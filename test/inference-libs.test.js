import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  buildFingerprintPrompt,
  parseFingerprintResponse,
  computeOverallBps,
  fingerprintModelDigest,
} from '../lib/fingerprint.js';
import {
  buildReviewPrompt,
  parseReviewResponse,
  reviewModelDigest,
} from '../lib/review.js';

// ─── fingerprint pure helpers ────────────────────────────────────────────

describe('lib/fingerprint — buildFingerprintPrompt', () => {
  it('produces system + user messages with sample text embedded', () => {
    const messages = buildFingerprintPrompt(['sample one', 'sample two', 'sample three']);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    assert.match(messages[1].content, /sample one/);
    assert.match(messages[1].content, /sample three/);
    assert.match(messages[0].content, /vocabEntropyBps/);
  });
});

describe('lib/fingerprint — computeOverallBps', () => {
  it('weights: 0.2 vocab + 0.4 domain + 0.2 structural + 0.2 specificity', () => {
    const r = computeOverallBps({
      vocabEntropyBps: 8000,
      domainTermBps: 9000,
      structuralBps: 7000,
      specificityBps: 8000,
    });
    // 0.2*8000 + 0.4*9000 + 0.2*7000 + 0.2*8000 = 1600+3600+1400+1600 = 8200
    assert.equal(r, 8200);
  });

  it('clamps overall to [0, 10000]', () => {
    const high = computeOverallBps({ vocabEntropyBps: 10000, domainTermBps: 10000, structuralBps: 10000, specificityBps: 10000 });
    assert.equal(high, 10000);
    const low = computeOverallBps({ vocabEntropyBps: 0, domainTermBps: 0, structuralBps: 0, specificityBps: 0 });
    assert.equal(low, 0);
  });
});

describe('lib/fingerprint — parseFingerprintResponse', () => {
  it('parses strict JSON', () => {
    const raw = JSON.stringify({
      vocabEntropyBps: 7800,
      domainTermBps: 8500,
      structuralBps: 7100,
      specificityBps: 9000,
      rationale: 'rich domain vocab, very specific',
    });
    const out = parseFingerprintResponse(raw);
    assert.equal(out.vocabEntropyBps, 7800);
    assert.equal(out.domainTermBps, 8500);
    assert.equal(out.specificityBps, 9000);
    // 0.2*7800 + 0.4*8500 + 0.2*7100 + 0.2*9000 = 1560+3400+1420+1800 = 8180
    assert.equal(out.overallBps, 8180);
    assert.match(out.rationale, /domain/);
  });

  it('strips ```json code fences', () => {
    const raw = '```json\n' + JSON.stringify({ vocabEntropyBps: 7000, domainTermBps: 7000, structuralBps: 7000, specificityBps: 7000, rationale: '' }) + '\n```';
    const out = parseFingerprintResponse(raw);
    assert.equal(out.overallBps, 7000);
  });

  it('clamps out-of-range axis values', () => {
    const raw = JSON.stringify({ vocabEntropyBps: 20000, domainTermBps: -500, structuralBps: 5000, specificityBps: 5000, rationale: '' });
    const out = parseFingerprintResponse(raw);
    assert.equal(out.vocabEntropyBps, 10000);
    assert.equal(out.domainTermBps, 0);
  });

  it('throws on no JSON object', () => {
    assert.throws(() => parseFingerprintResponse('just prose no JSON'), /no JSON object/);
  });

  it('throws on malformed bps value (string)', () => {
    const raw = JSON.stringify({ vocabEntropyBps: 'high', domainTermBps: 7000, structuralBps: 7000, specificityBps: 7000 });
    assert.throws(() => parseFingerprintResponse(raw), /bad bps value/);
  });
});

describe('lib/fingerprint — modelDigest', () => {
  it('is deterministic for same model name', () => {
    const a = fingerprintModelDigest('gpt-x-3.5');
    const b = fingerprintModelDigest('gpt-x-3.5');
    assert.equal(a, b);
  });

  it('differs across model names', () => {
    const a = fingerprintModelDigest('gpt-x-3.5');
    const b = fingerprintModelDigest('gpt-x-4');
    assert.notEqual(a, b);
  });

  it('returns 0x-prefixed bytes32', () => {
    const d = fingerprintModelDigest('m');
    assert.match(d, /^0x[0-9a-f]{64}$/);
  });
});

// ─── review pure helpers ─────────────────────────────────────────────────

describe('lib/review — buildReviewPrompt', () => {
  it('embeds samples + brief language + diff', () => {
    const samples = ['sample alpha', 'sample beta'];
    const brief = {
      language: 'typescript',
      focus: ['correctness', 'security'],
      diff: 'diff content here',
      expectedDeliverable: 'inline review',
    };
    const messages = buildReviewPrompt({ samples, brief });
    assert.match(messages[1].content, /sample alpha/);
    assert.match(messages[1].content, /sample beta/);
    assert.match(messages[1].content, /typescript/);
    assert.match(messages[1].content, /correctness, security/);
    assert.match(messages[1].content, /diff content here/);
  });

  it('handles missing optional fields', () => {
    const messages = buildReviewPrompt({ samples: [], brief: { language: 'rust', diff: 'x' } });
    assert.match(messages[1].content, /no voice samples/);
  });
});

describe('lib/review — parseReviewResponse', () => {
  const goodResponse = JSON.stringify({
    review: {
      summary: 'The change introduces a race condition between the cache write and the index update. See suggestions.',
      suggestions: [
        { loc: 'src/cache.ts:42', severity: 'blocker', issue: 'TOCTOU on cache.set', fix: 'wrap in mutex' },
        { loc: 'src/index.ts:88', severity: 'warn',    issue: 'unused export',      fix: 'remove' },
      ],
      approvalRecommendation: 'request_changes',
    },
    selfEval: {
      voiceMatchBps: 8400,
      completenessBps: 9100,
      accuracyBps: 7800,
      structureBps: 8800,
      rationale: 'voice close to samples, accuracy slightly lower than ideal',
    },
  });

  it('parses a well-formed response', () => {
    const out = parseReviewResponse(goodResponse);
    assert.match(out.review.summary, /race condition/);
    assert.equal(out.review.suggestions.length, 2);
    assert.equal(out.review.suggestions[0].severity, 'blocker');
    assert.equal(out.review.approvalRecommendation, 'request_changes');
    assert.equal(out.selfEval.voiceMatchBps, 8400);
    assert.equal(out.selfEval.overallBps, Math.round((8400 + 9100 + 7800 + 8800) / 4));
  });

  it('defaults approvalRecommendation to comment_only on unknown value', () => {
    const raw = goodResponse.replace('request_changes', 'maybe?');
    const out = parseReviewResponse(raw);
    assert.equal(out.review.approvalRecommendation, 'comment_only');
  });

  it('normalises suggestion severity to nit on unknown', () => {
    const obj = JSON.parse(goodResponse);
    obj.review.suggestions[0].severity = 'apocalyptic';
    const out = parseReviewResponse(JSON.stringify(obj));
    assert.equal(out.review.suggestions[0].severity, 'nit');
  });

  it('throws on missing review block', () => {
    const obj = JSON.parse(goodResponse);
    delete obj.review;
    assert.throws(() => parseReviewResponse(JSON.stringify(obj)), /missing review block/);
  });

  it('throws on missing selfEval block', () => {
    const obj = JSON.parse(goodResponse);
    delete obj.selfEval;
    assert.throws(() => parseReviewResponse(JSON.stringify(obj)), /missing selfEval block/);
  });

  it('throws on empty summary', () => {
    const obj = JSON.parse(goodResponse);
    obj.review.summary = '';
    assert.throws(() => parseReviewResponse(JSON.stringify(obj)), /empty review.summary/);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + goodResponse + '\n```';
    const out = parseReviewResponse(raw);
    assert.match(out.review.summary, /race condition/);
  });

  it('clamps out-of-range selfEval scores', () => {
    const obj = JSON.parse(goodResponse);
    obj.selfEval.voiceMatchBps = 15000;
    obj.selfEval.accuracyBps = -200;
    const out = parseReviewResponse(JSON.stringify(obj));
    assert.equal(out.selfEval.voiceMatchBps, 10000);
    assert.equal(out.selfEval.accuracyBps, 0);
  });
});

describe('lib/review — modelDigest', () => {
  it('deterministic for same model', () => {
    assert.equal(reviewModelDigest('m'), reviewModelDigest('m'));
  });
  it('differs from fingerprint digest for same model', () => {
    assert.notEqual(reviewModelDigest('m'), fingerprintModelDigest('m'));
  });
});

// ─── fingerprintSamples + generateReview with mock invokeLLM ─────────────

const { fingerprintSamples, localFingerprint } = await import('../lib/fingerprint.js');
const { generateReview } = await import('../lib/review.js');
const { credentialDigest: _credDigest, fingerprintDigest: _fpDigest } = await import('../lib/credential.js');
const { fingerprintDigest } = await import('../lib/credential.js');

describe('lib/fingerprint — fingerprintSamples (integrated, mock LLM)', () => {
  it('happy path: signs fingerprint that recovers to teeSigner', async () => {
    const teeSigner = ethers.Wallet.createRandom();
    const samples     = ['review a', 'review b', 'review c'];
    const sampleRoots = samples.map((_, i) => '0x' + (i + 1).toString(16).padStart(64, '0'));
    const mockLLM = async () => ({
      answer: JSON.stringify({
        vocabEntropyBps: 7800,
        domainTermBps:   8500,
        structuralBps:   7100,
        specificityBps:  9000,
        rationale: 'looks solid',
      }),
      model: 'mock-model',
      attestationId: 'att-id-123',
    });
    const out = await fingerprintSamples({ invokeLLM: mockLLM, samples, sampleRoots, teeSigner });
    assert.equal(out.fingerprint.vocabEntropyBps, 7800);
    assert.equal(out.fingerprint.overallBps,      8180);
    assert.equal(out.attestationId, 'att-id-123');
    // Recover sig back to teeSigner
    const digest = fingerprintDigest(sampleRoots, out.fingerprint);
    const recovered = ethers.verifyMessage(ethers.getBytes(digest), out.fingerprint.teeSig);
    assert.equal(recovered, teeSigner.address);
  });

  it('rejects sample/root length mismatch', async () => {
    const teeSigner = ethers.Wallet.createRandom();
    await assert.rejects(
      fingerprintSamples({
        invokeLLM: async () => ({ answer: '{}', model: 'm' }),
        samples: ['a', 'b', 'c'],
        sampleRoots: ['0x' + '1'.repeat(64), '0x' + '2'.repeat(64)],
        teeSigner,
      }),
      /length mismatch/,
    );
  });

  it('rejects samples < 3', async () => {
    const teeSigner = ethers.Wallet.createRandom();
    await assert.rejects(
      fingerprintSamples({
        invokeLLM: async () => ({ answer: '{}', model: 'm' }),
        samples: ['a', 'b'],
        sampleRoots: ['0x' + '1'.repeat(64), '0x' + '2'.repeat(64)],
        teeSigner,
      }),
      /samples 3\.\.20/,
    );
  });

  it('falls back to localFingerprint when LLM consistently returns empty', async () => {
    const teeSigner = ethers.Wallet.createRandom();
    const samples = [
      'race condition between cache.set and the index update, wrap in mutex',
      'retry loop swallows errors, add onRetry callback for visibility',
      'auth middleware trims whitespace silently — log it instead',
    ];
    const sampleRoots = samples.map((_, i) => '0x' + (i + 9).toString(16).padStart(64, '0'));
    const mockEmpty = async () => ({ answer: '', model: 'mock', attestationId: 'att' });
    const out = await fingerprintSamples({ invokeLLM: mockEmpty, samples, sampleRoots, teeSigner });
    assert.equal(out.fallback, true);
    assert.equal(out.attestationId, null);
    assert.ok(out.fingerprint.overallBps >= 0 && out.fingerprint.overallBps <= 10000);
    assert.match(out.rationale, /unavailable|locally/);
  });
});

describe('lib/fingerprint — localFingerprint', () => {
  it('produces scores in [0, 10000] for valid samples', () => {
    const out = localFingerprint([
      'TOCTOU between cache.set and index update — wrap in mutex',
      'retry loop swallows errors — add onRetry callback',
      'auth middleware silently trims whitespace — log or reject',
    ]);
    for (const k of ['vocabEntropyBps', 'domainTermBps', 'structuralBps', 'specificityBps', 'overallBps']) {
      assert.ok(out[k] >= 0 && out[k] <= 10000, `${k}=${out[k]} out of range`);
    }
  });

  it('is deterministic', () => {
    const samples = ['lock acquired then dropped before await', 'channel buffer overflow under load'];
    const a = localFingerprint(samples);
    const b = localFingerprint(samples);
    assert.deepEqual(a, b);
  });
});

describe('lib/review — generateReview (integrated, mock LLM)', () => {
  const goodLLMResponse = JSON.stringify({
    review: {
      summary: 'Race condition between cache set and index update — see suggestions.',
      suggestions: [{ loc: 'src/cache.ts:42', severity: 'blocker', issue: 'TOCTOU', fix: 'mutex' }],
      approvalRecommendation: 'request_changes',
    },
    selfEval: {
      voiceMatchBps: 8400, completenessBps: 9100, accuracyBps: 7800, structureBps: 8800,
      rationale: 'solid',
    },
  });

  it('returns parsed review + selfEval + modelDigest + attestationId', async () => {
    const mockLLM = async () => ({
      answer: goodLLMResponse,
      model: 'mock-model',
      attestationId: 'rev-att-1',
    });
    const out = await generateReview({
      invokeLLM: mockLLM,
      samples: ['voice sample one'],
      brief: { language: 'typescript', diff: 'd', focus: ['correctness'] },
    });
    assert.match(out.review.summary, /race condition/i);
    assert.equal(out.selfEval.voiceMatchBps, 8400);
    assert.equal(out.modelName, 'mock-model');
    assert.equal(out.attestationId, 'rev-att-1');
    assert.match(out.modelDigest, /^0x[0-9a-f]{64}$/);
  });

  it('propagates parser errors when LLM returns junk', async () => {
    const mockLLM = async () => ({ answer: 'not json at all', model: 'm' });
    await assert.rejects(
      generateReview({ invokeLLM: mockLLM, samples: [], brief: { language: 'rust', diff: 'x' } }),
      /no JSON object/,
    );
  });
});
