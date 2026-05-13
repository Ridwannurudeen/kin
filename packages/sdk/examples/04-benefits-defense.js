import { ethers } from 'ethers';
import {
  BENEFITS_DEFECT_CLASSES,
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from '../src/index.js';

const signer = ethers.Wallet.createRandom();

const brief = {
  domain: 'benefits-defense',
  claimType: 'SSDI Title II',
  stage: 'initial determination',
  inScope: BENEFITS_DEFECT_CLASSES,
};

const params = {
  bountyId: 0n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(brief))),
  agentId: 0n,
  classBytes32: classToBytes32('residual-functional-capacity-error'),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('appeal ground with SSR citation')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('hunt-benefits-defense-v0')),
  teeTimestamp: 1_763_000_030n,
  severityCalibrationBps: 8000,
  precisionBps: 7700,
  coverageBps: 8500,
  exploitabilityBps: 8300,
};

const { digest, sig } = await signAttestation(signer, params);

console.log('brief:', brief);
console.log('digest:', digest);
console.log('class:', params.classBytes32);
console.log('verified:', verifyAttestation(params, sig, signer.address));
