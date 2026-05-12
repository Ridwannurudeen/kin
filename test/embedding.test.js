import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { embed, embedToBuffer, bufferToEmbed, cosineSim, EMBED_DIM } from '../lib/embedding.js';
import { rankByBrief, topK } from '../lib/retrieval.js';

describe('lib/embedding — embed', () => {
  it('returns L2-normalized Float32Array of EMBED_DIM', () => {
    const v = embed('the quick brown fox jumps over the lazy dog');
    assert.ok(v instanceof Float32Array);
    assert.equal(v.length, EMBED_DIM);
    let sumSq = 0;
    for (const x of v) sumSq += x * x;
    assert.ok(Math.abs(sumSq - 1) < 1e-5, `not normalized: sumSq=${sumSq}`);
  });

  it('empty text produces zero vector (norm = 0 → keeps zeros, doesnt NaN)', () => {
    const v = embed('');
    assert.equal(v.length, EMBED_DIM);
    for (const x of v) assert.equal(x, 0);
  });

  it('is deterministic: same input twice → same vector', () => {
    const a = embed('hello kin world');
    const b = embed('hello kin world');
    for (let i = 0; i < EMBED_DIM; i++) assert.equal(a[i], b[i]);
  });

  it('similar texts have higher cosine sim than dissimilar ones', () => {
    const v1 = embed('the authentication flow has a race condition between session lookup and token refresh');
    const v2 = embed('there is a race condition between session lookup and refresh token in the auth flow');
    const v3 = embed('the unicorn graphic in the marketing banner needs better contrast and a bigger drop shadow');
    const sim12 = cosineSim(v1, v2);
    const sim13 = cosineSim(v1, v3);
    assert.ok(sim12 > sim13, `expected similar(${sim12.toFixed(3)}) > dissimilar(${sim13.toFixed(3)})`);
  });
});

describe('lib/embedding — round trip Float32Array ↔ Buffer', () => {
  it('embedToBuffer + bufferToEmbed preserves all values exactly', () => {
    const v = embed('round trip test with several distinctive tokens like async await promise');
    const buf = embedToBuffer(v);
    assert.equal(buf.length, EMBED_DIM * 4);
    const back = bufferToEmbed(buf);
    for (let i = 0; i < EMBED_DIM; i++) assert.equal(back[i], v[i]);
  });

  it('rejects wrong-length input', () => {
    assert.throws(() => embedToBuffer(new Float32Array(10)), /expected dim/);
    assert.throws(() => bufferToEmbed(Buffer.alloc(100)), /expected/);
  });
});

describe('lib/retrieval — rankByBrief + topK', () => {
  const samples = [
    { text: 'race condition between auth session lookup and refresh token in the middleware' },
    { text: 'memoized React component leaks closure-captured props across re-renders' },
    { text: 'SQL N+1 query in the order detail page hits the database 200 times per request' },
    { text: 'authentication header parsing trims whitespace causing token mismatch on copy-paste' },
    { text: 'CSS grid template column overflow on narrow viewports breaks the navigation bar' },
  ].map(s => ({ ...s, embedding: embed(s.text) }));

  it('auth-flavored brief ranks auth-flavored samples top', () => {
    const ranked = rankByBrief(samples, 'review this auth middleware refactor; token validation logic');
    // Top 2 should be the two auth-related samples (indices 0 and 3)
    const topTwoIndices = ranked.slice(0, 2).map(r => r.index).sort();
    assert.deepEqual(topTwoIndices, [0, 3]);
  });

  it('topK returns at most K results (or all if fewer)', () => {
    const k3 = topK(samples, 'auth', 3);
    assert.equal(k3.length, 3);
    const k99 = topK(samples, 'auth', 99);
    assert.equal(k99.length, samples.length);
  });

  it('empty candidate list returns empty', () => {
    assert.deepEqual(topK([], 'whatever', 5), []);
  });

  it('preserves sample payload in the result', () => {
    const ranked = topK(samples, 'auth', 1);
    assert.equal(typeof ranked[0].sample.text, 'string');
    assert.ok(ranked[0].sample.text.length > 0);
  });
});
