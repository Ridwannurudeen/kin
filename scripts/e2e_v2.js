// Kin v2 end-to-end on 0G Aristotle mainnet.
//
// Runs the full lifecycle:
//   1. Operator wallet mints a SkillNFT (real samples, real fingerprint via Sealed Inference)
//   2. Client wallet stakes for sybil eligibility
//   3. Client encrypts a structured brief to the operator's pubkey and posts the job
//   4. processJob runs (one-shot, no daemon loop): retrieval → review → quality gate → submitWork
//   5. Client accepts with a 4-axis rubric — payment splits + stake refunds
//   6. Client decrypts the output review and prints it
//
// Prerequisites:
//   - VERIFIER_PRIVATE_KEY in .env (or verifier/.env) for signing the operator's Credential
//   - PRIVATE_KEY in .env (the funder; pays gas for demo wallets)
//   - .demo-wallets.json from `node scripts/setup_demo_wallets.js`
//   - deployments/Kin.json from `node scripts/deploy.js` (v2 contract)
//
// Usage: node scripts/e2e_v2.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';

import { uploadRaw, downloadRaw, downloadEncryptedRecord, uploadEncryptedRecord, encrypt, genKey } from '../lib/storage.js';
import { encryptToPubkey, decryptWithPrivkey, pubkeyFromEthersWallet } from '../lib/ecdh.js';
import { embed, embedToBuffer } from '../lib/embedding.js';
import { signCredential, signFingerprint, hashGithubLogin } from '../lib/credential.js';
import { processJob } from './agent.js';
import { fingerprintSamples } from '../lib/fingerprint.js';
import { getBroker, sealedQuery } from '../lib/inference.js';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
const VPK = process.env.VERIFIER_PRIVATE_KEY;
const TEE_PK = process.env.TEE_SIGNER_PRIVATE_KEY || PK;  // for demo, teeSigner = operator-side relay

if (!PK)  { console.error('PRIVATE_KEY missing'); process.exit(1); }
if (!VPK) { console.error('VERIFIER_PRIVATE_KEY missing (run verifier/.env from setup_verifier.js)'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder = new ethers.Wallet(PK, provider);
const verifierWallet = new ethers.Wallet(VPK);
const teeSignerWallet = new ethers.Wallet(TEE_PK);

const demoWallets = JSON.parse(await fs.readFile('.demo-wallets.json', 'utf8'));
const operator = new ethers.Wallet(demoWallets.user.privateKey, provider);
const client   = new ethers.Wallet(demoWallets.client.privateKey, provider);

const artifact = JSON.parse(await fs.readFile('deployments/Kin.json', 'utf8'));
const kinAsOperator = new ethers.Contract(artifact.address, artifact.abi, operator);
const kinAsClient   = new ethers.Contract(artifact.address, artifact.abi, client);
const kinRead       = new ethers.Contract(artifact.address, artifact.abi, provider);

console.log(`Kin v2:    ${artifact.address}`);
console.log(`funder:    ${funder.address}`);
console.log(`operator:  ${operator.address}`);
console.log(`client:    ${client.address}`);
console.log(`verifier:  ${verifierWallet.address}`);
console.log(`teeSigner: ${teeSignerWallet.address}`);

// Sanity-check on-chain config
const onChainVerifier  = await kinRead.verifier();
const onChainTeeSigner = await kinRead.teeSigner();
if (onChainVerifier.toLowerCase() !== verifierWallet.address.toLowerCase()) {
  console.error(`verifier mismatch — chain has ${onChainVerifier}, env says ${verifierWallet.address}`);
  process.exit(1);
}
if (onChainTeeSigner.toLowerCase() !== teeSignerWallet.address.toLowerCase()) {
  console.error(`teeSigner mismatch — chain has ${onChainTeeSigner}, env says ${teeSignerWallet.address}`);
  process.exit(1);
}

// ─── Sample data ────────────────────────────────────────────────────────

const SAMPLES = [
  `That regex on line 142 backtracks catastrophically on inputs with 20+ repeated characters. Switch to a non-backtracking variant or pre-cap input length. We hit this in production last quarter — added log evidence in the issue thread.`,
  `The retry loop in fetchUser swallows the underlying error. If upstream returns 500, you'll loop until maxAttempts with no signal. Add an onRetry callback so the operator can see what's happening, and exit immediately on 401/403.`,
  `Nice refactor of the auth middleware. One issue: the new token validator silently trims whitespace. Either reject leading/trailing whitespace, or log it and proceed — the silent-trim hides copy-paste bugs that took us two days to find.`,
  `This change introduces a TOCTOU between cache.set and the index update. Wrap both in a mutex or use compare-and-swap. The race shows up under concurrent writes on the same key — repro with a 4-thread load test.`,
  `Tests cover the happy path but not the partial-failure case where step 3 succeeds and step 4 fails. Add a test that asserts we roll back step 3's side effect. Otherwise this fixes the symptom but leaves the bug.`,
];

const BRIEF = {
  briefSchemaVersion: 1,
  language: 'typescript',
  diff: `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -38,7 +38,12 @@ export async function verifySession(token: string) {
   const session = await sessionCache.get(token);
-  if (!session) return null;
+  if (!session) {
+    const refreshed = await refreshFromUpstream(token);
+    if (refreshed) sessionCache.set(token, refreshed);
+    return refreshed;
+  }
   return session;
 }`,
  focus: ['correctness', 'concurrency', 'security'],
  context: 'auth middleware — added cache-miss fallback to upstream refresh',
  knownConstraints: ['no new dependencies', 'must keep current API surface'],
  expectedDeliverable: 'inline review with summary + suggestions',
};

// ─── Step 1: Mint skill if not already minted ───────────────────────────

let skillId;
const totalSkills = Number(await kinRead.totalSkills());
let foundSkill = null;
for (let i = 0; i < totalSkills; i++) {
  const s = await kinRead.getSkill(i);
  if (s.owner.toLowerCase() === operator.address.toLowerCase()) { foundSkill = s; skillId = BigInt(i); break; }
}

let sampleKey;
try { sampleKey = await fs.readFile('.user-key.bin'); }
catch { sampleKey = genKey(); await fs.writeFile('.user-key.bin', sampleKey, { mode: 0o600 }); console.log('[1] generated .user-key.bin'); }

if (foundSkill) {
  console.log(`\n[1] reusing existing skill #${skillId}`);
} else {
  console.log(`\n[1] minting fresh skill for operator ${operator.address} ...`);

  // Upload encrypted samples
  console.log('  uploading samples (encrypted)...');
  const sampleRoots = [];
  for (let i = 0; i < SAMPLES.length; i++) {
    const { rootHash } = await uploadEncryptedRecord(SAMPLES[i], sampleKey, operator);
    sampleRoots.push(rootHash);
    console.log(`    sample[${i}]: ${rootHash.slice(0, 18)}…`);
  }

  // Compute + upload encrypted embeddings (one per sample)
  console.log('  computing embeddings, uploading (encrypted)...');
  const embedRoots = [];
  for (let i = 0; i < SAMPLES.length; i++) {
    const blob = encrypt(embedToBuffer(embed(SAMPLES[i])), sampleKey);
    const { rootHash } = await uploadRaw(blob, operator);
    embedRoots.push(rootHash);
    console.log(`    embed[${i}]:  ${rootHash.slice(0, 18)}…`);
  }

  // Run sample fingerprinter via Sealed Inference
  console.log('  initialising 0G inference broker...');
  const tmp = await createZGComputeNetworkBroker(operator);
  const services = await tmp.inference.listService();
  const providerAddr = services[0]?.provider;
  if (!providerAddr) { console.error('no inference provider'); process.exit(1); }
  const broker = await getBroker(operator, providerAddr);
  const invokeLLM = ({ system, user, maxTokens }) =>
    sealedQuery({ broker, providerAddress: providerAddr, system, question: user, contextBlocks: [], maxTokens });

  console.log('  running sample fingerprinter (Sealed Inference)...');
  const { fingerprint, attestationId, rationale } = await fingerprintSamples({
    invokeLLM, samples: SAMPLES, sampleRoots, teeSigner: teeSignerWallet,
  });
  console.log(`    overall ${fingerprint.overallBps}bps (vocab=${fingerprint.vocabEntropyBps} domain=${fingerprint.domainTermBps} struct=${fingerprint.structuralBps} spec=${fingerprint.specificityBps})`);
  console.log(`    attestation ${attestationId} | rationale: ${rationale.slice(0, 100)}…`);

  // Build + sign Credential (admin-mode: we control the verifier wallet)
  console.log('  signing Credential...');
  const credBase = {
    githubHandleHash: hashGithubLogin('demo-operator'),
    accountAgeDays:   1500,
    mergedPRs:        80,
    codeReviewCount:  40,
    verifiedAt:       Math.floor(Date.now() / 1000),
    verifier:         verifierWallet.address,
  };
  const cred = await signCredential(verifierWallet, operator.address, credBase);

  console.log('  minting on-chain...');
  const mintTx = await kinAsOperator.mintSkill(
    cred, sampleRoots, embedRoots, fingerprint,
    'typescript', 'Senior TS reviewer — auth, perf, correctness', ethers.parseEther('0.01'),
  );
  const mintRcpt = await mintTx.wait();
  skillId = (await kinRead.totalSkills()) - 1n;
  console.log(`  skill #${skillId} minted | tx ${mintTx.hash} | gas ${mintRcpt.gasUsed}`);
}

const skill = await kinRead.getSkill(skillId);

// ─── Step 2: Client stakes for sybil ────────────────────────────────────

const stakeAmt = await kinRead.CLIENT_STAKE_AMOUNT();
const currentStake = await kinRead.clientStakeBalance(client.address);
if (currentStake === 0n) {
  console.log(`\n[2] client stakes ${ethers.formatEther(stakeAmt)} OG for sybil eligibility ...`);
  const stakeTx = await kinAsClient.stakeForJobAccess({ value: stakeAmt });
  await stakeTx.wait();
  console.log(`  staked | tx ${stakeTx.hash}`);
} else {
  console.log(`\n[2] client already staked (${ethers.formatEther(currentStake)} OG)`);
}

// ─── Step 3: Client encrypts brief + posts job ──────────────────────────

console.log(`\n[3] client encrypts brief to operator pubkey + posts job ...`);
const operatorPubkey = pubkeyFromEthersWallet(operator);
const briefBlob = encryptToPubkey(JSON.stringify(BRIEF), operatorPubkey);
const { rootHash: briefRoot } = await uploadRaw(briefBlob, client);
console.log(`  brief uploaded: ${briefRoot.slice(0, 18)}…`);

const postTx = await kinAsClient.postJob(skillId, {
  briefSchemaVersion: 1,
  briefRoot,
  repoFingerprint: '0x' + '00'.repeat(32),
  diffLinesEstimate: BRIEF.diff.split('\n').length,
  urgency: 0,
}, { value: skill.pricePerJob });
const postRcpt = await postTx.wait();
const jobId = (await kinRead.totalJobs()) - 1n;
console.log(`  job #${jobId} posted | tx ${postTx.hash} | escrow ${ethers.formatEther(skill.pricePerJob)} OG`);

// ─── Step 4: Operator runs processJob (one-shot, simulates daemon) ──────

console.log(`\n[4] operator processes job (retrieval → review → quality gate → submitWork)...`);

const tmpBroker = await createZGComputeNetworkBroker(operator);
const services2 = await tmpBroker.inference.listService();
const providerAddr2 = services2[0]?.provider;
const broker2 = await getBroker(operator, providerAddr2);
const invokeLLM2 = ({ system, user, maxTokens }) =>
  sealedQuery({ broker: broker2, providerAddress: providerAddr2, system, question: user, contextBlocks: [], maxTokens });

const job = await kinRead.getJob(jobId);
const result = await processJob({
  kin: kinAsOperator, provider, operator, teeSigner: teeSignerWallet, sampleKey,
  storage: { uploadRaw, downloadRaw, downloadEncryptedRecord },
  invokeLLM: invokeLLM2,
  skill, job, jobId, evtTxHash: postTx.hash,
});

if (!result.ok) {
  console.error(`  processJob failed: ${result.reason}`);
  process.exit(1);
}
console.log(`  ✓ submitted | output ${result.outputRoot.slice(0, 18)}… | quality ${result.qualityScore}bps | tx ${result.txHash}`);

// ─── Step 5: Client accepts ────────────────────────────────────────────

console.log(`\n[5] client accepts with 4-axis rubric → payment splits, stake refunds...`);
const opBefore = await provider.getBalance(operator.address);
const clientStakeBefore = await kinRead.clientStakeBalance(client.address);

const acceptTx = await kinAsClient.acceptWork(jobId, {
  voiceMatch: 5, completeness: 5, accuracy: 4, structure: 5,
});
const acceptRcpt = await acceptTx.wait();
const opAfter = await provider.getBalance(operator.address);
const stakeAfter = await kinRead.clientStakeBalance(client.address);

console.log(`  accept tx ${acceptTx.hash}`);
console.log(`  operator earned ${ethers.formatEther(opAfter - opBefore)} OG`);
console.log(`  stake refunded: ${ethers.formatEther(clientStakeBefore - stakeAfter)} OG`);

// ─── Step 6: Client decrypts + prints the review ───────────────────────

console.log(`\n[6] client downloads + decrypts review:`);
const onChainJob = await kinRead.getJob(jobId);
const outBlob = await downloadRaw(onChainJob.outputRoot);
const outJson = JSON.parse(decryptWithPrivkey(outBlob, client.privateKey).toString('utf8'));

console.log(`\n=== REVIEW ===`);
console.log(outJson.review.summary);
console.log();
for (const s of outJson.review.suggestions) {
  console.log(`  [${s.severity}] ${s.loc}: ${s.issue}`);
  console.log(`    fix: ${s.fix}`);
}
console.log(`\n  recommendation: ${outJson.review.approvalRecommendation}`);
console.log(`  self-eval: voice=${outJson.selfEval.voiceMatchBps} complete=${outJson.selfEval.completenessBps} accuracy=${outJson.selfEval.accuracyBps} struct=${outJson.selfEval.structureBps}`);

const finalSkill = await kinRead.getSkill(skillId);
const avg = await kinRead.avgPerDim(skillId);
console.log(`\n=== SKILL #${skillId} after this job ===`);
console.log(`  jobs completed: ${finalSkill.rep.jobsCompleted}`);
console.log(`  total earned:   ${ethers.formatEther(finalSkill.rep.totalEarnedWei)} OG`);
console.log(`  avg ratings (bps, 1.0 rating = 10000):`);
console.log(`    voice match:   ${avg.voiceMatchBps}`);
console.log(`    completeness:  ${avg.completenessBps}`);
console.log(`    accuracy:      ${avg.accuracyBps}`);
console.log(`    structure:     ${avg.structureBps}`);
console.log(`\nchainscan: https://chainscan.0g.ai/address/${artifact.address}`);
