#!/usr/bin/env node
// Hunt MCP server — exposes Hunt's on-chain reads + cryptographic verifier
// as Model Context Protocol tools.
//
// Compatible with Claude Desktop, Cursor, and any MCP-compatible client.
// Stdio transport. No auth (read-only).
//
// Configure in Claude Desktop's mcp.config:
//   {
//     "mcpServers": {
//       "hunt": {
//         "command": "npx",
//         "args": ["-y", "@hunt-protocol/mcp-server"]
//       }
//     }
//   }
//
// All reads target 0G Aristotle mainnet (chain 16661) at evmrpc.0g.ai
// against the deployed Hunt contract 0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";

const HUNT_ADDRESS =
  process.env.HUNT_ADDRESS || "0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C";
const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const CHAIN_ID = 16661;
const CHAINSCAN = "https://chainscan.0g.ai";

// Canonical CWE classes Hunt recognises. Mirrors lib/cwe.js exactly.
const CANONICAL_CWES = Object.freeze([
  "swc-107-reentrancy",
  "swc-115-tx-origin",
  "access-control",
  "oracle-manipulation",
  "swc-101-int-overflow",
  "storage-collision",
  "unchecked-external-call",
  "front-running",
  "price-manipulation",
  "signature-replay",
  "unsafe-delegatecall",
  "denial-of-service",
]);

// Minimal Hunt ABI — just the reads + types this server exposes.
const HUNT_ABI = [
  "function totalHunters() view returns (uint256)",
  "function totalBounties() view returns (uint256)",
  "function teeSigner() view returns (address)",
  "function verifier() view returns (address)",
  "function getHunter(uint256) view returns (tuple(address owner, tuple(bytes32 githubHandleHash, uint32 accountAgeDays, uint32 mergedPRs, uint32 codeReviewCount, uint64 verifiedAt, address verifier, bytes sig) credential, bytes32[] sampleRoots, bytes32[] embedRoots, tuple(uint16 vocabEntropyBps, uint16 domainTermBps, uint16 structuralBps, uint16 specificityBps, uint16 overallBps, bytes32 modelDigest, bytes teeSig) fingerprint, string specialty, string description, bool paused, uint32 totalWins, uint32 totalSubmissions, uint256 totalEarnedWei))",
  "function getBounty(uint256) view returns (tuple(address poster, uint256 maxPayout, bytes32 codeRoot, bytes32[] inScopeCwes, uint64 postedAt, uint64 raceDeadline, uint64 settleDeadline, uint8 status, uint256 winningFindingIdx))",
  "function getFindings(uint256) view returns (tuple(uint256 hunterId, address hunter, bytes32 cweClass, uint8 severity, bytes32 findingRoot, bytes32 attestationDigest, bytes attestationSig, uint64 teeTimestamp, uint64 submittedAt, uint16 severityCalibrationBpsSelfEval, uint16 precisionBpsSelfEval, uint16 coverageBpsSelfEval, uint16 exploitabilityBpsSelfEval)[])",
  "function getFindingsCount(uint256) view returns (uint256)",
  "function getClassRep(uint256, bytes32) view returns (tuple(uint32 wins, uint32 submissions, uint256 totalEarnedWei, uint64 sumSeverityCalibration, uint64 sumPrecision, uint64 sumCoverage, uint64 sumExploitability))",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const hunt = new ethers.Contract(HUNT_ADDRESS, HUNT_ABI, provider);

function canonicalise(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cweToBytes32(s) {
  const c = canonicalise(s);
  return ethers.keccak256(ethers.toUtf8Bytes(c));
}

function bountyTuple(b) {
  return {
    poster: b.poster,
    maxPayoutOG: ethers.formatEther(b.maxPayout),
    codeRoot: b.codeRoot,
    inScopeCwes: b.inScopeCwes,
    postedAt: Number(b.postedAt),
    raceDeadline: Number(b.raceDeadline),
    settleDeadline: Number(b.settleDeadline),
    status: Number(b.status),
    statusLabel:
      ["Open", "Settled", "Expired"][Number(b.status)] || `status-${b.status}`,
    winningFindingIdx:
      Number(b.status) === 1 ? Number(b.winningFindingIdx) : null,
  };
}

function hunterTuple(h, id) {
  return {
    id,
    owner: h.owner,
    specialty: h.specialty,
    description: h.description,
    paused: Boolean(h.paused),
    totalWins: Number(h.totalWins),
    totalSubmissions: Number(h.totalSubmissions),
    totalEarnedOG: ethers.formatEther(h.totalEarnedWei),
    fingerprint: {
      overallBps: Number(h.fingerprint.overallBps),
      modelDigest: h.fingerprint.modelDigest,
    },
    sampleRoots: h.sampleRoots,
    embedRoots: h.embedRoots,
  };
}

function findingTuple(f, idx) {
  return {
    idx,
    hunterId: Number(f.hunterId),
    hunter: f.hunter,
    cweClass: f.cweClass,
    severity: Number(f.severity),
    severityLabel:
      ["?", "low", "medium", "high", "critical"][Number(f.severity)] || "?",
    findingRoot: f.findingRoot,
    attestationDigest: f.attestationDigest,
    attestationSig: f.attestationSig,
    teeTimestamp: Number(f.teeTimestamp),
    submittedAt: Number(f.submittedAt),
    selfEvalBps: {
      severityCalibration: Number(f.severityCalibrationBpsSelfEval),
      precision: Number(f.precisionBpsSelfEval),
      coverage: Number(f.coverageBpsSelfEval),
      exploitability: Number(f.exploitabilityBpsSelfEval),
    },
  };
}

// Re-derive the attestation digest from on-chain fields + modelDigest.
// Mirrors scripts/verify_bounty.js + lib/credential.js exactly.
function deriveAttestationDigest(bountyId, codeRoot, hunterId, f, modelDigest) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "uint256",
        "bytes32",
        "uint256",
        "bytes32",
        "uint8",
        "bytes32",
        "bytes32",
        "uint64",
        "uint16",
        "uint16",
        "uint16",
        "uint16",
      ],
      [
        bountyId,
        codeRoot,
        hunterId,
        f.cweClass,
        Number(f.severity),
        f.findingRoot,
        modelDigest,
        f.teeTimestamp,
        Number(f.severityCalibrationBpsSelfEval),
        Number(f.precisionBpsSelfEval),
        Number(f.coverageBpsSelfEval),
        Number(f.exploitabilityBpsSelfEval),
      ],
    ),
  );
}

function recoverSigner(digest, sig) {
  try {
    return ethers.verifyMessage(ethers.getBytes(digest), sig);
  } catch {
    return null;
  }
}

function ok(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function fail(message) {
  return {
    isError: true,
    content: [{ type: "text", text: `error: ${message}` }],
  };
}

const server = new McpServer(
  { name: "hunt", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "hunt_stats",
  {
    title: "Hunt protocol stats",
    description:
      "Aggregate on-chain numbers for the Hunt protocol: total hunters minted, total bounties posted, settled/expired/open counts, cumulative OG paid to hunters, teeSigner + verifier addresses, current Aristotle block.",
    inputSchema: {},
  },
  async () => {
    const [hCount, bCount, teeSigner, verifier, block] = await Promise.all([
      hunt.totalHunters(),
      hunt.totalBounties(),
      hunt.teeSigner(),
      hunt.verifier(),
      provider.getBlockNumber(),
    ]);
    const n = Number(bCount);
    const hN = Number(hCount);
    const [bs, hs] = await Promise.all([
      Promise.all(Array.from({ length: n }, (_, i) => hunt.getBounty(i))),
      Promise.all(Array.from({ length: hN }, (_, i) => hunt.getHunter(i))),
    ]);
    const paidWei = hs.reduce((acc, h) => acc + h.totalEarnedWei, 0n);
    return ok({
      contract: HUNT_ADDRESS,
      chainId: CHAIN_ID,
      block,
      teeSigner,
      verifier,
      totalHunters: hN,
      totalBounties: n,
      bountiesByStatus: {
        Open: bs.filter((b) => Number(b.status) === 0).length,
        Settled: bs.filter((b) => Number(b.status) === 1).length,
        Expired: bs.filter((b) => Number(b.status) === 2).length,
      },
      cumulativePaidOG: ethers.formatEther(paidWei),
      chainscan: `${CHAINSCAN}/address/${HUNT_ADDRESS}`,
    });
  },
);

server.registerTool(
  "hunt_list_hunters",
  {
    title: "List Hunt hunters",
    description:
      "Returns every minted hunter on the Hunt protocol with their specialty, wins, submissions, and total OG earned. A hunter's per-CWE reputation lives in ClassRep — use hunt_get_class_rep for that.",
    inputSchema: {},
  },
  async () => {
    const total = Number(await hunt.totalHunters());
    const hunters = await Promise.all(
      Array.from({ length: total }, async (_, i) => {
        const h = await hunt.getHunter(i);
        return hunterTuple(h, i);
      }),
    );
    return ok({ count: total, hunters });
  },
);

server.registerTool(
  "hunt_get_hunter",
  {
    title: "Get a single Hunt hunter",
    description: "Returns full hunter detail by id.",
    inputSchema: {
      hunterId: z
        .number()
        .int()
        .min(0)
        .describe("hunter id (0..totalHunters-1)"),
    },
  },
  async ({ hunterId }) => {
    const total = Number(await hunt.totalHunters());
    if (hunterId >= total) return fail(`hunter #${hunterId} not found`);
    const h = await hunt.getHunter(hunterId);
    return ok(hunterTuple(h, hunterId));
  },
);

server.registerTool(
  "hunt_list_bounties",
  {
    title: "List Hunt bounties",
    description:
      "Returns all bounties with status (Open/Settled/Expired), payout, code root, in-scope CWE class list, and finding count.",
    inputSchema: {},
  },
  async () => {
    const total = Number(await hunt.totalBounties());
    const bounties = await Promise.all(
      Array.from({ length: total }, async (_, i) => {
        const [b, fc] = await Promise.all([
          hunt.getBounty(i),
          hunt.getFindingsCount(i),
        ]);
        return { id: i, ...bountyTuple(b), findingsCount: Number(fc) };
      }),
    );
    return ok({ count: total, bounties });
  },
);

server.registerTool(
  "hunt_get_bounty",
  {
    title: "Get a single Hunt bounty",
    description:
      "Returns bounty detail + findings count by bountyId. Use hunt_get_findings to fetch full finding records.",
    inputSchema: {
      bountyId: z.number().int().min(0).describe("bounty id"),
    },
  },
  async ({ bountyId }) => {
    const total = Number(await hunt.totalBounties());
    if (bountyId >= total) return fail(`bounty #${bountyId} not found`);
    const [b, fc] = await Promise.all([
      hunt.getBounty(bountyId),
      hunt.getFindingsCount(bountyId),
    ]);
    return ok({
      id: bountyId,
      ...bountyTuple(b),
      findingsCount: Number(fc),
    });
  },
);

server.registerTool(
  "hunt_get_findings",
  {
    title: "Get all findings for a Hunt bounty",
    description:
      "Returns every finding submitted against a bounty, including the on-chain attestation digest + signature and the hunter's 4-axis self-evaluation.",
    inputSchema: {
      bountyId: z.number().int().min(0).describe("bounty id"),
    },
  },
  async ({ bountyId }) => {
    const findings = await hunt.getFindings(bountyId);
    return ok({
      bountyId,
      count: findings.length,
      findings: findings.map((f, i) => findingTuple(f, i)),
    });
  },
);

server.registerTool(
  "hunt_get_class_rep",
  {
    title: "Get per-CWE reputation for a hunter",
    description:
      "Returns the on-chain ClassRep tuple for (hunterId, cweClass). cweClass can be a bytes32 hex string OR a canonical kebab-case CWE name like 'oracle-manipulation' or 'swc-107-reentrancy' — the server will keccak256 it for you. This is the load-bearing per-CWE empirical reputation primitive.",
    inputSchema: {
      hunterId: z.number().int().min(0),
      cweClass: z
        .string()
        .describe(
          "bytes32 hex (0x…) or canonical CWE name like 'oracle-manipulation'",
        ),
    },
  },
  async ({ hunterId, cweClass }) => {
    let bytes32;
    if (/^0x[0-9a-fA-F]{64}$/.test(cweClass)) {
      bytes32 = cweClass;
    } else {
      bytes32 = cweToBytes32(cweClass);
    }
    const rep = await hunt.getClassRep(hunterId, bytes32);
    return ok({
      hunterId,
      cweClassInput: cweClass,
      cweClassBytes32: bytes32,
      wins: Number(rep.wins),
      submissions: Number(rep.submissions),
      totalEarnedOG: ethers.formatEther(rep.totalEarnedWei),
      averages: {
        severityCalibrationBps:
          rep.submissions > 0n
            ? Number(rep.sumSeverityCalibration / rep.submissions) * 2500
            : null,
        precisionBps:
          rep.submissions > 0n
            ? Number(rep.sumPrecision / rep.submissions) * 2500
            : null,
        coverageBps:
          rep.submissions > 0n
            ? Number(rep.sumCoverage / rep.submissions) * 2500
            : null,
        exploitabilityBps:
          rep.submissions > 0n
            ? Number(rep.sumExploitability / rep.submissions) * 2500
            : null,
      },
    });
  },
);

server.registerTool(
  "hunt_verify_bounty",
  {
    title: "Cryptographically verify a Hunt finding",
    description:
      "Same logic as scripts/verify_bounty.js + /verify.html: reads bounty + findings on-chain, recovers the teeSigner from each attestation signature, re-derives the digest from the on-chain fields, checks the race-window timestamp. In strict mode (modelDigest provided) the supplied modelDigest must re-derive the on-chain digest. For the canonical Sealed Inference path on Hunt's headline bounty #3, the modelDigest is keccak256(utf8('zai-org/GLM-5-FP8|hunt-audit-v1')). Returns per-finding checks + final pass/fail.",
    inputSchema: {
      bountyId: z.number().int().min(0),
      modelDigest: z
        .string()
        .optional()
        .describe(
          "optional 32-byte hex (0x…). Omit for non-strict mode (uses 0x0…0 placeholder).",
        ),
    },
  },
  async ({ bountyId, modelDigest }) => {
    const strictMode = !!modelDigest;
    const md = strictMode ? modelDigest : "0x" + "00".repeat(32);
    if (strictMode && !ethers.isHexString(md, 32)) {
      return fail("modelDigest must be a 32-byte hex string");
    }
    const [bounty, findings, teeSigner] = await Promise.all([
      hunt.getBounty(bountyId),
      hunt.getFindings(bountyId),
      hunt.teeSigner(),
    ]);
    if (bounty.postedAt === 0n) return fail(`bounty #${bountyId} not found`);
    const statusInt = Number(bounty.status);
    const winIdx = statusInt === 1 ? Number(bounty.winningFindingIdx) : -1;

    const findingsOut = findings.map((f, i) => {
      const recovered = recoverSigner(f.attestationDigest, f.attestationSig);
      const sigOk =
        !!recovered && recovered.toLowerCase() === teeSigner.toLowerCase();
      const derived = deriveAttestationDigest(
        BigInt(bountyId),
        bounty.codeRoot,
        f.hunterId,
        f,
        md,
      );
      const digestMatch =
        derived.toLowerCase() === f.attestationDigest.toLowerCase();
      const teeInWindow =
        f.teeTimestamp >= bounty.postedAt &&
        f.teeTimestamp <= bounty.raceDeadline;
      return {
        idx: i,
        isWinning: i === winIdx,
        sigOk,
        recovered: recovered || null,
        digestMatch,
        derivedDigest: derived,
        onChainDigest: f.attestationDigest,
        teeInWindow,
        teeTimestamp: Number(f.teeTimestamp),
        postedAt: Number(bounty.postedAt),
        raceDeadline: Number(bounty.raceDeadline),
      };
    });

    let pass = null;
    if (statusInt === 1 && winIdx >= 0) {
      const w = findingsOut[winIdx];
      pass = w.sigOk && w.teeInWindow && (!strictMode || w.digestMatch);
    }

    return ok({
      bountyId,
      contract: HUNT_ADDRESS,
      teeSigner,
      status:
        ["Open", "Settled", "Expired"][statusInt] || `status-${statusInt}`,
      winningFindingIdx: winIdx >= 0 ? winIdx : null,
      strictMode,
      modelDigestUsed: md,
      findings: findingsOut,
      verdict:
        statusInt !== 1
          ? `bounty status is ${["Open", "Settled", "Expired"][statusInt]}; no winning finding to verify`
          : pass
            ? strictMode
              ? "winning finding verifies in strict mode (signer + race window + supplied modelDigest all match)"
              : "winning finding verifies on signer + race window; modelDigest not supplied (non-strict)"
            : "verification FAILED",
      pass,
    });
  },
);

server.registerTool(
  "hunt_canonical_digest",
  {
    title: "Compute the canonical Hunt-audit modelDigest",
    description:
      "Returns keccak256(utf8('zai-org/GLM-5-FP8|hunt-audit-v1')) — the modelDigest Hunt's Sealed Inference path stamps on-chain. Use this as the modelDigest argument to hunt_verify_bounty for strict-mode verification of Sealed-Inference-path findings.",
    inputSchema: {},
  },
  async () => {
    return ok({
      canonicalString: "zai-org/GLM-5-FP8|hunt-audit-v1",
      modelDigest: ethers.keccak256(
        ethers.toUtf8Bytes("zai-org/GLM-5-FP8|hunt-audit-v1"),
      ),
      note: "Fallback-path modelDigest is keccak256(utf8('hunt-local-audit|hunt-audit-v1')) — distinct on-chain so the two paths are always distinguishable.",
    });
  },
);

server.registerTool(
  "hunt_list_cwes",
  {
    title: "List Hunt's canonical CWE classes",
    description:
      "Returns the 12 canonical CWE classes Hunt's hunter agents specialise in. Each maps to a bytes32 keccak256 hash; the contract enforces in-scope CWE filtering using these bytes32 values.",
    inputSchema: {},
  },
  async () => {
    return ok({
      count: CANONICAL_CWES.length,
      cwes: CANONICAL_CWES.map((c) => ({
        name: c,
        bytes32: cweToBytes32(c),
      })),
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Note: do NOT console.log on stdout — MCP uses stdio for JSON-RPC.
// Diagnostics go to stderr.
process.stderr.write(
  `[hunt-mcp] connected. contract=${HUNT_ADDRESS} rpc=${RPC_URL}\n`,
);
