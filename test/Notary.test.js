import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';

const ZERO_ROOT = '0x' + '00'.repeat(32);

async function deployNotary() {
  const { ethers } = await network.getOrCreate();
  const [admin, user, client, third] = await ethers.getSigners();
  const notary = await ethers.deployContract('HuntNotary');
  await notary.waitForDeployment();
  return { ethers, notary, admin, user, client, third };
}

function hash(ethers, value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function findEvent(notary, receipt, name) {
  const log = receipt.logs.find((l) => {
    try {
      return notary.interface.parseLog(l).name === name;
    } catch {
      return false;
    }
  });
  assert.ok(log, `${name} not emitted`);
  return notary.interface.parseLog(log);
}

describe('HuntNotary', () => {
  it('attest() increments totalAttestations', async () => {
    const env = await deployNotary();
    assert.equal(await env.notary.totalAttestations(), 0n);

    await env.notary.attest(
      hash(env.ethers, 'transcript'),
      hash(env.ethers, 'zai-org/GLM-5-FP8'),
      hash(env.ethers, 'general'),
      ZERO_ROOT,
    );

    assert.equal(await env.notary.totalAttestations(), 1n);
  });

  it('attest() reverts on empty contentHash', async () => {
    const env = await deployNotary();
    await assert.rejects(
      env.notary.attest(
        ZERO_ROOT,
        hash(env.ethers, 'model'),
        hash(env.ethers, 'domain'),
        ZERO_ROOT,
      ),
    );
  });

  it('attest() reverts on empty modelDigest', async () => {
    const env = await deployNotary();
    await assert.rejects(
      env.notary.attest(
        hash(env.ethers, 'content'),
        ZERO_ROOT,
        hash(env.ethers, 'domain'),
        ZERO_ROOT,
      ),
    );
  });

  it('getAttestation(id) returns the stored struct', async () => {
    const env = await deployNotary();
    const contentHash = hash(env.ethers, 'appeal transcript');
    const modelDigest = hash(env.ethers, 'zai-org/GLM-5-FP8|notary-v1');
    const domain = hash(env.ethers, 'insurance');
    const sealedInputRoot = hash(env.ethers, '0g-storage-root');

    const tx = await env.notary
      .connect(env.user)
      .attest(contentHash, modelDigest, domain, sealedInputRoot);
    const receipt = await tx.wait();
    const block = await env.ethers.provider.getBlock(receipt.blockNumber);

    const attestation = await env.notary.getAttestation(0);
    assert.equal(attestation.user.toLowerCase(), env.user.address.toLowerCase());
    assert.equal(attestation.contentHash, contentHash);
    assert.equal(attestation.modelDigest, modelDigest);
    assert.equal(attestation.domain, domain);
    assert.equal(attestation.attestedAt, BigInt(block.timestamp));
    assert.equal(attestation.sealedInputRoot, sealedInputRoot);
  });

  it('AttestationRecorded event fires with the right indexed fields', async () => {
    const env = await deployNotary();
    const contentHash = hash(env.ethers, 'medical transcript');
    const modelDigest = hash(env.ethers, 'model-digest');
    const domain = hash(env.ethers, 'medical');

    const tx = await env.notary
      .connect(env.client)
      .attest(contentHash, modelDigest, domain, ZERO_ROOT);
    const receipt = await tx.wait();
    const block = await env.ethers.provider.getBlock(receipt.blockNumber);
    const event = findEvent(env.notary, receipt, 'AttestationRecorded');

    assert.equal(event.args.attestId, 0n);
    assert.equal(event.args.user.toLowerCase(), env.client.address.toLowerCase());
    assert.equal(event.args.modelDigest, modelDigest);
    assert.equal(event.args.contentHash, contentHash);
    assert.equal(event.args.domain, domain);
    assert.equal(event.args.attestedAt, BigInt(block.timestamp));
    assert.equal(event.args.sealedInputRoot, ZERO_ROOT);
  });

  it('multiple users can independently attest', async () => {
    const env = await deployNotary();

    await env.notary
      .connect(env.user)
      .attest(
        hash(env.ethers, 'u1 transcript'),
        hash(env.ethers, 'u1 model'),
        hash(env.ethers, 'audit'),
        ZERO_ROOT,
      );
    await env.notary
      .connect(env.third)
      .attest(
        hash(env.ethers, 'u2 transcript'),
        hash(env.ethers, 'u2 model'),
        hash(env.ethers, 'benefits'),
        ZERO_ROOT,
      );

    assert.equal(await env.notary.totalAttestations(), 2n);
    const first = await env.notary.getAttestation(0);
    const second = await env.notary.getAttestation(1);
    assert.equal(first.user.toLowerCase(), env.user.address.toLowerCase());
    assert.equal(second.user.toLowerCase(), env.third.address.toLowerCase());
  });

  it('getAttestation(id) reverts out of range', async () => {
    const env = await deployNotary();
    await assert.rejects(env.notary.getAttestation(0), /out of range/);
  });
});
