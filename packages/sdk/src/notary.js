// Helpers for HuntNotary attestations.

import { ethers } from 'ethers';

export const ZERO_BYTES32 = '0x' + '00'.repeat(32);

export const NOTARY_ABI = Object.freeze([
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'attest',
    inputs: [
      { name: 'contentHash', type: 'bytes32' },
      { name: 'modelDigest', type: 'bytes32' },
      { name: 'domain', type: 'bytes32' },
      { name: 'sealedInputRoot', type: 'bytes32' },
    ],
    outputs: [{ name: 'attestId', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getAttestation',
    inputs: [{ name: 'attestId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'contentHash', type: 'bytes32' },
          { name: 'modelDigest', type: 'bytes32' },
          { name: 'domain', type: 'bytes32' },
          { name: 'attestedAt', type: 'uint64' },
          { name: 'sealedInputRoot', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'totalAttestations',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
]);

export function hashContent(transcript) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(transcript)));
}

export function modelToDigest(modelName) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(modelName)));
}

export function domainToBytes32(domain) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(domain)));
}

export function buildNotaryArgs({ transcript, model, domain, sealedInputRoot = ZERO_BYTES32 }) {
  return [
    hashContent(transcript),
    modelToDigest(model),
    domainToBytes32(domain),
    sealedInputRoot,
  ];
}
