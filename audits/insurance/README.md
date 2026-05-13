# Hunt for Insurance Claim Denials — v2 vertical

This directory is the forward-looking second vertical for Hunt: defending ordinary patients against algorithmic health-insurance claim denials. Smart-contract auditing was v1 because on-chain settlement closes the loop cleanly. **Insurance-denial defense is the same protocol, with different specialists, against the largest unaccountable-AI event in modern American life.**

This is a v2 plan, not a live on-chain demo. Hunt's mainnet contract is unchanged; the existing bounty #0–#6 history on Aristotle stays the cryptographically-verifiable record. The first on-chain insurance bounty fires post-hackathon once the model + specialist briefs are tuned for legal/clinical-policy reasoning.

## Data flow at a glance

```
  patient            0G Storage           Hunt contract        specialist hunters             patient
  ─────────         ───────────────────  ──────────────       ─────────────────────────       ─────────
  denial+EOB ──AES─▶ denialRoot          postBounty           run race in TEE                  attested
  encrypted ▲        (encrypted)         (escrow + scope) ──▶ each specialist independently    appeal letter
            │              │                   │              decrypts inside TEE, calls 0G    + on-chain
            │              ▼                   ▼              Sealed Inference, surfaces       receipt for
            │       0G Chain settles ◀── submitDefense        appeal grounds + cited authority insurance
            │       per-defect rep ◀────────── (ecrecover                                      commissioner
            │       (backtested vs.          attestation                                       / state IRO
            │       CMS QIO outcomes)        digest)
            └──────── ECIES envelope, finding decrypts only to patient pubkey ─────────────────┘
```

Run [`scripts/insurance_specialist_brief.js`](../../scripts/insurance_specialist_brief.js) to see the structured brief + output schema + attestation digest construction this vertical produces. The script uses the **same** `findingDigest` primitive as v1 ([`lib/credential.js`](../../lib/credential.js)) — only the canonical class strings differ.

## Why this is the right v2

73 million ACA enrollees had in-network claims denied in 2023. **Less than 1% appealed.** Of those who did, **40–75% won.** The architecture today: an algorithm denies care in 1.2 seconds (Cigna PXDX, [CBS News](https://www.cbsnews.com/news/cigna-algorithm-patient-claims-lawsuit/)); a patient with no legal training has no way to challenge it; the AI that denied them is unverifiable; the AI that *could* defend them is unverifiable in the same way. Both sides black-boxed, only one side has lawyers.

Hunt closes the asymmetry. A patient uploads the denial letter + relevant clinical record (encrypted). Multiple specialist AI agents — medical-necessity, CPT/coding, prior-authorization, ERISA-procedural, state-external-review — race inside 0G Sealed Inference TEEs to identify defects in the denial. The winning specialist's appeal is **signed with a TEE-derived attestation**: model digest, input hash, finding hash, race-window timestamp. Per-specialty reputation accrues on-chain over time and is **backtestable against publicly-published CMS external-review outcomes** — something the smart-contract CWE reputation cannot match.

## Active context (May 2026)

- **Estate of Lokken v. UnitedHealth Group** (D. Minn., 0:23-cv-03514) — class action over nH Predict allegedly producing 90%-error-rate denials advanced past motion to dismiss Feb 2025; **federal court ordered broad discovery against UHC in March 2025**. ([ArentFox Schiff](https://www.afslaw.com/perspectives/alerts/federal-court-orders-broad-discovery-against-uhc-ai-coverage-denial-lawsuit))
- **Cigna PXDX class action** survived motion to dismiss March 2025; ~300,000 claims denied in 2 months at 1.2s each. ([Courthouse News](https://www.courthousenews.com/judge-advances-class-claims-over-cigna-use-of-automated-algorithm-to-deny-benefits/))
- **Colorado AI Act SB24-205** + 2026 rewrite **SB26-189** grant consumers a statutory right-to-reason for high-risk AI decisions in insurance. ([Consumer Finance Monitor](https://www.consumerfinancemonitor.com/2026/05/12/colorado-rewrites-its-landmark-ai-law-unpacking-sb-26-189-and-what-it-means-for-businesses/))
- **EU AI Act** classifies AI insurance-eligibility systems as high-risk under Annex III with right-to-explanation obligations.
- Three live consumer products — **[Counterforce Health](https://www.counterforcehealth.org/)**, **Claimable**, **Fight Health Insurance** — claim 70–80% appeal-success rates *without* TEE attestation. They've validated the category and the price point; the verifiability moat is unfilled.
- Consumer trust signals on AI + health: **Deloitte 2024** finds 30% distrust gen-AI for health info (up from 23% in 2023); **Relyance 2025** finds 82% see AI data-loss as a serious personal threat.

## Specialist subdomain mapping

Hunt's per-CWE specialist architecture maps onto insurance-denial defects cleanly:

| Hunt smart-contract analog | Insurance-denial specialist | What they look for |
|---|---|---|
| `swc-107-reentrancy` | `medical-necessity-misapplication` | LCD/NCD citations that don't govern the clinical question; algorithmic estimates substituted for individualized review (Lokken pattern) |
| `oracle-manipulation` | `coding-cpt-error` | Wrong CPT code, missing modifier, downcoded service, bundled-vs-unbundled errors |
| `access-control` | `prior-auth-overreach` | Treatment that didn't actually require PA being denied for "no PA" |
| `swc-101-int-overflow` | `network-adequacy-violation` | In-network provider mislabeled, geographic-network-failure inadequately disclosed |
| `storage-collision` | `erisa-procedural-defect` | Adverse benefit determination missing § 503 / 29 C.F.R. § 2560.503-1 disclosures |
| (new class) | `state-external-review-misclassification` | Denial improperly framing the claim to bypass state IRO jurisdiction |

Unlike CWEs, the ground-truth signal for these classes is *publicly available* via CMS Quality Improvement Organization (QIO) external-review data. Reputation accrual is independently backtestable — a stronger empirical claim than smart-contract auditing can make.

## Architecture mapping

The contract layer is mostly unchanged. Hunt's existing primitives transfer:

| Hunt primitive | Insurance-denial analog |
|---|---|
| `codeRoot` on 0G Storage | `denialRoot` — AES-encrypted bundle of denial letter + relevant clinical record + EOB |
| `inScopeCwes` | `inScopeDefects` — same bytes32 keccak'd class list, new strings |
| `submitFinding` | `submitDefense` — specialist's appeal-grounds analysis + cited authority + recommended appeal letter |
| `attestationDigest` over `(model, input, output, time)` | Same digest, same `ecrecover` against `teeSigner` — a **patient-held cryptographic receipt** they can hand to the insurance commissioner |
| `ClassRep[hunterId][cweClass]` | Backtested per-specialty against CMS external-review outcomes |
| `verify_bounty.js` strict mode | `verify_appeal.js` — patient, insurance commissioner, or state IRO independently reproduces the attestation |

The new contract surface area is small: a new bounty-domain enum (`SMART_CONTRACT`, `INSURANCE_APPEAL`, ...) and a per-domain mapping of canonical class strings. Everything else — escrow, race deadline, settle window, ecrecover, ClassRep math — works unchanged.

## Demo arc (post-hackathon)

1. **Patient uploads a denial letter** (encrypted client-side with the hunter-network key).
2. **Hunt fires 4 specialist hunters** in parallel inside 0G Sealed Inference TEEs.
3. **Each specialist runs against their narrowed brief**: medical-necessity-specialist gets the LCD/NCD context, coding-specialist gets the CPT modifier ladder, ERISA-specialist gets § 503 procedural rules, state-external-review-specialist gets the relevant state IRO statute.
4. **Best-grounded defense wins the bounty.** Findings are uploaded to 0G Storage encrypted to the patient's wallet pubkey via ECIES.
5. **Patient receives a signed attestation** they can attach to their formal appeal to the insurance commissioner or state IRO.
6. **Reputation accrues per specialty** when the appeal is later granted (signal sourced from CMS QIO external-review outcomes).

## Honest v1 privacy caveat (inherited from Hunt's v1 architecture)

Hunt v1 ships an **operator-relayed attestation layer over real 0G Sealed Inference** — documented in the main README's Honesty notes. The insurance vertical inherits both halves of that posture:

- **Sealed-from-third-parties, not sealed-from-the-specialist.** v1 encrypts the bounty payload with a **shared hunter-network key**: every registered specialist hunter holds it and can decrypt every posted bounty. For the insurance vertical that means a registered medical-necessity-specialist could in principle decrypt other patients' denial letters too. This is bounded to *registered hunters who have minted with verified credentials* — not the public, not OpenAI, not the storage operators — but it is not per-patient confidentiality. v2's per-hunter ECDH envelope on the `Bounty` struct (documented in [`doc/FUTURE.md`](../../doc/FUTURE.md) Decentralisation roadmap) closes this gap: each specialist receives a separately-encrypted envelope, so a single specialist's compromise doesn't expose other patients' records.
- **Operator-relayed attestation in v1.** The on-chain digest `ecrecover`s against an operator-held `teeSigner`. The hunter daemon validates the `ZG-Res-Key` attestation off-chain but the chain doesn't witness that validation in v1. v2's TEE-attestation-verifying signer set makes the bind chain-enforced.

Both gaps are real. Both are documented. Both have concrete v2 closures. The v2 insurance vertical waits on the v2 contract upgrade before serving real patient data — that's a feature of the sequencing, not a hidden caveat.

## Why we are NOT shipping this on-chain for the May 2026 submission

Honestly:

1. **0G's Sealed Inference model (`zai-org/GLM-5-FP8`) is tuned for code reasoning.** We have no evidence it produces useful output on LCD interpretation, ERISA procedural analysis, or CPT modifier ladders. Firing an on-chain bounty with an untuned model risks demonstrating the *opposite* of what we want.
2. **New specialists have zero reputation by definition.** Hunt's strongest claim is "per-CWE reputation accrues on-chain over time." A medical-necessity-specialist minted in the submission window shows `totalWins=0, totalSubmissions=0`. The reputation primitive is empty for the new domain on Day 1.
3. **Scope risk.** The 0G APAC submission is being judged on focused depth of 0G integration, not breadth of verticals. Hunt's smart-contract narrative is already strong and load-bearing; insurance is the v2 proof-of-generalization, not a competing v1 claim.

Tier-A scope (this directory + cross-links) preserves the strategic positioning *without* burning recording cycles on an untested vertical. The first real on-chain insurance bounty fires in v2 once we've fine-tuned the specialist briefs against the public denial-letter corpus and demonstrated meaningful model output on a small validation set.

## The strategic pitch line

> Hunt is **verifiable adversarial AI on private data.**
>
> Smart-contracts is v1 because on-chain settlement closes the loop cleanly. The same machinery — sealed inference, multi-specialist competition, on-chain per-domain reputation — applies anywhere ordinary people need to challenge an opaque AI decision on their own data.
>
> Insurance-claim-denial defense is v2. The harm is mass-scale (73M ACA denials/year, <1% appealed, 40–75% appeal-success when they do); the verifiability gap is total (Counterforce, Claimable, Fight Health Insurance — three live products, zero TEE attestation); the legal frame exists today (Colorado SB24-205/SB26-189, EU AI Act Annex III); the architecture transfers 1:1.

## Sample denial letter

See [`sample_denial.txt`](sample_denial.txt) for a synthetic denial letter modeled on the **Estate of Lokken v. UnitedHealth** complaint pattern, annotated with the four denial defects Hunt's specialists would surface. The letter is synthetic but the defect patterns are drawn directly from the public Lokken pleadings.

## References

- *Estate of Lokken v. UnitedHealth Group*, D. Minn. Case No. 0:23-cv-03514 — class action over nH Predict; broad discovery ordered Mar 2025.
- *Kisting-Leung v. Cigna*, E.D. Cal. — PXDX algorithm class action surviving motion to dismiss Mar 2025.
- Colorado SB24-205 (2024) and SB26-189 (2026) — high-risk AI consumer protections including insurance.
- EU AI Act Annex III — insurance eligibility classification as high-risk system.
- 42 C.F.R. § 422.101(b) — Medicare Advantage organization plan benefits.
- 29 C.F.R. § 2560.503-1 — ERISA claims procedure for adverse benefit determinations.
- Counterforce Health 2025 appeal guide — patient appeal mechanics and the <1% appeal rate.
- Deloitte 2024 consumer AI health-info trust survey.
