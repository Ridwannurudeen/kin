// Generate a code review + self-evaluation in a single Sealed Inference call.
//
// Why combined: each call has setup cost + a distinct TEE attestation. Doing review +
// self-eval together: one attestation, one inference spend, fewer hops. The model is
// asked to return strict JSON containing both the review payload and the self-eval rubric.
//
// The on-chain attestation in submitWork covers (jobId, outputRoot, qualityScore,
// modelDigest), where qualityScore is the self-eval `overallBps`. The TEE attestation
// from 0G's ZG-Res-Key is logged off-chain alongside; v3 wires it into on-chain
// verification directly.

import { ethers } from 'ethers';

const REVIEW_MODEL_VERSION = 'kin-review-v1';

const SYSTEM_PROMPT = `You are an autonomous senior code reviewer on Kin. You will be given:
  - up to 5 sample reviews showing the senior engineer's voice + judgment
  - a structured brief describing what to review (repo, language, diff, focus, constraints)

PRODUCE one strict JSON object — no prose outside it, no markdown fences. Shape:

{
  "review": {
    "summary": "<5-10 sentences. Lead with the most important finding. Match the voice samples.>",
    "suggestions": [
      { "loc": "path/to/file:LINE", "severity": "blocker|warn|nit", "issue": "<specific>", "fix": "<concrete>" }
    ],
    "approvalRecommendation": "approve|request_changes|comment_only"
  },
  "selfEval": {
    "voiceMatchBps":  <0..10000>,
    "completenessBps": <0..10000>,
    "accuracyBps":     <0..10000>,
    "structureBps":    <0..10000>,
    "rationale": "<one-paragraph: where the review is strong / weak vs each axis>"
  }
}

CRITERIA for self-eval:
  - voiceMatch:    how close to the sample voice (vocabulary, sentence rhythm, opinion strength)
  - completeness:  how much of the focus[] in the brief is addressed
  - accuracy:      claims tied to specific lines/behaviour, no hallucinations
  - structure:     summary + suggestions[] follow the format, severity used sensibly

Be honest. A review that's voice-perfect but misses half the focus areas should score completenessBps 4000-5000. A review that's complete but generic-AI in voice should score voiceMatchBps 4000-5000.`;

function buildSampleBlock(samples) {
  if (!samples.length) return '(no voice samples provided)';
  return samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join('\n\n');
}

function buildBriefBlock(brief) {
  const fields = [
    `language: ${brief.language || 'unspecified'}`,
    brief.repoUrl       ? `repo: ${brief.repoUrl}` : null,
    brief.commitOrPrUrl ? `pr: ${brief.commitOrPrUrl}` : null,
    `focus: ${(brief.focus || []).join(', ') || 'general'}`,
    brief.context       ? `context: ${brief.context}` : null,
    brief.knownConstraints?.length ? `constraints: ${brief.knownConstraints.join('; ')}` : null,
    `expected: ${brief.expectedDeliverable || 'inline review with summary + suggestions'}`,
  ].filter(Boolean).join('\n');
  return `${fields}\n\ndiff:\n${brief.diff || '(no diff provided)'}`;
}

/// Compose the messages payload for the review LLM call.
export function buildReviewPrompt({ samples, brief }) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: `voice samples:\n${buildSampleBlock(samples)}\n\nbrief:\n${buildBriefBlock(brief)}` },
  ];
}

function extractJson(raw) {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  const firstBrace = s.indexOf('{');
  const lastBrace  = s.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) throw new Error(`no JSON object in response: ${raw.slice(0, 200)}`);
  return JSON.parse(s.slice(firstBrace, lastBrace + 1));
}

function clampBps(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`bad bps value: ${n}`);
  return Math.max(0, Math.min(10000, Math.round(n)));
}

/// Validate + normalise a parsed review payload. Returns the normalised object or throws.
export function parseReviewResponse(raw) {
  const obj = extractJson(raw);
  if (!obj.review || typeof obj.review !== 'object') throw new Error('missing review block');
  if (!obj.selfEval || typeof obj.selfEval !== 'object') throw new Error('missing selfEval block');

  const review = {
    summary:        String(obj.review.summary || ''),
    suggestions:    Array.isArray(obj.review.suggestions) ? obj.review.suggestions.map(normaliseSuggestion) : [],
    approvalRecommendation: ['approve', 'request_changes', 'comment_only'].includes(obj.review.approvalRecommendation)
      ? obj.review.approvalRecommendation : 'comment_only',
  };
  if (!review.summary) throw new Error('empty review.summary');

  const se = obj.selfEval;
  const voiceMatchBps  = clampBps(se.voiceMatchBps);
  const completenessBps = clampBps(se.completenessBps);
  const accuracyBps     = clampBps(se.accuracyBps);
  const structureBps    = clampBps(se.structureBps);
  // overallBps = simple mean (each axis equally weighted; v2 §8 says "weighted aggregate"
  // — for output evaluator we use a flat mean since all axes matter equally for the
  // submitWork quality gate).
  const overallBps      = Math.round((voiceMatchBps + completenessBps + accuracyBps + structureBps) / 4);
  const rationale       = typeof se.rationale === 'string' ? se.rationale : '';

  return {
    review,
    selfEval: { voiceMatchBps, completenessBps, accuracyBps, structureBps, overallBps, rationale },
  };
}

function normaliseSuggestion(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    loc:      String(s.loc || ''),
    severity: ['blocker', 'warn', 'nit'].includes(s.severity) ? s.severity : 'nit',
    issue:    String(s.issue || ''),
    fix:      String(s.fix || ''),
  };
}

export function reviewModelDigest(modelName) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${modelName}|${REVIEW_MODEL_VERSION}`));
}

/// Run a single Sealed Inference call producing review + self-eval. Returns:
///   { review, selfEval, modelDigest, attestationId, modelName }
///
/// Args:
///   invokeLLM   — async ({ system, user, maxTokens }) → { answer, model, attestationId, valid }
///                 The agent daemon supplies a real one driven by 0G Sealed Inference; tests
///                 inject a mock.
///   samples     — top-K voice sample texts (plain strings)
///   brief       — parsed StructuredBrief JSON (see V2_SPEC §5.1)
export async function generateReview({ invokeLLM, samples, brief, maxTokens = 1500 }) {
  const messages = buildReviewPrompt({ samples, brief });
  const result = await invokeLLM({
    system: messages[0].content,
    user: messages[1].content,
    maxTokens,
  });
  const parsed = parseReviewResponse(result.answer);
  return {
    ...parsed,
    modelName: result.model || 'unknown',
    modelDigest: reviewModelDigest(result.model || 'unknown'),
    attestationId: result.attestationId,
    attestationValid: result.valid,
  };
}
