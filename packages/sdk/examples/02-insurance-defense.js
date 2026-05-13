import { ethers } from 'ethers';
import {
  classToBytes32,
  INSURANCE_DEFECT_CLASSES,
  signAttestation,
  verifyAttestation,
} from '../src/index.js';

const signer = ethers.Wallet.createRandom();

const brief = {
  domain: 'insurance-claim-denial-defense',
  insurer: 'ACME Medicare Advantage Plan',
  service: 'Skilled nursing facility continuation',
  inScope: INSURANCE_DEFECT_CLASSES.slice(0, 3),
};

const params = {
  bountyId: 0n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(brief))),
  agentId: 0n,
  classBytes32: classToBytes32('medical-necessity-misapplication'),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('appeal defect with CFR citation')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('hunt-insurance-defense-v0')),
  teeTimestamp: 1_763_000_010n,
  severityCalibrationBps: 8100,
  precisionBps: 7900,
  coverageBps: 8400,
  exploitabilityBps: 8600,
};

const { digest, sig } = await signAttestation(signer, params);

console.log('brief:', brief);
console.log('digest:', digest);
console.log('class:', params.classBytes32);
console.log('verified:', verifyAttestation(params, sig, signer.address));
