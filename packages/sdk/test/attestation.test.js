import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { signAttestation, verifyAttestation } from "../src/attestation.js";
import { classToBytes32 } from "../src/classes.js";

function makeParams() {
  return {
    bountyId: 5n,
    inputRoot: "0x" + "55".repeat(32),
    agentId: 9n,
    classBytes32: classToBytes32("signature-replay"),
    severity: 4,
    outputRoot: "0x" + "77".repeat(32),
    modelDigest: ethers.keccak256(ethers.toUtf8Bytes("hunt-audit-v1|sig-test")),
    teeTimestamp: 1_715_430_444n,
    severityCalibrationBps: 9100,
    precisionBps: 9300,
    coverageBps: 8800,
    exploitabilityBps: 9200,
  };
}

describe("sdk attestation", () => {
  it("signAttestation and verifyAttestation round-trip with a random wallet", async () => {
    const wallet = ethers.Wallet.createRandom();
    const params = makeParams();
    const { digest, sig } = await signAttestation(wallet, params);
    assert.ok(digest.startsWith("0x"));
    assert.equal(sig.startsWith("0x"), true);
    assert.equal(verifyAttestation(params, sig, wallet.address), true);
  });

  it("verifyAttestation returns false for tampered params", async () => {
    const wallet = ethers.Wallet.createRandom();
    const params = makeParams();
    const { sig } = await signAttestation(wallet, params);
    const tampered = { ...params, outputRoot: "0x" + "88".repeat(32) };
    assert.equal(verifyAttestation(tampered, sig, wallet.address), false);
  });
});
