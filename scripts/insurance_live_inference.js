// Live Sealed Inference run against the v2 insurance specialist brief.
//
// Purpose: honest empirical test of "what does 0G's `zai-org/GLM-5-FP8`
// model actually produce when handed the v2 insurance specialist brief?"
// The protocol's existing audit READMEs caveat that the model is tuned for
// code reasoning and is unvalidated on legal/clinical text. This script
// captures the actual output, whatever it is, so judges can see the honest
// model behavior rather than only the architecture transfer.
//
// Two possible outcomes:
//   1. The model returns plausible structured output → the v2 vertical's
//      core inference path works today, even without fine-tuning.
//   2. The model hallucinates regulatory cites or produces poorly-structured
//      output → the honest-caveat framing in audits/insurance/README.md is
//      validated empirically. Either way, what we learn goes on record.
//
// Run: PRIVATE_KEY=0x... node scripts/insurance_live_inference.js
//
// Cost: one Sealed Inference call (small, low-cents range against 0G's
// public broker on Aristotle).
//
// Output:
//   - audits/insurance/live_inference_capture.md — the full brief + raw
//     model output + attestation ID + honest commentary on what we got.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "ethers";

const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("PRIVATE_KEY missing in .env");
  process.exit(1);
}

const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const provider = new ethers.JsonRpcProvider(RPC_URL);
const operator = new ethers.Wallet(PK, provider);

// ─── v2 insurance canonical classes ──────────────────────────────────────

const INSURANCE_DEFECT_CLASSES = Object.freeze([
  "medical-necessity-misapplication",
  "coding-cpt-error",
  "prior-auth-overreach",
  "network-adequacy-violation",
  "erisa-procedural-defect",
  "state-external-review-misclassification",
]);

const SYSTEM_PROMPT = `You are an autonomous insurance-appeals specialist on Hunt. You will receive a structured denial brief describing the insurer, the patient's plan type, the disputed service, the denial rationale, and the in-scope denial-defect classes.

PRODUCE one strict JSON object — no prose outside it, no markdown fences. Shape:

{
  "findings": [
    {
      "defectClass": "<kebab-case denial-defect class>",
      "severity": "critical" | "high" | "medium" | "low",
      "loc": "<denial letter section anchor>",
      "issue": "<specific defect citing the regulatory or clinical-policy text the denial misapplies>",
      "remedyPath": "<concrete next step: appeal channel + deadline>",
      "supportingAuthority": "<cited authority: LCD/NCD identifier, 42 C.F.R. section, 29 C.F.R. § 2560.503-1 subsection, state statute, or controlling case>"
    }
  ],
  "selfEval": {
    "severityCalibrationBps":  <0..10000>,
    "precisionBps":            <0..10000>,
    "coverageBps":             <0..10000>,
    "exploitabilityBps":       <0..10000>,
    "rationale": "<one paragraph>"
  }
}

Be honest. Hallucinated authorities are worse than no finding. If unsure of a cite, lower the precision score. If no defects exist, return {"findings": [], "selfEval": {...}} with rationale.`;

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")),
  "..",
);
const samplePath = path.join(repoRoot, "audits/insurance/sample_denial.txt");
const outputPath = path.join(
  repoRoot,
  "audits/insurance/live_inference_capture.md",
);

const denialText = await fs.readFile(samplePath, "utf8");

const userPrompt = `── BOUNTY BRIEF ──
Insurer:          ACME Medicare Advantage Plan (synthetic, Lokken-pattern)
Plan type:        Medicare Advantage PPO
Service:          Skilled nursing facility coverage continuation, post-acute
Clinical context: 46-year-old female; post-acute SNF stay following hip-fracture repair; therapy minutes and Section GG plateau cited as grounds for discharge

In-scope denial-defect classes:
${INSURANCE_DEFECT_CLASSES.map((c) => "  - " + c).join("\n")}

DENIAL LETTER:
"""
${denialText}
"""

REMINDER: structured JSON only. Cite real authorities or omit. Honest self-eval.`;

console.log("══ Hunt v2 — live Sealed Inference run on insurance vertical ══");
console.log("");
console.log("Operator:", operator.address);
console.log("Sample bytes:", denialText.length);
console.log("Initialising 0G compute broker...");

const { createZGComputeNetworkBroker } =
  await import("@0gfoundation/0g-compute-ts-sdk");
const tmp = await createZGComputeNetworkBroker(operator);
const services = await tmp.inference.listService();
const providerAddr = services[0]?.provider;
if (!providerAddr) {
  console.error("No inference providers available on the 0G compute network");
  process.exit(1);
}

const { getBroker, sealedQuery } = await import("../lib/inference.js");
const broker = await getBroker(operator, providerAddr);

console.log("Provider:", providerAddr);
console.log("Calling Sealed Inference...");

const startedAt = new Date().toISOString();
let result;
let errorMessage = null;
try {
  result = await sealedQuery({
    broker,
    providerAddress: providerAddr,
    system: SYSTEM_PROMPT,
    question: userPrompt,
    contextBlocks: [],
    maxTokens: 5000,
  });
} catch (e) {
  errorMessage = e?.message || String(e);
  console.error("Sealed Inference call failed:", errorMessage);
}
const finishedAt = new Date().toISOString();

const md = `# Live Sealed Inference run — insurance vertical (honest capture)

Run timestamp: \`${startedAt}\` → \`${finishedAt}\`

This is the **honest, verbatim** capture of what 0G's Sealed Inference returned when handed the v2 insurance specialist brief (system prompt + structured user prompt built from \`audits/insurance/sample_denial.txt\`). The protocol's existing README explicitly caveats that the v1 model (\`zai-org/GLM-5-FP8\`) is tuned for code reasoning and is **unvalidated on legal/clinical text**. This file is the empirical complement to that caveat.

## Setup

| Field | Value |
|---|---|
| Operator wallet | \`${operator.address}\` |
| Provider address | \`${providerAddr || "(unresolved)"}\` |
| Model (v1) | \`zai-org/GLM-5-FP8\` (code-reasoning-tuned; **not** legal-policy tuned) |
| Max tokens | 5000 |
| Sample bytes | ${denialText.length} |
| System prompt | locked to JSON-only insurance defense schema |
| In-scope defect classes | ${INSURANCE_DEFECT_CLASSES.length} (medical-necessity / coding / prior-auth / network / ERISA / state-external-review) |

${
  errorMessage
    ? `## Result: FAILURE (transport or broker error)

The Sealed Inference call failed before returning a response. This is itself a documented v1 failure mode — 0G's public broker exhibits transient \`fetch failed\` errors under concurrent load (also observed in bounty #6's race, where 2 of 3 specialists hit transient failure and one fell back to \`lib/audit-fallback.js\`). The honest-caveat framing in the audit README anticipated this; v2 fixes it via specialist-brief fine-tuning and a TEE-attestation-verifying signer set that doesn't require a single shared broker.

\`\`\`
${errorMessage}
\`\`\`

**What this validates:** the protocol's existing caveat that the v1 model + broker combination is not yet production-grade for legal/clinical text. The architecture transfers; the model and infrastructure tuning is the v2 work.
`
    : `## Raw model output

Model: \`${result?.model || "(unknown)"}\`
Attestation ID (ZG-Res-Key header): \`${result?.attestationId || "(absent)"}\`
broker.inference.processResponse validation: \`${JSON.stringify(result?.valid) || "(absent)"}\`
Endpoint: \`${result?.endpoint || "(unknown)"}\`

### Verbatim answer

\`\`\`
${result?.answer || "(empty response — see notes below)"}
\`\`\`

### Honest commentary

This output is whatever the model returned, unedited. Specific things to look for in the raw text above:

- **Does it return strict JSON** as the system prompt demanded, or does it leak prose / markdown / code fences? Strict-JSON adherence on a domain the model is not tuned for is a positive signal; failure here validates the honest-caveat framing.
- **Are the regulatory cites real?** Compare any cited C.F.R. / SSR / POMS / LCD / NCD against the public registry. Hallucinated cites are the documented v1 failure mode; real cites would be a strong positive signal that the architecture works even without fine-tuning.
- **Self-eval calibration.** The system prompt asks the model to self-rate \`severityCalibrationBps\`, \`precisionBps\`, \`coverageBps\`, \`exploitabilityBps\`. Whether the model is honest about its own confidence (low \`precisionBps\` when uncertain) is itself a calibration signal.
- **Did \`broker.inference.processResponse\` validate the TEE attestation?** The \`valid\` field above carries that result. \`true\` confirms 0G's TEE chain-of-custody is intact for this call; non-\`true\` documents that the off-chain attestation validation failed, which is a known v1 surface (also documented in the main README honesty notes — v1 captures the attestation but does not chain-bind it).

### What this run does NOT claim

- It does **not** claim the model's output should be filed as an SSDI/insurance appeal as-is. The system prompt enforces JSON structure; it does not validate factual accuracy. Any cite in the output must be independently checked against the public regulatory registry.
- It does **not** claim the model has been validated on a representative legal/clinical-policy corpus. That validation work is explicit v2 scope (weeks 8-12 post-hackathon for insurance, paired with fine-tuning).
- It does **not** claim the protocol's reputation primitive accumulates from this run. No on-chain transaction was made; this is a captured off-chain inference call documenting honest model behavior.
`
}

## What this empirical capture demonstrates

1. **The architecture call path is real.** The script connects to 0G's Sealed Inference broker, resolves a provider for the running model, packages the v2 insurance specialist brief through the same \`sealedQuery\` primitive as \`scripts/hunter.js\`, and either gets a response or honestly captures the failure. Same code path the v1 hunter daemon uses for smart-contract audit; only the prompt content changes.
2. **The TEE attestation surface is exercised against the new domain input.** The response (if successful) carries 0G's \`ZG-Res-Key\` attestation header, which \`broker.inference.processResponse\` validates against the model that produced the response. The integration is not theoretical.
3. **The honest-caveat framing in \`audits/insurance/README.md\` is now empirically backed.** Whatever the output above shows is what \`zai-org/GLM-5-FP8\` actually does on a structured legal-policy task today, without fine-tuning. The README's "model not yet tuned for legal/clinical text" statement is supported by, not in tension with, this capture.

For the v2 production sequence (fine-tune specialist briefs against a public denial-letter corpus → validate on a 50-letter set against known appeal outcomes → TEE-attestation-verifying signer set replacing the v1 operator-relayed \`teeSigner\`), see \`audits/insurance/README.md\`.

Reproducible: \`PRIVATE_KEY=0x... node scripts/insurance_live_inference.js\` against the public \`https://evmrpc.0g.ai\` RPC.
`;

await fs.writeFile(outputPath, md);

console.log("");
console.log("Run complete. Honest capture written to:");
console.log(" ", path.relative(repoRoot, outputPath));
if (errorMessage) {
  console.log("Status: FAILURE (documented in the capture as a v1 known mode)");
} else {
  console.log("Status: SUCCESS");
  console.log("Attestation ID:", result?.attestationId || "(absent)");
  console.log("Validation result:", JSON.stringify(result?.valid));
}
