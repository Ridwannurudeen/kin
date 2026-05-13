// Demonstration script for the v2 medical Records Reader vertical.
//
// Purpose: same as scripts/insurance_specialist_brief.js — show that Hunt's
// existing v1 primitives (structured brief, strict-JSON output schema,
// attestation digest construction, per-domain canonical class hashing) extend
// 1:1 to the medical Records Reader vertical without any contract change.
// This script does NOT call 0G Sealed Inference and does NOT fire any
// on-chain transaction.
//
// CRITICAL SCOPE DISCIPLINE: the output schema is locked to "questions for
// the treating physician" + "flags worth a human second opinion". The schema
// itself forbids the model from emitting a diagnosis or treatment
// recommendation. That framing keeps Hunt inside 21st Century Cures CDS
// exemption + FDA Jan 2026 enforcement-discretion guidance and outside EU
// AI Act Annex III SaMD obligations.
//
// Run: node scripts/medical_specialist_brief.js
//
// Output:
//   - audits/medical/demo_output.json — the brief, schema, and digest
//     construction that would be fed to the Sealed Inference TEE if the
//     v2 vertical were live on-chain.
//   - stdout summary showing the data flow.

import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "ethers";

// ─── v2 canonical classes for the medical vertical ───────────────────────
//
// Each name is a documented per-specialty *reading* class — what kind of
// disagreement a second-opinion specialist might surface. Published
// disagreement-rate data calibrates this registry against observed ground
// truth (smart-contract CWE rep has no equivalent baseline).

const MEDICAL_READING_CLASSES = Object.freeze([
  // Pathology — 14% major-disagreement general surgical; 11-15% breast core
  "pathology-borderline-interpretation",
  // Radiology — 20-32% major discrepancy on oncologic CT second-reads
  "radiology-second-read-discrepancy",
  // Oncology — stage migration on review, treatment-naive vs. treated
  "oncology-staging-revision",
  // Cardiology — subtle ischaemic patterns, valvular grading
  "cardiology-ecg-echo-revision",
  // Dermatology — pigmented-lesion ABCDE second read
  "dermatology-pigmented-lesion-revision",
  // Hematology — peripheral smear vs. flow vs. molecular discordance
  "hematology-flow-cytometry-discordance",
]);

function classToBytes32(s) {
  return ethers.keccak256(ethers.toUtf8Bytes(s));
}

// ─── Specialist brief (same shape as lib/review.js, new domain) ──────────

const SPECIALIST_BRIEF_MODEL_VERSION = "hunt-medical-records-reader-v0";

const SYSTEM_PROMPT = `You are an autonomous medical Records Reader specialist on Hunt.

ABSOLUTE SCOPE LIMIT — read this twice:
  - You DO NOT diagnose. You DO NOT recommend treatment. You DO NOT recommend medication. You DO NOT predict prognosis.
  - You DO surface "questions a patient should ask their treating physician" and "findings worth flagging for a human specialist second opinion".
  - You CITE published guidelines (NCCN, ACS, USPSTF, ACR appropriateness criteria, CAP, ASCO) when you reference what is or is not standard of care — and never claim you ARE applying them, only that they are worth discussing.
  - If the report is unambiguous and aligned with standard practice, the correct output is "findings": [] with a rationale explaining the report appears internally consistent.
  - You are operating under 21st Century Cures CDS exemption + FDA Jan 2026 CDS enforcement-discretion guidance. Output framed as differential-diagnosis-replacement falls outside that exemption.

You will receive:
  - up to 5 sample Records-Reader outputs from this specialist's prior history
  - a structured record brief containing the patient's clinical context (de-identified or synthetic), the source report, and the in-scope reading classes for the bounty

PRODUCE one strict JSON object — no prose outside it, no markdown fences. Shape:

{
  "findings": [
    {
      "readingClass": "<kebab-case from MEDICAL_READING_CLASSES>",
      "severity": "critical" | "high" | "medium" | "low",
      "questionForPhysician": "<the specific question the patient should ask — phrased as a question, not a statement>",
      "reportAnchor": "<section / line / image-finding the question relates to>",
      "publishedGuidelineCitation": "<guideline + section, e.g. 'NCCN Breast Cancer Screening v3.2025 §BS-1' — must be real or omit>",
      "secondOpinionTrigger": "<reason this finding is worth a human specialist second-opinion call, or null if not>"
    }
  ],
  "selfEval": {
    "severityCalibrationBps":  <0..10000>,
    "precisionBps":            <0..10000>,
    "coverageBps":             <0..10000>,
    "exploitabilityBps":       <0..10000>,
    "rationale": "<one paragraph: where strong / where weak, and an explicit note on scope discipline — confirm you did NOT diagnose>"
  }
}

CRITERIA for self-eval:
  - severityCalibration: how accurately the question urgency tracks the published disagreement-rate baseline for that reading class
  - precision:           false-positive rate — hallucinated guidelines are a critical failure; lower precision honestly if any citation is uncertain
  - coverage:            did the analysis hit each in-scope reading class against the report
  - exploitabilityBps:   does each question lead to a concrete next step (specific physician conversation, specific second-opinion specialty, specific guideline lookup)

Be honest. The patient may bring these questions into their next physician visit. A hallucinated guideline citation is worse than no citation. If unsure of the exact NCCN/ASCO/ACR section, omit the citation field rather than guess.

A "questions to ask" output that contains a diagnosis is a scope-discipline failure regardless of accuracy. Self-eval rationale MUST confirm scope discipline was held.`;

function buildSampleBlock(samples) {
  if (!samples.length)
    return "(no sample Records Reader outputs provided — cold-start specialist)";
  return samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n\n");
}

function buildRecordBrief(brief) {
  return `── BOUNTY BRIEF ──
Specialty:        ${brief.specialty}
Record type:      ${brief.recordType}
Clinical context: ${brief.clinicalContext}

In-scope reading classes (specialist must analyse against each):
${brief.inScopeReadings.map((c) => "  - " + c).join("\n")}

REPORT (sealed; decrypted only inside this specialist's TEE):
"""
${brief.reportText}
"""

PRIOR READINGS (this specialist, this reading class):
${brief.priorReadings.length ? brief.priorReadings.map((o) => "  - " + o).join("\n") : "  (cold start — no prior outputs)"}

REMINDER: questions for the physician, NOT diagnoses.
`;
}

function buildUserPrompt({ samples, brief }) {
  return [buildSampleBlock(samples), buildRecordBrief(brief)].join("\n\n");
}

// ─── Attestation digest (same primitive as v1 lib/credential.js) ─────────

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
        params.recordRoot, // was codeRoot in v1
        params.specialistId, // was hunterId in v1
        params.readingClass, // was cweClass in v1
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
const samplePath = path.join(
  repoRoot,
  "audits/medical/sample_pathology_report.txt",
);
const outputPath = path.join(repoRoot, "audits/medical/demo_output.json");

const reportText = await fs.readFile(samplePath, "utf8");

const brief = {
  specialty: "Pathology (breast core needle biopsy)",
  recordType: "Surgical pathology report",
  clinicalContext:
    "46-year-old female with palpable mass and BI-RADS 4B imaging finding; ADH-vs-low-grade-DCIS interobserver-borderline lesion on core biopsy — the single most-revised diagnostic category in breast pathology Q&A audits",
  inScopeReadings: MEDICAL_READING_CLASSES,
  reportText,
  priorReadings: [], // cold start
};

const userPrompt = buildUserPrompt({ samples: [], brief });

const modelDigest = ethers.keccak256(
  ethers.toUtf8Bytes(
    `hunt-medical-records-reader|${SPECIALIST_BRIEF_MODEL_VERSION}`,
  ),
);

const fakeAttestationParams = {
  bountyId: 0n,
  recordRoot: ethers.keccak256(ethers.toUtf8Bytes(reportText)),
  specialistId: 0n,
  readingClass: classToBytes32("pathology-borderline-interpretation"),
  severity: 3, // high — borderline interpretation worth a second opinion conversation
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
      readingClass: "string (kebab-case from MEDICAL_READING_CLASSES)",
      severity: "critical | high | medium | low",
      questionForPhysician: "string (PHRASED AS A QUESTION, not a statement)",
      reportAnchor: "string (section / line / image-finding)",
      publishedGuidelineCitation:
        "string (real NCCN/ASCO/ACR/USPSTF/ACS/CAP cite, or omitted)",
      secondOpinionTrigger: "string or null",
    },
  ],
  selfEval: {
    severityCalibrationBps: "0..10000",
    precisionBps: "0..10000",
    coverageBps: "0..10000",
    exploitabilityBps: "0..10000",
    rationale:
      "string — MUST confirm scope discipline (no diagnosis / no treatment recommendation)",
  },
};

const demoOutput = {
  vertical: "medical-records-reader",
  status: "v2-demonstration (no on-chain action; no PHI; synthetic input only)",
  scopeDiscipline:
    "Records Reader only — surfaces questions for the treating physician + second-opinion flags. NEVER a diagnosis, NEVER treatment, NEVER prognosis. Operates under 21st Century Cures CDS exemption + FDA Jan 2026 enforcement-discretion guidance. Outside EU AI Act Annex III SaMD scope.",
  specialistBriefModelVersion: SPECIALIST_BRIEF_MODEL_VERSION,
  canonicalClasses: MEDICAL_READING_CLASSES.map((s) => ({
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
      recordRoot: fakeAttestationParams.recordRoot,
      specialistId: fakeAttestationParams.specialistId.toString(),
      readingClass: fakeAttestationParams.readingClass,
      readingClassDecoded: "pathology-borderline-interpretation",
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
  disclaimer:
    "For research demonstration only. Not a medical device. Not a diagnosis. Not clinical decision support. Patients must discuss their actual reports with their treating physician and a qualified pathologist or radiologist.",
};

await fs.writeFile(outputPath, JSON.stringify(demoOutput, null, 2));

console.log("══ Hunt v2 — medical Records Reader brief demonstration ══");
console.log("");
console.log(
  "SCOPE DISCIPLINE: Records Reader only — questions for the physician,",
);
console.log(
  "never a diagnosis. Operates under 21st Century Cures CDS exemption.",
);
console.log("");
console.log(
  "Canonical reading classes (v2 registry, keccak'd same as v1 CWEs):",
);
for (const c of demoOutput.canonicalClasses) {
  console.log(`  ${c.name.padEnd(45)} ${c.bytes32}`);
}
console.log("");
console.log("Report sample bytes:        ", reportText.length);
console.log("recordRoot (keccak):        ", fakeAttestationParams.recordRoot);
console.log("modelDigest:                ", modelDigest);
console.log("Attestation digest (v1 fn): ", digest);
console.log("");
console.log("Full brief + schema + digest construction written to:");
console.log(" ", path.relative(repoRoot, outputPath));
console.log("");
console.log("This script demonstrates that the v1 attestation primitive in");
console.log("lib/credential.js applies UNCHANGED to the medical vertical.");
console.log("It does NOT call 0G Sealed Inference and does NOT touch chain.");
console.log("On-chain firing waits for specialist-brief tuning, validation on");
console.log(
  "MIMIC-CXR / TCGA / NIH ChestX-ray14, AND CLIA-certified human-in-the-loop",
);
console.log("partnership (weeks 12-20 post-hackathon).");
