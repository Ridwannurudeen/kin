// One-shot orchestrator: run all 3 hunter personas against a single bounty.
// Bypasses scripts/hunter.js's file-lock + single-hunter-per-process pattern for the demo.
//
// Usage: BOUNTY_ID=0 node scripts/run_race.js
//
// All 3 hunters share the funder's 0G compute broker (so we don't need each persona wallet
// to fund its own 3 OG inference ledger). The on-chain submitFinding tx is signed by each
// hunter's own wallet, so race-time ordering is real.

import "dotenv/config";
import fs from "node:fs/promises";
import { ethers } from "ethers";

import {
  uploadRaw,
  downloadRaw,
  downloadEncryptedRecord,
} from "../lib/storage.js";
import { getBroker, sealedQuery } from "../lib/inference.js";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { processBounty } from "./hunter.js";

const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const PK = process.env.PRIVATE_KEY;
const TEE_SIGNER_PK = process.env.TEE_SIGNER_PRIVATE_KEY || PK;
const BOUNTY_ID = BigInt(process.env.BOUNTY_ID ?? "0");

if (!PK) {
  console.error("PRIVATE_KEY required (funder)");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder = new ethers.Wallet(PK, provider);
const teeSigner = new ethers.Wallet(TEE_SIGNER_PK);

const artifact = JSON.parse(await fs.readFile("deployments/Hunt.json", "utf8"));
const huntRead = new ethers.Contract(artifact.address, artifact.abi, provider);

const hunterWallets = JSON.parse(
  await fs.readFile("demo/.hunter-wallets.json", "utf8"),
);
const networkKey = await fs.readFile(".hunter-network-key.bin");

console.log(`Hunt:      ${artifact.address}`);
console.log(`funder:    ${funder.address}`);
console.log(`teeSigner: ${teeSigner.address}`);
console.log(`bountyId:  ${BOUNTY_ID}`);

const bounty = await huntRead.getBounty(BOUNTY_ID);
console.log(
  `bounty:    poster=${bounty.poster} payout=${ethers.formatEther(bounty.maxPayout)} OG ` +
    `raceDeadline=${new Date(Number(bounty.raceDeadline) * 1000).toISOString()}`,
);
const evt = (
  await huntRead.queryFilter(huntRead.filters.BountyPosted(BOUNTY_ID), -10000)
)[0];
if (!evt) {
  console.error("no BountyPosted event found in last 10000 blocks");
  process.exit(1);
}
console.log(`bountyPostTx: ${evt.transactionHash}`);

// Shared 0G compute broker (funder's ledger). All 3 hunters' inference calls flow through this.
console.log("\ninitialising shared 0G compute broker (funder)...");
const tmp = await createZGComputeNetworkBroker(funder);
const services = await tmp.inference.listService();
const providerAddr = services[0]?.provider;
if (!providerAddr) {
  console.error("no inference providers");
  process.exit(1);
}
const broker = await getBroker(funder, providerAddr);
const invokeLLM = ({ system, user, maxTokens }) =>
  sealedQuery({
    broker,
    providerAddress: providerAddr,
    system,
    question: user,
    contextBlocks: [],
    maxTokens,
  });

const storage = { downloadRaw, downloadEncryptedRecord, uploadRaw };

// personaId → CWE classes the hunter claims as their specialty. Each persona's samples
// are 100% drawn from one class (see demo/hunter-personas.json), so the on-chain hunter
// identity *is* a specialist. processBounty intersects this with the bounty's inScopeCwes
// to compute effectiveScope: a reentrancy specialist will never submit an oracle finding,
// even on a bounty whose scope includes oracle.
const PERSONA_SPECIALTY_CWES = {
  "reentrancy-specialist": ["swc-107-reentrancy"],
  "oracle-specialist": ["oracle-manipulation"],
  "access-control-specialist": ["access-control"],
};

// Build a runner for one hunter persona.
async function runHunter(personaId) {
  const w = hunterWallets[personaId];
  if (!w) throw new Error(`no wallet for ${personaId}`);
  const operator = new ethers.Wallet(w.privateKey, provider);
  const hunt = new ethers.Contract(artifact.address, artifact.abi, operator);
  const hunter = await huntRead.getHunter(BigInt(w.hunterId));
  const sampleKey = Buffer.from(w.sampleKey.slice(2), "hex");
  const hunterSpecialtyCwes = PERSONA_SPECIALTY_CWES[personaId] || null;

  console.log(
    `\n[${personaId}] starting (hunterId=${w.hunterId}, wallet=${operator.address.slice(0, 10)}…, specialty=${hunterSpecialtyCwes?.join(",") || "generalist"})`,
  );

  try {
    const result = await processBounty({
      hunt,
      provider,
      operator,
      teeSigner,
      sampleKey,
      networkKey,
      storage,
      invokeLLM,
      hunter,
      hunterId: BigInt(w.hunterId),
      bounty,
      bountyId: BOUNTY_ID,
      evtTxHash: evt.transactionHash,
      hunterSpecialtyCwes,
      logger: (msg) => console.log(`[${personaId}] ${msg}`),
    });
    return { personaId, ...result };
  } catch (e) {
    return { personaId, ok: false, reason: e.message };
  }
}

// Run the 3 hunters strictly sequentially, not concurrently. The 0G inference proxy
// rate-limits / rejects overlapping requests from the same operator wallet — and all 3
// hunters share the funder's broker. The old 8s start-stagger was insufficient: hunters
// run for minutes, so they still overlapped heavily and ~2 of 3 hit `fetch failed` on
// every retry (observed across bounties #2,#3,#8–#17). Sequential execution gives each
// hunter the endpoint to itself. Race semantics still hold — all 3 submit before the
// same on-chain raceDeadline; post bounties with a longer race duration to fit 3 in.
console.log("\n=== RACE START ===");
const personaIds = Object.keys(hunterWallets);
const results = [];
for (const id of personaIds) {
  results.push(await runHunter(id));
}

console.log("\n=== RACE END ===");
for (const r of results) {
  if (r.ok) {
    console.log(
      `  ✓ ${r.personaId} → ${r.cweClass} severity=${r.severity} tx=${r.txHash} attempts=${r.attempts}`,
    );
  } else {
    console.log(`  ✗ ${r.personaId} → ${r.reason}`);
  }
}

// Print current on-chain state
const findingsCount = await huntRead.getFindingsCount(BOUNTY_ID);
console.log(`\non-chain findings count: ${findingsCount}`);
if (findingsCount > 0n) {
  const findings = await huntRead.getFindings(BOUNTY_ID);
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    console.log(
      `  finding[${i}]: hunter#${f.hunterId} cwe=${f.cweClass.slice(0, 18)}… sev=${f.severity} teeTs=${f.teeTimestamp} tx submittedAt=${f.submittedAt}`,
    );
  }
}
