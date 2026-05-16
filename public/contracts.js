// Hunt — browser-side contract metadata + small helpers.
//
// Loaded as a classic <script> before page logic. Exposes globals:
//   HUNT_ABI, HUNT_ADDRESS, NOTARY_ABI, NOTARY_ADDRESS, ORACLE_ABI, ORACLE_ADDRESS,
//   RPC_URL, CHAIN_ID, CHAINSCAN_URL,
//   CANONICAL_CWES, cweToBytes32, bytes32ToCwe, severityLabel, statusLabel,
//   loadDeployment(), loadNotaryDeployment(), loadOracleDeployment().
//
// ABI is hand-curated from contracts/Hunt.sol (matches solc output verbatim — only the
// functions + events the UI calls are kept; admin-only setters were dropped).

window.RPC_URL = "https://evmrpc.0g.ai";
window.CHAIN_ID = 16661;
window.CHAINSCAN_URL = "https://chainscan.0g.ai";

// Placeholder — overridden at runtime by loadDeployment() if deployments/Hunt.json exists.
window.HUNT_ADDRESS = "0x0000000000000000000000000000000000000000";
window.NOTARY_ADDRESS = "0x0000000000000000000000000000000000000000";
window.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000000";

// Mirror lib/cwe.js — per-domain class registries + union for backwards-compat.
window.SMART_CONTRACT_CWES = Object.freeze([
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
window.INSURANCE_DEFECT_CLASSES = Object.freeze([
  "medical-necessity-misapplication",
  "coding-cpt-error",
  "prior-auth-overreach",
  "network-adequacy-violation",
  "erisa-procedural-defect",
  "state-external-review-misclassification",
]);
window.BENEFITS_DEFECT_CLASSES = Object.freeze([
  "medical-listing-misapplication",
  "residual-functional-capacity-error",
  "vocational-expert-misclassification",
  "duration-requirement-misapplication",
  "substantial-gainful-activity-miscalculation",
  "combined-impairments-omission",
  "treating-physician-opinion-weight",
]);
window.MEDICAL_READING_CLASSES = Object.freeze([
  "pathology-borderline-interpretation",
  "radiology-second-read-discrepancy",
  "oncology-staging-revision",
  "cardiology-ecg-echo-revision",
  "dermatology-pigmented-lesion-revision",
  "hematology-flow-cytometry-discordance",
]);
window.CANONICAL_CWES = Object.freeze([
  ...window.SMART_CONTRACT_CWES,
  ...window.INSURANCE_DEFECT_CLASSES,
  ...window.BENEFITS_DEFECT_CLASSES,
  ...window.MEDICAL_READING_CLASSES,
]);
window.CLASS_DOMAIN = Object.freeze(
  Object.fromEntries([
    ...window.SMART_CONTRACT_CWES.map((c) => [c, "smart-contract"]),
    ...window.INSURANCE_DEFECT_CLASSES.map((c) => [c, "insurance"]),
    ...window.BENEFITS_DEFECT_CLASSES.map((c) => [c, "benefits"]),
    ...window.MEDICAL_READING_CLASSES.map((c) => [c, "medical"]),
  ]),
);
window.bytes32ToDomain = function (hash) {
  const name = window.bytes32ToCwe(hash);
  return name ? window.CLASS_DOMAIN[name] : undefined;
};

function _canonicalise(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Browser equivalent of lib/cwe.js cweToBytes32. Uses ethers UMD (must be loaded first).
window.cweToBytes32 = function cweToBytes32(s) {
  const c = _canonicalise(s);
  if (!window.CANONICAL_CWES.includes(c)) throw new Error(`unknown CWE: ${s}`);
  return ethers.keccak256(ethers.toUtf8Bytes(c));
};

// Inverse: bytes32 → canonical kebab-string, or undefined.
window.bytes32ToCwe = function bytes32ToCwe(hash) {
  const target = String(hash || "").toLowerCase();
  for (const c of window.CANONICAL_CWES) {
    if (ethers.keccak256(ethers.toUtf8Bytes(c)).toLowerCase() === target)
      return c;
  }
  return undefined;
};

window.severityLabel = function (n) {
  return (
    { 1: "low", 2: "medium", 3: "high", 4: "critical" }[Number(n)] || `sev-${n}`
  );
};

window.statusLabel = function (n) {
  return { 0: "Open", 1: "Settled", 2: "Expired" }[Number(n)] || `status-${n}`;
};

// Short-address util used by every page.
window.shortAddr = function (a) {
  const s = String(a || "");
  if (s.length < 12) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
};

window.shortHash = function (h) {
  const s = String(h || "");
  if (s.length < 14) return s;
  return s.slice(0, 10) + "…" + s.slice(-6);
};

// Fetch deployments/Hunt.json at runtime. Best-effort: 404 = placeholder stays.
window.loadDeployment = async function () {
  try {
    const r = await fetch("/deployments/Hunt.json", { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.address) window.HUNT_ADDRESS = j.address;
    return j;
  } catch {
    return null;
  }
};

window.loadNotaryDeployment = async function () {
  try {
    const r = await fetch("/deployments/Notary.json", { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.address) window.NOTARY_ADDRESS = j.address;
    if (j && j.abi) window.NOTARY_ABI = j.abi;
    return j;
  } catch {
    return null;
  }
};

window.loadOracleDeployment = async function () {
  try {
    const r = await fetch("/deployments/HuntReputationOracle.json", {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.address) window.ORACLE_ADDRESS = j.address;
    if (j && j.abi) window.ORACLE_ABI = j.abi;
    return j;
  } catch {
    return null;
  }
};

// 0G's public RPC at https://evmrpc.0g.ai answers in 1.7-2.3s per call. When a page
// fires 14+ parallel contract reads, occasional fetch failures ("Failed to fetch")
// happen due to browser HTTP/1.1 connection limits + transient flake. withRetry
// makes each call tolerant of ≤2 transient failures with backoff, so Promise.all
// across many reads doesn't lose the whole render to one dropped request.
window.withRetry = async function (fn, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
};

// Construct an ethers JsonRpcProvider with explicit batching + a sane stall window
// so parallel reads coalesce into a single HTTP request when the runtime supports it.
window.mkProvider = function () {
  return new ethers.JsonRpcProvider(window.RPC_URL, undefined, {
    batchMaxCount: 50,
    batchStallTime: 50,
    staticNetwork: ethers.Network.from(window.CHAIN_ID),
  });
};

// Hand-curated Hunt ABI — only the functions + events the static frontend uses.
// Verified against contracts/Hunt.sol on 2026-05-12. If you add a new ABI item here,
// re-verify the tuple component order matches Hunt.sol exactly.
window.HUNT_ABI = [
  // ── views ─────────────────────────────────────────────────────────────
  {
    type: "function",
    stateMutability: "view",
    name: "totalHunters",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "totalBounties",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "nextHunterId",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "nextBountyId",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "teeSigner",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "verifier",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "admin",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getHunter",
    inputs: [{ name: "hunterId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          {
            name: "credential",
            type: "tuple",
            components: [
              { name: "githubHandleHash", type: "bytes32" },
              { name: "accountAgeDays", type: "uint32" },
              { name: "mergedPRs", type: "uint32" },
              { name: "codeReviewCount", type: "uint32" },
              { name: "verifiedAt", type: "uint64" },
              { name: "verifier", type: "address" },
              { name: "sig", type: "bytes" },
            ],
          },
          { name: "sampleRoots", type: "bytes32[]" },
          { name: "embedRoots", type: "bytes32[]" },
          {
            name: "fingerprint",
            type: "tuple",
            components: [
              { name: "vocabEntropyBps", type: "uint16" },
              { name: "domainTermBps", type: "uint16" },
              { name: "structuralBps", type: "uint16" },
              { name: "specificityBps", type: "uint16" },
              { name: "overallBps", type: "uint16" },
              { name: "modelDigest", type: "bytes32" },
              { name: "teeSig", type: "bytes" },
            ],
          },
          { name: "specialty", type: "string" },
          { name: "description", type: "string" },
          { name: "paused", type: "bool" },
          { name: "totalWins", type: "uint32" },
          { name: "totalSubmissions", type: "uint32" },
          { name: "totalEarnedWei", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getBounty",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "poster", type: "address" },
          { name: "maxPayout", type: "uint256" },
          { name: "codeRoot", type: "bytes32" },
          { name: "inScopeCwes", type: "bytes32[]" },
          { name: "postedAt", type: "uint64" },
          { name: "raceDeadline", type: "uint64" },
          { name: "settleDeadline", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "winningFindingIdx", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getFindings",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "hunterId", type: "uint256" },
          { name: "hunter", type: "address" },
          { name: "cweClass", type: "bytes32" },
          { name: "severity", type: "uint8" },
          { name: "findingRoot", type: "bytes32" },
          { name: "attestationDigest", type: "bytes32" },
          { name: "attestationSig", type: "bytes" },
          { name: "teeTimestamp", type: "uint64" },
          { name: "submittedAt", type: "uint64" },
          { name: "severityCalibrationBpsSelfEval", type: "uint16" },
          { name: "precisionBpsSelfEval", type: "uint16" },
          { name: "coverageBpsSelfEval", type: "uint16" },
          { name: "exploitabilityBpsSelfEval", type: "uint16" },
        ],
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getFindingsCount",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getInScopeCwes",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getClassRep",
    inputs: [
      { name: "hunterId", type: "uint256" },
      { name: "cweClass", type: "bytes32" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "wins", type: "uint32" },
          { name: "submissions", type: "uint32" },
          { name: "totalEarnedWei", type: "uint64" },
          { name: "sumSeverityCalibration", type: "uint64" },
          { name: "sumPrecision", type: "uint64" },
          { name: "sumCoverage", type: "uint64" },
          { name: "sumExploitability", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "classAvg",
    inputs: [
      { name: "hunterId", type: "uint256" },
      { name: "cweClass", type: "bytes32" },
    ],
    outputs: [
      { name: "severityCalibrationBps", type: "uint64" },
      { name: "precisionBps", type: "uint64" },
      { name: "coverageBps", type: "uint64" },
      { name: "exploitabilityBps", type: "uint64" },
    ],
  },

  // ── on-chain constants exposed to the browser ──────────────────────────
  {
    type: "function",
    stateMutability: "view",
    name: "MIN_RACE_DURATION",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "MAX_RACE_DURATION",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },

  // ── state-changing entry points (browser-callable) ─────────────────────
  // postBounty: escrow a payout and post a sealed bounty against a known codeRoot.
  // The browser cannot upload to 0G Storage today, so /post-bounty.html demos
  // posting against an existing on-chain codeRoot (bounty #3's staged Vault.sol).
  {
    type: "function",
    stateMutability: "payable",
    name: "postBounty",
    inputs: [
      { name: "codeRoot", type: "bytes32" },
      { name: "inScopeCwes", type: "bytes32[]" },
      { name: "raceDuration", type: "uint64" },
    ],
    outputs: [{ name: "bountyId", type: "uint256" }],
  },
  // mintHunter: register a hunter agent. /mint-hunter.html splits this into
  // (1) the operator-mediated step that produces the Credential + SampleFingerprint
  // off-chain and (2) the visitor-signed on-chain call with that blob.
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "mintHunter",
    inputs: [
      {
        name: "cred",
        type: "tuple",
        components: [
          { name: "githubHandleHash", type: "bytes32" },
          { name: "accountAgeDays", type: "uint32" },
          { name: "mergedPRs", type: "uint32" },
          { name: "codeReviewCount", type: "uint32" },
          { name: "verifiedAt", type: "uint64" },
          { name: "verifier", type: "address" },
          { name: "sig", type: "bytes" },
        ],
      },
      { name: "sampleRoots", type: "bytes32[]" },
      { name: "embedRoots", type: "bytes32[]" },
      {
        name: "fp",
        type: "tuple",
        components: [
          { name: "vocabEntropyBps", type: "uint16" },
          { name: "domainTermBps", type: "uint16" },
          { name: "structuralBps", type: "uint16" },
          { name: "specificityBps", type: "uint16" },
          { name: "overallBps", type: "uint16" },
          { name: "modelDigest", type: "bytes32" },
          { name: "teeSig", type: "bytes" },
        ],
      },
      { name: "specialty", type: "string" },
      { name: "description", type: "string" },
    ],
    outputs: [{ name: "hunterId", type: "uint256" }],
  },
  // expireBounty: anyone can call after settleDeadline; refunds the original
  // poster. Safe public on-chain action with no operator coordination needed.
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "expireBounty",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [],
  },

  // ── events (used for stats + chainscan deep-links) ────────────────────
  {
    type: "event",
    name: "BountyPosted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "poster", type: "address" },
      { indexed: false, name: "maxPayout", type: "uint256" },
      { indexed: false, name: "codeRoot", type: "bytes32" },
      { indexed: false, name: "raceDeadline", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "FindingSubmitted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "findingIdx", type: "uint256" },
      { indexed: true, name: "hunterId", type: "uint256" },
      { indexed: false, name: "cweClass", type: "bytes32" },
      { indexed: false, name: "severity", type: "uint8" },
      { indexed: false, name: "teeTimestamp", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "BountySettled",
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "winningFindingIdx", type: "uint256" },
      { indexed: true, name: "winningHunterId", type: "uint256" },
      { indexed: false, name: "cweClass", type: "bytes32" },
      { indexed: false, name: "paid", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "BountyExpired",
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: false, name: "refunded", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "HunterMinted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "hunterId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "githubHandleHash", type: "bytes32" },
      { indexed: false, name: "specialty", type: "string" },
      { indexed: false, name: "fingerprintOverallBps", type: "uint16" },
    ],
  },
];

window.NOTARY_ABI = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "attest",
    inputs: [
      { name: "contentHash", type: "bytes32" },
      { name: "modelDigest", type: "bytes32" },
      { name: "domain", type: "bytes32" },
      { name: "sealedInputRoot", type: "bytes32" },
    ],
    outputs: [{ name: "attestId", type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getAttestation",
    inputs: [{ name: "attestId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "contentHash", type: "bytes32" },
          { name: "modelDigest", type: "bytes32" },
          { name: "domain", type: "bytes32" },
          { name: "attestedAt", type: "uint64" },
          { name: "sealedInputRoot", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "totalAttestations",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "AttestationRecorded",
    anonymous: false,
    inputs: [
      { indexed: true, name: "attestId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "modelDigest", type: "bytes32" },
      { indexed: false, name: "contentHash", type: "bytes32" },
      { indexed: false, name: "domain", type: "bytes32" },
      { indexed: false, name: "attestedAt", type: "uint64" },
      { indexed: false, name: "sealedInputRoot", type: "bytes32" },
    ],
  },
];

window.ORACLE_ABI = [
  {
    type: "function",
    stateMutability: "view",
    name: "HUNT",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "admin",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getDomains",
    inputs: [],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getClasses",
    inputs: [{ name: "domain", type: "bytes32" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "domainName",
    inputs: [{ name: "domain", type: "bytes32" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "className",
    inputs: [{ name: "classBytes32", type: "bytes32" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "aggregateDomain",
    inputs: [{ name: "domain", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "totalWins", type: "uint256" },
          { name: "totalSubmissions", type: "uint256" },
          { name: "totalEarnedWei", type: "uint256" },
          { name: "hunterCount", type: "uint256" },
        ],
      },
    ],
  },
];
