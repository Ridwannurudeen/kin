// Settle a Hunt bounty as the poster. Picks the winning finding + rates it 1..5 per axis.
// Reputation accrues to the winning hunter per their finding's CWE class.
//
// Usage: BOUNTY_ID=0 FINDING_IDX=0 node scripts/settle_bounty.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
const BOUNTY_ID = BigInt(process.env.BOUNTY_ID ?? '0');
const FINDING_IDX = BigInt(process.env.FINDING_IDX ?? '0');
const RATING = {
  severityCalibration: Number(process.env.RATING_SEVERITY    ?? 5),
  precision:           Number(process.env.RATING_PRECISION   ?? 4),
  coverage:            Number(process.env.RATING_COVERAGE    ?? 4),
  exploitability:      Number(process.env.RATING_EXPLOIT     ?? 5),
};

if (!PK) { console.error('PRIVATE_KEY required'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PK, provider);
const artifact = JSON.parse(await fs.readFile('deployments/Hunt.json', 'utf8'));
const hunt = new ethers.Contract(artifact.address, artifact.abi, wallet);

console.log(`Hunt:       ${artifact.address}`);
console.log(`poster:     ${wallet.address}`);
console.log(`bountyId:   ${BOUNTY_ID}`);
console.log(`findingIdx: ${FINDING_IDX}`);
console.log(`rating:     sev=${RATING.severityCalibration} prec=${RATING.precision} cov=${RATING.coverage} expl=${RATING.exploitability}`);

const bounty = await hunt.getBounty(BOUNTY_ID);
const blk = await provider.getBlock('latest');
console.log(`status:     ${bounty.status} (0=Open,1=Settled,2=Expired)`);
console.log(`raceDeadline: ${new Date(Number(bounty.raceDeadline)*1000).toISOString()}`);
console.log(`chain time: ${new Date(blk.timestamp*1000).toISOString()}`);

if (blk.timestamp <= Number(bounty.raceDeadline)) {
  const wait = Number(bounty.raceDeadline) - blk.timestamp + 5;
  console.log(`race still on — waiting ${wait}s for raceDeadline + 5s buffer...`);
  await new Promise(r => setTimeout(r, wait * 1000));
}

const findings = await hunt.getFindings(BOUNTY_ID);
console.log(`\nfindings on-chain: ${findings.length}`);
for (let i = 0; i < findings.length; i++) {
  const f = findings[i];
  console.log(`  [${i}] hunter#${f.hunterId} cwe=${f.cweClass.slice(0,18)}… sev=${f.severity} teeTs=${f.teeTimestamp}`);
}

console.log(`\nsettling bounty #${BOUNTY_ID} with winning findingIdx=${FINDING_IDX}...`);
const tx = await hunt.settleBounty(BOUNTY_ID, FINDING_IDX, RATING);
console.log(`tx: ${tx.hash}`);
const rcpt = await tx.wait();
console.log(`block: ${rcpt.blockNumber} | gas: ${rcpt.gasUsed}`);

const settled = await hunt.getBounty(BOUNTY_ID);
const winning = await hunt.getFindings(BOUNTY_ID).then(fs => fs[Number(FINDING_IDX)]);
const classRep = await hunt.getClassRep(winning.hunterId, winning.cweClass);
const classAvg = await hunt.classAvg(winning.hunterId, winning.cweClass);
const winnerHunter = await hunt.getHunter(winning.hunterId);

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`SETTLED.`);
console.log(`winner:           hunter #${winning.hunterId} (${winning.hunter})`);
console.log(`winning cwe:      ${winning.cweClass}`);
console.log(`payout:           ${ethers.formatEther(bounty.maxPayout)} OG (transferred to winner)`);
console.log(`settle tx:        ${tx.hash}`);
console.log(`chainscan:        https://chainscan.0g.ai/tx/${tx.hash}`);
console.log(`\n── per-CWE reputation now ──`);
console.log(`  wins:                ${classRep.wins}`);
console.log(`  submissions:         ${classRep.submissions}`);
console.log(`  totalEarnedWei:      ${classRep.totalEarnedWei}`);
console.log(`  avg severityCalibBps:  ${classAvg.severityCalibrationBps}`);
console.log(`  avg precisionBps:      ${classAvg.precisionBps}`);
console.log(`  avg coverageBps:       ${classAvg.coverageBps}`);
console.log(`  avg exploitabilityBps: ${classAvg.exploitabilityBps}`);
console.log(`\n── hunter aggregate ──`);
console.log(`  totalWins:           ${winnerHunter.totalWins}`);
console.log(`  totalSubmissions:    ${winnerHunter.totalSubmissions}`);
console.log(`  totalEarnedWei:      ${winnerHunter.totalEarnedWei}`);
console.log(`────────────────────────────────────────────────────────────`);
