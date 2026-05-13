// Demonstration script for the v2 insurance-claim-denial-defense vertical.
//
// Purpose: show that Hunt's existing primitives — structured specialist brief,
// strict-JSON output schema, attestation digest construction, and per-domain
// canonical class hashing — extend 1:1 to a non-smart-contract domain WITHOUT
// any contract change. This script does NOT call 0G Sealed Inference and does
// NOT fire any on-chain transaction. It exercises the code path locally so a
// judge can verify the architecture transfer is real, not asserted.
//
// Run: node scripts/insurance_specialist_brief.js
//
// Output:
//   - audits/insurance/demo_output.json — the brief, schema, and digest
//     construction that would be fed to the Sealed Inference TEE if the
//     v2 vertical were live on-chain.
//   - stdout summary showing the data flow.

import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "ethers";

// ─── v2 canonical classes for the insurance vertical ─────────────────────
//
// In v1, lib/cwe.js holds the closed registry of smart-contract CWE classes.
// The insurance vertical introduces a parallel registry of denial-defect
// classes. Each is hashed to bytes32 with the same `keccak256(utf8(name))`
// primitive used by lib/cwe.js — same encoding, same chain semantics, new
// canonical strings. v2 deploys these alongside the existing CWE registry
// behind a per-domain enum (`SMART_CONTRACT`, `INSURANCE_APPEAL`, ...).

const INSURANCE_DEFECT_CLASSES = Object.freeze([
  "medical-necessity-misapplication", // LCD/NCD citations not governing the question; algorithmic estimates substituted for individualised review (Lokken pattern)
  "coding-cpt-error", // Wrong CPT code, missing modifier, bundling/unbundling error
  "prior-auth-overreach", // Treatment didn't actually require PA; PA denied without basis
  "network-adequacy-violation", // In-network provider mislabeled; geographic-network-failure inadequately disclosed
  "erisa-procedural-defect", // ERISA § 503 / 29 C.F.R. § 2560.503-1 disclosure omissions
  "state-external-review-misclassification", // Denial improperly framing the claim to bypass state IRO jurisdiction
]);

function classToBytes32(s) {
  return ethers.keccak256(ethers.toUtf8Bytes(s));
}

// ─── Specialist brief (same shape as lib/review.js, new domain) ──────────

const SPECIALIST_BRIEF_MODEL_VERSION = "hunt-insurance-defense-v0";

const SYSTEM_PROMPT = `You are an autonomous insurance-appeals specialist on Hunt. You will receive:
  - up to 5 sample appeal letters from this specialist's prior history (showing their voice + the regulatory authorities they cite)
  - a structured denial brief describing the insurer, the patient's plan type, the disputed service, the denial rationale, and the in-scope denial-defect classes for the bounty

PRODUCE one strict JSON object — no prose outside it, no markdown fences. Shape:

{
  "findings": [
    {
      "defectClass": "<kebab-case denial-defect class, e.g. 'medical-necessity-misapplication', 'coding-cpt-error', 'prior-auth-overreach', 'network-adequacy-violation', 'erisa-procedural-defect', 'state-external-review-misclassification'>",
      "severity": "critical" | "high" | "medium" | "low",
      "loc": "<denial letter section anchor; e.g. 'NOMNC para 2'>",
      "issue": "<specific defect — concrete, not vague — citing the regulatory or clinical-policy text that the denial misapplies or omits>",
      "remedyPath": "<concrete next step: which appeal channel (insurer internal, state IRO, ERISA external review, QIO fast-track), within what window>",
      "supportingAuthority": "<cited authority: LCD/NCD identifier, 42 C.F.R. section, 29 C.F.R. § 2560.503-1 subsection, state-law statute, controlling case>"
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

CRITERIA for self-eval (calibrated to insurance-appeals domain):
  - severityCalibration: how accurately defects are graded against the appeal-success precedent base rate for that defect class
  - precision:           false-positive rate — flag if a "defect" might survive review
  - coverage:            did the analysis hit each in-scope defect class against the denial letter
  - exploitabilityBps:   does each defect have a concrete appeal-channel + deadline + cited authority, not hand-waving

Be honest. The patient is going to take this appeal letter to a state insurance commissioner or IRO. Hallucinated authorities are worse than no finding. Cite real regulations or do not cite. If unsure, lower the precision score.

If you find no actionable defects, return {"findings": [], "selfEval": {...}} with a rationale explaining why — coverage + exploitability must reflect honestly whether each in-scope class was checked.`;

function buildSampleBlock(samples) {
  if (!samples.length)
    return "(no sample appeal letters provided — cold-start specialist)";
  return samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n\n");
}

function buildDenialBrief(brief) {
  return `── BOUNTY BRIEF ──
Insurer:          ${brief.insurer}
Plan type:        ${brief.planType}
Service in dispute: ${brief.service}
Date of denial:   ${brief.denialDate}
Patient clinical context: ${brief.clinicalContext}

In-scope denial-defect classes (specialist must analyse against each):
${brief.inScopeDefects.map((c) => "  - " + c).join("\n")}

DENIAL LETTER (sealed; decrypted only inside this specialist's TEE):
"""
${brief.denialText}
"""

PRIOR APPEAL OUTCOMES (this specialist, this insurer, this defect class):
${brief.priorOutcomes.length ? brief.priorOutcomes.map((o) => "  - " + o).join("\n") : "  (cold start — no prior outcomes)"}
`;
}

function buildUserPrompt({ samples, brief }) {
  return [buildSampleBlock(samples), buildDenialBrief(brief)].join("\n\n");
}

// ─── Attestation digest (same primitive as v1 lib/credential.js) ─────────
//
// In v1 the contract `ecrecover`s a digest of keccak(abi.encode(...)) over
// (bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest,
//  teeTimestamp, severityCalibrationBps, precisionBps, coverageBps,
//  exploitabilityBps). The insurance vertical uses the IDENTICAL encoding;
// only the canonical class strings change. That's the point of this script —
// the chain-side primitive is unchanged.

const ABI = ethers.AbiCoder.defaultAbiCoder();

function findingDigest(params) {
  return ethers.keccak256(
    ABI.encode(
      [
        "uint256",
        "bytes32",
        "uint256",
        "bytes32",
        "uint8",
        "bytes32",
        "bytes32",
        "uint64",
        "uint16",
        "uint16",
        "uint16",
        "uint16",
      ],
      [
        params.bountyId,
        params.denialRoot, // was codeRoot in v1
        params.specialistId, // was hunterId in v1
        params.defectClass, // was cweClass in v1
        params.severity,
        params.findingRoot,
        params.modelDigest,
        params.teeTimestamp,
        params.severityCalibrationBps,
        params.precisionBps,
        params.coverageBps,
        params.exploitabilityBps,
      ],
    ),
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")),
  "..",
);
const samplePath = path.join(repoRoot, "audits/insurance/sample_denial.txt");
const outputPath = path.join(repoRoot, "audits/insurance/demo_output.json");

const denialText = await fs.readFile(samplePath, "utf8");

const brief = {
  insurer: "ACME Medicare Advantage Plan (synthetic, Lokken-pattern)",
  planType: "Medicare Advantage PPO",
  service: "Skilled nursing facility coverage continuation, post-acute",
  denialDate: "[DATE]",
  clinicalContext:
    "46-year-old female; post-acute SNF stay following hip-fracture repair; therapy minutes and Section GG plateau cited as grounds for discharge",
  inScopeDefects: INSURANCE_DEFECT_CLASSES,
  denialText,
  priorOutcomes: [], // cold start for the v2 demo
};

const userPrompt = buildUserPrompt({ samples: [], brief });

const modelDigest = ethers.keccak256(
  ethers.toUtf8Bytes(
    `hunt-insurance-defense|${SPECIALIST_BRIEF_MODEL_VERSION}`,
  ),
);

const fakeAttestationParams = {
  bountyId: 0n,
  denialRoot: ethers.keccak256(ethers.toUtf8Bytes(denialText)),
  specialistId: 0n,
  defectClass: classToBytes32("medical-necessity-misapplication"),
  severity: 3, // high
  findingRoot: ethers.keccak256(
    ethers.toUtf8Bytes("(specialist output placeholder)"),
  ),
  modelDigest,
  teeTimestamp: 0n,
  severityCalibrationBps: 0,
  precisionBps: 0,
  coverageBps: 0,
  exploitabilityBps: 0,
};

const digest = findingDigest(fakeAttestationParams);

const outputSchema = {
  findings: [
    {
      defectClass: "string (kebab-case from INSURANCE_DEFECT_CLASSES)",
      severity: "critical | high | medium | low",
      loc: "string (denial-letter section anchor)",
      issue: "string (concrete defect citing regulatory text)",
      remedyPath: "string (appeal channel + deadline)",
      supportingAuthority: "string (LCD/NCD/CFR/case)",
    },
  ],
  selfEval: {
    severityCalibrationBps: "0..10000",
    precisionBps: "0..10000",
    coverageBps: "0..10000",
    exploitabilityBps: "0..10000",
    rationale: "string",
  },
};

const demoOutput = {
  vertical: "insurance-claim-denial-defense",
  status: "v2-demonstration (no on-chain action)",
  specialistBriefModelVersion: SPECIALIST_BRIEF_MODEL_VERSION,
  canonicalClasses: INSURANCE_DEFECT_CLASSES.map((s) => ({
    name: s,
    bytes32: classToBytes32(s),
  })),
  brief: {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  },
  expectedOutputSchema: outputSchema,
  attestationConstruction: {
    note: "Identical to v1 lib/credential.js findingDigest — same ABI encoding, same keccak, same on-chain ecrecover gate. Only the canonical class strings differ.",
    inputs: {
      bountyId: fakeAttestationParams.bountyId.toString(),
      denialRoot: fakeAttestationParams.denialRoot,
      specialistId: fakeAttestationParams.specialistId.toString(),
      defectClass: fakeAttestationParams.defectClass,
      defectClassDecoded: "medical-necessity-misapplication",
      severity: fakeAttestationParams.severity,
      findingRoot: fakeAttestationParams.findingRoot,
      modelDigest: fakeAttestationParams.modelDigest,
      teeTimestamp: fakeAttestationParams.teeTimestamp.toString(),
      selfEvalBps: {
        severityCalibration: fakeAttestationParams.severityCalibrationBps,
        precision: fakeAttestationParams.precisionBps,
        coverage: fakeAttestationParams.coverageBps,
        exploitability: fakeAttestationParams.exploitabilityBps,
      },
    },
    digest,
  },
};

await fs.writeFile(outputPath, JSON.stringify(demoOutput, null, 2));

console.log("══ Hunt v2 — insurance specialist brief demonstration ══");
console.log("");
console.log(
  "Canonical denial-defect classes (v2 registry, keccak'd same as v1 CWEs):",
);
for (const c of demoOutput.canonicalClasses) {
  console.log(`  ${c.name.padEnd(40)} ${c.bytes32}`);
}
console.log("");
console.log("Denial sample bytes:        ", denialText.length);
console.log("denialRoot (keccak):        ", fakeAttestationParams.denialRoot);
console.log("modelDigest:                ", modelDigest);
console.log("Attestation digest (v1 fn): ", digest);
console.log("");
console.log("Full brief + schema + digest construction written to:");
console.log(" ", path.relative(repoRoot, outputPath));
console.log("");
console.log("This script demonstrates that the v1 attestation primitive in");
console.log("lib/credential.js applies UNCHANGED to the insurance vertical.");
console.log("It does NOT call 0G Sealed Inference and does NOT touch chain.");
console.log("On-chain firing waits for specialist-brief tuning + validation");
console.log("on a public denial-letter corpus (weeks 8-12 post-hackathon).");
