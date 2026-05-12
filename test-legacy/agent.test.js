import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { network } from 'hardhat';
import { ethers as standalone } from 'ethers';

import { processJob } from '../scripts/agent.js';
import { embed, embedToBuffer } from '../lib/embedding.js';
import { encryptToPubkey, decryptWithPrivkey, pubkeyFromEthersWallet } from '../lib/ecdh.js';
import { encrypt, decrypt, genKey } from '../lib/storage.js';
import {
  deployKin, randomRoot, makeCredential, makeFingerprint,
  signCredential, signFingerprint, makeBrief, makeClientEligible,
} from './helpers.js';

// ─── In-memory mock storage ─────────────────────────────────────────────

function makeMockStorage() {
  const blobs = new Map();  // rootHash → Buffer

  function newRoot() { return standalone.hexlify(standalone.randomBytes(32)); }

  return {
    blobs,
    async uploadRaw(blob, _signer) {
      const rootHash = newRoot();
      blobs.set(rootHash, Buffer.from(blob));
      return { rootHash, txHash: '0xmock' };
    },
    async downloadRaw(rootHash) {
      const b = blobs.get(rootHash);
      if (!b) throw new Error(`mock-storage: missing ${rootHash}`);
      return b;
    },
    async downloadEncryptedRecord(rootHash, key) {
      const blob = blobs.get(rootHash);
      if (!blob) throw new Error(`mock-storage: missing ${rootHash}`);
      return decrypt(blob, key);
    },
    /// Convenience for tests: register a pre-encrypted blob under a chosen root.
    register(root, blob) { blobs.set(root, Buffer.from(blob)); },
  };
}

// ─── Sample data (synthetic for tests; real reviews used in the marketplace populate) ─

const SAMPLES = [
  `This change introduces a TOCTOU between cache.set and the index update. Wrap both in a mutex or use compare-and-swap. The race shows up under concurrent writes on the same key — easy to repro with a 4-thread load test.`,
  `The retry loop in fetchUser swallows the underlying error. If the upstream returns 500, you'll loop until maxAttempts with no signal. Add an onRetry callback so the operator can see what's happening, and exit immediately on 401/403.`,
  `Nice refactor of the auth middleware. One issue: the new token validator trims whitespace, which silently masks copy-paste errors. Either reject leading/trailing whitespace, or log it and proceed — the silent-trim is the worst of both worlds.`,
  `That regex on line 142 looks innocent but it's catastrophically backtracking on inputs with 20+ repeated chars. Switch to a non-backtracking variant or pre-cap input length. We hit this in production last quarter.`,
  `Tests cover the happy path but not the partial-failure case where step 3 returns OK but step 4 returns 500. Add a test that asserts we roll back step 3's side effect. Otherwise this fixes the symptom without fixing the bug.`,
];

const BRIEF = {
  briefSchemaVersion: 1,
  language: 'typescript',
  diff: '--- src/cache.ts ---\n+ cache.set(key, val);\n+ index[key] = val;',
  focus: ['correctness', 'concurrency'],
  context: 'auth-flow cache write path',
  knownConstraints: [],
  expectedDeliverable: 'inline review with summary and suggestions',
};

const GOOD_REVIEW_RESPONSE = JSON.stringify({
  review: {
    summary: 'TOCTOU between cache.set and index update reintroduces the race we discussed last sprint. See suggestions.',
    suggestions: [
      { loc: 'src/cache.ts:1', severity: 'blocker', issue: 'TOCTOU', fix: 'wrap in mutex or use SETNX' },
    ],
    approvalRecommendation: 'request_changes',
  },
  selfEval: {
    voiceMatchBps: 8200, completenessBps: 8800, accuracyBps: 8500, structureBps: 8400,
    rationale: 'matches voice; specific to the diff',
  },
});

const LOW_QUALITY_RESPONSE = JSON.stringify({
  review: { summary: 'looks fine', suggestions: [], approvalRecommendation: 'approve' },
  selfEval: { voiceMatchBps: 5000, completenessBps: 5000, accuracyBps: 5000, structureBps: 5000, rationale: 'lazy' },
});

// ─── E2E happy path ─────────────────────────────────────────────────────

describe('agent — processJob (mocked storage + LLM, hardhat chain)', () => {
  it('full round trip: post → process → submit → accept', async () => {
    const env = await deployKin();
    const { ethers, kin, user: hardhatUser, client: hardhatClient, verifier, teeSigner } = env;

    // We need an operator with privkey (hardhat signers don't expose keys directly).
    // Use a wallet we create and fund.
    const [admin] = await ethers.getSigners();
    const operator = standalone.Wallet.createRandom().connect(ethers.provider);
    const client   = standalone.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: operator.address, value: ethers.parseEther('10') });
    await admin.sendTransaction({ to: client.address,   value: ethers.parseEther('10') });

    // 1. Operator mints a skill (uses our test helpers but with our operator wallet)
    const storage = makeMockStorage();
    const sampleKey = genKey();
    const sampleRoots = [];
    const embedRoots = [];
    for (const text of SAMPLES) {
      const sampleBlob = encrypt(text, sampleKey);
      const sampleRoot = standalone.hexlify(standalone.randomBytes(32));
      storage.register(sampleRoot, sampleBlob);
      sampleRoots.push(sampleRoot);
      const emb = embed(text);
      const embBlob = encrypt(embedToBuffer(emb), sampleKey);
      const embRoot = standalone.hexlify(standalone.randomBytes(32));
      storage.register(embRoot, embBlob);
      embedRoots.push(embRoot);
    }

    const credBase = makeCredential({
      verifier: verifier.address,
      githubHandleHash: ethers.keccak256(ethers.toUtf8Bytes(`agent-test-${operator.address}`)),
    });
    const cred = await signCredential(ethers, verifier, operator.address, credBase);
    const fp = await signFingerprint(ethers, teeSigner, sampleRoots, makeFingerprint());

    const kinAsOperator = kin.connect(operator);
    const mintTx = await kinAsOperator.mintSkill(
      cred, sampleRoots, embedRoots, fp, 'typescript', 'TS reviewer', ethers.parseEther('0.01'),
    );
    const mintRcpt = await mintTx.wait();
    const skillId = (await kin.totalSkills()) - 1n;
    const skill = await kin.getSkill(skillId);

    // 2. Client stakes + encrypts brief to operator pubkey + posts job
    const kinAsClient = kin.connect(client);
    await kinAsClient.stakeForJobAccess({ value: await kin.CLIENT_STAKE_AMOUNT() });

    const operatorPubkey = pubkeyFromEthersWallet(operator);
    const briefBlob = encryptToPubkey(JSON.stringify(BRIEF), operatorPubkey);
    const briefRoot = standalone.hexlify(standalone.randomBytes(32));
    storage.register(briefRoot, briefBlob);

    const postTx = await kinAsClient.postJob(skillId, makeBrief({ briefRoot }), { value: ethers.parseEther('0.01') });
    const postRcpt = await postTx.wait();
    const jobId = (await kin.totalJobs()) - 1n;

    // 3. Run processJob
    const invokeLLM = async () => ({ answer: GOOD_REVIEW_RESPONSE, model: 'mock-model', attestationId: 'mock-att' });
    const job = await kin.getJob(jobId);
    const result = await processJob({
      kin: kinAsOperator, provider: ethers.provider, operator, teeSigner,
      sampleKey, storage, invokeLLM,
      skill, job, jobId, evtTxHash: postTx.hash,
      logger: () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.ok(result.qualityScore >= 7000);

    // 4. Client retrieves + decrypts output
    const onChainJob = await kin.getJob(jobId);
    assert.equal(Number(onChainJob.status), 1);  // Submitted
    const outBlob = await storage.downloadRaw(onChainJob.outputRoot);
    const outJson = JSON.parse(decryptWithPrivkey(outBlob, client.privateKey).toString('utf8'));
    assert.match(outJson.review.summary, /TOCTOU/);

    // 5. Client accepts + checks payment + stake refund
    const userBefore = await ethers.provider.getBalance(operator.address);
    await kinAsClient.acceptWork(jobId, { voiceMatch: 5, completeness: 5, accuracy: 5, structure: 5 });
    const userAfter = await ethers.provider.getBalance(operator.address);
    assert.equal(userAfter - userBefore, ethers.parseEther('0.01'));
    assert.equal(await kin.clientStakeBalance(client.address), 0n);

    // Per-dim rep
    const s = await kin.getSkill(skillId);
    assert.equal(s.rep.jobsCompleted, 1n);
  });

  it('retries on low-quality LLM output up to MAX_RETRIES, then gives up', async () => {
    const env = await deployKin();
    const { ethers, kin, verifier, teeSigner } = env;
    const [admin] = await ethers.getSigners();
    const operator = standalone.Wallet.createRandom().connect(ethers.provider);
    const client   = standalone.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: operator.address, value: ethers.parseEther('10') });
    await admin.sendTransaction({ to: client.address,   value: ethers.parseEther('10') });

    const storage = makeMockStorage();
    const sampleKey = genKey();
    const sampleRoots = [];
    const embedRoots = [];
    for (const text of SAMPLES.slice(0, 3)) {
      const sampleRoot = standalone.hexlify(standalone.randomBytes(32));
      const embRoot    = standalone.hexlify(standalone.randomBytes(32));
      storage.register(sampleRoot, encrypt(text, sampleKey));
      storage.register(embRoot,    encrypt(embedToBuffer(embed(text)), sampleKey));
      sampleRoots.push(sampleRoot);
      embedRoots.push(embRoot);
    }
    const cred = await signCredential(ethers, verifier, operator.address, makeCredential({
      verifier: verifier.address,
      githubHandleHash: ethers.keccak256(ethers.toUtf8Bytes(`retry-test-${operator.address}`)),
    }));
    const fp = await signFingerprint(ethers, teeSigner, sampleRoots, makeFingerprint());
    await kin.connect(operator).mintSkill(cred, sampleRoots, embedRoots, fp, 'rust', 'd', ethers.parseEther('0.01'));
    const skillId = (await kin.totalSkills()) - 1n;
    const skill = await kin.getSkill(skillId);

    await kin.connect(client).stakeForJobAccess({ value: await kin.CLIENT_STAKE_AMOUNT() });
    const briefBlob = encryptToPubkey(JSON.stringify(BRIEF), pubkeyFromEthersWallet(operator));
    const briefRoot = standalone.hexlify(standalone.randomBytes(32));
    storage.register(briefRoot, briefBlob);
    const postTx = await kin.connect(client).postJob(skillId, makeBrief({ briefRoot }), { value: ethers.parseEther('0.01') });

    const jobId = (await kin.totalJobs()) - 1n;
    let calls = 0;
    const invokeLLM = async () => { calls++; return { answer: LOW_QUALITY_RESPONSE, model: 'mock-model' }; };
    const result = await processJob({
      kin: kin.connect(operator), provider: ethers.provider, operator, teeSigner,
      sampleKey, storage, invokeLLM, skill, job: await kin.getJob(jobId),
      jobId, evtTxHash: postTx.hash, logger: () => {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'quality-gate');
    assert.equal(calls, 3);
    // Job stays Open
    assert.equal(Number((await kin.getJob(jobId)).status), 0);
  });

  it('passes after one retry if second attempt clears bar', async () => {
    const env = await deployKin();
    const { ethers, kin, verifier, teeSigner } = env;
    const [admin] = await ethers.getSigners();
    const operator = standalone.Wallet.createRandom().connect(ethers.provider);
    const client   = standalone.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: operator.address, value: ethers.parseEther('10') });
    await admin.sendTransaction({ to: client.address,   value: ethers.parseEther('10') });

    const storage = makeMockStorage();
    const sampleKey = genKey();
    const sampleRoots = [], embedRoots = [];
    for (const text of SAMPLES.slice(0, 3)) {
      const sr = standalone.hexlify(standalone.randomBytes(32));
      const er = standalone.hexlify(standalone.randomBytes(32));
      storage.register(sr, encrypt(text, sampleKey));
      storage.register(er, encrypt(embedToBuffer(embed(text)), sampleKey));
      sampleRoots.push(sr); embedRoots.push(er);
    }
    const cred = await signCredential(ethers, verifier, operator.address, makeCredential({
      verifier: verifier.address,
      githubHandleHash: ethers.keccak256(ethers.toUtf8Bytes(`once-retry-${operator.address}`)),
    }));
    const fp = await signFingerprint(ethers, teeSigner, sampleRoots, makeFingerprint());
    await kin.connect(operator).mintSkill(cred, sampleRoots, embedRoots, fp, 'go', 'd', ethers.parseEther('0.01'));
    const skillId = (await kin.totalSkills()) - 1n;

    await kin.connect(client).stakeForJobAccess({ value: await kin.CLIENT_STAKE_AMOUNT() });
    const briefRoot = standalone.hexlify(standalone.randomBytes(32));
    storage.register(briefRoot, encryptToPubkey(JSON.stringify(BRIEF), pubkeyFromEthersWallet(operator)));
    const postTx = await kin.connect(client).postJob(skillId, makeBrief({ briefRoot }), { value: ethers.parseEther('0.01') });

    let calls = 0;
    const invokeLLM = async () => {
      calls++;
      return { answer: calls === 1 ? LOW_QUALITY_RESPONSE : GOOD_REVIEW_RESPONSE, model: 'mock-model' };
    };
    const jobId = (await kin.totalJobs()) - 1n;
    const result = await processJob({
      kin: kin.connect(operator), provider: ethers.provider, operator, teeSigner,
      sampleKey, storage, invokeLLM,
      skill: await kin.getSkill(skillId), job: await kin.getJob(jobId),
      jobId, evtTxHash: postTx.hash, logger: () => {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });
});
