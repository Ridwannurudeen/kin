import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BENEFITS_DEFECT_CLASSES,
  INSURANCE_DEFECT_CLASSES,
  MEDICAL_READING_CLASSES,
  SMART_CONTRACT_CWES,
  bytes32ToClass,
  canonicalise,
  classToBytes32,
} from "../src/classes.js";

describe("sdk classes", () => {
  it("canonicalise produces stable kebab-case output", () => {
    assert.equal(
      canonicalise("  SWC_107 Reentrancy!!  "),
      "swc-107-reentrancy",
    );
    assert.equal(
      canonicalise("Medical   Necessity__Misapplication"),
      "medical-necessity-misapplication",
    );
  });

  it("classToBytes32 is deterministic", () => {
    const a = classToBytes32("oracle-manipulation");
    const b = classToBytes32("Oracle Manipulation");
    assert.equal(a, b);
  });

  it("registries contain the expected entries", () => {
    assert.ok(SMART_CONTRACT_CWES.includes("oracle-manipulation"));
    assert.ok(INSURANCE_DEFECT_CLASSES.includes("erisa-procedural-defect"));
    assert.ok(
      BENEFITS_DEFECT_CLASSES.includes("vocational-expert-misclassification"),
    );
    assert.ok(
      MEDICAL_READING_CLASSES.includes("pathology-borderline-interpretation"),
    );
  });

  it("bytes32ToClass round-trips across all four registries", () => {
    const registries = [
      SMART_CONTRACT_CWES,
      INSURANCE_DEFECT_CLASSES,
      BENEFITS_DEFECT_CLASSES,
      MEDICAL_READING_CLASSES,
    ];

    for (const registry of registries) {
      for (const entry of registry) {
        assert.equal(bytes32ToClass(classToBytes32(entry), registry), entry);
      }
    }
  });
});
