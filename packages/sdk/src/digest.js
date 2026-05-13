// Verbatim re-implementation of lib/credential.js findingDigest, with renamed
// parameters to be domain-agnostic. Used by all four Hunt verticals + any
// downstream consumer.
import { ethers } from 'ethers';

const ABI = ethers.AbiCoder.defaultAbiCoder();

/**
 * Compute the attestation digest for a finding/output. Matches the byte-for-byte
 * encoding the Hunt v1 contract ecrecover's against `teeSigner`.
 *
 * @param {object} params
 * @param {bigint} params.bountyId         - uint256 - the bounty/job identifier
 * @param {string} params.inputRoot        - bytes32 - keccak of the sealed input blob (codeRoot in v1)
 * @param {bigint} params.agentId          - uint256 - the agent/hunter identifier
 * @param {string} params.classBytes32     - bytes32 - keccak256(utf8(canonical class name))
 * @param {number} params.severity         - uint8   - 1..4 (low..critical)
 * @param {string} params.outputRoot       - bytes32 - keccak of the encrypted output blob (findingRoot in v1)
 * @param {string} params.modelDigest      - bytes32 - keccak256(utf8(model name + version))
 * @param {bigint} params.teeTimestamp     - uint64  - timestamp the agent claims it ran the model at
 * @param {number} params.severityCalibrationBps - uint16 - 0..10000
 * @param {number} params.precisionBps     - uint16  - 0..10000
 * @param {number} params.coverageBps      - uint16  - 0..10000
 * @param {number} params.exploitabilityBps - uint16 - 0..10000
 * @returns {string} bytes32 keccak digest as 0x-prefixed hex
 */
export function findingDigest(params) {
  return ethers.keccak256(ABI.encode(
    ['uint256', 'bytes32', 'uint256', 'bytes32', 'uint8', 'bytes32', 'bytes32',
     'uint64', 'uint16', 'uint16', 'uint16', 'uint16'],
    [params.bountyId, params.inputRoot, params.agentId, params.classBytes32,
     params.severity, params.outputRoot, params.modelDigest, params.teeTimestamp,
     params.severityCalibrationBps, params.precisionBps, params.coverageBps,
     params.exploitabilityBps],
  ));
}

export const FINDING_DIGEST_ABI = [
  'uint256', 'bytes32', 'uint256', 'bytes32', 'uint8', 'bytes32', 'bytes32',
  'uint64', 'uint16', 'uint16', 'uint16', 'uint16',
];
