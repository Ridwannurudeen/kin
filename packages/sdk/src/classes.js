/**
 * Canonical class registries shared across Hunt's current domains.
 */
import { ethers } from "ethers";

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

export const INSURANCE_DEFECT_CLASSES = Object.freeze([
  "medical-necessity-misapplication",
  "coding-cpt-error",
  "prior-auth-overreach",
  "network-adequacy-violation",
  "erisa-procedural-defect",
  "state-external-review-misclassification",
]);

export const BENEFITS_DEFECT_CLASSES = Object.freeze([
  "medical-listing-misapplication",
  "residual-functional-capacity-error",
  "vocational-expert-misclassification",
  "duration-requirement-misapplication",
  "substantial-gainful-activity-miscalculation",
  "combined-impairments-omission",
  "treating-physician-opinion-weight",
]);

export const MEDICAL_READING_CLASSES = Object.freeze([
  "pathology-borderline-interpretation",
  "radiology-second-read-discrepancy",
  "oncology-staging-revision",
  "cardiology-ecg-echo-revision",
  "dermatology-pigmented-lesion-revision",
  "hematology-flow-cytometry-discordance",
]);

export function canonicalise(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function classToBytes32(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalise(name)));
}

export function bytes32ToClass(hash, registry) {
  const target = String(hash || "").toLowerCase();
  for (const entry of registry || []) {
    if (classToBytes32(entry).toLowerCase() === target) return entry;
  }
  return undefined;
}
