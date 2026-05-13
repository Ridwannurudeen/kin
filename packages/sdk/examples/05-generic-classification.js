import { ethers } from 'ethers';
import {
  bytes32ToClass,
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from '../src/index.js';

const signer = ethers.Wallet.createRandom();
const SENTIMENT_CLASSES = Object.freeze([
  'bullish',
  'bearish',
  'neutral',
  'uncertain',
]);

const brief = {
  domain: 'tweet-sentiment-classification',
  text: 'Builders keep asking for verifiable AI receipts on 0G.',
  customRegistry: SENTIMENT_CLASSES,
};

const classBytes32 = classToBytes32('Bullish');
const params = {
  bountyId: 42n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes(brief.text)),
  agentId: 7n,
  classBytes32,
  severity: 1,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('bullish classification, confidence 0.82')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('sentiment-model-v1')),
  teeTimestamp: 1_763_000_040n,
  severityCalibrationBps: 8200,
  precisionBps: 8100,
  coverageBps: 9000,
  exploitabilityBps: 7000,
};

const { digest, sig } = await signAttestation(signer, params);

console.log('brief:', brief);
console.log('digest:', digest);
console.log('class:', bytes32ToClass(classBytes32, SENTIMENT_CLASSES));
console.log('verified:', verifyAttestation(params, sig, signer.address));
