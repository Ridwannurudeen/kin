// Canonical CWE/SWC class registry for Hunt.
//
// Hunters and posters must agree on the kebab-case string for each class because the
// on-chain `inScopeCwes` array stores keccak256 hashes of those strings. Both sides hash
// via `cweToBytes32`, which lowercases + kebab-cases + matches against `CANONICAL_CWES`.
// Unknown classes throw — silently bucketing them would let a hunter submit
// "swc-107-reentrancyy" and have it never match any poster's scope.

import { ethers } from 'ethers';

/// Frozen list of canonical class strings. Order matters only for stability; lookups are
/// by Set membership. Covers the common SWC/DASP-Top-10 + a few related primitives.
export const CANONICAL_CWES = Object.freeze([
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

const CANONICAL_SET = new Set(CANONICAL_CWES);

/// Canonicalise an arbitrary class string: lowercase, collapse whitespace/underscores to
/// hyphens, drop non-alphanumeric-or-hyphen, collapse repeated hyphens, trim leading/
/// trailing hyphens. Mirrors the kebabCweClass logic used by lib/review.js so the same
/// model output round-trips cleanly.
function canonicalise(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/// Hash a CWE class string to bytes32 for on-chain comparison. Throws on unknown classes.
export function cweToBytes32(cweClassString) {
  const canonical = canonicalise(cweClassString);
  if (!CANONICAL_SET.has(canonical)) {
    throw new Error(`unknown CWE class: ${cweClassString} (canonical: ${canonical})`);
  }
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

/// Inverse lookup: given a bytes32 hash (e.g. from on-chain inScopeCwes), find the
/// canonical string. Returns undefined if the hash matches no canonical class.
export function bytes32ToCwe(hash) {
  const target = String(hash).toLowerCase();
  for (const c of CANONICAL_CWES) {
    if (ethers.keccak256(ethers.toUtf8Bytes(c)).toLowerCase() === target) return c;
  }
  return undefined;
}

const SEVERITY_MAP = { critical: 4, high: 3, medium: 2, low: 1 };

/// Map a severity string ('critical' | 'high' | 'medium' | 'low') to the 1..4 uint
/// expected by Hunt.submitFinding. Throws on anything else.
export function severityToUint(sev) {
  const n = SEVERITY_MAP[String(sev || '').toLowerCase()];
  if (!n) throw new Error(`bad severity: ${sev} (want critical|high|medium|low)`);
  return n;
}
