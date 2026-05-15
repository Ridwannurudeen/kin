/**
 * Verifiable AI attestation digest helpers.
 */
import { ethers } from "ethers";

const ABI = ethers.AbiCoder.defaultAbiCoder();

/**
 * Compute the attestation digest for a finding/output. Matches the byte-for-byte
 * encoding the Hunt v1 contract ecrecover's against `teeSigner`.
 *
 * @param {object} params
 * @param {bigint} params.bountyId
 * @param {string} params.inputRoot
 * @param {bigint} params.agentId
 * @param {string} params.classBytes32
 * @param {number} params.severity
 * @param {string} params.outputRoot
 * @param {string} params.modelDigest
 * @param {bigint} params.teeTimestamp
 * @param {number} params.severityCalibrationBps
 * @param {number} params.precisionBps
 * @param {number} params.coverageBps
 * @param {number} params.exploitabilityBps
 * @returns {string}
 */
export function findingDigest(params) {
  return ethers.keccak256(
    ABI.encode(
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
        params.bountyId,
        params.inputRoot,
        params.agentId,
        params.classBytes32,
        params.severity,
        params.outputRoot,
        params.modelDigest,
        params.teeTimestamp,
        params.severityCalibrationBps,
        params.precisionBps,
        params.coverageBps,
        params.exploitabilityBps,
      ],
    ),
  );
}

export const FINDING_DIGEST_ABI = [
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
];
