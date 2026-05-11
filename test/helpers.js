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
