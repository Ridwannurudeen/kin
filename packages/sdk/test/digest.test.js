import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { FINDING_DIGEST_ABI, findingDigest } from "../src/digest.js";
import { findingDigest as legacyFindingDigest } from "../../../lib/credential.js";
import { classToBytes32 } from "../src/classes.js";

function makeParams() {
  return {
    bountyId: 3n,
    inputRoot: "0x" + "11".repeat(32),
    agentId: 1n,
    classBytes32: classToBytes32("oracle-manipulation"),
    severity: 3,
    outputRoot: "0x" + "22".repeat(32),
    modelDigest: ethers.keccak256(
      ethers.toUtf8Bytes("zai-org/GLM-5-FP8|hunt-audit-v1"),
    ),
    teeTimestamp: 1_715_430_034n,
    severityCalibrationBps: 8500,
    precisionBps: 9200,
    coverageBps: 8800,
    exploitabilityBps: 9000,
  };
}

describe("sdk digest", () => {
  it("is deterministic for fixed inputs", () => {
    const params = makeParams();
    assert.equal(findingDigest(params), findingDigest(params));
    assert.equal(FINDING_DIGEST_ABI.length, 12);
  });

  it("changes when any field changes", () => {
    const base = makeParams();
    const baseDigest = findingDigest(base);
    const variants = [
      { ...base, bountyId: 4n },
      { ...base, inputRoot: "0x" + "33".repeat(32) },
      { ...base, agentId: 2n },
      { ...base, classBytes32: classToBytes32("reentrancy-special-case") },
      { ...base, severity: 4 },
      { ...base, outputRoot: "0x" + "44".repeat(32) },
      {
        ...base,
        modelDigest: ethers.keccak256(ethers.toUtf8Bytes("alternate-model|v1")),
      },
      { ...base, teeTimestamp: 1_715_430_035n },
      { ...base, severityCalibrationBps: 8501 },
      { ...base, precisionBps: 9201 },
      { ...base, coverageBps: 8801 },
      { ...base, exploitabilityBps: 9001 },
    ];

    for (const variant of variants) {
      assert.notEqual(findingDigest(variant), baseDigest);
    }
  });

  it("matches the existing Hunt lib/credential.js findingDigest output", () => {
    const params = makeParams();
    const legacyParams = {
      bountyId: params.bountyId,
      codeRoot: params.inputRoot,
      hunterId: params.agentId,
      cweClass: params.classBytes32,
      severity: params.severity,
      findingRoot: params.outputRoot,
      modelDigest: params.modelDigest,
      teeTimestamp: params.teeTimestamp,
      severityCalibrationBps: params.severityCalibrationBps,
      precisionBps: params.precisionBps,
      coverageBps: params.coverageBps,
      exploitabilityBps: params.exploitabilityBps,
    };

    assert.equal(findingDigest(params), legacyFindingDigest(legacyParams));
  });
});
