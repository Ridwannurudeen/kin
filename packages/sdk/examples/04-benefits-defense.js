import { ethers } from "ethers";
import {
  BENEFITS_DEFECT_CLASSES,
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from "../src/index.js";

const wallet = ethers.Wallet.createRandom();
const brief = {
  domain: "benefits-defense",
  claimType: "SSDI reconsideration",
  class: BENEFITS_DEFECT_CLASSES[2],
};

const params = {
  bountyId: 31n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes("sealed ssdi denial root")),
  agentId: 4n,
  classBytes32: classToBytes32(brief.class),
  severity: 3,
  outputRoot: ethers.keccak256(
    ethers.toUtf8Bytes("appeal grounds packet root"),
  ),
  modelDigest: ethers.keccak256(
    ethers.toUtf8Bytes("hunt-benefits-defense|hunt-benefits-defense-v0"),
  ),
  teeTimestamp: 1_715_430_255n,
  severityCalibrationBps: 8100,
  precisionBps: 8500,
  coverageBps: 8300,
  exploitabilityBps: 9000,
};

const { digest, sig } = await signAttestation(wallet, params);
console.log("brief:", brief);
console.log("digest:", digest);
console.log("verified:", verifyAttestation(params, sig, wallet.address));
