// Canonical CWE/SWC class registry for Hunt.
//
// Hunters and posters must agree on the kebab-case string for each class because the
// on-chain `inScopeCwes` array stores keccak256 hashes of those strings. Both sides hash
// via `cweToBytes32`, which lowercases + kebab-cases + matches against `CANONICAL_CWES`.
// Unknown classes throw — silently bucketing them would let a hunter submit
// "swc-107-reentrancyy" and have it never match any poster's scope.

import { ethers } from "ethers";

/// Smart-contract CWE registry (Hunt v1, the only domain with end-to-end on-chain
/// race + settle lifecycle today).
export const SMART_CONTRACT_CWES = Object.freeze([
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

/// Insurance-defect classes. Used by audits/insurance/ vertical. The on-chain
/// contract treats these as opaque bytes32 — the runtime here is what enforces
/// the canonical string set so a hunter can't submit "erisa-procedural-defectt"
/// and have it never match any poster's scope.
export const INSURANCE_DEFECT_CLASSES = Object.freeze([
  "medical-necessity-misapplication",
  "coding-cpt-error",
  "prior-auth-overreach",
  "network-adequacy-violation",
  "erisa-procedural-defect",
  "state-external-review-misclassification",
]);

/// SSDI / SSI / Medicare / VA defect classes. Used by audits/benefits/ vertical.
export const BENEFITS_DEFECT_CLASSES = Object.freeze([
  "medical-listing-misapplication",
  "residual-functional-capacity-error",
  "vocational-expert-misclassification",
  "duration-requirement-misapplication",
  "substantial-gainful-activity-miscalculation",
  "combined-impairments-omission",
  "treating-physician-opinion-weight",
]);

/// Medical records-reader classes. Used by audits/medical/ vertical.
/// IMPORTANT: this is a "Records Reader," NOT an "AI Doctor." Hunters surface
/// questions a patient should ask their physician — never diagnoses, never
/// treatment recommendations. See audits/medical/README.md for the scope
/// discipline rationale (21st-Century-Cures CDS exemptions; EU AI Act Annex
/// III high-risk SaMD exclusion).
export const MEDICAL_READING_CLASSES = Object.freeze([
  "pathology-borderline-interpretation",
  "radiology-second-read-discrepancy",
  "oncology-staging-revision",
  "cardiology-ecg-echo-revision",
  "dermatology-pigmented-lesion-revision",
  "hematology-flow-cytometry-discordance",
]);

/// Backwards-compat: CANONICAL_CWES used to mean smart-contract classes only.
/// Now it's the union of every domain registry so cweToBytes32() accepts every
/// canonical class string Hunt understands. Domain-specific consumers should
/// import the per-domain frozen arrays directly.
export const CANONICAL_CWES = Object.freeze([
  ...SMART_CONTRACT_CWES,
  ...INSURANCE_DEFECT_CLASSES,
  ...BENEFITS_DEFECT_CLASSES,
  ...MEDICAL_READING_CLASSES,
]);

/// Domain identifier for each canonical class — used by bytes32ToDomain to tag
/// an on-chain inScopeCwes entry with its vertical.
export const CLASS_DOMAIN = Object.freeze(
  Object.fromEntries([
    ...SMART_CONTRACT_CWES.map((c) => [c, "smart-contract"]),
    ...INSURANCE_DEFECT_CLASSES.map((c) => [c, "insurance"]),
    ...BENEFITS_DEFECT_CLASSES.map((c) => [c, "benefits"]),
    ...MEDICAL_READING_CLASSES.map((c) => [c, "medical"]),
  ]),
);

const CANONICAL_SET = new Set(CANONICAL_CWES);

/// Canonicalise an arbitrary class string: lowercase, collapse whitespace/underscores to
/// hyphens, drop non-alphanumeric-or-hyphen, collapse repeated hyphens, trim leading/
/// trailing hyphens. Mirrors the kebabCweClass logic used by lib/review.js so the same
/// model output round-trips cleanly.
function canonicalise(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/// Hash a CWE class string to bytes32 for on-chain comparison. Throws on unknown classes.
export function cweToBytes32(cweClassString) {
  const canonical = canonicalise(cweClassString);
  if (!CANONICAL_SET.has(canonical)) {
    throw new Error(
      `unknown CWE class: ${cweClassString} (canonical: ${canonical})`,
    );
  }
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

/// Inverse lookup: given a bytes32 hash (e.g. from on-chain inScopeCwes), find the
/// canonical string. Returns undefined if the hash matches no canonical class.
export function bytes32ToCwe(hash) {
  const target = String(hash).toLowerCase();
  for (const c of CANONICAL_CWES) {
    if (ethers.keccak256(ethers.toUtf8Bytes(c)).toLowerCase() === target)
      return c;
  }
  return undefined;
}

/// Reverse-lookup the domain tag ('smart-contract' | 'insurance' | 'benefits' |
/// 'medical') for an on-chain bytes32 cweClass hash. Returns undefined if the
/// hash isn't a canonical class.
export function bytes32ToDomain(hash) {
  const name = bytes32ToCwe(hash);
  return name ? CLASS_DOMAIN[name] : undefined;
}

const SEVERITY_MAP = { critical: 4, high: 3, medium: 2, low: 1 };

/// Map a severity string ('critical' | 'high' | 'medium' | 'low') to the 1..4 uint
/// expected by Hunt.submitFinding. Throws on anything else.
export function severityToUint(sev) {
  const n = SEVERITY_MAP[String(sev || "").toLowerCase()];
  if (!n)
    throw new Error(`bad severity: ${sev} (want critical|high|medium|low)`);
  return n;
}
