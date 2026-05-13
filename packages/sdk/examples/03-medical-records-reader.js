import { ethers } from 'ethers';
import {
  classToBytes32,
  MEDICAL_READING_CLASSES,
  signAttestation,
  verifyAttestation,
} from '../src/index.js';

const signer = ethers.Wallet.createRandom();

const brief = {
  domain: 'medical-records-reader',
  recordType: 'synthetic pathology report',
  scopeLimit: 'questions for physician, not diagnosis',
  inScope: MEDICAL_READING_CLASSES,
};

const params = {
  bountyId: 0n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(brief))),
  agentId: 0n,
  classBytes32: classToBytes32('pathology-borderline-interpretation'),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('second-opinion question set')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('hunt-medical-records-reader-v0')),
  teeTimestamp: 1_763_000_020n,
  severityCalibrationBps: 7600,
  precisionBps: 7800,
  coverageBps: 8200,
  exploitabilityBps: 7300,
};

const { digest, sig } = await signAttestation(signer, params);

console.log('brief:', brief);
console.log('digest:', digest);
console.log('class:', params.classBytes32);
console.log('verified:', verifyAttestation(params, sig, signer.address));
