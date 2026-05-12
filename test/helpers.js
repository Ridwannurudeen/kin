// Test helpers — builds + signs Credentials, SampleFingerprints, attestations the way
// the real verifier service and TEE evaluator will. Contract verifies these signatures
// against the registered `verifier` and `teeSigner` addresses.

import { network } from 'hardhat';
import {
  credentialDigest,
  signCredential as libSignCredential,
  fingerprintDigest,
  signFingerprint as libSignFingerprint,
  signAttestation as libSignAttestation,
  signFindingAttestation as libSignFindingAttestation,
} from '../lib/credential.js';

export const ZERO_ROOT = '0x' + '00'.repeat(32);

/// Deploy fresh Kin contract with a dedicated verifier wallet + teeSigner wallet.
/// Returns everything tests need.
export async function deployKin() {
  const { ethers, networkHelpers } = await network.getOrCreate();
  const [admin, user, client, third, fourth] = await ethers.getSigners();

  // Distinct verifier + teeSigner wallets (so we can sign in tests as them)
  const verifier  = ethers.Wallet.createRandom().connect(ethers.provider);
  const teeSigner = ethers.Wallet.createRandom().connect(ethers.provider);

  // Fund them so they can transact if needed
  await admin.sendTransaction({ to: verifier.address,  value: ethers.parseEther('10') });
  await admin.sendTransaction({ to: teeSigner.address, value: ethers.parseEther('10') });

  const kin = await ethers.deployContract('Kin', [teeSigner.address, verifier.address]);
  await kin.waitForDeployment();

  return { ethers, networkHelpers, kin, admin, user, client, third, fourth, verifier, teeSigner };
}

/// Random bytes32 root (encrypted-blob 0G Storage root in real life).
export function randomRoot(ethers) {
  return ethers.hexlify(ethers.randomBytes(32));
}

export function rootList(ethers, n) {
  return Array.from({ length: n }, () => randomRoot(ethers));
}

/// Build a Credential struct matching contract field order.
/// Caller passes the wallet whose ownership the credential claims, and overrides.
export function makeCredential(opts = {}) {
  return {
    githubHandleHash: opts.githubHandleHash ?? '0x' + '11'.repeat(32),
    accountAgeDays:   opts.accountAgeDays   ?? 800,        // > 730 default bar
    mergedPRs:        opts.mergedPRs        ?? 50,         // > 20 default bar
    codeReviewCount:  opts.codeReviewCount  ?? 30,         // > 10 default bar
    verifiedAt:       opts.verifiedAt       ?? Math.floor(Date.now() / 1000),
    verifier:         opts.verifier,                       // address of verifier wallet (required)
    sig:              '0x',                                // filled by signCredential
  };
}

/// Sign a Credential with the verifier wallet (uses shared lib).
export async function signCredential(ethers, verifier, wallet, cred) {
  return libSignCredential(verifier, wallet, cred);
}

/// Build a SampleFingerprint with reasonable defaults that pass the quality bar.
export function makeFingerprint(opts = {}) {
  return {
    vocabEntropyBps: opts.vocabEntropyBps ?? 7800,
    domainTermBps:   opts.domainTermBps   ?? 8500,
    structuralBps:   opts.structuralBps   ?? 7100,
    specificityBps:  opts.specificityBps  ?? 9000,
    overallBps:      opts.overallBps      ?? 8200,    // > 6000 bar
    modelDigest:     opts.modelDigest     ?? '0x' + 'ab'.repeat(32),
    teeSig:          '0x',
  };
}

export async function signFingerprint(ethers, teeSigner, sampleRoots, fp) {
  return libSignFingerprint(teeSigner, sampleRoots, fp);
}

/// Build an attestation digest + signature for submitWork.
export async function signAttestation(ethers, teeSigner, jobId, outputRoot, qualityScore, modelDigest) {
  return libSignAttestation(teeSigner, jobId, outputRoot, qualityScore, modelDigest);
}

/// Default structured brief.
export function makeBrief(opts = {}) {
  return {
    briefSchemaVersion: opts.briefSchemaVersion ?? 1,
    briefRoot:          opts.briefRoot          ?? '0x' + 'cd'.repeat(32),
    repoFingerprint:    opts.repoFingerprint    ?? '0x' + '00'.repeat(32),
    diffLinesEstimate:  opts.diffLinesEstimate  ?? 120,
    urgency:            opts.urgency            ?? 0,
  };
}

/// Convenience: mint a skill for `user` with safe defaults. Returns skillId.
export async function mintSkillFor(env, user, overrides = {}) {
  const { ethers, kin, verifier, teeSigner } = env;
  const sampleRoots = overrides.sampleRoots ?? rootList(ethers, 3);
  const embedRoots  = overrides.embedRoots  ?? rootList(ethers, sampleRoots.length);
  const credBase = makeCredential({
    verifier: verifier.address,
    githubHandleHash: overrides.githubHandleHash ?? ethers.keccak256(ethers.toUtf8Bytes(`user-${user.address}`)),
    ...overrides.credOverrides,
  });
  const cred = await signCredential(ethers, verifier, user.address, credBase);

  const fpBase = makeFingerprint(overrides.fpOverrides);
  const fp = await signFingerprint(ethers, teeSigner, sampleRoots, fpBase);

  const language    = overrides.language    ?? 'typescript';
  const description = overrides.description ?? 'Senior TS reviewer';
  const price       = overrides.pricePerJob ?? ethers.parseEther('0.01');

  const tx = await kin.connect(user).mintSkill(cred, sampleRoots, embedRoots, fp, language, description, price);
  const rcpt = await tx.wait();
  const ev = rcpt.logs.find(l => { try { return kin.interface.parseLog(l).name === 'SkillMinted'; } catch { return false; } });
  const parsed = kin.interface.parseLog(ev);
  return { skillId: parsed.args.skillId, sampleRoots, embedRoots, cred, fp };
}

/// Convenience: take the staking path so a client can post jobs.
export async function makeClientEligible(env, client) {
  const { kin } = env;
  await kin.connect(client).stakeForJobAccess({ value: await kin.CLIENT_STAKE_AMOUNT() });
}

// ─── Hunt helpers ──────────────────────────────────────────────────────

/// Deploy fresh Hunt contract with a dedicated verifier wallet + teeSigner wallet.
export async function deployHunt() {
  const { ethers, networkHelpers } = await network.getOrCreate();
  const [admin, user, client, third, fourth] = await ethers.getSigners();

  const verifier  = ethers.Wallet.createRandom().connect(ethers.provider);
  const teeSigner = ethers.Wallet.createRandom().connect(ethers.provider);

  await admin.sendTransaction({ to: verifier.address,  value: ethers.parseEther('10') });
  await admin.sendTransaction({ to: teeSigner.address, value: ethers.parseEther('10') });

  const hunt = await ethers.deployContract('Hunt', [teeSigner.address, verifier.address]);
  await hunt.waitForDeployment();

  return { ethers, networkHelpers, hunt, admin, user, client, third, fourth, verifier, teeSigner };
}

/// Convenience: mint a hunter for `user` with safe defaults. Returns hunterId + inputs.
export async function mintHunterFor(env, user, overrides = {}) {
  const { ethers, hunt, verifier, teeSigner } = env;
  const sampleRoots = overrides.sampleRoots ?? rootList(ethers, 3);
  const embedRoots  = overrides.embedRoots  ?? rootList(ethers, sampleRoots.length);
  const credBase = makeCredential({
    verifier: verifier.address,
    githubHandleHash: overrides.githubHandleHash ?? ethers.keccak256(ethers.toUtf8Bytes(`hunter-${user.address}`)),
    ...overrides.credOverrides,
  });
  const cred = await signCredential(ethers, verifier, user.address, credBase);

  const fpBase = makeFingerprint(overrides.fpOverrides);
  const fp = await signFingerprint(ethers, teeSigner, sampleRoots, fpBase);

  const specialty   = overrides.specialty   ?? 'reentrancy + access control';
  const description = overrides.description ?? 'Senior Solidity hunter';

  const tx = await hunt.connect(user).mintHunter(cred, sampleRoots, embedRoots, fp, specialty, description);
  const rcpt = await tx.wait();
  const ev = rcpt.logs.find(l => { try { return hunt.interface.parseLog(l).name === 'HunterMinted'; } catch { return false; } });
  const parsed = hunt.interface.parseLog(ev);
  return { hunterId: parsed.args.hunterId, sampleRoots, embedRoots, cred, fp };
}

/// keccak256 of a CWE class name. Delegates to `cweToBytes32` so tests, the hunter daemon,
/// and any poster CLI all hash the same canonical kebab form (lowercased, underscores → -).
import { cweToBytes32 } from '../lib/cwe.js';
export function cweHash(_ethers, name) {
  return cweToBytes32(name);
}

/// Build a FindingInput tuple with sane defaults. `teeTimestamp` and `attestationSig`
/// are filled by buildSignedFindingInput; this just returns the unsigned shape.
export function makeFindingInput(opts = {}) {
  return {
    cweClass:                 opts.cweClass                 ?? ('0x' + '11'.repeat(32)),
    severity:                 opts.severity                 ?? 3,
    findingRoot:              opts.findingRoot              ?? ('0x' + 'ff'.repeat(32)),
    severityCalibrationBps:   opts.severityCalibrationBps   ?? 8000,
    precisionBps:             opts.precisionBps             ?? 8200,
    coverageBps:              opts.coverageBps              ?? 7800,
    exploitabilityBps:        opts.exploitabilityBps        ?? 8400,
    modelDigest:              opts.modelDigest              ?? ('0x' + 'ab'.repeat(32)),
    teeTimestamp:             opts.teeTimestamp             ?? 0,   // filled by signer
    attestationSig:           '0x',                                  // filled by signer
  };
}

/// Sign a finding attestation. Returns the full FindingInput ready to submit.
/// Pulls codeRoot + postedAt from the on-chain bounty for the chosen teeTimestamp.
export async function buildSignedFindingInput(env, bountyId, hunterId, signer, input) {
  const { ethers, teeSigner } = env;
  const bounty = await env.hunt.getBounty(bountyId);
  // Default teeTimestamp = postedAt (always inside [postedAt, raceDeadline]).
  const teeTimestamp = input.teeTimestamp && input.teeTimestamp !== 0
    ? BigInt(input.teeTimestamp)
    : BigInt(bounty.postedAt);

  const sigSource = signer ?? teeSigner;
  const { sig } = await libSignFindingAttestation(sigSource, {
    bountyId: BigInt(bountyId),
    codeRoot: bounty.codeRoot,
    hunterId: BigInt(hunterId),
    cweClass: input.cweClass,
    severity: input.severity,
    findingRoot: input.findingRoot,
    modelDigest: input.modelDigest,
    teeTimestamp,
    severityCalibrationBps: input.severityCalibrationBps,
    precisionBps: input.precisionBps,
    coverageBps: input.coverageBps,
    exploitabilityBps: input.exploitabilityBps,
  });

  return { ...input, teeTimestamp, attestationSig: sig };
}

/// Convenience: mint a hunter + post a bounty + return everything. raceDuration in seconds.
export async function huntScenario(env, opts = {}) {
  const { ethers, hunt } = env;
  const poster = opts.poster ?? env.client;
  const hunterOwner = opts.hunterOwner ?? env.user;

  const { hunterId } = await mintHunterFor(env, hunterOwner, opts.hunterOverrides ?? {});

  const codeRoot   = opts.codeRoot     ?? randomRoot(ethers);
  const inScope    = opts.inScopeCwes  ?? [];
  const raceDur    = opts.raceDuration ?? 600;             // 10 min, > 5 min floor
  const payout     = opts.payout       ?? ethers.parseEther('0.05');

  const tx = await hunt.connect(poster).postBounty(codeRoot, inScope, raceDur, { value: payout });
  const rcpt = await tx.wait();
  const ev = rcpt.logs.find(l => { try { return hunt.interface.parseLog(l).name === 'BountyPosted'; } catch { return false; } });
  const parsed = hunt.interface.parseLog(ev);
  const bountyId = parsed.args.bountyId;

  return { hunterId, bountyId, codeRoot, payout, raceDuration: raceDur };
}
