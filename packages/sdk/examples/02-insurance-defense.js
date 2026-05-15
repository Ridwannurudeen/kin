import { ethers } from "ethers";
import {
  INSURANCE_DEFECT_CLASSES,
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from "../src/index.js";

const wallet = ethers.Wallet.createRandom();
const brief = {
  domain: "insurance-claim-denial-defense",
  insurer: "synthetic medicare advantage denial",
  class: INSURANCE_DEFECT_CLASSES[0],
};

const params = {
  bountyId: 11n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes("sealed denial package root")),
  agentId: 0n,
  classBytes32: classToBytes32(brief.class),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes("appeal grounds root")),
  modelDigest: ethers.keccak256(
    ethers.toUtf8Bytes("hunt-insurance-defense|hunt-insurance-defense-v0"),
  ),
  teeTimestamp: 1_715_430_101n,
  severityCalibrationBps: 7900,
  precisionBps: 8700,
  coverageBps: 8200,
  exploitabilityBps: 9100,
};

const { digest, sig } = await signAttestation(wallet, params);
console.log("brief:", brief);
console.log("digest:", digest);
console.log("verified:", verifyAttestation(params, sig, wallet.address));
