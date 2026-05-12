// Hunt — browser-side contract metadata + small helpers.
//
// Loaded as a classic <script> before page logic. Exposes globals:
//   HUNT_ABI, HUNT_ADDRESS, RPC_URL, CHAIN_ID, CHAINSCAN_URL,
//   CANONICAL_CWES, cweToBytes32, bytes32ToCwe, severityLabel, statusLabel,
//   loadDeployment().
//
// ABI is hand-curated from contracts/Hunt.sol (matches solc output verbatim — only the
// functions + events the UI calls are kept; admin-only setters were dropped).

window.RPC_URL = 'https://evmrpc.0g.ai';
window.CHAIN_ID = 16661;
window.CHAINSCAN_URL = 'https://chainscan.0g.ai';

// Placeholder — overridden at runtime by loadDeployment() if deployments/Hunt.json exists.
window.HUNT_ADDRESS = '0x0000000000000000000000000000000000000000';

// Mirror lib/cwe.js CANONICAL_CWES exactly.
window.CANONICAL_CWES = Object.freeze([
  'swc-107-reentrancy',
  'swc-115-tx-origin',
  'access-control',
  'oracle-manipulation',
  'swc-101-int-overflow',
  'storage-collision',
  'unchecked-external-call',
  'front-running',
  'price-manipulation',
  'signature-replay',
  'unsafe-delegatecall',
  'denial-of-service',
]);

function _canonicalise(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Browser equivalent of lib/cwe.js cweToBytes32. Uses ethers UMD (must be loaded first).
window.cweToBytes32 = function cweToBytes32(s) {
  const c = _canonicalise(s);
  if (!window.CANONICAL_CWES.includes(c)) throw new Error(`unknown CWE: ${s}`);
  return ethers.keccak256(ethers.toUtf8Bytes(c));
};

// Inverse: bytes32 → canonical kebab-string, or undefined.
window.bytes32ToCwe = function bytes32ToCwe(hash) {
  const target = String(hash || '').toLowerCase();
  for (const c of window.CANONICAL_CWES) {
    if (ethers.keccak256(ethers.toUtf8Bytes(c)).toLowerCase() === target) return c;
  }
  return undefined;
};

window.severityLabel = function (n) {
  return ({ 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' })[Number(n)] || `sev-${n}`;
};

window.statusLabel = function (n) {
  return ({ 0: 'Open', 1: 'Settled', 2: 'Expired' })[Number(n)] || `status-${n}`;
};

// Short-address util used by every page.
window.shortAddr = function (a) {
  const s = String(a || '');
  if (s.length < 12) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
};

window.shortHash = function (h) {
  const s = String(h || '');
  if (s.length < 14) return s;
  return s.slice(0, 10) + '…' + s.slice(-6);
};

// Fetch deployments/Hunt.json at runtime. Best-effort: 404 = placeholder stays.
window.loadDeployment = async function () {
  try {
    const r = await fetch('/deployments/Hunt.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.address) window.HUNT_ADDRESS = j.address;
    return j;
  } catch { return null; }
};

// Hand-curated Hunt ABI — only the functions + events the static frontend uses.
// Verified against contracts/Hunt.sol on 2026-05-12. If you add a new ABI item here,
// re-verify the tuple component order matches Hunt.sol exactly.
window.HUNT_ABI = [
  // ── views ─────────────────────────────────────────────────────────────
  { type: 'function', stateMutability: 'view', name: 'totalHunters', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', stateMutability: 'view', name: 'totalBounties', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', stateMutability: 'view', name: 'nextHunterId', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', stateMutability: 'view', name: 'nextBountyId', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', stateMutability: 'view', name: 'teeSigner', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', stateMutability: 'view', name: 'verifier', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', stateMutability: 'view', name: 'admin', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function', stateMutability: 'view', name: 'getHunter',
    inputs: [{ name: 'hunterId', type: 'uint256' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'owner', type: 'address' },
        {
          name: 'credential', type: 'tuple', components: [
            { name: 'githubHandleHash', type: 'bytes32' },
            { name: 'accountAgeDays', type: 'uint32' },
            { name: 'mergedPRs', type: 'uint32' },
            { name: 'codeReviewCount', type: 'uint32' },
            { name: 'verifiedAt', type: 'uint64' },
            { name: 'verifier', type: 'address' },
            { name: 'sig', type: 'bytes' },
          ],
        },
        { name: 'sampleRoots', type: 'bytes32[]' },
        { name: 'embedRoots', type: 'bytes32[]' },
        {
          name: 'fingerprint', type: 'tuple', components: [
            { name: 'vocabEntropyBps', type: 'uint16' },
            { name: 'domainTermBps', type: 'uint16' },
            { name: 'structuralBps', type: 'uint16' },
            { name: 'specificityBps', type: 'uint16' },
            { name: 'overallBps', type: 'uint16' },
            { name: 'modelDigest', type: 'bytes32' },
            { name: 'teeSig', type: 'bytes' },
          ],
        },
        { name: 'specialty', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'paused', type: 'bool' },
        { name: 'totalWins', type: 'uint32' },
        { name: 'totalSubmissions', type: 'uint32' },
        { name: 'totalEarnedWei', type: 'uint64' },
      ],
    }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'getBounty',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'poster', type: 'address' },
        { name: 'maxPayout', type: 'uint256' },
        { name: 'codeRoot', type: 'bytes32' },
        { name: 'inScopeCwes', type: 'bytes32[]' },
        { name: 'postedAt', type: 'uint64' },
        { name: 'raceDeadline', type: 'uint64' },
        { name: 'settleDeadline', type: 'uint64' },
        { name: 'status', type: 'uint8' },
        { name: 'winningFindingIdx', type: 'uint256' },
      ],
    }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'getFindings',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]', components: [
        { name: 'hunterId', type: 'uint256' },
        { name: 'hunter', type: 'address' },
        { name: 'cweClass', type: 'bytes32' },
        { name: 'severity', type: 'uint8' },
        { name: 'findingRoot', type: 'bytes32' },
        { name: 'attestationDigest', type: 'bytes32' },
        { name: 'attestationSig', type: 'bytes' },
        { name: 'teeTimestamp', type: 'uint64' },
        { name: 'submittedAt', type: 'uint64' },
        { name: 'severityCalibrationBpsSelfEval', type: 'uint16' },
        { name: 'precisionBpsSelfEval', type: 'uint16' },
        { name: 'coverageBpsSelfEval', type: 'uint16' },
        { name: 'exploitabilityBpsSelfEval', type: 'uint16' },
      ],
    }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'getFindingsCount',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'getInScopeCwes',
    inputs: [{ name: 'bountyId', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'getClassRep',
    inputs: [{ name: 'hunterId', type: 'uint256' }, { name: 'cweClass', type: 'bytes32' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'wins', type: 'uint32' },
        { name: 'submissions', type: 'uint32' },
        { name: 'totalEarnedWei', type: 'uint64' },
        { name: 'sumSeverityCalibration', type: 'uint64' },
        { name: 'sumPrecision', type: 'uint64' },
        { name: 'sumCoverage', type: 'uint64' },
        { name: 'sumExploitability', type: 'uint64' },
      ],
    }],
  },
  {
    type: 'function', stateMutability: 'view', name: 'classAvg',
    inputs: [{ name: 'hunterId', type: 'uint256' }, { name: 'cweClass', type: 'bytes32' }],
    outputs: [
      { name: 'severityCalibrationBps', type: 'uint64' },
      { name: 'precisionBps', type: 'uint64' },
      { name: 'coverageBps', type: 'uint64' },
      { name: 'exploitabilityBps', type: 'uint64' },
    ],
  },

  // ── events (used for stats + chainscan deep-links) ────────────────────
  {
    type: 'event', name: 'BountyPosted', anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'poster', type: 'address' },
      { indexed: false, name: 'maxPayout', type: 'uint256' },
      { indexed: false, name: 'codeRoot', type: 'bytes32' },
      { indexed: false, name: 'raceDeadline', type: 'uint64' },
    ],
  },
  {
    type: 'event', name: 'FindingSubmitted', anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'findingIdx', type: 'uint256' },
      { indexed: true, name: 'hunterId', type: 'uint256' },
      { indexed: false, name: 'cweClass', type: 'bytes32' },
      { indexed: false, name: 'severity', type: 'uint8' },
      { indexed: false, name: 'teeTimestamp', type: 'uint64' },
    ],
  },
  {
    type: 'event', name: 'BountySettled', anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'winningFindingIdx', type: 'uint256' },
      { indexed: true, name: 'winningHunterId', type: 'uint256' },
      { indexed: false, name: 'cweClass', type: 'bytes32' },
      { indexed: false, name: 'paid', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'BountyExpired', anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: false, name: 'refunded', type: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'HunterMinted', anonymous: false,
    inputs: [
      { indexed: true, name: 'hunterId', type: 'uint256' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'githubHandleHash', type: 'bytes32' },
      { indexed: false, name: 'specialty', type: 'string' },
      { indexed: false, name: 'fingerprintOverallBps', type: 'uint16' },
    ],
  },
];
