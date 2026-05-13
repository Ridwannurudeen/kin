import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { signAttestation, verifyAttestation } from '../src/attestation.js';
import { classToBytes32 } from '../src/classes.js';

const params = {
  bountyId: 3n,
  inputRoot: '0x' + '11'.repeat(32),
  agentId: 1n,
  classBytes32: classToBytes32('oracle-manipulation'),
  severity: 3,
  outputRoot: '0x' + '22'.repeat(32),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1')),
  teeTimestamp: 1_763_000_000n,
  severityCalibrationBps: 8800,
  precisionBps: 9000,
  coverageBps: 8500,
  exploitabilityBps: 8700,
};

describe('attestation', () => {
  it('signAttestation and verifyAttestation round-trip', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { sig } = await signAttestation(wallet, params);
    assert.equal(verifyAttestation(params, sig, wallet.address), true);
  });

  it('verifyAttestation returns false for tampered params', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { sig } = await signAttestation(wallet, params);
    const tampered = { ...params, outputRoot: '0x' + '33'.repeat(32) };
    assert.equal(verifyAttestation(tampered, sig, wallet.address), false);
  });
});
