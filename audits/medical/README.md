# Hunt for Medical Records — v2 vertical

This directory is the second non-crypto vertical for Hunt, positioned alongside [insurance-claim-denial defense](../insurance/README.md). Where the insurance vertical defends citizens **against** opaque AI denials, this one gives them a **trustworthy** multi-specialist AI read of their own medical records — the read they couldn't otherwise afford.

**Critical scope discipline.** This is a *"Records Reader"*, not an *"AI Doctor."* Hunt's specialists surface **questions a patient should ask their physician** and **findings worth a human second opinion** — never a diagnosis, never a treatment recommendation, never a Class II/IIa device claim. The framing keeps Hunt inside 21st Century Cures Act CDS exemptions and the [FDA's January 2026 enforcement-discretion guidance](https://www.orrick.com/en/Insights/2026/01/FDA-Eases-Oversight-for-AI-Enabled-Clinical-Decision-Support-Software-and-Wearables), and outside the EU AI Act Annex III high-risk SaMD bucket.

Like insurance, this is positioning + plan for the May 2026 submission. No on-chain bounty fires yet — the first medical bounty post-hackathon ships only after specialist briefs are tuned and validated against public benchmark datasets (MIMIC-CXR, TCGA, NIH ChestX-ray14).

## Data flow at a glance

```
  patient            0G Storage           Hunt contract        Records-Reader specialists       patient
  ─────────         ───────────────────  ──────────────       ─────────────────────────────     ─────────
  report ────AES──▶ recordRoot           postBounty           each specialist independently     attested
  encrypted ▲        (encrypted; sealed   (escrow + scope) ──▶ decrypts inside TEE, calls 0G    "questions to
            │        from third-parties,                       Sealed Inference, returns        ask your doctor"
            │        not from registered                       QUESTIONS + guideline citations  + on-chain
            │        specialists in v1)                       NEVER a diagnosis                 receipt
            │              │                   │                       │
            │              ▼                   ▼                       ▼
            │       0G Chain settles ◀── submitReading              (records reader output)
            │       per-class rep ◀────── (ecrecover                      │
            │       (backtested vs.        attestation                    │
            │       published per-         digest)                        │
            │       specialty disagreement                                │
            │       rates: ASCO 2021,                                     │
            │       PMC PMC5265198)                                       │
            └──────── ECIES envelope, output decrypts only to patient pubkey ─────────────────────┘
```

Run [`scripts/medical_specialist_brief.js`](../../scripts/medical_specialist_brief.js) to see the structured brief + strict "questions-not-diagnoses" output schema + attestation digest construction this vertical produces. The script uses the **same** `findingDigest` primitive as v1 ([`lib/credential.js`](../../lib/credential.js)) — only the canonical class strings differ. The system prompt locks the model to "questions for the physician" output and explicitly forbids diagnosis or treatment recommendations.

## Why medical records second-opinion fits Hunt's architecture

Three reasons the protocol maps even more naturally to medical second-opinion than to smart-contract audit:

1. **Specialist disagreement is the documented baseline, not the exception.** Pathology second-opinion series report **~14% major-disagreement** rates in general surgical pathology, **~11-15%** in breast core biopsy, **20-32%** in radiology oncologic CT, and up to **52%** in neuro-oncology pathology. ([ASCO 2021](https://ascopubs.org/doi/10.1200/JCO.2021.39.15_suppl.e18650), [Anticancer Research](https://ar.iiarjournals.org/content/38/5/2989), [PMC PMC5265198](https://pmc.ncbi.nlm.nih.gov/articles/PMC5265198/)). A "race of specialists" architecture is **empirically calibrated** to a domain where specialists disagree at measurable rates — not asserted, observed.

2. **Privacy stakes are at the absolute top.** [Deloitte 2024](https://www.deloitte.com/us/en/insights/deloitte-insights-magazine/issue-33/ai-generated-health-information-us-consumers.html) (n>2000): 30% of US consumers distrust gen-AI for health information (up from 23% in 2023). [Relyance 2025](https://www.relyance.ai/consumer-ai-trust-survey-2025): 82% of consumers see AI data-loss as a serious personal threat. Pathology + radiology + genetic data is the canonical "I really don't want this leaving my device" category. Sealed Inference + attestation is the only architecture an honest consumer should accept.

3. **The market is real and underserved.** ~3 million Americans seek medical second opinions per year (CDC); the global market was [USD 7.5B in 2025, projected to ~$23-28B by 2032-33](https://www.datamintelligence.com/research-report/medical-second-opinion-market) at 15-17% CAGR. Cleveland Clinic MyConsult self-pay is **$565-$745** per case; Teladoc Expert Medical Opinion is employer-paid (most patients don't qualify). The mass-market price tier — $20-50 per record review for a *"questions to ask your doctor"* report — is unoccupied by any product that ships TEE attestation.

## Specialist subdomain mapping

Hunt's per-CWE specialist architecture maps onto medical record-reading specialties with documented disagreement-rate signals:

| Hunt smart-contract analog | Medical specialist | Documented disagreement rate | What they look for |
|---|---|---|---|
| (existing) `oracle-manipulation` | `pathology-specialist` | 11-15% major (breast core), ~14% general surgical, up to **52% neuro-oncology** | Margin status, grade, immunohistochemistry interpretation, borderline ADH/DCIS, lymphovascular invasion |
| (new) `radiology-second-read` | `radiology-specialist` | 20-32% major discrepancy on oncologic CT | Missed nodules, mischaracterized lesions, BI-RADS / Lung-RADS / PI-RADS revisions |
| (new) `oncology-staging` | `oncology-specialist` | n/a (consensus-based) | Stage migration on second review, treatment-naive vs. treated interpretation |
| (new) `cardiology-ecg-echo` | `cardiology-specialist` | n/a (operator-dependent) | Subtle ischemic patterns, valvular disease severity grading |
| (new) `dermatology-clinical` | `dermatology-specialist` | Lower than pathology | Pigmented lesion ABCDE, melanoma vs. benign nevus differential |

The disagreement-rate column is the **empirical ground-truth signal** that makes per-specialty reputation meaningful in this domain. Smart-contract auditing has no equivalent published per-CWE disagreement baseline.

## Architecture transfer

| Hunt primitive | Medical Records Reader analog |
|---|---|
| `codeRoot` on 0G Storage | `recordRoot` — AES-encrypted bundle of de-identified pathology report / imaging study / lab panel |
| `inScopeCwes` | `inScopeReadings` — same bytes32 keccak'd class list, new canonical strings |
| `submitFinding` | `submitReading` — specialist's **questions for the treating physician** + flagged findings + recommended second-opinion targets |
| `attestationDigest` | Patient-held cryptographic receipt: which model read which record at which time |
| `ClassRep` | Backtested against published per-specialty discordance benchmarks |
| `verify_bounty.js` | `verify_reading.js` — independently reproduce the attestation off the patient's own copy of the receipt |

The contract delta is the same as for insurance: a new domain enum (`SMART_CONTRACT`, `INSURANCE_APPEAL`, `MEDICAL_READING`) and a per-domain canonical-class registry. Escrow, race, settle, ecrecover, ClassRep math all reused unchanged.

## Demo arc (post-hackathon)

1. **Patient uploads a record** — pathology report, imaging study, lab panel — encrypted client-side.
2. **Hunt fires N specialist hunters** in parallel inside 0G Sealed Inference TEEs.
3. **Each specialist returns a "Records Reader" output**: questions to ask the treating physician, findings worth a second-opinion conversation, references to published guideline citations. Never a diagnosis.
4. **Best-grounded reading wins.** Encrypted findings uploaded to 0G Storage; patient gets a TEE-attested receipt.
5. **Patient brings the questions to their physician** — not a competing AI diagnosis, an informed question-list that a non-specialist family couldn't have generated alone.
6. **Reputation accrues per specialty** when the patient (or a verifying second pathologist / radiologist) confirms which reading was useful.

## Honest v1 privacy caveat (inherited from Hunt's v1 architecture)

Medical records carry the highest privacy stakes of any vertical Hunt could enter, so the v1 caveats matter more here than anywhere else. Two specific gaps inherit from v1 and have concrete v2 closures:

- **Sealed-from-third-parties, not sealed-from-the-specialist.** v1 encrypts the bounty payload with a **shared hunter-network key** held by every registered specialist. For medical, that means every registered pathology-specialist could in principle decrypt other patients' pathology reports posted to the same shared network. The exposure surface is bounded to verified-credential hunters (not the public, not OpenAI, not 0G's storage operators), but it is not per-patient confidentiality. v2's **per-hunter ECDH envelope** on the `Bounty` struct closes the gap: each specialist receives a separately-encrypted envelope, so one specialist's compromise doesn't expose other patients' records.
- **Operator-relayed attestation in v1.** The on-chain digest `ecrecover`s against an operator-held `teeSigner`. The hunter daemon validates the 0G `ZG-Res-Key` attestation off-chain but the chain doesn't witness it. v2's TEE-attestation-verifying signer set makes that bind chain-enforced.
- **Plus: medical-specific data minimisation.** The on-chain bounty stores only the `recordRoot` (keccak hash of the encrypted blob) — never the plaintext, never PHI. The patient's pubkey is the only party that can decrypt the specialist's output (ECIES envelope). De-identification happens client-side before encryption. PHI never crosses the network in plaintext at any point.

The v2 medical vertical waits on **both** the v2 contract upgrade *and* CLIA-certified human-in-the-loop partnership before serving real patient data. The sequencing is deliberate, not a hidden caveat.

## Why we are NOT shipping this on-chain for the May 2026 submission

1. **Model behavior on medical text is unverified.** `zai-org/GLM-5-FP8` is tuned for code reasoning. We have no validation against MIMIC-CXR / TCGA / NIH ChestX-ray14 / public pathology AI benchmarks. Firing a live medical bounty with an untuned model risks demonstrating the *opposite* of "Hunt extends cleanly" — and far more reputationally costly here than in smart-contract auditing, because patients act on what they read.
2. **FDA / EU AI Act regulatory care required.** Even the *"Records Reader"* framing demands disclaimers, no claims of diagnostic accuracy parity, and zero PHI in the demo. We need synthetic and public-dataset inputs only. That validation work is weeks, not days.
3. **Reputation cold-start.** New specialists show `totalWins=0, totalSubmissions=0` on Day 1. Medical specialists need a backtested validation set before reputation has any signal.
4. **Liability scope.** Medical advice carries the heaviest liability surface area of any vertical Hunt could enter. Public Tier-A positioning is appropriate for the submission; on-chain execution waits for legal review and partnership with a clinical advisor.

Sequence: tune specialist briefs against MIMIC-CXR and public pathology Q&A corpora → validate on a 200-record blinded set against known consensus diagnoses → publish the validation methodology → **then** fire the first on-chain medical bounty under partnership with a CLIA-certified pathologist or radiologist who acts as the human-in-the-loop. ETA: weeks 12–20 post-hackathon.

## The strategic pitch line

> Insurance is Hunt defending citizens **against** opaque AI.
> Medical Records Reader is Hunt giving citizens **better** AI than they could otherwise afford — with cryptographic proof of what each specialist actually said about their data.
>
> Same protocol, same primitives, opposite face of the same problem: **ordinary people deserve verifiable AI on their private data.** Hunt is the substrate. Smart-contract auditing was the first vertical because on-chain settlement closes the loop cleanly. Insurance is the v2 vertical. Medical records second-opinion is the v3 vertical. Each vertical is a different specialist panel against a different document corpus, on the same Hunt machinery.

## Sample record

See [`sample_pathology_report.txt`](sample_pathology_report.txt) for a synthetic surgical-pathology report exhibiting the single hardest interobserver call in breast pathology (ADH vs. low-grade DCIS on core biopsy), annotated with the questions a Records Reader specialist would surface for the patient to ask their treating physician. The report is synthetic; the diagnostic ambiguity it captures is drawn directly from the public discordance literature.

## Public datasets for post-hackathon validation

- **MIMIC-CXR** (PhysioNet) — large-scale chest radiograph dataset with structured reports
- **NIH ChestX-ray14** — 112k frontal-view chest X-rays with 14 disease labels
- **TCGA** (The Cancer Genome Atlas) — pathology slides + clinical data, public
- **CAMELYON16 / CAMELYON17** — lymph-node biopsy whole-slide pathology benchmarks
- **CheXpert** (Stanford) — chest radiograph dataset

All public, all de-identified, all suitable for tuning + validating medical specialists without touching any real PHI.

## References

- [DataM Intelligence — Medical Second Opinion Market 2025-2032](https://www.datamintelligence.com/research-report/medical-second-opinion-market)
- [ASCO 2021 — Diagnostic Discrepancies in Second-Opinion Pathology Reviews](https://ascopubs.org/doi/10.1200/JCO.2021.39.15_suppl.e18650)
- [Anticancer Research — Second Opinion Pathology at Comprehensive Cancer Center](https://ar.iiarjournals.org/content/38/5/2989)
- [PMC PMC5265198 — Error and Discrepancy in Radiology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5265198/)
- [Orrick — FDA Jan 2026 CDS enforcement-discretion guidance](https://www.orrick.com/en/Insights/2026/01/FDA-Eases-Oversight-for-AI-Enabled-Clinical-Decision-Support-Software-and-Wearables)
- [STAT — FDA pulls back oversight of AI-enabled devices, Jan 2026](https://www.statnews.com/2026/01/06/fda-pulls-back-oversight-ai-enabled-devices-wearables/)
- [Deloitte 2024 — Consumer AI health-info trust survey](https://www.deloitte.com/us/en/insights/deloitte-insights-magazine/issue-33/ai-generated-health-information-us-consumers.html)
- [Relyance 2025 Consumer AI Trust Survey](https://www.relyance.ai/consumer-ai-trust-survey-2025)
- [Apple Private Cloud Compute — security architecture](https://security.apple.com/blog/private-cloud-compute/)
- [Teladoc Expert Medical Opinion](https://www.teladochealth.com/helpcenter/article/expert-medical-opinion-faqs)
- [Cleveland Clinic MyConsult](https://my.clevelandclinic.org/online-services/virtual-second-opinions)
