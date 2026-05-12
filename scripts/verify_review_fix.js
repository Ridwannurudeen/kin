// Verify the maxTokens fix end-to-end: production lib/review.js → lib/inference.js → broker →
// GLM-5-FP8 Sealed Inference → parseReviewResponse. If this prints "✓ PARSED", the fix is real.

import "dotenv/config";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { getBroker, sealedQuery } from "../lib/inference.js";
import { generateReview } from "../lib/review.js";

const wallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  new ethers.JsonRpcProvider(process.env.ZG_RPC_URL || "https://evmrpc.0g.ai"),
);
const tmp = await createZGComputeNetworkBroker(wallet);
const services = await tmp.inference.listService();
const GLM = services[0].provider;
const broker = await getBroker(wallet, GLM);

const invokeLLM = ({ system, user, maxTokens }) =>
  sealedQuery({
    broker,
    providerAddress: GLM,
    system,
    question: user,
    contextBlocks: [],
    maxTokens,
  });

const brief = {
  chain: "0G Aristotle",
  language: "solidity",
  contractsInScope: ["Vault.sol"],
  focus: ["oracle-manipulation", "access-control", "reentrancy"],
  diff: `pragma solidity ^0.8.20;
interface IOracle { function latestRoundData() external view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80); }
contract Vault {
  IOracle public oracle; uint256 public maxOracleStaleness = 3600; uint256 public lastPrice;
  function _currentPrice() internal view returns (uint256) { (,int256 a,,uint256 u,) = oracle.latestRoundData(); return uint256(a); }
  function setPrice() external { (,int256 a,,uint256 u,) = oracle.latestRoundData(); require(block.timestamp - u <= maxOracleStaleness, "stale"); lastPrice = uint256(a); }
  function liquidate(address user) external { uint256 p = _currentPrice(); /* uses p without freshness check */ }
}`,
};
const samples = [
  "Oracle returning stale price during volatile periods enabled liquidation of healthy positions in Prisma Finance audit (Code4rena Mar 2024). Pattern: latestRoundData read without block.timestamp - updatedAt check on user-facing read paths.",
];

console.log(
  "[verify] running generateReview with maxTokens=5000 against GLM-5-FP8...",
);
const t0 = Date.now();
let res;
try {
  res = await generateReview({ invokeLLM, samples, brief, maxTokens: 5000 });
} catch (e) {
  console.log(`[verify] ✗ THROWN: ${e.message.slice(0, 300)}`);
  process.exit(2);
}
const dtMs = Date.now() - t0;
console.log(`[verify] ✓ PARSED in ${dtMs}ms`);
console.log(`[verify] model:          ${res.modelName}`);
console.log(`[verify] modelDigest:    ${res.modelDigest}`);
console.log(
  `[verify] attestation:    ${res.attestationId} valid=${res.attestationValid}`,
);
console.log(`[verify] findings count: ${res.findings.length}`);
for (const f of res.findings) {
  console.log(`   - ${f.cweClass} / ${f.severity}  ${f.loc}`);
  console.log(`     issue: ${f.issue.slice(0, 140)}`);
}
console.log(
  `[verify] selfEval: sev=${res.selfEval.severityCalibrationBps} prec=${res.selfEval.precisionBps} cov=${res.selfEval.coverageBps} exploit=${res.selfEval.exploitabilityBps} overall=${res.selfEval.overallBps}`,
);
console.log(`[verify] rationale: ${res.selfEval.rationale.slice(0, 200)}`);
