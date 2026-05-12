import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import {
  deployKin,
  randomRoot,
  rootList,
  makeCredential,
  makeFingerprint,
  makeBrief,
  signCredential,
  signFingerprint,
  signAttestation,
  mintSkillFor,
  makeClientEligible,
  ZERO_ROOT,
} from './helpers.js';

const E = (env, n) => env.ethers.parseEther(n);

// ─── Deployment ─────────────────────────────────────────────────────────

describe('Kin v2 — deployment', () => {
  it('sets teeSigner, verifier, admin from constructor', async () => {
    const env = await deployKin();
    assert.equal((await env.kin.teeSigner()).toLowerCase(), env.teeSigner.address.toLowerCase());
    assert.equal((await env.kin.verifier()).toLowerCase(),  env.verifier.address.toLowerCase());
    assert.equal((await env.kin.admin()).toLowerCase(),     env.admin.address.toLowerCase());
  });

  it('reverts on zero teeSigner', async () => {
    const { ethers } = await network.getOrCreate();
    const [, somebody] = await ethers.getSigners();
    await assert.rejects(
      ethers.deployContract('Kin', [ethers.ZeroAddress, somebody.address]),
      /tee=0/,
    );
  });

  it('reverts on zero verifier', async () => {
    const { ethers } = await network.getOrCreate();
    const [, somebody] = await ethers.getSigners();
    await assert.rejects(
      ethers.deployContract('Kin', [somebody.address, ethers.ZeroAddress]),
      /verifier=0/,
    );
  });
});

// ─── Admin rotation ─────────────────────────────────────────────────────

describe('Kin v2 — admin', () => {
  it('setTeeSigner: only admin', async () => {
    const env = await deployKin();
    await assert.rejects(env.kin.connect(env.user).setTeeSigner(env.user.address), /not admin/);
  });

  it('setTeeSigner: rotates + emits', async () => {
    const env = await deployKin();
    const newSigner = env.ethers.Wallet.createRandom();
    await env.kin.connect(env.admin).setTeeSigner(newSigner.address);
    assert.equal((await env.kin.teeSigner()).toLowerCase(), newSigner.address.toLowerCase());
  });

  it('setTeeSigner: rejects zero', async () => {
    const env = await deployKin();
    await assert.rejects(env.kin.connect(env.admin).setTeeSigner(env.ethers.ZeroAddress), /tee=0/);
  });

  it('setVerifier: only admin + rotates', async () => {
    const env = await deployKin();
    await assert.rejects(env.kin.connect(env.user).setVerifier(env.user.address), /not admin/);
    const newV = env.ethers.Wallet.createRandom();
    await env.kin.connect(env.admin).setVerifier(newV.address);
    assert.equal((await env.kin.verifier()).toLowerCase(), newV.address.toLowerCase());
  });

  it('transferAdmin: only admin + transfers', async () => {
    const env = await deployKin();
    await assert.rejects(env.kin.connect(env.user).transferAdmin(env.user.address), /not admin/);
    await env.kin.connect(env.admin).transferAdmin(env.user.address);
    assert.equal((await env.kin.admin()).toLowerCase(), env.user.address.toLowerCase());
  });
});

// ─── mintSkill: happy path ──────────────────────────────────────────────

describe('Kin v2 — mintSkill happy path', () => {
  it('mints, emits SkillMinted, persists fields', async () => {
    const env = await deployKin();
    const { skillId, sampleRoots, embedRoots } = await mintSkillFor(env, env.user, {
      language: 'rust',
      description: 'Senior Rust reviewer — borrow checker whisperer',
      pricePerJob: E(env, '0.025'),
    });
    assert.equal(skillId, 0n);

    const s = await env.kin.getSkill(0);
    assert.equal(s.owner.toLowerCase(), env.user.address.toLowerCase());
    assert.equal(s.language, 'rust');
    assert.equal(s.pricePerJob, E(env, '0.025'));
    assert.equal(s.sampleRoots.length, sampleRoots.length);
    assert.equal(s.embedRoots.length, embedRoots.length);
    assert.equal(Number(s.fingerprint.overallBps), 8200);
    assert.equal(s.paused, false);
    assert.equal(s.rep.jobsCompleted, 0n);
  });

  it('increments nextSkillId across multiple mints', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await mintSkillFor(env, env.client, {
      githubHandleHash: env.ethers.keccak256(env.ethers.toUtf8Bytes('different-user')),
    });
    assert.equal(await env.kin.totalSkills(), 2n);
  });
});

// ─── mintSkill: validation ──────────────────────────────────────────────

describe('Kin v2 — mintSkill validation', () => {
  it('reverts when samples < 3', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { sampleRoots: rootList(env.ethers, 2), embedRoots: rootList(env.ethers, 2) }),
      /samples 3\.\.20/,
    );
  });

  it('reverts when samples > 20', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { sampleRoots: rootList(env.ethers, 21), embedRoots: rootList(env.ethers, 21) }),
      /samples 3\.\.20/,
    );
  });

  it('reverts on sample/embed length mismatch', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { sampleRoots: rootList(env.ethers, 3), embedRoots: rootList(env.ethers, 4) }),
      /sample\/embed length mismatch/,
    );
  });

  it('reverts when pricePerJob is 0', async () => {
    const env = await deployKin();
    await assert.rejects(mintSkillFor(env, env.user, { pricePerJob: 0n }), /price 0/);
  });

  it('reverts on description > 280 chars', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { description: 'x'.repeat(281) }),
      /desc>280/,
    );
  });

  it('reverts on language not in enum', async () => {
    const env = await deployKin();
    await assert.rejects(mintSkillFor(env, env.user, { language: 'cobol' }), /bad language/);
  });

  it('accepts each enum language', async () => {
    const langs = ['any','javascript','typescript','python','rust','go','solidity','java','c','cpp'];
    for (const lang of langs) {
      const env = await deployKin();
      const { skillId } = await mintSkillFor(env, env.user, {
        language: lang,
        githubHandleHash: env.ethers.keccak256(env.ethers.toUtf8Bytes(`u-${lang}`)),
      });
      assert.equal(skillId, 0n);
    }
  });

  it('reverts when fingerprint.overallBps below MIN_QUALITY_BPS', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { fpOverrides: { overallBps: 5999 } }),
      /fingerprint below bar/,
    );
  });

  it('reverts when credential.verifier != contract verifier', async () => {
    const env = await deployKin();
    const wrongVerifier = env.ethers.Wallet.createRandom().connect(env.ethers.provider);
    const sampleRoots = rootList(env.ethers, 3);
    const embedRoots  = rootList(env.ethers, 3);
    const credBase = makeCredential({ verifier: wrongVerifier.address });
    const cred = await signCredential(env.ethers, wrongVerifier, env.user.address, credBase);
    const fp = await signFingerprint(env.ethers, env.teeSigner, sampleRoots, makeFingerprint());
    await assert.rejects(
      env.kin.connect(env.user).mintSkill(cred, sampleRoots, embedRoots, fp, 'rust', 'desc', E(env, '0.01')),
      /wrong verifier/,
    );
  });

  it('reverts when accountAgeDays below bar', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { credOverrides: { accountAgeDays: 729 } }),
      /github age/,
    );
  });

  it('reverts when mergedPRs below bar', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { credOverrides: { mergedPRs: 19 } }),
      /merged PRs/,
    );
  });

  it('reverts when codeReviewCount below bar', async () => {
    const env = await deployKin();
    await assert.rejects(
      mintSkillFor(env, env.user, { credOverrides: { codeReviewCount: 9 } }),
      /review count/,
    );
  });

  it('reverts on bad credential signature (wrong signer)', async () => {
    const env = await deployKin();
    const sampleRoots = rootList(env.ethers, 3);
    const embedRoots  = rootList(env.ethers, 3);
    const credBase = makeCredential({ verifier: env.verifier.address });
    // sign with a non-verifier wallet
    const imposter = env.ethers.Wallet.createRandom();
    const cred = await signCredential(env.ethers, imposter, env.user.address, credBase);
    const fp = await signFingerprint(env.ethers, env.teeSigner, sampleRoots, makeFingerprint());
    await assert.rejects(
      env.kin.connect(env.user).mintSkill(cred, sampleRoots, embedRoots, fp, 'rust', 'd', E(env, '0.01')),
      /bad cred sig/,
    );
  });

  it('reverts on bad fingerprint signature (wrong signer)', async () => {
    const env = await deployKin();
    const sampleRoots = rootList(env.ethers, 3);
    const embedRoots  = rootList(env.ethers, 3);
    const credBase = makeCredential({ verifier: env.verifier.address });
    const cred = await signCredential(env.ethers, env.verifier, env.user.address, credBase);
    const imposter = env.ethers.Wallet.createRandom();
    const fp = await signFingerprint(env.ethers, imposter, sampleRoots, makeFingerprint());
    await assert.rejects(
      env.kin.connect(env.user).mintSkill(cred, sampleRoots, embedRoots, fp, 'rust', 'd', E(env, '0.01')),
      /bad fingerprint sig/,
    );
  });

  it('reverts on credential reuse', async () => {
    const env = await deployKin();
    // Pin verifiedAt so both mint calls produce the same credential digest regardless of wall clock.
    const handleHash = env.ethers.keccak256(env.ethers.toUtf8Bytes('reused-handle'));
    const verifiedAt = 1_700_000_000;
    await mintSkillFor(env, env.user, { githubHandleHash: handleHash, credOverrides: { verifiedAt } });
    await assert.rejects(
      mintSkillFor(env, env.user, { githubHandleHash: handleHash, credOverrides: { verifiedAt } }),
      /credential reused/,
    );
  });
});

// ─── updateSkill ────────────────────────────────────────────────────────

describe('Kin v2 — updateSkill', () => {
  it('owner updates price + pause', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await env.kin.connect(env.user).updateSkill(0, E(env, '0.05'), true);
    const s = await env.kin.getSkill(0);
    assert.equal(s.pricePerJob, E(env, '0.05'));
    assert.equal(s.paused, true);
  });

  it('non-owner reverts', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await assert.rejects(env.kin.connect(env.client).updateSkill(0, E(env, '0.05'), false), /not owner/);
  });

  it('price 0 reverts', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await assert.rejects(env.kin.connect(env.user).updateSkill(0, 0n, false), /price 0/);
  });
});

// ─── Sybil paths ────────────────────────────────────────────────────────

describe('Kin v2 — sybil: stake', () => {
  it('exact stake works + records balance', async () => {
    const env = await deployKin();
    const amt = await env.kin.CLIENT_STAKE_AMOUNT();
    await env.kin.connect(env.client).stakeForJobAccess({ value: amt });
    assert.equal(await env.kin.clientStakeBalance(env.client.address), amt);
    assert.equal(await env.kin.clientEligible(env.client.address), true);
  });

  it('wrong amount reverts', async () => {
    const env = await deployKin();
    await assert.rejects(
      env.kin.connect(env.client).stakeForJobAccess({ value: E(env, '0.01') }),
      /stake amount mismatch/,
    );
  });

  it('double-stake reverts', async () => {
    const env = await deployKin();
    const amt = await env.kin.CLIENT_STAKE_AMOUNT();
    await env.kin.connect(env.client).stakeForJobAccess({ value: amt });
    await assert.rejects(
      env.kin.connect(env.client).stakeForJobAccess({ value: amt }),
      /already staked/,
    );
  });
});

describe('Kin v2 — sybil: verify', () => {
  it('verifyClient with valid cred sets verified', async () => {
    const env = await deployKin();
    const credBase = makeCredential({ verifier: env.verifier.address });
    const cred = await signCredential(env.ethers, env.verifier, env.client.address, credBase);
    await env.kin.connect(env.client).verifyClient(cred);
    assert.equal(await env.kin.clientVerified(env.client.address), true);
    assert.equal(await env.kin.clientEligible(env.client.address), true);
  });

  it('verifyClient with bad sig reverts', async () => {
    const env = await deployKin();
    const credBase = makeCredential({ verifier: env.verifier.address });
    const imposter = env.ethers.Wallet.createRandom();
    const cred = await signCredential(env.ethers, imposter, env.client.address, credBase);
    await assert.rejects(env.kin.connect(env.client).verifyClient(cred), /bad cred sig/);
  });

  it('verifyClient with reused cred reverts', async () => {
    const env = await deployKin();
    const credBase = makeCredential({ verifier: env.verifier.address });
    const cred = await signCredential(env.ethers, env.verifier, env.client.address, credBase);
    await env.kin.connect(env.client).verifyClient(cred);
    await assert.rejects(env.kin.connect(env.client).verifyClient(cred), /credential reused/);
  });

  it('verifyClient below age bar reverts', async () => {
    const env = await deployKin();
    const credBase = makeCredential({ verifier: env.verifier.address, accountAgeDays: 100 });
    const cred = await signCredential(env.ethers, env.verifier, env.client.address, credBase);
    await assert.rejects(env.kin.connect(env.client).verifyClient(cred), /github age/);
  });
});

describe('Kin v2 — sybil: wait', () => {
  it('startClientWait records first-seen', async () => {
    const env = await deployKin();
    await env.kin.connect(env.client).startClientWait();
    const t = await env.kin.clientFirstSeen(env.client.address);
    assert.notEqual(t, 0n);
    // Not yet eligible
    assert.equal(await env.kin.clientEligible(env.client.address), false);
  });

  it('eligible after 7 days', async () => {
    const env = await deployKin();
    await env.kin.connect(env.client).startClientWait();
    await env.networkHelpers.time.increase(7 * 24 * 3600 + 1);
    assert.equal(await env.kin.clientEligible(env.client.address), true);
  });

  it('cannot double-start wait', async () => {
    const env = await deployKin();
    await env.kin.connect(env.client).startClientWait();
    await assert.rejects(env.kin.connect(env.client).startClientWait(), /already started/);
  });
});

describe('Kin v2 — sybil: gate', () => {
  it('default: not eligible', async () => {
    const env = await deployKin();
    assert.equal(await env.kin.clientEligible(env.client.address), false);
  });
});

// ─── postJob ────────────────────────────────────────────────────────────

describe('Kin v2 — postJob happy path', () => {
  it('escrows, emits, sets deadline = now + 7d', async () => {
    const env = await deployKin();
    const { skillId } = await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    const brief = makeBrief();
    const price = (await env.kin.getSkill(skillId)).pricePerJob;
    const tx = await env.kin.connect(env.client).postJob(skillId, brief, { value: price });
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return env.kin.interface.parseLog(l); } catch { return null; } })
                         .find(p => p?.name === 'JobPosted');
    assert.equal(ev.args.jobId, 0n);
    const j = await env.kin.getJob(0);
    assert.equal(j.client.toLowerCase(), env.client.address.toLowerCase());
    assert.equal(j.payment, price);
    assert.equal(j.brief.briefRoot, brief.briefRoot);
    assert.equal(j.status, 0n);  // Open
    const block = await env.ethers.provider.getBlock(rcpt.blockNumber);
    assert.equal(BigInt(j.deadline) - BigInt(block.timestamp), 7n * 24n * 3600n);
  });
});

describe('Kin v2 — postJob validation', () => {
  it('reverts on skill not found', async () => {
    const env = await deployKin();
    await makeClientEligible(env, env.client);
    await assert.rejects(
      env.kin.connect(env.client).postJob(999, makeBrief(), { value: E(env, '0.01') }),
      /skill not found/,
    );
  });

  it('reverts when skill is paused', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await env.kin.connect(env.user).updateSkill(0, E(env, '0.01'), true);
    await makeClientEligible(env, env.client);
    await assert.rejects(
      env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.01') }),
      /skill paused/,
    );
  });

  it('reverts when client == owner', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.user);
    await assert.rejects(
      env.kin.connect(env.user).postJob(0, makeBrief(), { value: E(env, '0.01') }),
      /client == owner/,
    );
  });

  it('reverts on wrong price', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await assert.rejects(
      env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.005') }),
      /exact price required/,
    );
  });

  it('reverts on bad schema version', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await assert.rejects(
      env.kin.connect(env.client).postJob(0, makeBrief({ briefSchemaVersion: 2 }), { value: E(env, '0.01') }),
      /bad schema/,
    );
  });

  it('reverts on empty brief root', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await assert.rejects(
      env.kin.connect(env.client).postJob(0, makeBrief({ briefRoot: ZERO_ROOT }), { value: E(env, '0.01') }),
      /empty brief/,
    );
  });

  it('reverts when client not eligible (no stake/verify/wait)', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await assert.rejects(
      env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.01') }),
      /sybil gate/,
    );
  });
});

// ─── repostBrief ────────────────────────────────────────────────────────

describe('Kin v2 — repostBrief', () => {
  it('client updates brief root while open', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.01') });
    const newRoot = randomRoot(env.ethers);
    await env.kin.connect(env.client).repostBrief(0, newRoot);
    assert.equal((await env.kin.getJob(0)).brief.briefRoot, newRoot);
  });

  it('non-client cannot repost', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.01') });
    await assert.rejects(env.kin.connect(env.user).repostBrief(0, randomRoot(env.ethers)), /not client/);
  });

  it('reverts after deadline', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.01') });
    await env.networkHelpers.time.increase(8 * 24 * 3600);
    await assert.rejects(env.kin.connect(env.client).repostBrief(0, randomRoot(env.ethers)), /deadline passed/);
  });

  it('reverts on empty root', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    await env.kin.connect(env.client).postJob(0, makeBrief(), { value: E(env, '0.01') });
    await assert.rejects(env.kin.connect(env.client).repostBrief(0, ZERO_ROOT), /empty brief/);
  });
});

// ─── submitWork ─────────────────────────────────────────────────────────

async function postAndPrepare(env) {
  const { skillId } = await mintSkillFor(env, env.user);
  await makeClientEligible(env, env.client);
  await env.kin.connect(env.client).postJob(skillId, makeBrief(), { value: E(env, '0.01') });
  return { skillId, jobId: 0n };
}

describe('Kin v2 — submitWork', () => {
  it('happy path: stores root, qualityScore, attestation; emits', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    const outputRoot = randomRoot(env.ethers);
    const modelDigest = '0x' + 'cc'.repeat(32);
    const qualityScore = 8500;
    const { sig, digest } = await signAttestation(env.ethers, env.teeSigner, jobId, outputRoot, qualityScore, modelDigest);
    await env.kin.connect(env.user).submitWork(jobId, outputRoot, qualityScore, modelDigest, sig);
    const j = await env.kin.getJob(jobId);
    assert.equal(j.outputRoot, outputRoot);
    assert.equal(Number(j.qualityScore), qualityScore);
    assert.equal(j.attestationDigest, digest);
    assert.equal(j.status, 1n);  // Submitted
  });

  it('reverts when not agent owner', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    const outputRoot = randomRoot(env.ethers);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, jobId, outputRoot, 8500, '0x' + 'cc'.repeat(32));
    await assert.rejects(
      env.kin.connect(env.client).submitWork(jobId, outputRoot, 8500, '0x' + 'cc'.repeat(32), sig),
      /not agent owner/,
    );
  });

  it('reverts on empty output root', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, jobId, ZERO_ROOT, 8500, '0x' + 'cc'.repeat(32));
    await assert.rejects(
      env.kin.connect(env.user).submitWork(jobId, ZERO_ROOT, 8500, '0x' + 'cc'.repeat(32), sig),
      /empty output/,
    );
  });

  it('reverts when deadline passed', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    await env.networkHelpers.time.increase(8 * 24 * 3600);
    const outputRoot = randomRoot(env.ethers);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, jobId, outputRoot, 8500, '0x' + 'cc'.repeat(32));
    await assert.rejects(
      env.kin.connect(env.user).submitWork(jobId, outputRoot, 8500, '0x' + 'cc'.repeat(32), sig),
      /deadline passed/,
    );
  });

  it('reverts when quality below MIN_OUTPUT_QUALITY_BPS', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    const outputRoot = randomRoot(env.ethers);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, jobId, outputRoot, 6999, '0x' + 'cc'.repeat(32));
    await assert.rejects(
      env.kin.connect(env.user).submitWork(jobId, outputRoot, 6999, '0x' + 'cc'.repeat(32), sig),
      /quality below bar/,
    );
  });

  it('reverts on bad attestation sig (wrong signer)', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    const outputRoot = randomRoot(env.ethers);
    const imposter = env.ethers.Wallet.createRandom();
    const { sig } = await signAttestation(env.ethers, imposter, jobId, outputRoot, 8500, '0x' + 'cc'.repeat(32));
    await assert.rejects(
      env.kin.connect(env.user).submitWork(jobId, outputRoot, 8500, '0x' + 'cc'.repeat(32), sig),
      /bad attestation sig/,
    );
  });

  it('reverts when job not Open (already submitted)', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    const outputRoot = randomRoot(env.ethers);
    const modelDigest = '0x' + 'cc'.repeat(32);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, jobId, outputRoot, 8500, modelDigest);
    await env.kin.connect(env.user).submitWork(jobId, outputRoot, 8500, modelDigest, sig);
    await assert.rejects(
      env.kin.connect(env.user).submitWork(jobId, outputRoot, 8500, modelDigest, sig),
      /not open/,
    );
  });
});

// ─── acceptWork ─────────────────────────────────────────────────────────

async function postSubmitPrepare(env) {
  const { jobId } = await postAndPrepare(env);
  const outputRoot = randomRoot(env.ethers);
  const modelDigest = '0x' + 'cc'.repeat(32);
  const { sig } = await signAttestation(env.ethers, env.teeSigner, jobId, outputRoot, 8500, modelDigest);
  await env.kin.connect(env.user).submitWork(jobId, outputRoot, 8500, modelDigest, sig);
  return { jobId };
}

describe('Kin v2 — acceptWork', () => {
  it('pays skill owner + records per-dim rep + refunds stake', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    const ownerBefore = await env.ethers.provider.getBalance(env.user.address);
    const clientStakeBefore = await env.kin.clientStakeBalance(env.client.address);
    assert.notEqual(clientStakeBefore, 0n);

    await env.kin.connect(env.client).acceptWork(jobId, { voiceMatch: 5, completeness: 4, accuracy: 5, structure: 3 });

    const ownerAfter = await env.ethers.provider.getBalance(env.user.address);
    assert.equal(ownerAfter - ownerBefore, E(env, '0.01'));
    const s = await env.kin.getSkill(0);
    assert.equal(s.rep.jobsCompleted, 1n);
    assert.equal(s.rep.sumVoiceMatch,   5n);
    assert.equal(s.rep.sumCompleteness, 4n);
    assert.equal(s.rep.sumAccuracy,     5n);
    assert.equal(s.rep.sumStructure,    3n);
    assert.equal(s.rep.totalEarnedWei, BigInt(E(env, '0.01')));

    const j = await env.kin.getJob(jobId);
    assert.equal(j.status, 2n);  // Accepted
    assert.equal(Number(j.rating.voiceMatch), 5);
    assert.equal(Number(j.rating.accuracy), 5);

    // Stake refunded
    assert.equal(await env.kin.clientStakeBalance(env.client.address), 0n);
  });

  it('reverts when not client', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await assert.rejects(
      env.kin.connect(env.third).acceptWork(jobId, { voiceMatch: 5, completeness: 5, accuracy: 5, structure: 5 }),
      /not client/,
    );
  });

  it('reverts when status != Submitted', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);  // not submitted
    await assert.rejects(
      env.kin.connect(env.client).acceptWork(jobId, { voiceMatch: 5, completeness: 5, accuracy: 5, structure: 5 }),
      /not submitted/,
    );
  });

  it('reverts on rating == 0 (unrated)', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await assert.rejects(
      env.kin.connect(env.client).acceptWork(jobId, { voiceMatch: 0, completeness: 4, accuracy: 4, structure: 4 }),
      /rating 1\.\.5/,
    );
  });

  it('reverts on rating > 5', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await assert.rejects(
      env.kin.connect(env.client).acceptWork(jobId, { voiceMatch: 6, completeness: 4, accuracy: 4, structure: 4 }),
      /rating 1\.\.5/,
    );
  });
});

// ─── disputeWork ────────────────────────────────────────────────────────

describe('Kin v2 — disputeWork', () => {
  it('refunds client within window', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    const clientBefore = await env.ethers.provider.getBalance(env.client.address);
    const tx = await env.kin.connect(env.client).disputeWork(jobId, 'output didnt match brief');
    const rcpt = await tx.wait();
    const gas = rcpt.gasUsed * rcpt.gasPrice;
    const clientAfter = await env.ethers.provider.getBalance(env.client.address);
    assert.equal(clientAfter - clientBefore + gas, E(env, '0.01'));
    assert.equal((await env.kin.getJob(jobId)).status, 3n); // Disputed
  });

  it('reverts after window closes', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await env.networkHelpers.time.increase(24 * 3600 + 1);
    await assert.rejects(env.kin.connect(env.client).disputeWork(jobId, 'late'), /window closed/);
  });

  it('reverts when not client', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await assert.rejects(env.kin.connect(env.third).disputeWork(jobId, 'x'), /not client/);
  });

  it('reverts when not Submitted', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    await assert.rejects(env.kin.connect(env.client).disputeWork(jobId, 'x'), /not submitted/);
  });
});

// ─── releaseAfterTimeout ────────────────────────────────────────────────

describe('Kin v2 — releaseAfterTimeout', () => {
  it('anyone can release after window, applies default rating 4/4/4/4', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await env.networkHelpers.time.increase(24 * 3600 + 1);
    const ownerBefore = await env.ethers.provider.getBalance(env.user.address);
    await env.kin.connect(env.third).releaseAfterTimeout(jobId);
    const ownerAfter = await env.ethers.provider.getBalance(env.user.address);
    assert.equal(ownerAfter - ownerBefore, E(env, '0.01'));
    const j = await env.kin.getJob(jobId);
    assert.equal(Number(j.rating.voiceMatch), 4);
    assert.equal(Number(j.rating.completeness), 4);
    assert.equal(Number(j.rating.accuracy), 4);
    assert.equal(Number(j.rating.structure), 4);
    assert.equal(j.status, 2n);
  });

  it('reverts before window closes', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await assert.rejects(env.kin.connect(env.third).releaseAfterTimeout(jobId), /window open/);
  });

  it('reverts when not Submitted', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    await assert.rejects(env.kin.connect(env.third).releaseAfterTimeout(jobId), /not submitted/);
  });
});

// ─── expireJob ──────────────────────────────────────────────────────────

describe('Kin v2 — expireJob', () => {
  it('refunds client after deadline', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    await env.networkHelpers.time.increase(8 * 24 * 3600);
    const clientBefore = await env.ethers.provider.getBalance(env.client.address);
    const tx = await env.kin.connect(env.third).expireJob(jobId);
    const clientAfter = await env.ethers.provider.getBalance(env.client.address);
    assert.equal(clientAfter - clientBefore, E(env, '0.01'));
    assert.equal((await env.kin.getJob(jobId)).status, 4n); // Expired
  });

  it('reverts before deadline', async () => {
    const env = await deployKin();
    const { jobId } = await postAndPrepare(env);
    await assert.rejects(env.kin.connect(env.third).expireJob(jobId), /not expired yet/);
  });

  it('reverts when not Open', async () => {
    const env = await deployKin();
    const { jobId } = await postSubmitPrepare(env);
    await env.networkHelpers.time.increase(8 * 24 * 3600);
    await assert.rejects(env.kin.connect(env.third).expireJob(jobId), /not open/);
  });
});

// ─── Views ──────────────────────────────────────────────────────────────

describe('Kin v2 — views', () => {
  it('avgPerDim math: two jobs, averages in bps where 1.0 = 10000', async () => {
    const env = await deployKin();
    const { jobId: j0 } = await postSubmitPrepare(env);
    await env.kin.connect(env.client).acceptWork(j0, { voiceMatch: 5, completeness: 3, accuracy: 4, structure: 5 });

    // Second job from a different client to avoid double-stake check
    await makeClientEligible(env, env.third);
    await env.kin.connect(env.third).postJob(0, makeBrief({ briefRoot: '0x' + 'ee'.repeat(32) }), { value: E(env, '0.01') });
    const outputRoot = randomRoot(env.ethers);
    const modelDigest = '0x' + 'dd'.repeat(32);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, 1, outputRoot, 8000, modelDigest);
    await env.kin.connect(env.user).submitWork(1, outputRoot, 8000, modelDigest, sig);
    await env.kin.connect(env.third).acceptWork(1, { voiceMatch: 3, completeness: 5, accuracy: 4, structure: 3 });

    const avg = await env.kin.avgPerDim(0);
    // (5+3)/2 = 4.0 → 40000 bps; (3+5)/2 = 4.0 → 40000; (4+4)/2 = 4.0 → 40000; (5+3)/2 = 4.0 → 40000
    assert.equal(avg.voiceMatchBps,   40000n);
    assert.equal(avg.completenessBps, 40000n);
    assert.equal(avg.accuracyBps,     40000n);
    assert.equal(avg.structureBps,    40000n);
  });

  it('avgPerDim returns zeros when no completed jobs', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    const avg = await env.kin.avgPerDim(0);
    assert.equal(avg.voiceMatchBps, 0n);
  });

  it('totalSkills + totalJobs increment', async () => {
    const env = await deployKin();
    await mintSkillFor(env, env.user);
    await mintSkillFor(env, env.client, {
      githubHandleHash: env.ethers.keccak256(env.ethers.toUtf8Bytes('other')),
    });
    assert.equal(await env.kin.totalSkills(), 2n);

    await makeClientEligible(env, env.third);
    await env.kin.connect(env.third).postJob(0, makeBrief(), { value: E(env, '0.01') });
    assert.equal(await env.kin.totalJobs(), 1n);
  });

  it('getSampleRoots / getEmbedRoots return arrays', async () => {
    const env = await deployKin();
    const { sampleRoots, embedRoots } = await mintSkillFor(env, env.user);
    const fetchedS = await env.kin.getSampleRoots(0);
    const fetchedE = await env.kin.getEmbedRoots(0);
    assert.equal(fetchedS.length, sampleRoots.length);
    assert.equal(fetchedE.length, embedRoots.length);
    for (let i = 0; i < sampleRoots.length; i++) {
      assert.equal(fetchedS[i], sampleRoots[i]);
      assert.equal(fetchedE[i], embedRoots[i]);
    }
  });
});

// ─── End-to-end happy path ─────────────────────────────────────────────

describe('Kin v2 — end-to-end', () => {
  it('mint → stake → post → submit → accept → earnings + stake refund', async () => {
    const env = await deployKin();
    const { skillId } = await mintSkillFor(env, env.user);
    await makeClientEligible(env, env.client);
    const stakeAmt = await env.kin.clientStakeBalance(env.client.address);
    assert.notEqual(stakeAmt, 0n);

    const price = (await env.kin.getSkill(skillId)).pricePerJob;
    await env.kin.connect(env.client).postJob(skillId, makeBrief(), { value: price });

    const outputRoot = randomRoot(env.ethers);
    const modelDigest = '0x' + 'ab'.repeat(32);
    const { sig } = await signAttestation(env.ethers, env.teeSigner, 0, outputRoot, 9100, modelDigest);
    await env.kin.connect(env.user).submitWork(0, outputRoot, 9100, modelDigest, sig);

    const userBefore = await env.ethers.provider.getBalance(env.user.address);
    await env.kin.connect(env.client).acceptWork(0, { voiceMatch: 5, completeness: 5, accuracy: 5, structure: 5 });
    const userAfter = await env.ethers.provider.getBalance(env.user.address);
    assert.equal(userAfter - userBefore, price);

    assert.equal(await env.kin.clientStakeBalance(env.client.address), 0n);
    const s = await env.kin.getSkill(skillId);
    assert.equal(s.rep.jobsCompleted, 1n);
    assert.equal(s.rep.totalEarnedWei, BigInt(price));
  });
});
