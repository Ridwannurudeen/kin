// TEE-side sample fingerprinter. Scores each batch of samples on four axes via Sealed
// Inference, then signs the structured fingerprint with the teeSigner wallet so it can be
// submitted on-chain (contract verifies via _verifyFingerprint → ecrecover).
//
// Honesty caveat: 0G Sealed Inference TEE signs over LLM responses, not arbitrary blobs.
// We compute scores via the TEE LLM (legitimate quality signal), then re-sign the
// structured fingerprint with an operator-held signing key. v3 = wire 0G's per-response
// attestation into the on-chain verification path directly.

import { ethers } from "ethers";
import { signFingerprint } from "./credential.js";

const FINGERPRINT_MODEL_VERSION = "kin-fingerprint-v1";

const SYSTEM_PROMPT = `Score code-review samples on 4 axes (0-10000 each). Output STRICT JSON only, no prose.

Axes:
- vocabEntropyBps: lexical diversity
- domainTermBps: density of review-domain terms
- structuralBps: sentence complexity
- specificityBps: how often statements name concrete code locations

JSON format:
{"vocabEntropyBps":N,"domainTermBps":N,"structuralBps":N,"specificityBps":N,"rationale":"short text"}`;

function buildBatchText(samples) {
  return samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n\n");
}

/// Build the messages array for the fingerprint inference call.
export function buildFingerprintPrompt(samples) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Score these ${samples.length} samples:\n\n${buildBatchText(samples)}`,
    },
  ];
}

/// Strip code fences + parse JSON. Returns parsed object or throws.
function extractJson(raw) {
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
    throw new Error(`no JSON object in response: ${raw.slice(0, 120)}`);
  return JSON.parse(s.slice(firstBrace, lastBrace + 1));
}

function clampBps(n) {
  if (typeof n !== "number" || !Number.isFinite(n))
    throw new Error(`bad bps value: ${n}`);
  return Math.max(0, Math.min(10000, Math.round(n)));
}

/// Weighted aggregate per V2_SPEC §5.3.
/// Weights: vocab 0.2, domain 0.4, structural 0.2, specificity 0.2.
export function computeOverallBps({
  vocabEntropyBps,
  domainTermBps,
  structuralBps,
  specificityBps,
}) {
  const agg =
    0.2 * vocabEntropyBps +
    0.4 * domainTermBps +
    0.2 * structuralBps +
    0.2 * specificityBps;
  return clampBps(agg);
}

/// Parse a fingerprint LLM response into validated scores + computed overallBps.
export function parseFingerprintResponse(raw) {
  const obj = extractJson(raw);
  const vocabEntropyBps = clampBps(obj.vocabEntropyBps);
  const domainTermBps = clampBps(obj.domainTermBps);
  const structuralBps = clampBps(obj.structuralBps);
  const specificityBps = clampBps(obj.specificityBps);
  const overallBps = computeOverallBps({
    vocabEntropyBps,
    domainTermBps,
    structuralBps,
    specificityBps,
  });
  const rationale = typeof obj.rationale === "string" ? obj.rationale : "";
  return {
    vocabEntropyBps,
    domainTermBps,
    structuralBps,
    specificityBps,
    overallBps,
    rationale,
  };
}

/// Model digest = keccak256(model || promptVersion). Bound on-chain via the fingerprint sig.
export function fingerprintModelDigest(modelName) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${modelName}|${FINGERPRINT_MODEL_VERSION}`),
  );
}

/// Deterministic local feature-stats fingerprint. Used as a documented fallback when
/// 0G Sealed Inference returns empty responses (V2_SPEC §14 risk row). Scores are computed
/// from lexical + structural statistics over the samples, NOT from an LLM judgement. The
/// resulting fingerprint is honest about its provenance via modelDigest = "kin-local-stats".
export function localFingerprint(samples) {
  const text = samples.join("\n\n");
  const words = text.toLowerCase().match(/[a-z][a-z0-9_]{1,}/g) || [];
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);

  // 1. Vocab entropy: Shannon entropy of word freq distribution, scaled to bps.
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const total = words.length || 1;
  let H = 0;
  for (const c of freq.values()) {
    const p = c / total;
    H -= p * Math.log2(p);
  }
  const Hmax = Math.log2(Math.max(freq.size, 2));
  const vocabEntropyBps = clampBps((H / Hmax) * 10000);

  // 2. Domain term density: fraction of tokens matching code-review vocabulary.
  const DOMAIN = new Set([
    "race",
    "condition",
    "toctou",
    "mutex",
    "lock",
    "deadlock",
    "reentrancy",
    "overflow",
    "underflow",
    "null",
    "undefined",
    "panic",
    "unwrap",
    "await",
    "async",
    "closure",
    "borrow",
    "lifetime",
    "arc",
    "rc",
    "atomic",
    "channel",
    "spawn",
    "retry",
    "timeout",
    "swallow",
    "log",
    "assert",
    "invariant",
    "allocation",
    "leak",
    "reference",
    "pointer",
    "cache",
    "toctou",
    "validator",
    "token",
    "session",
    "auth",
    "middleware",
    "cors",
    "xss",
    "csrf",
    "sql",
    "injection",
    "sanitize",
    "encode",
    "escape",
    "hash",
    "signature",
    "nonce",
    "replay",
    "revert",
    "require",
    "calldata",
    "storage",
    "slot",
    "proxy",
    "upgrade",
    "attack",
    "exploit",
    "audit",
    "review",
    "test",
    "mock",
    "stub",
    "regex",
    "backtrack",
    "catastrophic",
    "o(n)",
    "complexity",
    "idiom",
    "convention",
    "refactor",
    "rename",
    "rebase",
    "merge",
    "conflict",
    "typo",
    "comment",
    // Hunt audit-domain extensions: oracle, access-control, upgrade-safety, DeFi primitives.
    "oracle",
    "manipulation",
    "twap",
    "chainlink",
    "pyth",
    "sequencer",
    "staleness",
    "stale",
    "heartbeat",
    "sandwich",
    "frontrun",
    "slippage",
    "liquidation",
    "liquidate",
    "collateral",
    "ltv",
    "ratio",
    "governance",
    "multisig",
    "timelock",
    "dao",
    "modifier",
    "onlyowner",
    "onlyadmin",
    "ownable",
    "initializer",
    "disableinitializers",
    "delegatecall",
    "selfdestruct",
    "uups",
    "initializable",
    "rolemanager",
    "grantrole",
    "revokerole",
    "accesscontrol",
    "permit",
    "allowance",
    "approval",
    "flashloan",
    "vault",
    "share",
    "withdraw",
    "deposit",
    "mint",
    "burn",
    "transferfrom",
    "transfer",
    "callback",
    "hook",
    "beforewithdraw",
    "aftertransfer",
    "erc20",
    "erc721",
    "erc777",
    "erc1155",
    "pausable",
    "pause",
    "sweep",
    "rescue",
    "keeper",
    "liveness",
    "censorship",
    "grief",
    "dos",
    "precision",
    "rounding",
    "divisionbyzero",
    "underflow",
    "arithmetic",
    "math",
    "wad",
    "ray",
    "ecrecover",
    "recover",
    "digest",
    "typehash",
    "eip712",
    "eip191",
    "eip2612",
    "chainid",
    "msgsender",
    "txorigin",
    "externalcall",
    "lowlevel",
    "statictransfer",
    "callreturndata",
    "invariantviolation",
    "tvl",
    "apr",
    "apy",
    "interest",
    "fee",
    "tax",
    "bps",
    "basisp",
    "wei",
    "block",
    "timestamp",
    "number",
    "gasleft",
    "gaslimit",
    "outofgas",
    "dust",
    "rounding",
  ]);
  let domainHits = 0;
  for (const w of words) if (DOMAIN.has(w)) domainHits++;
  // Sigmoid-style: 5% domain density → 7000 bps, 10% → 8500, 15%+ → ~9500. Anchored so realistic reviews comfortably clear the 6000 bar.
  const domainDensity = domainHits / Math.max(words.length, 1);
  const domainTermBps = clampBps(10000 * (1 - Math.exp(-domainDensity * 25)));

  // 3. Structural: coefficient of variation of sentence lengths, scaled so cv≈0.4 → 7000 bps.
  const lens = sentences.map((s) => s.length);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(lens.length, 1);
  const variance =
    lens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lens.length, 1);
  const cv = Math.sqrt(variance) / Math.max(mean, 1);
  const structuralBps = clampBps(10000 * (1 - Math.exp(-cv * 2.5)));

  // 4. Specificity: density of code-like tokens (file paths, identifiers, line numbers, backticked code, type params).
  const codeRefs = (
    text.match(
      /[a-zA-Z_][a-zA-Z0-9_]*[\.:][a-zA-Z_][a-zA-Z0-9_]*|line\s*\d+|src\/|\b[a-zA-Z_][a-zA-Z0-9_]{2,}\(|::[a-zA-Z_]|`[^`]+`|<[A-Z][A-Za-z0-9_<>,\s]*>/g,
    ) || []
  ).length;
  const refsPerSentence = codeRefs / Math.max(sentences.length, 1);
  const specificityBps = clampBps(
    10000 * (1 - Math.exp(-refsPerSentence * 1.5)),
  );

  const overallBps = computeOverallBps({
    vocabEntropyBps,
    domainTermBps,
    structuralBps,
    specificityBps,
  });
  return {
    vocabEntropyBps,
    domainTermBps,
    structuralBps,
    specificityBps,
    overallBps,
    rationale:
      "0G Sealed Inference unavailable; scored locally via lexical+structural feature stats over the samples.",
  };
}

/// Run the fingerprint LLM call and produce a signed SampleFingerprint struct.
///
/// Args:
///   invokeLLM   — async ({ system, user, maxTokens }) → { answer, model, attestationId, valid }
///                 The agent daemon supplies a real one driven by 0G Sealed Inference; tests
///                 inject a mock.
///   samples     — array of plain-text sample strings
///   sampleRoots — array of bytes32 root hashes of the encrypted samples on 0G Storage
///   teeSigner   — ethers Wallet whose address matches Hunt.teeSigner() / Kin.teeSigner() on-chain
///
/// Returns: { fingerprint, attestationId, rationale }
export async function fingerprintSamples({
  invokeLLM,
  samples,
  sampleRoots,
  teeSigner,
}) {
  if (samples.length !== sampleRoots.length)
    throw new Error("samples/sampleRoots length mismatch");
  if (samples.length < 3 || samples.length > 20)
    throw new Error("samples 3..20");

  const messages = buildFingerprintPrompt(samples);
  let result = null,
    parsed = null;
  let usedFallback = false;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      result = await invokeLLM({
        system: messages[0].content,
        user: messages[1].content,
        // 5000 budget — GLM-5-FP8 is a reasoning model and a smaller budget gets eaten
        // entirely by reasoning_tokens before any content is emitted. Same root cause as
        // lib/review.js:generateReview.
        maxTokens: 5000,
      });
      parsed = parseFingerprintResponse(result.answer);
      break;
    } catch (e) {
      console.error(
        `[fingerprint] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${e.message}`,
      );
      if (result) {
        console.error(
          `  model: ${result.model || "n/a"} | attestation: ${result.attestationId || "n/a"} | answer length: ${(result.answer || "").length}`,
        );
      }
      if (attempt === MAX_ATTEMPTS) {
        console.error(
          "[fingerprint] all LLM attempts failed — falling back to local feature-stats fingerprint (V2_SPEC §14)",
        );
        parsed = localFingerprint(samples);
        usedFallback = true;
      }
    }
  }
  const modelDigest = usedFallback
    ? ethers.keccak256(
        ethers.toUtf8Bytes("kin-local-stats|" + FINGERPRINT_MODEL_VERSION),
      )
    : fingerprintModelDigest(result.model || "unknown");

  const fp = {
    vocabEntropyBps: parsed.vocabEntropyBps,
    domainTermBps: parsed.domainTermBps,
    structuralBps: parsed.structuralBps,
    specificityBps: parsed.specificityBps,
    overallBps: parsed.overallBps,
    modelDigest,
  };
  const signed = await signFingerprint(teeSigner, sampleRoots, fp);
  return {
    fingerprint: signed,
    attestationId: usedFallback ? null : result.attestationId,
    rationale: parsed.rationale,
    fallback: usedFallback,
  };
}
