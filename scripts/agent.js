// Kin v2 autonomous agent daemon.
//
// Long-lived process run by a skill owner. Watches `JobPosted` events for skills they own,
// then for each new job:
//   1. recovers the client's pubkey from the JobPosted tx
//   2. downloads + ECDH-decrypts the brief
//   3. downloads + AES-decrypts samples + per-sample embeddings
//   4. runs top-K retrieval over the samples by similarity to the brief
//   5. calls Sealed Inference (review + self-eval in one shot, see lib/review.js)
//   6. if self-eval qualityScore < MIN_OUTPUT_QUALITY_BPS, retries up to MAX_RETRIES
//   7. ECDH-encrypts the review to the client's pubkey, uploads to 0G Storage
//   8. signs attestation (jobId, outputRoot, qualityScore, modelDigest) with teeSigner
//   9. calls submitWork on Kin
//
// Trust model: in v2 demo, the daemon holds both the skill owner's wallet and the teeSigner
// key. Documented in V2_SPEC. v3 = teeSigner moves to a TEE-attestation-verifying relay.

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';

import {
  uploadRaw, downloadRaw, downloadEncryptedRecord,
} from '../lib/storage.js';
import {
  encryptToPubkey, decryptWithPrivkey,
} from '../lib/ecdh.js';
import { pubkeyFromTx } from '../lib/pubkey.js';
import { bufferToEmbed } from '../lib/embedding.js';
import { topK } from '../lib/retrieval.js';
import { generateReview } from '../lib/review.js';
import { signAttestation } from '../lib/credential.js';

const MIN_OUTPUT_QUALITY_BPS = 7000;
const MAX_RETRIES = 3;

// ─── Pure-ish job handler (injected deps → unit testable) ──────────────────

/// Process a single JobPosted event. All external dependencies are injected so this can
/// run in tests with mocked storage + mock LLM, or in production against 0G mainnet.
///
/// Args:
///   kin              — ethers.Contract bound to the operator wallet
///   provider         — ethers.Provider for tx lookup
///   operator         — ethers.Wallet of the skill owner (signs txs, decrypts briefs)
///   teeSigner        — ethers.Wallet whose address matches Kin.teeSigner()
///   sampleKey        — Buffer, 32-byte AES key for sample/embedding decryption
///   storage          — { downloadRaw, downloadEncryptedRecord, uploadRaw }
///   invokeLLM        — async ({ system, user, maxTokens }) → { answer, model, attestationId, valid }
///   skill            — the Skill struct (from Kin.getSkill)
///   job              — the Job struct (from Kin.getJob)
///   jobId            — bigint
///   evtTxHash        — txHash of the JobPosted event (used to recover client pubkey)
///   logger           — function(string), defaults to console.log
///
/// Returns { ok: true, outputRoot, qualityScore, attempts } on success,
///         { ok: false, reason } on quality-gate failure or other recoverable issue.
export async function processJob({
  kin, provider, operator, teeSigner, sampleKey,
  storage, invokeLLM, skill, job, jobId, evtTxHash, logger = console.log,
}) {
  logger(`[job ${jobId}] start`);

  // 1. Client pubkey from the JobPosted tx
  const clientPubkey = await pubkeyFromTx(provider, evtTxHash);

  // 2. Download + ECDH-decrypt brief
  const briefBlob = await storage.downloadRaw(job.brief.briefRoot);
  const briefBytes = decryptWithPrivkey(briefBlob, operator.privateKey);
  const brief = JSON.parse(briefBytes.toString('utf8'));

  // 3. Download + AES-decrypt samples + embeddings (in parallel)
  const sampleRoots = skill.sampleRoots;
  const embedRoots  = skill.embedRoots;
  const [samples, embeddings] = await Promise.all([
    Promise.all(sampleRoots.map(r => storage.downloadEncryptedRecord(r, sampleKey).then(b => b.toString('utf8')))),
    Promise.all(embedRoots .map(r => storage.downloadEncryptedRecord(r, sampleKey).then(b => bufferToEmbed(b)))),
  ]);

  // 4. Top-K
  const candidates = samples.map((text, i) => ({ text, embedding: embeddings[i] }));
  const queryText = [brief.diff, brief.context].filter(Boolean).join('\n');
  const top = topK(candidates, queryText, 5);
  const sampleTexts = top.map(t => t.sample.text);
  logger(`[job ${jobId}] top-${top.length} retrieved (scores: ${top.map(t => t.score.toFixed(2)).join(',')})`);

  // 5+6. Generate review, retry on quality gate failure OR LLM parse/transport error.
  // 0G Sealed Inference occasionally returns empty bodies; treat that the same as a
  // quality miss — retry up to MAX_RETRIES before giving up.
  let reviewResult;
  let attempts = 0;
  let lastError = null;
  for (attempts = 1; attempts <= MAX_RETRIES; attempts++) {
    try {
      reviewResult = await generateReview({
        invokeLLM,
        samples: sampleTexts,
        brief,
      });
    } catch (e) {
      lastError = e;
      logger(`[job ${jobId}] attempt ${attempts} LLM error: ${e.message?.slice(0, 120)}, retrying`);
      continue;
    }
    if (reviewResult.selfEval.overallBps >= MIN_OUTPUT_QUALITY_BPS) break;
    logger(`[job ${jobId}] attempt ${attempts} qualityScore ${reviewResult.selfEval.overallBps} below ${MIN_OUTPUT_QUALITY_BPS}, retrying`);
  }
  if (!reviewResult) {
    logger(`[job ${jobId}] LLM failed ${MAX_RETRIES}x; last error: ${lastError?.message?.slice(0, 120)}`);
    return { ok: false, reason: 'llm-unavailable', attempts };
  }
  if (reviewResult.selfEval.overallBps < MIN_OUTPUT_QUALITY_BPS) {
    logger(`[job ${jobId}] gave up after ${MAX_RETRIES} attempts; letting job expire`);
    return { ok: false, reason: 'quality-gate', attempts };
  }
  logger(`[job ${jobId}] passed quality gate at attempt ${attempts}, overall ${reviewResult.selfEval.overallBps}bps`);

  // 7. Encrypt output to client + upload
  const outputJson = JSON.stringify({
    jobId: jobId.toString(),
    review: reviewResult.review,
    selfEval: reviewResult.selfEval,
    modelName: reviewResult.modelName,
    modelDigest: reviewResult.modelDigest,
    attestationId: reviewResult.attestationId,
  });
  const encryptedOutput = encryptToPubkey(outputJson, clientPubkey);
  const { rootHash: outputRoot } = await storage.uploadRaw(encryptedOutput, operator);
  logger(`[job ${jobId}] output uploaded: ${outputRoot.slice(0, 18)}…`);

  // 8. Sign attestation
  const qualityScore = reviewResult.selfEval.overallBps;
  const { sig: attestationSig } = await signAttestation(teeSigner, jobId, outputRoot, qualityScore, reviewResult.modelDigest);

  // 9. submitWork
  const tx = await kin.submitWork(jobId, outputRoot, qualityScore, reviewResult.modelDigest, attestationSig);
  const rcpt = await tx.wait();
  logger(`[job ${jobId}] submitWork tx ${tx.hash} block ${rcpt.blockNumber}`);

  return { ok: true, outputRoot, qualityScore, attempts, txHash: tx.hash };
}

// ─── Watch loop ─────────────────────────────────────────────────────────────

async function main() {
  const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
  const PK = process.env.PRIVATE_KEY;
  const TEE_SIGNER_PK = process.env.TEE_SIGNER_PRIVATE_KEY;
  const SKILL_IDS = (process.env.SKILL_IDS || '').split(',').filter(Boolean).map(s => BigInt(s.trim()));
  const POLL_MS = Number(process.env.POLL_MS || 8000);
  const SAMPLE_KEY_PATH = process.env.SAMPLE_KEY_PATH || '.user-key.bin';

  if (!PK) { console.error('PRIVATE_KEY required'); process.exit(1); }
  if (!TEE_SIGNER_PK) { console.error('TEE_SIGNER_PRIVATE_KEY required'); process.exit(1); }
  if (SKILL_IDS.length === 0) { console.error('SKILL_IDS required (comma-separated)'); process.exit(1); }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const operator = new ethers.Wallet(PK, provider);
  const teeSigner = new ethers.Wallet(TEE_SIGNER_PK);
  const sampleKey = await fs.readFile(SAMPLE_KEY_PATH);

  const artifact = JSON.parse(await fs.readFile('deployments/Kin.json', 'utf8'));
  const kin = new ethers.Contract(artifact.address, artifact.abi, operator);

  console.log(`[agent] operator     ${operator.address}`);
  console.log(`[agent] teeSigner    ${teeSigner.address}`);
  console.log(`[agent] kin          ${artifact.address}`);
  console.log(`[agent] skill ids    ${SKILL_IDS.join(',')}`);
  console.log(`[agent] poll every   ${POLL_MS}ms`);

  // Verify ownership + cache skill metadata
  const skillsCache = new Map();
  for (const id of SKILL_IDS) {
    const s = await kin.getSkill(id);
    if (s.owner.toLowerCase() !== operator.address.toLowerCase()) {
      console.error(`[agent] skill ${id} owned by ${s.owner}, not us — skipping`);
      continue;
    }
    if ((await kin.teeSigner()).toLowerCase() !== teeSigner.address.toLowerCase()) {
      console.error(`[agent] TEE_SIGNER_PRIVATE_KEY address ${teeSigner.address} != on-chain ${await kin.teeSigner()}`);
      process.exit(1);
    }
    skillsCache.set(id, s);
    console.log(`[agent] tracking skill #${id} | price ${ethers.formatEther(s.pricePerJob)} OG`);
  }
  if (skillsCache.size === 0) { console.error('[agent] no owned skills, exiting'); process.exit(1); }

  // Lazy-load inference SDK (its broken ESM re-exports trip test-loaders, runtime is fine)
  const { getBroker, sealedQuery } = await import('../lib/inference.js');
  const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk');
  const tmp = await createZGComputeNetworkBroker(operator);
  const services = await tmp.inference.listService();
  const providerAddr = services[0]?.provider;
  if (!providerAddr) { console.error('[agent] no inference providers found'); process.exit(1); }
  const broker = await getBroker(operator, providerAddr);
  const invokeLLM = ({ system, user, maxTokens }) =>
    sealedQuery({ broker, providerAddress: providerAddr, system, question: user, contextBlocks: [], maxTokens });

  const storage = { downloadRaw, downloadEncryptedRecord, uploadRaw };

  // Acquire a simple file lock so two daemons can't fight over the same skills
  const lockPath = './agent.lock';
  try {
    await fs.writeFile(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    console.error(`[agent] another daemon already running (lockfile ${lockPath} exists). exit.`);
    process.exit(1);
  }
  process.on('exit', () => { try { fs.unlink(lockPath); } catch {} });
  process.on('SIGINT',  () => { try { fs.unlink(lockPath); } catch {}; process.exit(0); });
  process.on('SIGTERM', () => { try { fs.unlink(lockPath); } catch {}; process.exit(0); });

  // Watch loop
  let lastBlock = await provider.getBlockNumber();
  console.log(`[agent] watching from block ${lastBlock}`);
  const handled = new Set();

  while (true) {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock > lastBlock) {
        const filter = kin.filters.JobPosted();
        const events = await kin.queryFilter(filter, lastBlock + 1, currentBlock);
        for (const evt of events) {
          const skillId = evt.args.skillId;
          const jobId = evt.args.jobId;
          if (!skillsCache.has(skillId)) continue;
          if (handled.has(jobId.toString())) continue;
          handled.add(jobId.toString());
          processJob({
            kin, provider, operator, teeSigner, sampleKey,
            storage, invokeLLM,
            skill: skillsCache.get(skillId), job: await kin.getJob(jobId),
            jobId, evtTxHash: evt.transactionHash,
          }).catch(e => console.error(`[job ${jobId}] failed:`, e.message));
        }
        lastBlock = currentBlock;
      }
    } catch (e) {
      console.error('[agent] poll error:', e.message);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
    || import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
