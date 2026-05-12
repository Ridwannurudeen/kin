import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import {
  deployHunt,
  randomRoot,
  rootList,
  makeCredential,
  makeFingerprint,
  signCredential,
  signFingerprint,
  mintHunterFor,
  makeFindingInput,
  buildSignedFindingInput,
  cweHash,
  huntScenario,
  ZERO_ROOT,
} from './helpers.js';

const E = (env, n) => env.ethers.parseEther(n);

// ─── Deployment ─────────────────────────────────────────────────────────

describe('Hunt — deployment', () => {
  it('sets teeSigner, verifier, admin from constructor', async () => {
    const env = await deployHunt();
    assert.equal((await env.hunt.teeSigner()).toLowerCase(), env.teeSigner.address.toLowerCase());
    assert.equal((await env.hunt.verifier()).toLowerCase(),  env.verifier.address.toLowerCase());
    assert.equal((await env.hunt.admin()).toLowerCase(),     env.admin.address.toLowerCase());
  });

  it('reverts on zero teeSigner', async () => {
    const { ethers } = await network.getOrCreate();
    const [, somebody] = await ethers.getSigners();
    await assert.rejects(
      ethers.deployContract('Hunt', [ethers.ZeroAddress, somebody.address]),
      /tee=0/,
    );
  });

  it('reverts on zero verifier', async () => {
    const { ethers } = await network.getOrCreate();
    const [, somebody] = await ethers.getSigners();
    await assert.rejects(
      ethers.deployContract('Hunt', [somebody.address, ethers.ZeroAddress]),
      /verifier=0/,
    );
  });
});

// ─── mintHunter: happy path ─────────────────────────────────────────────

describe('Hunt — mintHunter happy path', () => {
  it('mints, emits HunterMinted, persists fields', async () => {
    const env = await deployHunt();
    const { hunterId, sampleRoots, embedRoots } = await mintHunterFor(env, env.user, {
      specialty: 'reentrancy',
      description: 'Senior Solidity hunter — knows where the locks aren\'t',
    });
    assert.equal(hunterId, 0n);

    const h = await env.hunt.getHunter(0);
    assert.equal(h.owner.toLowerCase(), env.user.address.toLowerCase());
    assert.equal(h.specialty, 'reentrancy');
    assert.equal(h.sampleRoots.length, sampleRoots.length);
    assert.equal(h.embedRoots.length, embedRoots.length);
    assert.equal(Number(h.fingerprint.overallBps), 8200);
    assert.equal(h.paused, false);
    assert.equal(h.totalWins, 0n);
    assert.equal(h.totalSubmissions, 0n);
  });

  it('increments nextHunterId across multiple mints', async () => {
    const env = await deployHunt();
    await mintHunterFor(env, env.user);
    await mintHunterFor(env, env.client, {
      githubHandleHash: env.ethers.keccak256(env.ethers.toUtf8Bytes('different-hunter')),
    });
    assert.equal(await env.hunt.totalHunters(), 2n);
  });
});

// ─── mintHunter: validation ─────────────────────────────────────────────

describe('Hunt — mintHunter validation', () => {
  it('reverts when samples < 3', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { sampleRoots: rootList(env.ethers, 2), embedRoots: rootList(env.ethers, 2) }),
      /samples 3\.\.20/,
    );
  });

  it('reverts when samples > 20', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { sampleRoots: rootList(env.ethers, 21), embedRoots: rootList(env.ethers, 21) }),
      /samples 3\.\.20/,
    );
  });

  it('reverts on sample/embed length mismatch', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { sampleRoots: rootList(env.ethers, 3), embedRoots: rootList(env.ethers, 4) }),
      /sample\/embed length mismatch/,
    );
  });

  it('reverts on empty specialty', async () => {
    const env = await deployHunt();
    await assert.rejects(mintHunterFor(env, env.user, { specialty: '' }), /specialty 1\.\.64/);
  });

  it('reverts on specialty > 64 chars', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { specialty: 'x'.repeat(65) }),
      /specialty 1\.\.64/,
    );
  });

  it('reverts on description > 280 chars', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { description: 'x'.repeat(281) }),
      /desc>280/,
    );
  });

  it('reverts when fingerprint.overallBps below MIN_FINGERPRINT_QUALITY_BPS', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { fpOverrides: { overallBps: 5999 } }),
      /fingerprint below bar/,
    );
  });

  it('reverts when credential.verifier != contract verifier', async () => {
    const env = await deployHunt();
    const wrongVerifier = env.ethers.Wallet.createRandom().connect(env.ethers.provider);
    const sampleRoots = rootList(env.ethers, 3);
    const embedRoots  = rootList(env.ethers, 3);
    const credBase = makeCredential({ verifier: wrongVerifier.address });
    const cred = await signCredential(env.ethers, wrongVerifier, env.user.address, credBase);
    const fp = await signFingerprint(env.ethers, env.teeSigner, sampleRoots, makeFingerprint());
    await assert.rejects(
      env.hunt.connect(env.user).mintHunter(cred, sampleRoots, embedRoots, fp, 'reentrancy', 'd'),
      /wrong verifier/,
    );
  });

  it('reverts when accountAgeDays below bar', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { credOverrides: { accountAgeDays: 729 } }),
      /github age/,
    );
  });

  it('reverts when mergedPRs below bar', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { credOverrides: { mergedPRs: 19 } }),
      /merged PRs/,
    );
  });

  it('reverts when codeReviewCount below bar', async () => {
    const env = await deployHunt();
    await assert.rejects(
      mintHunterFor(env, env.user, { credOverrides: { codeReviewCount: 9 } }),
      /review count/,
    );
  });

  it('reverts on credential reuse', async () => {
    const env = await deployHunt();
    const handleHash = env.ethers.keccak256(env.ethers.toUtf8Bytes('reused-hunter-handle'));
    const verifiedAt = 1_700_000_000;
    await mintHunterFor(env, env.user, { githubHandleHash: handleHash, credOverrides: { verifiedAt } });
    await assert.rejects(
      mintHunterFor(env, env.user, { githubHandleHash: handleHash, credOverrides: { verifiedAt } }),
      /credential reused/,
    );
  });

  it('reverts on bad credential signature (wrong signer)', async () => {
    const env = await deployHunt();
    const sampleRoots = rootList(env.ethers, 3);
    const embedRoots  = rootList(env.ethers, 3);
    const credBase = makeCredential({ verifier: env.verifier.address });
    const imposter = env.ethers.Wallet.createRandom();
    const cred = await signCredential(env.ethers, imposter, env.user.address, credBase);
    const fp = await signFingerprint(env.ethers, env.teeSigner, sampleRoots, makeFingerprint());
    await assert.rejects(
      env.hunt.connect(env.user).mintHunter(cred, sampleRoots, embedRoots, fp, 'reentrancy', 'd'),
      /bad cred sig/,
    );
  });

  it('reverts on bad fingerprint signature (wrong signer)', async () => {
    const env = await deployHunt();
    const sampleRoots = rootList(env.ethers, 3);
    const embedRoots  = rootList(env.ethers, 3);
    const credBase = makeCredential({ verifier: env.verifier.address });
    const cred = await signCredential(env.ethers, env.verifier, env.user.address, credBase);
    const imposter = env.ethers.Wallet.createRandom();
    const fp = await signFingerprint(env.ethers, imposter, sampleRoots, makeFingerprint());
    await assert.rejects(
      env.hunt.connect(env.user).mintHunter(cred, sampleRoots, embedRoots, fp, 'reentrancy', 'd'),
      /bad fingerprint sig/,
    );
  });
});

// ─── pauseHunter ────────────────────────────────────────────────────────

describe('Hunt — pauseHunter', () => {
  it('owner can pause + unpause', async () => {
    const env = await deployHunt();
    await mintHunterFor(env, env.user);
    await env.hunt.connect(env.user).pauseHunter(0, true);
    assert.equal((await env.hunt.getHunter(0)).paused, true);
    await env.hunt.connect(env.user).pauseHunter(0, false);
    assert.equal((await env.hunt.getHunter(0)).paused, false);
  });

  it('non-owner reverts', async () => {
    const env = await deployHunt();
    await mintHunterFor(env, env.user);
    await assert.rejects(env.hunt.connect(env.client).pauseHunter(0, true), /not owner/);
  });
});

// ─── postBounty ─────────────────────────────────────────────────────────

describe('Hunt — postBounty happy path', () => {
  it('escrows payout, emits BountyPosted, sets deadlines', async () => {
    const env = await deployHunt();
    const codeRoot = randomRoot(env.ethers);
    const payout = E(env, '0.05');
    const raceDur = 600;
    const tx = await env.hunt.connect(env.client).postBounty(codeRoot, [], raceDur, { value: payout });
    const rcpt = await tx.wait();
    const ev = rcpt.logs.find(l => { try { return env.hunt.interface.parseLog(l).name === 'BountyPosted'; } catch { return false; } });
    const parsed = env.hunt.interface.parseLog(ev);
    assert.equal(parsed.args.bountyId, 0n);
    assert.equal(parsed.args.maxPayout, payout);

    const b = await env.hunt.getBounty(0);
    assert.equal(b.poster.toLowerCase(), env.client.address.toLowerCase());
    assert.equal(b.maxPayout, payout);
    assert.equal(b.codeRoot, codeRoot);
    assert.equal(b.status, 0n);  // Open

    const block = await env.ethers.provider.getBlock(rcpt.blockNumber);
    assert.equal(BigInt(b.postedAt), BigInt(block.timestamp));
    assert.equal(BigInt(b.raceDeadline) - BigInt(b.postedAt), BigInt(raceDur));
    assert.equal(BigInt(b.settleDeadline) - BigInt(b.raceDeadline), 24n * 3600n);

    // Escrow held on contract
    assert.equal(await env.ethers.provider.getBalance(await env.hunt.getAddress()), payout);
  });

  it('inScopeCwes empty means any class accepted (no revert when storing)', async () => {
    const env = await deployHunt();
    const codeRoot = randomRoot(env.ethers);
    await env.hunt.connect(env.client).postBounty(codeRoot, [], 600, { value: E(env, '0.01') });
    const scope = await env.hunt.getInScopeCwes(0);
    assert.equal(scope.length, 0);
  });
});

describe('Hunt — postBounty validation', () => {
  it('reverts on zero payout', async () => {
    const env = await deployHunt();
    await assert.rejects(
      env.hunt.connect(env.client).postBounty(randomRoot(env.ethers), [], 600, { value: 0 }),
      /payout=0/,
    );
  });

  it('reverts on empty codeRoot', async () => {
    const env = await deployHunt();
    await assert.rejects(
      env.hunt.connect(env.client).postBounty(ZERO_ROOT, [], 600, { value: E(env, '0.01') }),
      /empty code/,
    );
  });

  it('reverts when raceDuration below MIN_RACE_DURATION', async () => {
    const env = await deployHunt();
    await assert.rejects(
      env.hunt.connect(env.client).postBounty(randomRoot(env.ethers), [], 299, { value: E(env, '0.01') }),
      /race duration/,
    );
  });

  it('reverts when raceDuration above MAX_RACE_DURATION', async () => {
    const env = await deployHunt();
    const tooLong = 7 * 24 * 3600 + 1;
    await assert.rejects(
      env.hunt.connect(env.client).postBounty(randomRoot(env.ethers), [], tooLong, { value: E(env, '0.01') }),
      /race duration/,
    );
  });
});

// ─── submitFinding ──────────────────────────────────────────────────────

describe('Hunt — submitFinding happy path', () => {
  it('records finding, emits FindingSubmitted, increments totalSubmissions', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput({ cweClass: cweHash(env.ethers, 'SWC-107-reentrancy') });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);

    const tx = await env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.find(l => { try { return env.hunt.interface.parseLog(l).name === 'FindingSubmitted'; } catch { return false; } });
    const parsed = env.hunt.interface.parseLog(ev);
    assert.equal(parsed.args.bountyId, bountyId);
    assert.equal(parsed.args.findingIdx, 0n);
    assert.equal(parsed.args.hunterId, hunterId);
    assert.equal(parsed.args.severity, 3n);

    assert.equal(await env.hunt.getFindingsCount(bountyId), 1n);
    const findings = await env.hunt.getFindings(bountyId);
    assert.equal(findings[0].hunter.toLowerCase(), env.user.address.toLowerCase());
    assert.equal(findings[0].findingRoot, input.findingRoot);

    const h = await env.hunt.getHunter(hunterId);
    assert.equal(h.totalSubmissions, 1n);
  });

  it('multiple findings from different hunters accumulate with monotonic indices', async () => {
    const env = await deployHunt();
    const { hunterId: h0, bountyId } = await huntScenario(env);
    const { hunterId: h1 } = await mintHunterFor(env, env.third, {
      githubHandleHash: env.ethers.keccak256(env.ethers.toUtf8Bytes('hunter-third')),
    });

    const sigA = await buildSignedFindingInput(env, bountyId, h0, env.teeSigner, makeFindingInput());
    await env.hunt.connect(env.user).submitFinding(bountyId, h0, sigA);

    const sigB = await buildSignedFindingInput(env, bountyId, h1, env.teeSigner,
      makeFindingInput({ findingRoot: '0x' + 'aa'.repeat(32) }));
    await env.hunt.connect(env.third).submitFinding(bountyId, h1, sigB);

    assert.equal(await env.hunt.getFindingsCount(bountyId), 2n);
    const findings = await env.hunt.getFindings(bountyId);
    assert.equal(findings[0].hunterId, h0);
    assert.equal(findings[1].hunterId, h1);
  });
});

describe('Hunt — submitFinding validation', () => {
  it('reverts on bounty not found', async () => {
    const env = await deployHunt();
    const { hunterId } = await mintHunterFor(env, env.user);
    const input = makeFindingInput();
    // Can't call buildSignedFindingInput for a nonexistent bounty — build manually.
    const signed = { ...input, teeTimestamp: 1n, attestationSig: '0x' + '00'.repeat(65) };
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(999, hunterId, signed),
      /bounty not found/,
    );
  });

  it('reverts when bounty not Open (settled)', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput();
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed);

    await env.networkHelpers.time.increase(601);
    await env.hunt.connect(env.client).settleBounty(bountyId, 0, {
      severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
    });

    const signed2 = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner,
      makeFindingInput({ findingRoot: '0x' + 'bb'.repeat(32) }));
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed2),
      /bounty not open/,
    );
  });

  it('reverts when race deadline passed', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput();
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await env.networkHelpers.time.increase(601);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /race over/,
    );
  });

  it('reverts when not hunter owner', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput();
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.third).submitFinding(bountyId, hunterId, signed),
      /not hunter owner/,
    );
  });

  it('reverts when hunter is paused', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    await env.hunt.connect(env.user).pauseHunter(hunterId, true);
    const input = makeFindingInput();
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /hunter paused/,
    );
  });

  it('reverts on severity = 0', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput({ severity: 0 });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /severity 1\.\.4/,
    );
  });

  it('reverts on severity = 5', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput({ severity: 5 });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /severity 1\.\.4/,
    );
  });

  it('reverts on empty findingRoot', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const input = makeFindingInput({ findingRoot: ZERO_ROOT });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /empty finding/,
    );
  });

  it('reverts when teeTimestamp before postedAt', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const bounty = await env.hunt.getBounty(bountyId);
    const input = makeFindingInput({ teeTimestamp: BigInt(bounty.postedAt) - 1n });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /tee timestamp window/,
    );
  });

  it('reverts when teeTimestamp after raceDeadline', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const bounty = await env.hunt.getBounty(bountyId);
    const input = makeFindingInput({ teeTimestamp: BigInt(bounty.raceDeadline) + 1n });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /tee timestamp window/,
    );
  });

  it('reverts when cweClass not in non-empty inScope list', async () => {
    const env = await deployHunt();
    const allowed = cweHash(env.ethers, 'SWC-107-reentrancy');
    const { hunterId, bountyId } = await huntScenario(env, { inScopeCwes: [allowed] });
    const input = makeFindingInput({ cweClass: cweHash(env.ethers, 'SWC-115-tx-origin') });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /class out of scope/,
    );
  });

  it('accepts in-scope cweClass when list is non-empty', async () => {
    const env = await deployHunt();
    const allowed = cweHash(env.ethers, 'SWC-107-reentrancy');
    const { hunterId, bountyId } = await huntScenario(env, { inScopeCwes: [allowed] });
    const input = makeFindingInput({ cweClass: allowed });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed);
    assert.equal(await env.hunt.getFindingsCount(bountyId), 1n);
  });

  it('reverts when self-eval average below MIN_FINDING_QUALITY_BPS', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    // average = (5000+5000+5000+5000)/4 = 5000 < 6000
    const input = makeFindingInput({
      severityCalibrationBps: 5000, precisionBps: 5000, coverageBps: 5000, exploitabilityBps: 5000,
    });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /self-eval below bar/,
    );
  });

  it('reverts on bad attestation sig (wrong signer)', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const imposter = env.ethers.Wallet.createRandom();
    const input = makeFindingInput();
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, imposter, input);
    await assert.rejects(
      env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed),
      /bad attestation sig/,
    );
  });
});

// ─── settleBounty ───────────────────────────────────────────────────────

async function bountyWithFinding(env, opts = {}) {
  const scenario = await huntScenario(env, opts);
  const { hunterId, bountyId } = scenario;
  const cls = opts.cweClass ?? cweHash(env.ethers, 'SWC-107-reentrancy');
  const input = makeFindingInput({ cweClass: cls });
  const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
  await env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed);
  return { ...scenario, cweClass: cls };
}

describe('Hunt — settleBounty happy path', () => {
  it('settles, pays hunter, updates class rep + hunter aggregate, emits events', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId, payout, cweClass } = await bountyWithFinding(env);

    await env.networkHelpers.time.increase(601);

    const hunterBefore = await env.ethers.provider.getBalance(env.user.address);
    const tx = await env.hunt.connect(env.client).settleBounty(bountyId, 0, {
      severityCalibration: 5, precision: 4, coverage: 3, exploitability: 4,
    });
    const rcpt = await tx.wait();
    const hunterAfter = await env.ethers.provider.getBalance(env.user.address);
    assert.equal(hunterAfter - hunterBefore, payout);

    const b = await env.hunt.getBounty(bountyId);
    assert.equal(b.status, 1n);  // Settled
    assert.equal(b.winningFindingIdx, 0n);
    assert.equal(b.maxPayout, 0n);

    const rep = await env.hunt.getClassRep(hunterId, cweClass);
    assert.equal(rep.wins, 1n);
    assert.equal(rep.submissions, 1n);
    assert.equal(rep.totalEarnedWei, BigInt(payout));
    assert.equal(rep.sumSeverityCalibration, 5n);
    assert.equal(rep.sumPrecision, 4n);
    assert.equal(rep.sumCoverage, 3n);
    assert.equal(rep.sumExploitability, 4n);

    const h = await env.hunt.getHunter(hunterId);
    assert.equal(h.totalWins, 1n);
    assert.equal(h.totalEarnedWei, BigInt(payout));

    const settled = rcpt.logs.find(l => { try { return env.hunt.interface.parseLog(l).name === 'BountySettled'; } catch { return false; } });
    const settledArgs = env.hunt.interface.parseLog(settled).args;
    assert.equal(settledArgs.bountyId, bountyId);
    assert.equal(settledArgs.winningFindingIdx, 0n);
    assert.equal(settledArgs.winningHunterId, hunterId);
    assert.equal(settledArgs.paid, payout);

    const repEv = rcpt.logs.find(l => { try { return env.hunt.interface.parseLog(l).name === 'ClassRepUpdated'; } catch { return false; } });
    const repArgs = env.hunt.interface.parseLog(repEv).args;
    assert.equal(repArgs.hunterId, hunterId);
    assert.equal(repArgs.wins, 1n);
    assert.equal(repArgs.submissions, 1n);
  });
});

describe('Hunt — settleBounty validation', () => {
  it('reverts when not poster', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await assert.rejects(
      env.hunt.connect(env.third).settleBounty(bountyId, 0, {
        severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
      }),
      /not poster/,
    );
  });

  it('reverts when bounty already settled', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await env.hunt.connect(env.client).settleBounty(bountyId, 0, {
      severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
    });
    await assert.rejects(
      env.hunt.connect(env.client).settleBounty(bountyId, 0, {
        severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
      }),
      /not open/,
    );
  });

  it('reverts when race not over yet', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await assert.rejects(
      env.hunt.connect(env.client).settleBounty(bountyId, 0, {
        severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
      }),
      /race not over/,
    );
  });

  it('reverts when settle window closed', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    // race ends after 600s, settle window is 24h after that.
    await env.networkHelpers.time.increase(600 + 24 * 3600 + 1);
    await assert.rejects(
      env.hunt.connect(env.client).settleBounty(bountyId, 0, {
        severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
      }),
      /settle window closed/,
    );
  });

  it('reverts on findingIdx out of bounds', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await assert.rejects(
      env.hunt.connect(env.client).settleBounty(bountyId, 99, {
        severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
      }),
      /bad findingIdx/,
    );
  });

  it('reverts when rating axis = 0', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await assert.rejects(
      env.hunt.connect(env.client).settleBounty(bountyId, 0, {
        severityCalibration: 0, precision: 4, coverage: 4, exploitability: 4,
      }),
      /rating 1\.\.5/,
    );
  });

  it('reverts when rating axis > 5', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await assert.rejects(
      env.hunt.connect(env.client).settleBounty(bountyId, 0, {
        severityCalibration: 4, precision: 4, coverage: 4, exploitability: 6,
      }),
      /rating 1\.\.5/,
    );
  });
});

// ─── expireBounty ───────────────────────────────────────────────────────

describe('Hunt — expireBounty', () => {
  it('refunds poster when no findings + race deadline passed', async () => {
    const env = await deployHunt();
    const { bountyId, payout } = await huntScenario(env);
    await env.networkHelpers.time.increase(601);

    const posterBefore = await env.ethers.provider.getBalance(env.client.address);
    const tx = await env.hunt.connect(env.third).expireBounty(bountyId);
    await tx.wait();
    const posterAfter = await env.ethers.provider.getBalance(env.client.address);
    assert.equal(posterAfter - posterBefore, payout);

    const b = await env.hunt.getBounty(bountyId);
    assert.equal(b.status, 2n);  // Expired
    assert.equal(b.maxPayout, 0n);
  });

  it('refunds poster when findings exist but settle window expired', async () => {
    const env = await deployHunt();
    const { bountyId, payout } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(600 + 24 * 3600 + 1);

    const posterBefore = await env.ethers.provider.getBalance(env.client.address);
    await env.hunt.connect(env.third).expireBounty(bountyId);
    const posterAfter = await env.ethers.provider.getBalance(env.client.address);
    assert.equal(posterAfter - posterBefore, payout);

    assert.equal((await env.hunt.getBounty(bountyId)).status, 2n);
  });

  it('reverts when race not over and no findings yet', async () => {
    const env = await deployHunt();
    const { bountyId } = await huntScenario(env);
    await assert.rejects(env.hunt.connect(env.third).expireBounty(bountyId), /still active/);
  });

  it('reverts when findings exist and settle window still open', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);  // race over, but settle window open
    await assert.rejects(env.hunt.connect(env.third).expireBounty(bountyId), /still active/);
  });

  it('reverts when bounty already settled', async () => {
    const env = await deployHunt();
    const { bountyId } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await env.hunt.connect(env.client).settleBounty(bountyId, 0, {
      severityCalibration: 4, precision: 4, coverage: 4, exploitability: 4,
    });
    await assert.rejects(env.hunt.connect(env.third).expireBounty(bountyId), /not open/);
  });

  it('reverts when bounty already expired', async () => {
    const env = await deployHunt();
    const { bountyId } = await huntScenario(env);
    await env.networkHelpers.time.increase(601);
    await env.hunt.connect(env.third).expireBounty(bountyId);
    await assert.rejects(env.hunt.connect(env.third).expireBounty(bountyId), /not open/);
  });
});

// ─── Views ──────────────────────────────────────────────────────────────

describe('Hunt — views', () => {
  it('classAvg returns averages in bps after a single settled bounty', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId, cweClass } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await env.hunt.connect(env.client).settleBounty(bountyId, 0, {
      severityCalibration: 5, precision: 3, coverage: 4, exploitability: 2,
    });
    const avg = await env.hunt.classAvg(hunterId, cweClass);
    assert.equal(avg.severityCalibrationBps, 50000n);
    assert.equal(avg.precisionBps,            30000n);
    assert.equal(avg.coverageBps,             40000n);
    assert.equal(avg.exploitabilityBps,       20000n);
  });

  it('classAvg returns zeros for an unused class', async () => {
    const env = await deployHunt();
    const { hunterId } = await mintHunterFor(env, env.user);
    // Use a canonical class that just hasn't been used yet (signature-replay) instead of
    // a made-up class — cweHash now throws on non-canonical names.
    const avg = await env.hunt.classAvg(hunterId, cweHash(env.ethers, 'signature-replay'));
    assert.equal(avg.severityCalibrationBps, 0n);
    assert.equal(avg.precisionBps,           0n);
    assert.equal(avg.coverageBps,            0n);
    assert.equal(avg.exploitabilityBps,      0n);
  });

  it('getClassRep returns populated struct after settle', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId, payout, cweClass } = await bountyWithFinding(env);
    await env.networkHelpers.time.increase(601);
    await env.hunt.connect(env.client).settleBounty(bountyId, 0, {
      severityCalibration: 5, precision: 4, coverage: 4, exploitability: 5,
    });
    const rep = await env.hunt.getClassRep(hunterId, cweClass);
    assert.equal(rep.wins, 1n);
    assert.equal(rep.submissions, 1n);
    assert.equal(rep.totalEarnedWei, BigInt(payout));
    assert.equal(rep.sumSeverityCalibration, 5n);
    assert.equal(rep.sumPrecision, 4n);
    assert.equal(rep.sumCoverage, 4n);
    assert.equal(rep.sumExploitability, 5n);
  });

  it('getFindings + getFindingsCount return submitted findings', async () => {
    const env = await deployHunt();
    const { hunterId, bountyId } = await huntScenario(env);
    const cls = cweHash(env.ethers, 'SWC-107-reentrancy');
    const input = makeFindingInput({ cweClass: cls });
    const signed = await buildSignedFindingInput(env, bountyId, hunterId, env.teeSigner, input);
    await env.hunt.connect(env.user).submitFinding(bountyId, hunterId, signed);

    assert.equal(await env.hunt.getFindingsCount(bountyId), 1n);
    const list = await env.hunt.getFindings(bountyId);
    assert.equal(list.length, 1);
    assert.equal(list[0].cweClass, cls);
    assert.equal(Number(list[0].severity), 3);
  });

  it('getHunter exposes credential + fingerprint + arrays', async () => {
    const env = await deployHunt();
    const { hunterId, sampleRoots, embedRoots } = await mintHunterFor(env, env.user);
    const h = await env.hunt.getHunter(hunterId);
    assert.equal(h.sampleRoots.length, sampleRoots.length);
    assert.equal(h.embedRoots.length, embedRoots.length);
    for (let i = 0; i < sampleRoots.length; i++) {
      assert.equal(h.sampleRoots[i], sampleRoots[i]);
      assert.equal(h.embedRoots[i], embedRoots[i]);
    }
    assert.equal(Number(h.credential.accountAgeDays), 800);
  });

  it('getBounty returns posted bounty', async () => {
    const env = await deployHunt();
    const { bountyId, codeRoot, payout } = await huntScenario(env);
    const b = await env.hunt.getBounty(bountyId);
    assert.equal(b.poster.toLowerCase(), env.client.address.toLowerCase());
    assert.equal(b.codeRoot, codeRoot);
    assert.equal(b.maxPayout, payout);
  });

  it('totalHunters + totalBounties increment', async () => {
    const env = await deployHunt();
    await mintHunterFor(env, env.user);
    await mintHunterFor(env, env.client, {
      githubHandleHash: env.ethers.keccak256(env.ethers.toUtf8Bytes('h2')),
    });
    await env.hunt.connect(env.third).postBounty(randomRoot(env.ethers), [], 600, { value: E(env, '0.01') });
    assert.equal(await env.hunt.totalHunters(), 2n);
    assert.equal(await env.hunt.totalBounties(), 1n);
  });
});
