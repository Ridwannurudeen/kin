import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENEFITS_DEFECT_CLASSES,
  INSURANCE_DEFECT_CLASSES,
  MEDICAL_READING_CLASSES,
  SMART_CONTRACT_CWES,
  bytes32ToClass,
  canonicalise,
  classToBytes32,
} from '../src/classes.js';

describe('classes', () => {
  it('canonicalise produces stable kebab-case', () => {
    assert.equal(canonicalise('  SWC_107 Reentrancy!!  '), 'swc-107-reentrancy');
    assert.equal(canonicalise('Medical Necessity  Misapplication'), 'medical-necessity-misapplication');
  });

  it('classToBytes32 is deterministic', () => {
    assert.equal(classToBytes32('Oracle Manipulation'), classToBytes32('oracle-manipulation'));
  });

  it('all registries contain expected entries', () => {
    assert.ok(SMART_CONTRACT_CWES.includes('swc-107-reentrancy'));
    assert.ok(INSURANCE_DEFECT_CLASSES.includes('erisa-procedural-defect'));
    assert.ok(BENEFITS_DEFECT_CLASSES.includes('vocational-expert-misclassification'));
    assert.ok(MEDICAL_READING_CLASSES.includes('radiology-second-read-discrepancy'));
  });

  it('bytes32ToClass round-trips across a registry', () => {
    const cls = 'network-adequacy-violation';
    assert.equal(bytes32ToClass(classToBytes32(cls), INSURANCE_DEFECT_CLASSES), cls);
  });
});
