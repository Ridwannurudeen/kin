// Generate a smart-contract audit + self-evaluation in a single Sealed Inference call.
//
// Why combined: each call has setup cost + a distinct TEE attestation. Doing findings +
// self-eval together: one attestation, one inference spend, fewer hops. The model is
// asked to return strict JSON containing both the finding list and the self-eval rubric.
//
// The on-chain attestation in submitFinding covers (bountyId, codeRoot, hunterId,
// cweClass, severity, findingRoot, modelDigest, teeTimestamp, severityCalibrationBps,
// precisionBps, coverageBps, exploitabilityBps), where the four bps axes come from the
// model's self-eval. The TEE attestation from 0G's ZG-Res-Key is logged off-chain
// alongside; v3 wires it into on-chain verification directly.

import { ethers } from "ethers";

const REVIEW_MODEL_VERSION = "hunt-audit-v1";

const SYSTEM_PROMPT = `You are an autonomous senior smart-contract security auditor on Hunt. You will be given:
  - up to 5 sample findings from this hunter's prior audit history (showing their voice + rigour)
  - a structured bounty brief describing chain, contracts in scope, diff/source, focus CWE classes, prior audits, and bounty schedule

PRODUCE one strict JSON object — no prose outside it, no markdown fences. Shape:

{
  "findings": [
    {
      "cweClass": "<kebab-case CWE class, e.g. 'SWC-107-reentrancy', 'SWC-115-tx-origin', 'access-control', 'oracle-manipulation', 'SWC-101-int-overflow', 'storage-collision'>",
      "severity": "critical" | "high" | "medium" | "low",
      "loc": "<path:line, e.g. 'Vault.sol:42'>",
      "issue": "<specific finding; concrete, not vague>",
      "exploitabilityPath": "<concrete attack vector or PoC sketch — what an attacker actually does>",
      "fix": "<suggested patch — code-level>",
      "gasImpact": "positive" | "negative" | "neutral"
    }
  ],
  "selfEval": {
    "severityCalibrationBps":  <0..10000>,
    "precisionBps":            <0..10000>,
    "coverageBps":             <0..10000>,
    "exploitabilityBps":       <0..10000>,
    "rationale": "<one paragraph: where strong / where weak>"
  }
}

CRITERIA for self-eval:
  - severityCalibration: how accurately findings are classed critical/high/medium/low vs reality
  - precision:           false-positive rate — high means few false positives; be honest if a finding might be a false alarm
  - coverage:            did you hit the in-scope CWE classes + the in-scope contracts
  - exploitability:      did each finding have a concrete attack path, not just hand-waving

Be honest. A high-quality review that catches the wrong severity scores severityCalibrationBps 4000-5000. A complete review with one false positive scores precisionBps 6000-7000.

If you find no issues, return {"findings": [], "selfEval": {...}} with a rationale explaining why — but coverageBps + exploitabilityBps must reflect honestly whether classes were actually checked (low coverage if classes weren't checked, high if checked thoroughly and code is clean).`;

function buildSampleBlock(samples) {
  if (!samples.length) return "(no sample findings provided)";
  return samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n\n");
}

function buildBriefBlock(brief) {
  const scheduleLine = brief.bountySchedule
    ? Object.entries(brief.bountySchedule)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  const fields = [
    `chain: ${brief.chain || "unspecified"}`,
    `language: ${brief.language || "solidity"}`,
    brief.repoUrl ? `repo: ${brief.repoUrl}` : null,
    brief.commitHash ? `commit: ${brief.commitHash}` : null,
    `contractsInScope: ${(brief.contractsInScope || []).join(", ") || "(unspecified)"}`,
    `focus: ${(brief.focus || []).join(", ") || "general"}`,
    brief.knownConstraints?.length
      ? `constraints: ${brief.knownConstraints.join("; ")}`
      : null,
    brief.priorAudits?.length
      ? `priorAudits: ${brief.priorAudits.join("; ")}`
      : null,
    scheduleLine ? `bountySchedule: ${scheduleLine}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${fields}\n\ndiff:\n${brief.diff || "(no diff provided)"}`;
}

/// Compose the messages payload for the audit LLM call.
export function buildReviewPrompt({ samples, brief }) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `sample findings:\n${buildSampleBlock(samples)}\n\nbrief:\n${buildBriefBlock(brief)}`,
    },
  ];
}

export function extractJson(raw) {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(json)?\s*/, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1)
    throw new Error(`no JSON object in response: ${raw.slice(0, 200)}`);
  return JSON.parse(s.slice(firstBrace, lastBrace + 1));
}

export function clampBps(n) {
  if (typeof n !== "number" || !Number.isFinite(n))
    throw new Error(`bad bps value: ${n}`);
  return Math.max(0, Math.min(10000, Math.round(n)));
}

const SEVERITIES = ["critical", "high", "medium", "low"];
const GAS_IMPACTS = ["positive", "negative", "neutral"];

function kebabCweClass(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normaliseFinding(f) {
  if (!f || typeof f !== "object") return null;
  return {
    cweClass: kebabCweClass(f.cweClass),
    severity: SEVERITIES.includes(f.severity) ? f.severity : "low",
    loc: String(f.loc || "").trim(),
    issue: String(f.issue || "").trim(),
    exploitabilityPath: String(f.exploitabilityPath || "").trim(),
    fix: String(f.fix || "").trim(),
    gasImpact: GAS_IMPACTS.includes(f.gasImpact) ? f.gasImpact : "neutral",
  };
}

/// Validate + normalise a parsed audit payload. Returns the normalised object or throws.
export function parseReviewResponse(raw) {
  const obj = extractJson(raw);
  if (!Array.isArray(obj.findings))
    throw new Error("missing or non-array findings field");
  if (!obj.selfEval || typeof obj.selfEval !== "object")
    throw new Error("missing selfEval block");

  const findings = obj.findings.map(normaliseFinding).filter(Boolean);

  const se = obj.selfEval;
  const severityCalibrationBps = clampBps(se.severityCalibrationBps);
  const precisionBps = clampBps(se.precisionBps);
  const coverageBps = clampBps(se.coverageBps);
  const exploitabilityBps = clampBps(se.exploitabilityBps);
  // overallBps = simple mean (each axis equally weighted; mirrors Hunt.sol's submitFinding
  // self-eval gate which averages the same four axes).
  const overallBps = Math.round(
    (severityCalibrationBps + precisionBps + coverageBps + exploitabilityBps) /
      4,
  );
  const rationale = typeof se.rationale === "string" ? se.rationale : "";

  return {
    findings,
    selfEval: {
      severityCalibrationBps,
      precisionBps,
      coverageBps,
      exploitabilityBps,
      overallBps,
      rationale,
    },
  };
}

export function reviewModelDigest(modelName) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${modelName}|${REVIEW_MODEL_VERSION}`),
  );
}

/// Run a single Sealed Inference call producing findings + self-eval. Returns:
///   { findings, selfEval, modelName, modelDigest, attestationId, attestationValid }
///
/// Args:
///   invokeLLM   — async ({ system, user, maxTokens }) → { answer, model, attestationId, valid }
///                 The hunter daemon supplies a real one driven by 0G Sealed Inference; tests
///                 inject a mock. Caller wraps retries.
///   samples     — top-K sample finding texts (plain strings)
///   brief       — parsed StructuredBrief JSON (briefSchemaVersion: 2)
// maxTokens default is 5000 because the production provider (zai-org/GLM-5-FP8) is a
// reasoning model: it consumes completion_tokens for internal reasoning *before* emitting
// content. A 1500 budget gets spent entirely on reasoning, leaving 0 content tokens and
// finish_reason=length. 5000 leaves enough headroom for ~1000-1500 reasoning + 2000-3000
// content (typical observed: ~1018 reasoning + ~3700 content for a Vault-sized brief).
export async function generateReview({
  invokeLLM,
  samples,
  brief,
  maxTokens = 5000,
}) {
  const messages = buildReviewPrompt({ samples, brief });
  const result = await invokeLLM({
    system: messages[0].content,
    user: messages[1].content,
    maxTokens,
  });
  const parsed = parseReviewResponse(result.answer);
  return {
    ...parsed,
    modelName: result.model || "unknown",
    modelDigest: reviewModelDigest(result.model || "unknown"),
    attestationId: result.attestationId,
    attestationValid: result.valid,
  };
}
