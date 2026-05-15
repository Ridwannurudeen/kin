import { ethers } from "ethers";
import {
  SMART_CONTRACT_CWES,
  classToBytes32,
  signAttestation,
  verifyAttestation,
} from "../src/index.js";

const wallet = ethers.Wallet.createRandom();
const brief = {
  domain: "smart-contract-audit",
  target: "Vault.sol oracle-staleness review",
  class: SMART_CONTRACT_CWES[3],
};

const params = {
  bountyId: 3n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes("sealed vault source root")),
  agentId: 1n,
  classBytes32: classToBytes32(brief.class),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes("encrypted finding root")),
  modelDigest: ethers.keccak256(
    ethers.toUtf8Bytes("zai-org/GLM-5-FP8|hunt-audit-v1"),
  ),
  teeTimestamp: 1_715_430_034n,
  severityCalibrationBps: 8500,
  precisionBps: 9200,
  coverageBps: 8800,
  exploitabilityBps: 9000,
};

const { digest, sig } = await signAttestation(wallet, params);
console.log("brief:", brief);
console.log("digest:", digest);
console.log("verified:", verifyAttestation(params, sig, wallet.address));
