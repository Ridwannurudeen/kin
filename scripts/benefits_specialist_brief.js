// Demonstration script for the v2 Disability + Senior Benefits Defense vertical.
//
// Purpose: same shape as scripts/insurance_specialist_brief.js and
// scripts/medical_specialist_brief.js — show that Hunt's v1 primitives
// (structured brief, strict-JSON output schema, attestation digest, per-domain
// class hashing) extend 1:1 to a third non-crypto vertical: defending
// pro-se claimants in SSDI / SSI / Medicare reconsideration / VA appeals.
//
// This script does NOT call 0G Sealed Inference and does NOT fire any
// on-chain transaction. It exercises the code path locally so a judge can
// verify that the same architecture maps onto government-benefits-adjudication
// defense the same way it maps onto smart-contract auditing.
//
// CRITICAL DISCIPLINE: this vertical processes the input of pro-se claimants
// who may be elderly, cognitively impaired, low-literacy, or non-native
// English speakers. The output schema is locked to "appeal grounds with
// cited C.F.R. / SSR / POMS authority + recommended appeal channel + filing
// deadline" — never raw legal advice, never a guarantee of outcome. v2 ships
// only in partnership with NOSSCR-credentialed representatives who provide
// the required human-in-the-loop verification.
//
// Run: node scripts/benefits_specialist_brief.js
//
// Output:
//   - audits/benefits/demo_output.json — the brief, schema, and digest
//     construction that would be fed to the Sealed Inference TEE if the
//     v2 vertical were live.
//   - stdout summary showing the data flow.

import fs from "node:fs/promises";
import path from "node:path";
import { ethers } from "ethers";

// ─── v2 canonical classes for the Benefits-Defense vertical ──────────────
//
// Each class corresponds to a documented SSDI/SSI denial-defect pattern with
// a controlling C.F.R. / SSR / POMS anchor. Each name is hashed via the same
// keccak256(utf8(name)) primitive lib/cwe.js uses for smart-contract CWEs.

const BENEFITS_DEFECT_CLASSES = Object.freeze([
  // Step 3 sequential-evaluation defects
  "medical-listing-misapplication", // failure to consider meets-or-medically-equals; 20 C.F.R. Part 404 Subpart P App. 1; SSR 17-2p
  // Step 4/5 RFC + DOT defects
  "residual-functional-capacity-error", // RFC internal inconsistency; SSR 96-8p narrative-discussion violation; 20 C.F.R. § 404.1545
  "vocational-expert-misclassification", // DOT-RFC conflict; SSR 00-4p; transferable-skills errors; Med-Voc Guideline misapplication
  // Threshold defects
  "duration-requirement-misapplication", // 12-month rule applied to chronic-but-fluctuating conditions; 20 C.F.R. § 404.1505(a)
  "substantial-gainful-activity-miscalculation", // earnings-cap analysis errors; 20 C.F.R. § 404.1574; POMS DI 10501
  // Procedural defects
  "combined-impairments-omission", // single-impairment analysis where record shows multiple; 20 C.F.R. § 404.1523; SSR 96-8p
  "treating-physician-opinion-weight", // failure to articulate supportability + consistency under 20 C.F.R. § 404.1520c (2017 rules)
]);

function classToBytes32(s) {
  return ethers.keccak256(ethers.toUtf8Bytes(s));
}

// ─── Specialist brief (same shape as lib/review.js, new domain) ──────────

const SPECIALIST_BRIEF_MODEL_VERSION = "hunt-benefits-defense-v0";

const SYSTEM_PROMPT = `You are an autonomous SSDI/SSI benefits-appeals specialist on Hunt. You will receive:
  - up to 5 sample appeal grounds from this specialist's prior history (showing their voice + the C.F.R. / SSR / POMS authorities they cite)
  - a structured denial brief containing the claimant's claim type (SSDI / SSI / Title II / Title XVI), age category, primary impairment(s), the SSA denial letter, and the in-scope defect classes for the bounty

ABSOLUTE SCOPE LIMIT — read this twice:
  - You DO NOT diagnose. You DO NOT guarantee appeal outcomes. You DO NOT replace an accredited representative.
  - You DO surface "appeal grounds rooted in the SSA's own regulations and rulings" that a pro-se claimant — or their accredited representative — can use to draft a Request for Reconsideration (SSA-561), Request for Hearing (HA-501), or Request for Review (HA-520).
  - You CITE 20 C.F.R., Social Security Rulings (SSRs), and Program Operations Manual System (POMS) provisions when you anchor a defect — these MUST be real. A hallucinated C.F.R. cite filed in good faith by a 67-year-old pro-se claimant could prejudice their entire case before an ALJ. If unsure of the exact provision, omit the citation field rather than guess.
  - Output must be honest about confidence — if the record is ambiguous and the defect might not survive ALJ review, lower the precision score and say so in the rationale.

PRODUCE one strict JSON object — no prose outside it, no markdown fences. Shape:

{
  "findings": [
    {
      "defectClass": "<kebab-case from BENEFITS_DEFECT_CLASSES>",
      "severity": "critical" | "high" | "medium" | "low",
      "denialLetterAnchor": "<denial-letter section the defect lives in, e.g. 'Step 3 — Listing of Impairments paragraph 2'>",
      "appealGround": "<concrete defect statement citing the SSA's own reasoning back to the C.F.R. / SSR / POMS provision it violates>",
      "controllingAuthority": "<specific cite: '20 C.F.R. § 404.1526', 'SSR 96-8p', 'POMS DI 24505.001', etc. — REAL only; OMIT if uncertain>",
      "appealChannel": "Reconsideration (SSA-561, 60d) | ALJ Hearing (HA-501, 60d) | Appeals Council (HA-520, 60d) | Federal Court (42 U.S.C. § 405(g), 60d)",
      "filingDeadlineRule": "<the deadline trigger event + the rule cite>"
    }
  ],
  "selfEval": {
    "severityCalibrationBps":  <0..10000>,
    "precisionBps":            <0..10000>,
    "coverageBps":             <0..10000>,
    "exploitabilityBps":       <0..10000>,
    "rationale": "<one paragraph: where strong / where weak, AND explicit confirmation of scope discipline (no diagnosis, no outcome guarantee, no representation claim)>"
  }
}

CRITERIA for self-eval:
  - severityCalibration: how accurately the defect grade tracks the published ALJ-reversal rate for that defect class on remand
  - precision:           false-positive rate — hallucinated authorities are a critical failure mode here; lower precision honestly if uncertain
  - coverage:            did the analysis hit each in-scope defect class against the denial letter
  - exploitabilityBps:   does each defect lead to a concrete appeal channel + filing deadline + citation, not hand-waving

If you find no actionable defects, return {"findings": [], "selfEval": {...}} with a rationale explaining why — coverage + exploitability must reflect honestly whether each in-scope class was checked against the denial.`;

function buildSampleBlock(samples) {
  if (!samples.length)
    return "(no sample appeal grounds provided — cold-start specialist)";
  return samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n\n");
}

function buildDenialBrief(brief) {
  return `── BOUNTY BRIEF ──
Claim type:       ${brief.claimType}
Age category:     ${brief.ageCategory}
Primary impairments: ${brief.impairments.join(", ")}
Date of denial:   ${brief.denialDate}
Stage:            ${brief.stage}

In-scope defect classes (specialist must analyse against each):
${brief.inScopeDefects.map((c) => "  - " + c).join("\n")}

DENIAL LETTER (sealed; decrypted only inside this specialist's TEE):
"""
${brief.denialText}
"""

PRIOR APPEAL OUTCOMES (this specialist, this defect class, this stage):
${brief.priorOutcomes.length ? brief.priorOutcomes.map((o) => "  - " + o).join("\n") : "  (cold start — no prior outcomes)"}

REMINDER: appeal grounds with cited authority, NOT diagnoses, NOT outcome guarantees.
`;
}

function buildUserPrompt({ samples, brief }) {
  return [buildSampleBlock(samples), buildDenialBrief(brief)].join("\n\n");
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
const samplePath = path.join(repoRoot, "audits/benefits/sample_denial.txt");
const outputPath = path.join(repoRoot, "audits/benefits/demo_output.json");

const denialText = await fs.readFile(samplePath, "utf8");

const brief = {
  claimType: "SSDI (Title II)",
  ageCategory:
    "Closely approaching advanced age (52) — 20 C.F.R. § 404.1563(d)",
  impairments: [
    "Degenerative disc disease, lumbar spine with radiculopathy",
    "Type 2 diabetes mellitus (controlled)",
    "Major depressive disorder",
  ],
  denialDate: "[DATE]",
  stage:
    "Initial determination (eligible for Reconsideration via SSA-561 within 60 days)",
  inScopeDefects: BENEFITS_DEFECT_CLASSES,
  denialText,
  priorOutcomes: [], // cold start for the v2 demo
};

const userPrompt = buildUserPrompt({ samples: [], brief });

const modelDigest = ethers.keccak256(
  ethers.toUtf8Bytes(`hunt-benefits-defense|${SPECIALIST_BRIEF_MODEL_VERSION}`),
);

const fakeAttestationParams = {
  bountyId: 0n,
  denialRoot: ethers.keccak256(ethers.toUtf8Bytes(denialText)),
  specialistId: 0n,
  defectClass: classToBytes32("medical-listing-misapplication"),
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
      defectClass: "string (kebab-case from BENEFITS_DEFECT_CLASSES)",
      severity: "critical | high | medium | low",
      denialLetterAnchor: "string (section anchor)",
      appealGround:
        "string (defect statement back to the regulation it violates)",
      controllingAuthority:
        "string (real C.F.R. / SSR / POMS cite, or OMITTED if uncertain)",
      appealChannel:
        "Reconsideration (SSA-561, 60d) | ALJ Hearing (HA-501, 60d) | Appeals Council (HA-520, 60d) | Federal Court (42 U.S.C. § 405(g), 60d)",
      filingDeadlineRule: "string (trigger event + rule cite)",
    },
  ],
  selfEval: {
    severityCalibrationBps: "0..10000",
    precisionBps: "0..10000",
    coverageBps: "0..10000",
    exploitabilityBps: "0..10000",
    rationale:
      "string — MUST confirm scope discipline (no diagnosis, no outcome guarantee, no representation claim)",
  },
};

const demoOutput = {
  vertical: "disability-and-senior-benefits-defense",
  status:
    "v2-demonstration (no on-chain action; no real claimant data; synthetic SSDI denial only)",
  scopeDiscipline:
    "Appeal grounds with cited C.F.R. / SSR / POMS authority + appeal channel + filing deadline. NEVER a diagnosis. NEVER an outcome guarantee. NEVER a substitute for representation by an attorney or NOSSCR-credentialed non-attorney representative. v2 ships only with NOSSCR human-in-the-loop partnership.",
  specialistBriefModelVersion: SPECIALIST_BRIEF_MODEL_VERSION,
  canonicalClasses: BENEFITS_DEFECT_CLASSES.map((s) => ({
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
      defectClassDecoded: "medical-listing-misapplication",
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
  populationNote:
    "This vertical's pro-se claimants are disproportionately elderly, cognitively impaired, low-literacy, or non-native English speakers. Onboarding flow must accommodate that — plain-language consent, in-language interpreters, accredited-representative human-in-the-loop are not optional.",
  disclaimer:
    "For research demonstration only. Not legal advice. Not a substitute for representation by a qualified attorney or NOSSCR-credentialed non-attorney representative under 20 C.F.R. § 404.1705.",
};

await fs.writeFile(outputPath, JSON.stringify(demoOutput, null, 2));

console.log(
  "══ Hunt v2 — Disability + Senior Benefits specialist brief demonstration ══",
);
console.log("");
console.log(
  "SCOPE DISCIPLINE: appeal grounds with cited authority — never diagnoses,",
);
console.log(
  "never outcome guarantees, never a substitute for accredited representation.",
);
console.log("");
console.log(
  "Canonical defect classes (v2 registry, keccak'd same as v1 CWEs):",
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
console.log(
  "lib/credential.js applies UNCHANGED to the benefits-defense vertical.",
);
console.log("It does NOT call 0G Sealed Inference and does NOT touch chain.");
console.log(
  "On-chain firing waits for specialist-brief tuning against the SSA",
);
console.log(
  "POMS/SSR corpus AND NOSSCR human-in-the-loop partnership (weeks 12-20",
);
console.log(
  "post-hackathon, parallel with the medical vertical's CLIA timeline).",
);
