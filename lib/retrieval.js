// Top-K retrieval over a set of (sample text, sample embedding) pairs, ranked by cosine
// similarity to a query (brief) embedding. Used at job time by the agent daemon to pick
// the most relevant samples to pass into the Sealed Inference voice-context window.

import { embed, cosineSim } from './embedding.js';

/// Rank candidates by cosine similarity to the brief. Returns descending-score list of
/// { index, score, sample } objects.
///
/// `candidates`: Array of { text: string, embedding: Float32Array, ...other }
/// `briefText`: string
export function rankByBrief(candidates, briefText) {
  if (!Array.isArray(candidates)) throw new Error('candidates must be array');
  if (candidates.length === 0) return [];
  const q = embed(briefText);
  const scored = candidates.map((c, i) => {
    if (!(c.embedding instanceof Float32Array)) throw new Error(`candidate[${i}].embedding missing`);
    return { index: i, score: cosineSim(q, c.embedding), sample: c };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/// Select the top K from a ranked list (or all if length <= K).
export function topK(candidates, briefText, k = 5) {
  const ranked = rankByBrief(candidates, briefText);
  return ranked.slice(0, k);
}
