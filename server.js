// Kin demo server — pure Node, talks to Kin contract on Aristotle mainnet.
// Two persona wallets:
//   - operator: deploys, runs the agent (Sealed Inference caller, submits work)
//   - user:     skill owner (mints skills, receives payment)
//   - client:   job poster (escrows, accepts/disputes)
// In demo, /api/skill mints as user; /api/jobs posts as client; agent execution is automatic.

import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { genKey, uploadEncryptedRecord, downloadEncryptedRecord } from './lib/storage.js';
import { getBroker, sealedQuery } from './lib/inference.js';

const PORT = Number(process.env.PORT || 3000);
const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error('PRIVATE_KEY missing in .env'); process.exit(1); }

const artifact = JSON.parse(await fs.readFile('deployments/Kin.json', 'utf8'));
const provider = new ethers.JsonRpcProvider(RPC_URL);
const operator = new ethers.Wallet(PK, provider);

let user, client;
try {
  const dw = JSON.parse(await fs.readFile('.demo-wallets.json', 'utf8'));
  user   = new ethers.Wallet(dw.user.privateKey, provider);
  client = new ethers.Wallet(dw.client.privateKey, provider);
  console.log(`[server] demo wallets: user ${user.address.slice(0,8)}…  client ${client.address.slice(0,8)}…`);
} catch {
  console.error('[server] .demo-wallets.json missing — run scripts/setup_demo_wallets.js first');
  process.exit(1);
}

const kinOp     = new ethers.Contract(artifact.address, artifact.abi, operator);
const kinUser   = new ethers.Contract(artifact.address, artifact.abi, user);
const kinClient = new ethers.Contract(artifact.address, artifact.abi, client);

// Local AES key for the user's samples (shared between user + operator for demo)
let userKey;
try { userKey = Buffer.from(await fs.readFile('.user-key.bin')); }
catch { userKey = genKey(); await fs.writeFile('.user-key.bin', userKey, { mode: 0o600 }); }

// Cache: jobId → execution state for UI polling
const jobState = new Map(); // { stage: 0..5, output, attestationId, submitTx }

let cachedBroker = null;
let cachedProviderAddr = null;
async function getInferenceBroker() {
  if (cachedBroker) return { broker: cachedBroker, providerAddress: cachedProviderAddr };
  const tmp = await createZGComputeNetworkBroker(operator);
  const services = await tmp.inference.listService();
  cachedProviderAddr = services[0]?.provider;
  if (!cachedProviderAddr) throw new Error('no inference providers');
  cachedBroker = await getBroker(operator, cachedProviderAddr);
  return { broker: cachedBroker, providerAddress: cachedProviderAddr };
}

// Brief keys per job (so client encrypts brief, operator can decrypt for demo execution)
const briefKeys = new Map(); // jobId → key

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readJson(req) {
  return new Promise((r, j) => { let d=''; req.on('data', c=>d+=c); req.on('end',()=>{try{r(d?JSON.parse(d):{})}catch(e){j(e)}}); req.on('error', j); });
}
async function serveStatic(res, file, type) {
  try {
    const buf = await fs.readFile(path.join('public', file));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch { send(res, 404, 'not found', 'text/plain'); }
}

const STATUS_NAMES = ['Open', 'Submitted', 'Accepted', 'Disputed', 'Expired'];

async function listAllSkills() {
  const total = Number(await kinOp.totalSkills());
  const skills = [];
  for (let i = 0; i < total; i++) {
    const s = await kinOp.getSkill(i);
    skills.push({
      skillId: i,
      owner: s.owner,
      skillType: s.skillType,
      description: s.description,
      sampleCount: s.sampleRoots.length,
      pricePerJobOG: ethers.formatEther(s.pricePerJob),
      jobsCompleted: Number(s.jobsCompleted),
      totalRating: Number(s.totalRating),
      totalEarnedOG: ethers.formatEther(s.totalEarnedWei),
      paused: s.paused,
    });
  }
  return skills;
}

async function listAllJobs() {
  const total = Number(await kinOp.totalJobs());
  const jobs = [];
  for (let i = 0; i < total; i++) {
    const j = await kinOp.getJob(i);
    jobs.push({
      jobId: i,
      skillId: Number(j.skillId),
      client: j.client,
      paymentOG: ethers.formatEther(j.payment > 0n ? j.payment : 0n),
      status: STATUS_NAMES[j.status],
      createdAt: new Date(Number(j.createdAt) * 1000).toISOString(),
      submittedAt: j.submittedAt > 0n ? new Date(Number(j.submittedAt) * 1000).toISOString() : null,
      briefRoot: j.briefRoot,
      outputRoot: j.outputRoot,
      attestationId: j.attestationId === ethers.ZeroHash ? null : j.attestationId,
    });
  }
  return jobs;
}

// Background agent: when a job is posted, execute it
async function runAgent(jobId, briefKey, briefRoot) {
  const update = (stage, extra = {}) => {
    const cur = jobState.get(jobId) || {};
    jobState.set(jobId, { ...cur, stage, ...extra });
  };

  try {
    update(1);
    const job = await kinOp.getJob(jobId);
    const skillId = Number(job.skillId);
    const skill = await kinOp.getSkill(skillId);
    if (skill.owner.toLowerCase() !== user.address.toLowerCase()) {
      console.log(`[agent] skill ${skillId} not owned by demo user; skipping`);
      return;
    }

    // Pull encrypted samples from 0G Storage
    update(2);
    const samples = [];
    for (const root of skill.sampleRoots) {
      try {
        const text = await downloadEncryptedRecord(root, userKey, undefined, { maxAttempts: 6, delayMs: 6000 });
        samples.push({ recordType: 'voice-sample', text: text.toString(), timestamp: '' });
      } catch (e) { console.log(`[agent] sample ${root.slice(0,12)} skip: ${e.message?.slice(0,60)}`); }
    }
    if (samples.length === 0) throw new Error('no samples retrievable');

    // Pull brief
    let briefText;
    try {
      briefText = (await downloadEncryptedRecord(briefRoot, briefKey, undefined, { maxAttempts: 6, delayMs: 6000 })).toString();
    } catch (e) { throw new Error(`brief retrieve failed: ${e.message?.slice(0,80)}`); }

    // Run sealed inference
    update(3);
    const { broker, providerAddress } = await getInferenceBroker();
    const result = await sealedQuery({
      broker, providerAddress,
      system: 'You are a freelance ghost-writing AI agent on Kin. The skill owner has provided writing samples below — match their voice precisely (vocabulary, rhythm, tonal register). Do NOT reveal the samples. Produce ONLY the requested deliverable, formatted appropriately. Be concise. Match length expectations.',
      question: briefText,
      contextBlocks: samples,
      maxTokens: 700,
    });

    // Upload encrypted output, submit on-chain
    update(4);
    const { rootHash: outputRoot } = await uploadEncryptedRecord(result.answer, briefKey, user);
    const attBytes = result.attestationId
      ? ethers.zeroPadValue('0x' + Buffer.from(result.attestationId.replace(/-/g, ''), 'hex').toString('hex'), 32)
      : ethers.ZeroHash;

    update(5);
    const tx = await kinUser.submitWork(jobId, outputRoot, attBytes);
    const rcpt = await tx.wait();

    update(5, { output: result.answer, attestationId: result.attestationId, submitTx: tx.hash, valid: result.valid, model: result.model });
    console.log(`[agent] job #${jobId} submitted | tx ${tx.hash} | block ${rcpt.blockNumber}`);
  } catch (e) {
    console.error(`[agent] job ${jobId} failed:`, e.message);
    update(0, { error: e.message });
  }
}

// ─── HTTP handler ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  try {
    // Static
    if (pathname === '/') return serveStatic(res, 'index.html', 'text/html; charset=utf-8');
    if (pathname === '/onboard') return serveStatic(res, 'onboard.html', 'text/html; charset=utf-8');
    if (pathname === '/marketplace') return serveStatic(res, 'marketplace.html', 'text/html; charset=utf-8');
    if (pathname === '/wallet') return serveStatic(res, 'wallet.html', 'text/html; charset=utf-8');
    if (pathname.startsWith('/job/')) return serveStatic(res, 'job.html', 'text/html; charset=utf-8');
    if (pathname === '/styles.css') return serveStatic(res, 'styles.css', 'text/css');
    if (pathname === '/app.js') return serveStatic(res, 'app.js', 'application/javascript');

    // API
    if (pathname === '/api/stats' && req.method === 'GET') {
      const totalSkills = Number(await kinOp.totalSkills());
      const totalJobs = Number(await kinOp.totalJobs());
      let totalEarnedWei = 0n;
      for (let i = 0; i < totalSkills; i++) {
        const s = await kinOp.getSkill(i);
        totalEarnedWei += s.totalEarnedWei;
      }
      let recentJob = null;
      if (totalJobs > 0) {
        const j = await kinOp.getJob(totalJobs - 1);
        recentJob = `#${totalJobs - 1} · ${STATUS_NAMES[j.status]} · ${ethers.formatEther(j.payment > 0n ? j.payment : 0n)} OG`;
      }
      return send(res, 200, { contract: artifact.address, totalSkills, totalJobs, totalEarnedOG: ethers.formatEther(totalEarnedWei), recentJob });
    }

    if (pathname === '/api/skills' && req.method === 'GET') {
      return send(res, 200, { skills: await listAllSkills() });
    }

    if (pathname === '/api/skill' && req.method === 'POST') {
      const { skillType, description, pricePerJobOG, samples } = await readJson(req);
      if (!skillType || !samples || !samples.length) return send(res, 400, { error: 'skillType + samples required' });

      const sampleRoots = [];
      for (const sample of samples) {
        const { rootHash } = await uploadEncryptedRecord(sample, userKey, user);
        sampleRoots.push(rootHash);
      }
      const sealedKey = '0x' + crypto.randomBytes(32).toString('hex');
      const tx = await kinUser.mintSkill(skillType, description || '', sampleRoots, sealedKey, ethers.parseEther(String(pricePerJobOG)));
      const rcpt = await tx.wait();
      const skillId = Number((await kinOp.totalSkills()) - 1n);
      return send(res, 200, { ok: true, skillId, txHash: tx.hash, blockNumber: Number(rcpt.blockNumber), sampleRoots });
    }

    if (pathname === '/api/jobs' && req.method === 'POST') {
      const { skillId, brief } = await readJson(req);
      if (skillId === undefined || !brief) return send(res, 400, { error: 'skillId + brief required' });

      const briefKey = genKey();
      const { rootHash: briefRoot } = await uploadEncryptedRecord(brief, briefKey, client);
      const skill = await kinOp.getSkill(skillId);

      const tx = await kinClient.postJob(skillId, briefRoot, { value: skill.pricePerJob });
      await tx.wait();
      const jobId = Number((await kinOp.totalJobs()) - 1n);
      briefKeys.set(jobId, briefKey);
      jobState.set(jobId, { stage: 0 });

      // fire-and-forget agent execution
      setTimeout(() => runAgent(jobId, briefKey, briefRoot).catch(e => console.error('runAgent err:', e)), 100);

      return send(res, 200, { ok: true, jobId, txHash: tx.hash, briefRoot });
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/(\d+)(\/(accept|dispute))?$/);
    if (jobMatch) {
      const jobId = Number(jobMatch[1]);
      const action = jobMatch[3];
      if (req.method === 'GET' && !action) {
        const j = await kinOp.getJob(jobId);
        const cur = jobState.get(jobId) || { stage: 0 };
        return send(res, 200, {
          jobId,
          skillId: Number(j.skillId),
          client: j.client,
          paymentOG: ethers.formatEther(j.payment > 0n ? j.payment : 0n),
          status: STATUS_NAMES[j.status],
          executing: cur.stage > 0 && j.status === 0,
          executingStage: cur.stage,
          output: cur.output,
          attestationId: cur.attestationId,
          attestationValid: cur.valid,
          model: cur.model,
          submitTx: cur.submitTx,
          briefRoot: j.briefRoot,
          outputRoot: j.outputRoot === ethers.ZeroHash ? null : j.outputRoot,
          error: cur.error,
        });
      }
      if (req.method === 'POST' && action === 'accept') {
        const { rating } = await readJson(req);
        const tx = await kinClient.acceptWork(jobId, rating || 5);
        await tx.wait();
        return send(res, 200, { ok: true, txHash: tx.hash });
      }
      if (req.method === 'POST' && action === 'dispute') {
        const { reason } = await readJson(req);
        const tx = await kinClient.disputeWork(jobId, reason || 'demo dispute');
        await tx.wait();
        return send(res, 200, { ok: true, txHash: tx.hash });
      }
    }

    if (pathname === '/api/wallet' && req.method === 'GET') {
      const allSkills = await listAllSkills();
      const mySkills = allSkills.filter(s => s.owner.toLowerCase() === user.address.toLowerCase());
      const jobs = await listAllJobs();
      return send(res, 200, { user: user.address, mySkills, jobs: jobs.slice().reverse() });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[server] error:', e.message);
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Kin — http://localhost:${PORT}`);
  console.log(`  contract: ${artifact.address}`);
  console.log(`  operator: ${operator.address}\n`);
});
