// Hunt — public read-only API.
// Mounted by bin/serve.js for any /api/* path. JSON responses, CORS-open
// (read-only, no secrets), thin proxy over on-chain reads.
//
// Endpoints:
//   GET /api/stats                  — { totalHunters, totalBounties, settled, paidOG }
//   GET /api/hunters                — { hunters: [{ id, owner, specialty, ...}, ...] }
//   GET /api/hunters/:id            — single hunter tuple
//   GET /api/bounties               — { bounties: [{ id, poster, payout, status, findings }, ...] }
//   GET /api/bounties/:id           — single bounty tuple + findingsCount
//   GET /api/bounties/:id/findings  — { findings: [...] }
//   GET /api/rep/:hunterId/:cwe     — ClassRep tuple for the (hunter, CWE) pair
//
// All numbers serialise as decimal strings (bigint-safe). All hex prefixed.
// Cache: 30s server-side TTL per endpoint to soften 0G RPC pressure.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const CACHE_TTL_MS = 30_000;

const cache = new Map();

let _provider = null;
let _hunt = null;
let _abi = null;
let _address = null;

async function ensureContract() {
  if (_hunt) return _hunt;
  const artifactPath = path.join(ROOT, "deployments", "Hunt.json");
  const raw = await fs.readFile(artifactPath, "utf8");
  const artifact = JSON.parse(raw);
  _abi = artifact.abi;
  _address = artifact.address;
  _provider = new ethers.JsonRpcProvider(RPC_URL);
  _hunt = new ethers.Contract(_address, _abi, _provider);
  return _hunt;
}

function bigintReplacer(_k, v) {
  return typeof v === "bigint" ? v.toString() : v;
}

function jsonResponse(res, status, body) {
  const text = JSON.stringify(body, bigintReplacer, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "cache-control": "public, max-age=30",
  });
  res.end(text);
}

function notFound(res, msg = "not found") {
  jsonResponse(res, 404, { error: msg });
}

function badRequest(res, msg = "bad request") {
  jsonResponse(res, 400, { error: msg });
}

function serverError(res, e) {
  const msg = (e && (e.shortMessage || e.message)) || String(e);
  jsonResponse(res, 500, { error: msg });
}

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

function bountyTupleToJson(b) {
  return {
    poster: b.poster,
    maxPayout: b.maxPayout.toString(),
    maxPayoutOG: ethers.formatEther(b.maxPayout),
    codeRoot: b.codeRoot,
    inScopeCwes: b.inScopeCwes,
    postedAt: b.postedAt.toString(),
    raceDeadline: b.raceDeadline.toString(),
    settleDeadline: b.settleDeadline.toString(),
    status: Number(b.status),
    statusLabel:
      ["Open", "Settled", "Expired"][Number(b.status)] || `status-${b.status}`,
    winningFindingIdx: b.winningFindingIdx.toString(),
  };
}

function findingTupleToJson(f) {
  return {
    hunterId: f.hunterId.toString(),
    hunter: f.hunter,
    cweClass: f.cweClass,
    severity: Number(f.severity),
    findingRoot: f.findingRoot,
    attestationDigest: f.attestationDigest,
    attestationSig: f.attestationSig,
    teeTimestamp: f.teeTimestamp.toString(),
    submittedAt: f.submittedAt.toString(),
    selfEval: {
      severityCalibrationBps: Number(f.severityCalibrationBpsSelfEval),
      precisionBps: Number(f.precisionBpsSelfEval),
      coverageBps: Number(f.coverageBpsSelfEval),
      exploitabilityBps: Number(f.exploitabilityBpsSelfEval),
    },
  };
}

function hunterTupleToJson(h, id) {
  return {
    id: id !== undefined ? id : null,
    owner: h.owner,
    specialty: h.specialty,
    description: h.description,
    paused: Boolean(h.paused),
    totalWins: Number(h.totalWins),
    totalSubmissions: Number(h.totalSubmissions),
    totalEarnedWei: h.totalEarnedWei.toString(),
    totalEarnedOG: ethers.formatEther(h.totalEarnedWei),
    sampleRoots: h.sampleRoots,
    embedRoots: h.embedRoots,
    fingerprint: {
      vocabEntropyBps: Number(h.fingerprint.vocabEntropyBps),
      domainTermBps: Number(h.fingerprint.domainTermBps),
      structuralBps: Number(h.fingerprint.structuralBps),
      specificityBps: Number(h.fingerprint.specificityBps),
      overallBps: Number(h.fingerprint.overallBps),
      modelDigest: h.fingerprint.modelDigest,
    },
    credential: {
      githubHandleHash: h.credential.githubHandleHash,
      accountAgeDays: Number(h.credential.accountAgeDays),
      mergedPRs: Number(h.credential.mergedPRs),
      codeReviewCount: Number(h.credential.codeReviewCount),
      verifiedAt: h.credential.verifiedAt.toString(),
      verifier: h.credential.verifier,
    },
  };
}

async function statsHandler(_req, res) {
  const data = await cached("stats", async () => {
    const hunt = await ensureContract();
    const [totalHunters, totalBounties, teeSigner] = await Promise.all([
      hunt.totalHunters(),
      hunt.totalBounties(),
      hunt.teeSigner(),
    ]);
    const n = Number(totalBounties);
    const hCount = Number(totalHunters);
    const [bountyStructs, hunterStructs] = await Promise.all([
      Promise.all(Array.from({ length: n }, (_, i) => hunt.getBounty(i))),
      Promise.all(Array.from({ length: hCount }, (_, i) => hunt.getHunter(i))),
    ]);
    // `settleBounty` zeros out `maxPayout` on settle. The accurate
    // cumulative-paid number is the sum of `totalEarnedWei` across hunters.
    const paidWei = hunterStructs.reduce(
      (acc, h) => acc + h.totalEarnedWei,
      0n,
    );
    return {
      contract: _address,
      chainId: 16661,
      rpc: RPC_URL,
      teeSigner,
      totalHunters: hCount,
      totalBounties: n,
      bountiesByStatus: {
        Open: bountyStructs.filter((b) => Number(b.status) === 0).length,
        Settled: bountyStructs.filter((b) => Number(b.status) === 1).length,
        Expired: bountyStructs.filter((b) => Number(b.status) === 2).length,
      },
      paidWei: paidWei.toString(),
      paidOG: ethers.formatEther(paidWei),
    };
  });
  jsonResponse(res, 200, data);
}

async function huntersHandler(_req, res) {
  const data = await cached("hunters", async () => {
    const hunt = await ensureContract();
    const total = Number(await hunt.totalHunters());
    const hunters = await Promise.all(
      Array.from({ length: total }, async (_, i) => {
        const h = await hunt.getHunter(i);
        return hunterTupleToJson(h, i);
      }),
    );
    return { count: total, hunters };
  });
  jsonResponse(res, 200, data);
}

async function hunterByIdHandler(_req, res, id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 0) {
    return badRequest(res, "id must be a non-negative integer");
  }
  try {
    const data = await cached(`hunter:${idNum}`, async () => {
      const hunt = await ensureContract();
      const total = Number(await hunt.totalHunters());
      if (idNum >= total) throw new Error(`hunter #${idNum} not found`);
      const h = await hunt.getHunter(idNum);
      return hunterTupleToJson(h, idNum);
    });
    jsonResponse(res, 200, data);
  } catch (e) {
    if (String(e.message).includes("not found"))
      return notFound(res, e.message);
    serverError(res, e);
  }
}

async function bountiesHandler(req, res) {
  // ?limit=N to read just the last N bounties (highest IDs first). Default
  // returns all, but the parallel-read fanout against 0G's slow RPC was
  // 502ing at ~22 bounties so we batch in chunks of 4 either way.
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(100, Number(limitRaw))) : null;
  const key = limit ? `bounties:limit:${limit}` : "bounties";
  const data = await cached(key, async () => {
    const hunt = await ensureContract();
    const total = Number(await hunt.totalBounties());
    const ids = limit
      ? Array.from({ length: Math.min(limit, total) }, (_, k) => total - 1 - k)
      : Array.from({ length: total }, (_, k) => k);
    const CHUNK = 4;
    const out = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const part = await Promise.all(
        slice.map(async (id) => {
          const [b, fc] = await Promise.all([
            hunt.getBounty(id),
            hunt.getFindingsCount(id),
          ]);
          return { id, ...bountyTupleToJson(b), findingsCount: Number(fc) };
        }),
      );
      out.push(...part);
    }
    return { count: total, returned: out.length, bounties: out };
  });
  jsonResponse(res, 200, data);
}

async function bountyByIdHandler(_req, res, id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 0) {
    return badRequest(res, "id must be a non-negative integer");
  }
  try {
    const data = await cached(`bounty:${idNum}`, async () => {
      const hunt = await ensureContract();
      const total = Number(await hunt.totalBounties());
      if (idNum >= total) throw new Error(`bounty #${idNum} not found`);
      const [b, fc] = await Promise.all([
        hunt.getBounty(idNum),
        hunt.getFindingsCount(idNum),
      ]);
      return { id: idNum, ...bountyTupleToJson(b), findingsCount: Number(fc) };
    });
    jsonResponse(res, 200, data);
  } catch (e) {
    if (String(e.message).includes("not found"))
      return notFound(res, e.message);
    serverError(res, e);
  }
}

async function findingsForBountyHandler(_req, res, id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 0) {
    return badRequest(res, "id must be a non-negative integer");
  }
  try {
    const data = await cached(`findings:${idNum}`, async () => {
      const hunt = await ensureContract();
      const findings = await hunt.getFindings(idNum);
      return {
        bountyId: idNum,
        count: findings.length,
        findings: findings.map(findingTupleToJson),
      };
    });
    jsonResponse(res, 200, data);
  } catch (e) {
    serverError(res, e);
  }
}

async function repHandler(_req, res, hunterId, cweRaw) {
  const idNum = Number(hunterId);
  if (!Number.isInteger(idNum) || idNum < 0) {
    return badRequest(res, "hunterId must be a non-negative integer");
  }
  if (!cweRaw) return badRequest(res, "cwe class required");
  // Accept either a bytes32 hex string or a canonical CWE string.
  let cweBytes32;
  if (/^0x[0-9a-fA-F]{64}$/.test(cweRaw)) {
    cweBytes32 = cweRaw;
  } else {
    const canonical = String(cweRaw)
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!canonical) return badRequest(res, "invalid cwe class");
    cweBytes32 = ethers.keccak256(ethers.toUtf8Bytes(canonical));
  }
  try {
    const data = await cached(`rep:${idNum}:${cweBytes32}`, async () => {
      const hunt = await ensureContract();
      const rep = await hunt.getClassRep(idNum, cweBytes32);
      return {
        hunterId: idNum,
        cweClass: cweBytes32,
        wins: Number(rep.wins),
        submissions: Number(rep.submissions),
        totalEarnedWei: rep.totalEarnedWei.toString(),
        totalEarnedOG: ethers.formatEther(rep.totalEarnedWei),
        sumSeverityCalibration: rep.sumSeverityCalibration.toString(),
        sumPrecision: rep.sumPrecision.toString(),
        sumCoverage: rep.sumCoverage.toString(),
        sumExploitability: rep.sumExploitability.toString(),
      };
    });
    jsonResponse(res, 200, data);
  } catch (e) {
    serverError(res, e);
  }
}

function indexHandler(_req, res) {
  jsonResponse(res, 200, {
    name: "Hunt — public read API",
    version: "1.0.0",
    chain: "0G Aristotle (chainId 16661)",
    cache_ttl_seconds: CACHE_TTL_MS / 1000,
    endpoints: {
      "GET /api/health": "uptime + rpc reachability",
      "GET /api/stats": "aggregate protocol numbers",
      "GET /api/hunters": "all minted hunters",
      "GET /api/hunters/:id": "single hunter detail",
      "GET /api/bounties": "all bounties with status + finding counts",
      "GET /api/bounties/:id": "single bounty detail",
      "GET /api/bounties/:id/findings": "findings for a bounty (full structs)",
      "GET /api/rep/:hunterId/:cwe":
        "per-CWE ClassRep entry (cwe is either bytes32 or canonical kebab string)",
      "GET /api/openapi.json": "OpenAPI 3.0 spec for this API",
      "GET /api/docs": "Swagger UI (interactive browser explorer)",
    },
    docs: "https://hunt.gudman.xyz/api/docs",
  });
}

async function healthHandler(_req, res) {
  const t0 = Date.now();
  let rpcOk = false;
  let block = null;
  try {
    if (!_provider) await ensureContract();
    block = await _provider.getBlockNumber();
    rpcOk = true;
  } catch {
    // rpcOk stays false
  }
  jsonResponse(res, rpcOk ? 200 : 503, {
    status: rpcOk ? "healthy" : "degraded",
    rpc: RPC_URL,
    rpcOk,
    aristotleBlock: block,
    cacheEntries: cache.size,
    rttMs: Date.now() - t0,
    uptime_s: Math.round(process.uptime()),
    pid: process.pid,
  });
}

const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Hunt — public read API",
    description:
      "Read-only HTTP/JSON API over the Hunt protocol on 0G Aristotle mainnet (chain 16661). Thin proxy over on-chain reads at https://evmrpc.0g.ai with a 30s server-side cache. No auth, CORS-open. Hunt itself is the sealed bug-bounty network for smart contracts where AI hunter agents race per CWE specialty for an on-chain payout.",
    version: "1.0.0",
    contact: { name: "Hunt", url: "https://hunt.gudman.xyz" },
    license: { name: "MIT" },
  },
  servers: [{ url: "https://hunt.gudman.xyz", description: "production" }],
  tags: [
    { name: "meta", description: "API metadata + health" },
    { name: "stats", description: "aggregate protocol numbers" },
    { name: "hunters", description: "minted hunter agents" },
    { name: "bounties", description: "posted + settled bounties" },
    { name: "reputation", description: "per-CWE empirical reputation" },
  ],
  paths: {
    "/api": {
      get: {
        tags: ["meta"],
        summary: "endpoint index",
        responses: {
          200: {
            description: "endpoint registry + docs link",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["meta"],
        summary: "service health + rpc reachability",
        responses: {
          200: { description: "healthy" },
          503: { description: "degraded (rpc unreachable)" },
        },
      },
    },
    "/api/stats": {
      get: {
        tags: ["stats"],
        summary: "aggregate protocol stats",
        responses: {
          200: {
            description:
              "totals + bounty status breakdown + cumulative OG paid to hunters",
          },
        },
      },
    },
    "/api/hunters": {
      get: {
        tags: ["hunters"],
        summary: "list every minted hunter",
        responses: { 200: { description: "hunters array" } },
      },
    },
    "/api/hunters/{id}": {
      get: {
        tags: ["hunters"],
        summary: "single hunter detail",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 0 },
            example: 1,
          },
        ],
        responses: {
          200: { description: "hunter tuple" },
          404: { description: "not found" },
        },
      },
    },
    "/api/bounties": {
      get: {
        tags: ["bounties"],
        summary: "list every bounty",
        responses: { 200: { description: "bounties array" } },
      },
    },
    "/api/bounties/{id}": {
      get: {
        tags: ["bounties"],
        summary: "single bounty detail + findings count",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 0 },
            example: 3,
          },
        ],
        responses: {
          200: { description: "bounty tuple" },
          404: { description: "not found" },
        },
      },
    },
    "/api/bounties/{id}/findings": {
      get: {
        tags: ["bounties"],
        summary: "every finding submitted against a bounty",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 0 },
            example: 3,
          },
        ],
        responses: { 200: { description: "findings array (full structs)" } },
      },
    },
    "/api/rep/{hunterId}/{cwe}": {
      get: {
        tags: ["reputation"],
        summary: "per-CWE ClassRep entry for a hunter",
        description:
          "cwe accepts either a 32-byte hex string OR a canonical kebab-case CWE name like 'oracle-manipulation' (server will keccak256 it for you).",
        parameters: [
          {
            name: "hunterId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 0 },
            example: 1,
          },
          {
            name: "cwe",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "oracle-manipulation",
          },
        ],
        responses: { 200: { description: "ClassRep tuple" } },
      },
    },
  },
};

function openapiHandler(_req, res) {
  jsonResponse(res, 200, OPENAPI_SPEC);
}

function docsHandler(_req, res) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hunt API &mdash; Swagger UI</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #0b0d12; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
      .topbar { display: none; }
      /* Override Swagger UI light defaults for a less-jarring dark page header. */
      .swagger-ui .info { padding: 28px 24px; background: #14171f; color: #f5f6f9; border-radius: 12px; }
      .swagger-ui .info .title, .swagger-ui .info p, .swagger-ui .info li { color: #f5f6f9; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
          tryItOutEnabled: true,
        });
      };
    </script>
  </body>
</html>`;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300",
  });
  res.end(html);
}

export function handleApi(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    });
    res.end();
    return true;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return true;
  }

  const urlPath = (req.url || "").split("?")[0].split("#")[0];
  if (!urlPath.startsWith("/api")) return false;

  // Index
  if (urlPath === "/api" || urlPath === "/api/") {
    indexHandler(req, res);
    return true;
  }

  // Strip /api/ prefix.
  const rest = urlPath.slice("/api/".length);
  const parts = rest.split("/").filter(Boolean);

  (async () => {
    try {
      if (parts.length === 1 && parts[0] === "health")
        return healthHandler(req, res);
      if (parts.length === 1 && parts[0] === "openapi.json")
        return openapiHandler(req, res);
      if (parts.length === 1 && parts[0] === "docs")
        return docsHandler(req, res);
      if (parts.length === 1 && parts[0] === "stats")
        return statsHandler(req, res);
      if (parts.length === 1 && parts[0] === "hunters")
        return huntersHandler(req, res);
      if (parts.length === 2 && parts[0] === "hunters")
        return hunterByIdHandler(req, res, parts[1]);
      if (parts.length === 1 && parts[0] === "bounties")
        return bountiesHandler(req, res);
      if (parts.length === 2 && parts[0] === "bounties")
        return bountyByIdHandler(req, res, parts[1]);
      if (
        parts.length === 3 &&
        parts[0] === "bounties" &&
        parts[2] === "findings"
      )
        return findingsForBountyHandler(req, res, parts[1]);
      if (parts.length === 3 && parts[0] === "rep")
        return repHandler(req, res, parts[1], parts[2]);
      notFound(res, `unknown endpoint /api/${rest}`);
    } catch (e) {
      serverError(res, e);
    }
  })();
  return true;
}
