import { ethers } from 'ethers';
import {
  classToBytes32,
  findingDigest,
  signAttestation,
  verifyAttestation,
} from '../src/index.js';

const signer = ethers.Wallet.createRandom();

const brief = {
  domain: 'smart-contract-audit',
  sealedInput: 'Vault.sol with oracle staleness checks in admin path only',
  className: 'oracle-manipulation',
  severity: 3,
};

const params = {
  bountyId: 3n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes(brief.sealedInput)),
  agentId: 1n,
  classBytes32: classToBytes32(brief.className),
  severity: brief.severity,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('oracle stale-price finding')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1')),
  teeTimestamp: 1_763_000_000n,
  severityCalibrationBps: 8800,
  precisionBps: 9000,
  coverageBps: 8500,
  exploitabilityBps: 8700,
};

const { digest, sig } = await signAttestation(signer, params);

console.log('brief:', brief);
console.log('digest:', digest);
console.log('manual digest:', findingDigest(params));
console.log('verified:', verifyAttestation(params, sig, signer.address));
