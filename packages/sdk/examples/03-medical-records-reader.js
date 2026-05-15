import { ethers } from "ethers";
import {
  MEDICAL_READING_CLASSES,
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from "../src/index.js";

const wallet = ethers.Wallet.createRandom();
const brief = {
  domain: "medical-records-reader",
  specialty: "breast pathology second-read question",
  class: MEDICAL_READING_CLASSES[0],
};

const params = {
  bountyId: 21n,
  inputRoot: ethers.keccak256(
    ethers.toUtf8Bytes("sealed pathology report root"),
  ),
  agentId: 2n,
  classBytes32: classToBytes32(brief.class),
  severity: 2,
  outputRoot: ethers.keccak256(
    ethers.toUtf8Bytes("questions-for-physician root"),
  ),
  modelDigest: ethers.keccak256(
    ethers.toUtf8Bytes(
      "hunt-medical-records-reader|hunt-medical-records-reader-v0",
    ),
  ),
  teeTimestamp: 1_715_430_188n,
  severityCalibrationBps: 7600,
  precisionBps: 8400,
  coverageBps: 7900,
  exploitabilityBps: 8600,
};

const { digest, sig } = await signAttestation(wallet, params);
console.log("brief:", brief);
console.log("digest:", digest);
console.log("verified:", verifyAttestation(params, sig, wallet.address));
