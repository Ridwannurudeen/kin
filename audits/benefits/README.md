# Hunt for Disability + Senior Benefits — v2 vertical

This is the third non-crypto vertical for Hunt, positioned alongside [insurance-claim-denial defense](../insurance/README.md) and the [medical Records Reader](../medical/README.md). Where insurance defends citizens against **private-payor** AI denials and medical gives them better verifiable AI reads, this vertical defends citizens against **public-payor** denials — the algorithmic and procedural denials issued by Social Security (SSDI/SSI), Medicare appeals, and the Veterans Administration.

**Who this serves directly.** Elderly citizens contesting Social Security retirement-benefits errors or Medicare reconsiderations. Retirees facing reduced SSI determinations. Working-age disabled applicants navigating SSDI's 60-70% initial denial rate. Veterans appealing VA service-connection determinations. The unifying thread: populations who interact most heavily with government-benefits adjudication AND least frequently with attorneys, because attorneys take a 25% contingency fee under [42 U.S.C. § 406](https://www.law.cornell.edu/uscode/text/42/406) — economically rational for the lawyer, structurally exclusionary for the claimant.

Like insurance and medical, this is Tier-A positioning for the May 2026 submission. No on-chain bounty fires yet — the first benefits bounty post-hackathon ships only after specialist briefs are tuned against the public SSA decisions corpus and validated for legal accuracy by an accredited non-attorney representative.

## Why this is the v2 vertical that matters most for elderly + disabled citizens

Three reasons the protocol fits this population specifically:

1. **The harm is mass-scale, slow, and the largest adjudication backlog in any US administrative system.** As of January 2026, **~330,000 cases** are pending an SSDI Administrative Law Judge hearing ([SSA disability appeals data](https://www.ssa.gov/appeals/DataSets/01_NetStat_Report.html)), with an **average wait of 274 days**. ([Disability Secrets, 2026 wait-time tracker](https://www.disabilitysecrets.com/disability-reflection-12.html)) Initial-denial rate is approximately **60-70%** annually; appeal success with representation **exceeds 50%** at the ALJ hearing stage. Most claimants represent themselves *pro se* because attorney contingency is capped at 25% of past-due benefits under 42 U.S.C. § 406 — economically rational for attorneys to skip claims with low expected back-pay, structurally exclusionary for claimants in early-onset disability or low-wage histories.

2. **The architecture maps even more cleanly than insurance.** SSDI denials follow a published five-step sequential evaluation ([20 C.F.R. § 404.1520](https://www.law.cornell.edu/cfr/text/20/404.1520)). Each step has documented defect patterns that map to specialist subdomains:

   | Specialist | What they look for | Regulatory anchor |
   |---|---|---|
   | `medical-listing-misapplication` | Listing of Impairments meets-or-equals errors; failure to consider medical equivalence | 20 C.F.R. Part 404 Subpart P App. 1; SSR 17-2p |
   | `residual-functional-capacity-error` | RFC internal inconsistency; failure to discuss every documented limitation; conflict with SSR 96-8p narrative requirement | 20 C.F.R. § 404.1545; SSR 96-8p |
   | `vocational-expert-misclassification` | DOT-RFC conflict; transferable-skills errors; Medical-Vocational Guideline misapplication | SSR 00-4p; 20 C.F.R. § 404, Subpart P, App. 2 |
   | `duration-requirement-misapplication` | "Not expected to last 12 months" applied to chronic-but-fluctuating conditions | 20 C.F.R. § 404.1505(a) |
   | `substantial-gainful-activity-miscalculation` | Earnings-cap analysis errors; subsidies and special conditions not credited | 20 C.F.R. § 404.1574; POMS DI 10501 |
   | `combined-impairments-omission` | Single-impairment analysis where the record shows multiple co-occurring conditions | 20 C.F.R. § 404.1523; SSR 96-8p |
   | `treating-physician-opinion-weight` | Failure to articulate supportability + consistency under the 2017 rules | 20 C.F.R. § 404.1520c |

3. **The ground-truth signal is even better than insurance.** SSA publishes ALJ decisions, per-condition approval rates, per-ALJ disposition statistics, and per-state outcome data. Every Hunt specialist's per-class reputation is independently backtestable against publicly-released SSA datasets — a stronger empirical claim than CWE reputation against smart-contract incidents.

## Data flow at a glance

```
  pro-se claimant     0G Storage           Hunt contract       benefits specialists           claimant
  ──────────────     ───────────────────  ──────────────       ──────────────────────────     ─────────
  SSDI denial ───AES─▶ denialRoot          postBounty           each specialist independently  attested
  + medical record    (encrypted)         (escrow + scope) ──▶ decrypts inside TEE, calls 0G   appeal grounds
  encrypted ▲              │                   │                Sealed Inference, surfaces     + on-chain
            │              ▼                   ▼                appeal defects + cited C.F.R.  receipt for
            │       0G Chain settles ◀── submitDefense          / SSR / POMS authority        ALJ hearing
            │       per-defect rep ◀────────── (ecrecover                                      / Appeals
            │       (backtested vs.          attestation                                       Council
            │       SSA ALJ dispositions    digest)
            │       per condition)
            └──────── ECIES envelope, finding decrypts only to claimant pubkey ─────────────────┘
```

Run [`scripts/benefits_specialist_brief.js`](../../scripts/benefits_specialist_brief.js) to see the structured brief + output schema + attestation digest construction this vertical produces. The script uses the **same** `findingDigest` primitive as v1 ([`lib/credential.js`](../../lib/credential.js)) — only the canonical class strings differ.

## Architecture transfer

| Hunt primitive | Benefits-defense analog |
|---|---|
| `codeRoot` on 0G Storage | `denialRoot` — AES-encrypted bundle of SSA denial letter + medical record + work history |
| `inScopeCwes` | `inScopeDefects` — same bytes32 keccak'd class list, new canonical strings |
| `submitFinding` | `submitDefense` — specialist's appeal-grounds analysis + cited C.F.R. / SSR / POMS authority + recommended appeal channel + filing deadline |
| `attestationDigest` | **Claimant-held cryptographic receipt** they can attach to their Request for Reconsideration (SSA-561), Request for Hearing (HA-501), or Request for Review (HA-520) |
| `ClassRep[hunterId][cweClass]` | Backtested against publicly-released SSA ALJ disposition data per condition + per defect class |

The contract delta is identical to insurance + medical: a new bounty-domain enum (`SMART_CONTRACT`, `INSURANCE_APPEAL`, `MEDICAL_READING`, `BENEFITS_DEFENSE`) and a per-domain canonical-class registry. Escrow, race deadline, settle window, `ecrecover`, ClassRep math all reused unchanged.

## Sub-domains within "Disability + Senior Benefits"

The vertical's primary focus is **SSDI/SSI** because that's where the largest adjudication backlog and most acute harm sit. Two secondary surfaces use the same machinery with different specialist registries:

- **Medicare reconsideration appeals** — Medicare Advantage denials are addressed by the [insurance vertical](../insurance/README.md) (private-payor pattern). Traditional Medicare Part B / Part D denials follow a different appeals path through Medicare Administrative Contractors → Qualified Independent Contractors → ALJ → Medicare Appeals Council → federal court. Specialist subdomains: `lcd-misapplication`, `ncd-misapplication`, `medical-necessity-traditional-medicare`, `part-d-formulary-exception`. ([CMS Appeals Process overview](https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/clm104c29.pdf))
- **VA disability claims** — Service-connection determinations and rating decisions. The PACT Act 2022 expanded eligibility but also expanded the backlog. Specialist subdomains: `service-connection-error`, `vha-c-and-p-examination-deficiency`, `rating-percentage-error`, `pact-act-presumptive-condition-omission`. ([VA Disability Appeals](https://www.va.gov/decision-reviews/))

Both secondary surfaces share the same contract machinery; they're populated post-launch as the specialist registries are validated.

## Honest v1 privacy caveat (inherited from Hunt's v1 architecture)

The same two gaps as insurance + medical, with one population-specific addition:

- **Sealed-from-third-parties, not sealed-from-the-specialist** in v1. The shared hunter-network key means every registered benefits-specialist could decrypt every posted SSDI denial bundle. Bounded to verified-credential hunters, not the public, not OpenAI, not 0G's storage operators. v2's per-hunter ECDH envelope closes the gap ([`doc/FUTURE.md`](../../doc/FUTURE.md) Decentralisation roadmap).
- **Operator-relayed attestation in v1.** Same v1 → v2 closure as the other verticals.
- **Population-specific: elderly + cognitively impaired claimants may not understand the privacy posture.** This vertical's onboarding flow must be designed for users who may have dementia, low literacy, language barriers, or no smartphone. Plain-language consent, in-language interpreters, and an accredited-representative human-in-the-loop are not optional. v2 ships with a partnership-with-accredited-non-attorney-representatives requirement before any real claimant data is processed.

## Why we are NOT shipping this on-chain for the May 2026 submission

1. **Legal accuracy stakes are high.** Hallucinated C.F.R. cites in a benefits appeal letter could prejudice the claimant's case before an ALJ. `zai-org/GLM-5-FP8` is not validated against the SSA POMS or SSR corpus. A premature on-chain bounty risks producing legally-unsound appeal grounds that a pro-se claimant would file in good faith.
2. **Representation requirement.** Filing a benefits appeal pro-se is legal, but Hunt's brand cannot afford to be the AI that told a 67-year-old to file an appeal that an attorney would have known was procedurally barred. v2 ships only in partnership with NOSSCR-credentialed non-attorney representatives or similar accredited bodies who provide the human-in-the-loop review.
3. **Reputation cold-start.** New benefits-specialists show `totalWins=0` on Day 1 and have no validation against the SSA ALJ disposition corpus. Reputation primitive is empty for this vertical until backtesting populates it.
4. **Scope discipline.** Hunt's v1 smart-contract narrative is the load-bearing depth-of-0G-integration story. The benefits vertical is the third v2 proof-of-generalization, demonstrating that the protocol's reach covers private-payor denial (insurance), cooperative AI second-opinion (medical), AND public-payor denial (benefits) — three distinct counterparties, one substrate.

Sequence: build a 200-letter SSA decisions training corpus (publicly available via [SSA's appeals decisions search](https://www.ssa.gov/appeals/)) → tune specialist briefs against documented C.F.R./SSR/POMS authority → validate on a 50-letter blinded set against known appeal outcomes → partner with NOSSCR for human-in-the-loop verification → **then** fire the first on-chain benefits bounty. ETA: weeks 12–20 post-hackathon, in parallel with the medical vertical's CLIA partnership timeline.

## The strategic pitch line

> Insurance is Hunt defending citizens against **private-payor** opaque AI.
> Medical is Hunt giving citizens **better** verifiable AI reads of their records.
> Benefits is Hunt defending citizens against **public-payor** opaque adjudication — the largest adjudication backlog in any US administrative system, where 330,000 cases wait 274 days for a hearing and most claimants cannot afford an attorney.
>
> Same protocol. Same primitives. Three faces of one truth: **ordinary citizens — and especially elderly, retired, and physically challenged citizens — deserve verifiable, attested, accountable AI when they are forced to navigate adjudication systems alone.**

## Sample denial letter

See [`sample_denial.txt`](sample_denial.txt) for a synthetic SSDI initial denial modeled on the standard SSA-1561 template, annotated with seven specific defects a Hunt specialist panel would surface — defects rooted in real 20 C.F.R. citations, Social Security Rulings (SSRs), and Program Operations Manual System (POMS) provisions. The denial is synthetic; the regulatory authorities cited and the defect patterns are real.

## Public datasets for post-hackathon validation

- **[SSA appeals decisions search](https://www.ssa.gov/appeals/)** — public ALJ and Appeals Council decisions
- **[SSA POMS](https://secure.ssa.gov/poms.nsf/)** — Program Operations Manual System (the SSA's internal adjudication manual)
- **[Social Security Rulings (SSRs)](https://www.ssa.gov/OP_Home/rulings/rulings.html)** — published rulings binding on the agency
- **[SSA performance data](https://www.ssa.gov/ssa-performance/disability-appeals-time)** — per-office wait times, per-ALJ disposition data
- **[VA Board of Veterans' Appeals decisions](https://www.bva.va.gov/)** — public VA appeals decisions

All public, all suitable for tuning + validating benefits specialists without touching any real claimant data.

## References

- [SSA Disability Appeals Wait Times — official data](https://www.ssa.gov/ssa-performance/disability-appeals-time)
- [SSA Average Wait Time Until Hearing Held Report](https://www.ssa.gov/appeals/DataSets/01_NetStat_Report.html)
- [Disability Secrets 2026 wait-time tracker](https://www.disabilitysecrets.com/disability-reflection-12.html)
- [Victory Disability 2026 SSDI wait times](https://www.victory-disability.com/blog/ssdi-wait-time-2026/)
- [20 C.F.R. § 404.1520 — sequential evaluation process](https://www.law.cornell.edu/cfr/text/20/404.1520)
- [20 C.F.R. § 404.1545 — residual functional capacity](https://www.law.cornell.edu/cfr/text/20/404.1545)
- [42 U.S.C. § 406 — attorney representation + 25% contingency cap](https://www.law.cornell.edu/uscode/text/42/406)
- [SSR 96-8p — RFC narrative discussion requirement](https://www.ssa.gov/OP_Home/rulings/di/01/SSR96-08-di-01.html)
- [SSR 00-4p — DOT-RFC conflict resolution](https://www.ssa.gov/OP_Home/rulings/di/02/SSR2000-04-di-02.html)
- [Medical-Vocational Guidelines — 20 C.F.R. Part 404, Subpart P, App. 2](https://www.law.cornell.edu/cfr/text/20/part-404/appendix-2)
- [Carr v. Saul, 593 U.S. ___ (2021) — Appointments Clause challenges to SSA ALJs](https://www.supremecourt.gov/opinions/20pdf/19-1442_j4ek.pdf)
- [Biestek v. Berryhill, 587 U.S. ___ (2019) — vocational expert testimony substantial evidence](https://www.supremecourt.gov/opinions/18pdf/17-1184_e1pf.pdf)
- [Apple Private Cloud Compute — security architecture](https://security.apple.com/blog/private-cloud-compute/)
