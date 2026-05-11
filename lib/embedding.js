// Local deterministic embedding via feature hashing. 256-dim L2-normalized Float32 vectors.
//
// This is not a semantic embedding — it captures lexical overlap (which is sufficient for
// "rank samples by relevance to brief" in a domain where samples and briefs share most
// vocabulary: code review). True semantic embeddings would require running a sentence
// transformer inside the operator's process or the TEE, neither of which 0G supports
// cleanly today. v3 swaps this for a real embedder when TEE-loadable embedders ship.
//
// Encoding: Float32Array of 256 floats → 1024 raw bytes. Encrypted + uploaded to 0G
// Storage alongside the samples (each sample has a matching embedding root).

export const EMBED_DIM = 256;

/// Simple, fast, deterministic hash. djb2.
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z_][a-z0-9_]{1,}/g) || []);
}

/// Embed `text` into a normalized Float32Array.
export function embed(text) {
  const vec = new Float32Array(EMBED_DIM);
  for (const tok of tokenize(text)) {
    const h = djb2(tok);
    const idx = h % EMBED_DIM;
    const sign = (h & 1) ? 1 : -1;
    vec[idx] += sign;
  }
  // L2 normalize
  let sumSq = 0;
  for (let i = 0; i < EMBED_DIM; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  return vec;
}

/// Pack a Float32Array as a Buffer for storage. Length-checked.
export function embedToBuffer(vec) {
  if (!(vec instanceof Float32Array)) throw new Error('expected Float32Array');
  if (vec.length !== EMBED_DIM) throw new Error(`expected dim ${EMBED_DIM}, got ${vec.length}`);
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/// Unpack a Buffer (1024 bytes) into a Float32Array.
export function bufferToEmbed(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('expected Buffer');
  if (buf.length !== EMBED_DIM * 4) throw new Error(`expected ${EMBED_DIM * 4} bytes, got ${buf.length}`);
  // Copy-on-read since buf may not be 4-byte aligned.
  const out = new Float32Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

/// Cosine similarity between two L2-normalized vectors (returns dot product).
export function cosineSim(a, b) {
  if (a.length !== b.length) throw new Error('dim mismatch');
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
