// End-to-end Kin demo: user mints skill → client posts job → agent runs in TEE → settles on-chain.
// Three actors: deployer (pays gas + acts as agent runner), demo_user (skill owner), demo_client (job poster)
//
// Usage:
//   PRIVATE_KEY=0x... node scripts/e2e_job.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { genKey, uploadEncryptedRecord, downloadEncryptedRecord } from '../lib/storage.js';
import { getBroker, sealedQuery } from '../lib/inference.js';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error('PRIVATE_KEY missing'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const operator = new ethers.Wallet(PK, provider);

const demoWallets = JSON.parse(await fs.readFile('.demo-wallets.json', 'utf8'));
const userWallet = new ethers.Wallet(demoWallets.user.privateKey, provider);
const clientWallet = new ethers.Wallet(demoWallets.client.privateKey, provider);

const artifact = JSON.parse(await fs.readFile('deployments/Kin.json', 'utf8'));
const kinAsOperator = new ethers.Contract(artifact.address, artifact.abi, operator);
const kinAsUser    = new ethers.Contract(artifact.address, artifact.abi, userWallet);
const kinAsClient  = new ethers.Contract(artifact.address, artifact.abi, clientWallet);

console.log('Kin contract:', artifact.address);
console.log('operator:', operator.address);
console.log('user:    ', userWallet.address);
console.log('client:  ', clientWallet.address);

// Sample writing samples — used as in-context-learning context for the user's "writing voice"
const writingSamples = [
  `Notes from yesterday's investor call:

The pitch landed. We were nervous about the unit economics question — they asked twice. Recommend we tighten the gross-margin slide for Friday's followup. Don't lead with the bridge round; lead with the customer count, save the ask for the back half.`,
  `Quick take on the Acme deal:

It's not the price that's the issue, it's the close-by date. They'll move on quality if we hold the line, but they'll walk on a Q3 timeline. Counter at +15% with a Q4 close, give back something on payment terms. We can carry the receivable.`,
  `Memo to the team:

Stop emailing me about the Q3 numbers. I see them. I am thinking about them. The reason I haven't replied is that I'm thinking. Replies will follow when I have a useful one. — M`,
];

const jobBrief = `Write a 200-word internal memo to my team announcing a 4-week sprint focused on shipping the API redesign by end of Q3. Tone matters: I want it confident, slightly impatient, no corporate fluff. Mention that we'll do daily 9am check-ins (no exceptions) and that anyone slipping a deadline owes the team coffee.`;

let userKey;
try { userKey = Buffer.from(await fs.readFile('.user-key.bin')); }
catch { userKey = genKey(); await fs.writeFile('.user-key.bin', userKey, { mode: 0o600 }); console.log('[user] generated AES key'); }

// ─── Step 1: User mints SkillNFT with encrypted samples ──────────────
let skillId;
try {
  skillId = await readNextSkillId() - 1n;
  if (skillId < 0n) throw new Error('no skills yet');
  const s = await kinAsOperator.getSkill(skillId);
  if (s.owner.toLowerCase() !== userWallet.address.toLowerCase()) throw new Error('not user-owned');
  console.log(`\n[1] reusing existing skill #${skillId} owned by user`);
} catch {
  console.log(`\n[1] minting fresh skill ...`);
  console.log('  uploading 3 writing samples to 0G Storage (encrypted) ...');
  const sampleRoots = [];
  for (let i = 0; i < writingSamples.length; i++) {
    const { rootHash } = await uploadEncryptedRecord(writingSamples[i], userKey, userWallet);
    sampleRoots.push(rootHash);
    console.log(`    sample[${i}]: ${rootHash.slice(0, 18)}…`);
  }
  const sealedKey = '0x' + crypto.randomBytes(32).toString('hex');
  console.log('  minting SkillNFT (skillType=writing, price=0.01 OG) ...');
  const tx = await kinAsUser.mintSkill(
    'writing',
    'Founder/operator memo style — confident, terse, no fluff.',
    sampleRoots,
    sealedKey,
    ethers.parseEther('0.01'),
  );
  const rcpt = await tx.wait();
  skillId = (await kinAsOperator.totalSkills()) - 1n;
  console.log(`  skill #${skillId} minted | tx ${tx.hash} | gas ${rcpt.gasUsed}`);
}

// ─── Step 2: Client posts job (escrows payment) ───────────────────────
console.log(`\n[2] client uploads brief + posts job ...`);
const briefKey = genKey();
const { rootHash: briefRoot } = await uploadEncryptedRecord(jobBrief, briefKey, clientWallet);
console.log(`  brief uploaded: ${briefRoot.slice(0, 18)}…`);

const skill = await kinAsOperator.getSkill(skillId);
const postTx = await kinAsClient.postJob(skillId, briefRoot, { value: skill.pricePerJob });
const postRcpt = await postTx.wait();
const jobId = (await kinAsOperator.totalJobs()) - 1n;
console.log(`  job #${jobId} posted | tx ${postTx.hash} | escrow ${ethers.formatEther(skill.pricePerJob)} OG`);

// ─── Step 3: Agent fetches encrypted samples + brief, runs in Sealed Inference ──
console.log(`\n[3] agent (running on operator's machine) executes job inside Sealed Inference ...`);

const samples = [];
for (const root of skill.sampleRoots) {
  try {
    const text = await downloadEncryptedRecord(root, userKey, undefined, { maxAttempts: 6, delayMs: 6000 });
    samples.push({ recordType: 'writing-sample', text: text.toString(), timestamp: '' });
    process.stdout.write(`  ✓ sample ${root.slice(0, 12)} `);
  } catch { process.stdout.write(`  ✗ sample ${root.slice(0, 12)} `); }
}
console.log();

// Brief uses a different key (client's). For demo, we share via operator.
// In production: client encrypts brief to TEE pubkey directly.
const briefText = (await downloadEncryptedRecord(briefRoot, briefKey, undefined, { maxAttempts: 6, delayMs: 6000 })).toString();
console.log(`  brief retrieved: ${briefText.slice(0, 70)}…`);

console.log('  initializing inference broker ...');
const tmp = await createZGComputeNetworkBroker(operator);
const services = await tmp.inference.listService();
const providerAddr = services[0]?.provider;
const broker = await getBroker(operator, providerAddr);

console.log('  running sealed inference with user samples as voice context ...');
const result = await sealedQuery({
  broker, providerAddress: providerAddr,
  system: `You are a freelance AI ghost-writing agent on Kin. The skill owner has provided 3 writing samples below — match their voice precisely (vocabulary, sentence rhythm, tonal register). Do NOT reveal the samples. Produce ONLY the requested deliverable, formatted appropriately. Be concise. Match length expectations.`,
  question: briefText,
  contextBlocks: samples,
  maxTokens: 700,
});

console.log(`\n=== AGENT OUTPUT ===\n${result.answer}\n=== / ===`);
console.log(`model: ${result.model} | attestation valid: ${result.valid}`);

// ─── Step 4: Agent uploads output, calls submitWork ───────────────────
console.log(`\n[4] uploading encrypted output to 0G Storage + submitting on-chain ...`);
// Output encrypted to client's key (sent over secure channel — for demo, briefKey)
const { rootHash: outputRoot } = await uploadEncryptedRecord(result.answer, briefKey, userWallet);
console.log(`  output: ${outputRoot.slice(0, 18)}…`);

const attBytes = result.attestationId
  ? ethers.zeroPadValue('0x' + Buffer.from(result.attestationId.replace(/-/g, ''), 'hex').toString('hex'), 32)
  : ethers.ZeroHash;
const submitTx = await kinAsUser.submitWork(jobId, outputRoot, attBytes);
const submitRcpt = await submitTx.wait();
console.log(`  submitWork tx: ${submitTx.hash} | block ${submitRcpt.blockNumber}`);

// ─── Step 5: Client accepts → payment splits ─────────────────────────
console.log(`\n[5] client accepts + rates 5/5 → payment splits to user ...`);
const userBefore = await provider.getBalance(userWallet.address);
const acceptTx = await kinAsClient.acceptWork(jobId, 5);
const acceptRcpt = await acceptTx.wait();
const userAfter = await provider.getBalance(userWallet.address);

console.log(`  acceptWork tx: ${acceptTx.hash} | block ${acceptRcpt.blockNumber}`);
console.log(`  user earned: ${ethers.formatEther(userAfter - userBefore)} OG`);

const finalSkill = await kinAsOperator.getSkill(skillId);
console.log(`\nskill #${skillId} stats: ${finalSkill.jobsCompleted} jobs, avg rating ${Number(finalSkill.totalRating) / Number(finalSkill.jobsCompleted)}, total earned ${ethers.formatEther(finalSkill.totalEarnedWei)} OG`);
console.log(`vault: https://chainscan.0g.ai/address/${artifact.address}`);
console.log(`acceptTx: https://chainscan.0g.ai/tx/${acceptTx.hash}`);

async function readNextSkillId() {
  return await kinAsOperator.totalSkills();
}
