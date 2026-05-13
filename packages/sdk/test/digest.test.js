import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { findingDigest as sdkFindingDigest } from '../src/digest.js';
import { findingDigest as libFindingDigest } from '../../../lib/credential.js';

const BASE = Object.freeze({
  bountyId: 3n,
  inputRoot: '0x' + '11'.repeat(32),
  agentId: 1n,
  classBytes32: ethers.keccak256(ethers.toUtf8Bytes('oracle-manipulation')),
  severity: 3,
  outputRoot: '0x' + '22'.repeat(32),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1')),
  teeTimestamp: 1_763_000_000n,
  severityCalibrationBps: 8800,
  precisionBps: 9000,
  coverageBps: 8500,
  exploitabilityBps: 8700,
});

describe('digest', () => {
  it('is deterministic for fixed inputs', () => {
    assert.equal(sdkFindingDigest(BASE), sdkFindingDigest(BASE));
  });

  it('changes when any encoded field changes', () => {
    const original = sdkFindingDigest(BASE);
    const changes = [
      { bountyId: 4n },
      { inputRoot: '0x' + '12'.repeat(32) },
      { agentId: 2n },
      { classBytes32: ethers.keccak256(ethers.toUtf8Bytes('access-control')) },
      { severity: 4 },
      { outputRoot: '0x' + '23'.repeat(32) },
      { modelDigest: ethers.keccak256(ethers.toUtf8Bytes('other-model')) },
      { teeTimestamp: 1_763_000_001n },
      { severityCalibrationBps: 8801 },
      { precisionBps: 9001 },
      { coverageBps: 8501 },
      { exploitabilityBps: 8701 },
    ];

    for (const change of changes) {
      assert.notEqual(sdkFindingDigest({ ...BASE, ...change }), original);
    }
  });

  it('matches lib/credential.js findingDigest for identical inputs', () => {
    const libDigest = libFindingDigest({
      bountyId: BASE.bountyId,
      codeRoot: BASE.inputRoot,
      hunterId: BASE.agentId,
      cweClass: BASE.classBytes32,
      severity: BASE.severity,
      findingRoot: BASE.outputRoot,
      modelDigest: BASE.modelDigest,
      teeTimestamp: BASE.teeTimestamp,
      severityCalibrationBps: BASE.severityCalibrationBps,
      precisionBps: BASE.precisionBps,
      coverageBps: BASE.coverageBps,
      exploitabilityBps: BASE.exploitabilityBps,
    });

    assert.equal(sdkFindingDigest(BASE), libDigest);
  });
});
