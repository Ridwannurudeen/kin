import { ethers } from "ethers";
import {
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from "../src/index.js";

const wallet = ethers.Wallet.createRandom();
const sentimentRegistry = Object.freeze([
  "positive",
  "negative",
  "mixed",
  "urgent-review",
]);

const brief = {
  domain: "tweet-sentiment-classification",
  labels: sentimentRegistry,
  class: "urgent-review",
};

const params = {
  bountyId: 41n,
  inputRoot: ethers.keccak256(
    ethers.toUtf8Bytes("sealed social post batch root"),
  ),
  agentId: 8n,
  classBytes32: classToBytes32(brief.class),
  severity: 2,
  outputRoot: ethers.keccak256(
    ethers.toUtf8Bytes("classification output root"),
  ),
  modelDigest: ethers.keccak256(
    ethers.toUtf8Bytes("generic-classifier|sentiment-v1"),
  ),
  teeTimestamp: 1_715_430_322n,
  severityCalibrationBps: 7200,
  precisionBps: 8100,
  coverageBps: 7800,
  exploitabilityBps: 7600,
};

const { digest, sig } = await signAttestation(wallet, params);
console.log("brief:", brief);
console.log("digest:", digest);
console.log("verified:", verifyAttestation(params, sig, wallet.address));
