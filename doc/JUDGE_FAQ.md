# Hunt — anticipated judge questions

Pre-emptive answers to the hard questions any sharp judge will raise. Honest, cited, no marketing spin. If a question below sounds harsher than a judge would phrase it, treat that as a feature — we'd rather over-prepare than under-prepare.

---

## Q1 — Isn't this just Olympix / Nethermind AuditAgent / Trail of Bits' internal pipeline with extra steps?

**No, and the difference is structural, not feature-list.**

Verified May 2026 (three parallel research agents, primary sources in `doc/FUTURE.md`):
- **Olympix** ships static analysis + LLM explanations + BugPOCer (PoC generation). No TEE attestation, no on-chain reputation, no per-CWE specialization. ([source](https://olympix.security/))
- **Nethermind AuditAgent** ships CI-time AI audits at 30% recall vs human auditors. No TEE attestation, no on-chain reputation. ([source](https://www.nethermind.io/blog/how-nethermind-security-uses-auditagent-alongside-manual-audits))
- **Trail of Bits "AI-native pipeline"** (blog March 2026) describes internal multi-agent reasoning + adversarial stages — but it's a consulting workflow, not on-chain, not staked, not a reputation primitive. ([source](https://blog.trailofbits.com/2026/03/31/how-we-made-trail-of-bits-ai-native-so-far/))
- **Cantina Apex, Sherlock AI, Immunefi AI** — all marketing as "AI security engineer" tooling, none ship TEE attestation or on-chain reputation.

Hunt's structural difference: **verifiable-execution substrate** (every finding carries an on-chain digest the contract `ecrecover`s, v1 is operator-relayed over real Sealed Inference, v2 replaces the relay with a TEE-attestation-verifying signer set — see Q2) + **on-chain reputation per CWE class** (not single fungible score). Centralized auditors structurally cannot match without rebuilding on a TEE+chain substrate — that's an 18-month migration for them. Documented in detail at `doc/FUTURE.md`.

---

## Q2 — `teeSigner` and `verifier` are single operator-held keys. Isn't this centralized?

**Yes — v1 is centralized. We're explicit about it; the public README + SUBMISSION + AI_USAGE all say so. v2 decentralises both.**

Honest scope of v1:
- `teeSigner` (`0xc9c0754f…`) signs sample fingerprints and finding attestation digests. The hunter daemon calls real 0G Sealed Inference, receives a `ZG-Res-Key`, runs `broker.inference.processResponse` off-chain — and then the operator-held key signs a digest containing `modelDigest` plus a `teeTimestamp` set to `block.timestamp` (`scripts/hunter.js:355`, not the TEE-issued timestamp). The off-chain validation is not bound to the on-chain signature in v1.
- `verifier` (`0x3a40CA05…`) signs GitHub Credentials at hunter-mint time, enforcing the ≥730d account + ≥20 merged PRs + ≥10 reviews bar.

Both are operator-held in v1 because shipping a TEE-attestation-verifying relay set + an EAS multi-issuer credential schema would have eaten the entire hackathon window. We chose to ship the *cryptographic settlement layer* correctly — the digest structure, the `ecrecover` gate, the race-window check, the per-CWE rep math — and document the path away from operator-relayed v1.

v2 plan (`doc/FUTURE.md`):
- **TEE-attestation-verifying relay set** — k-of-n signers, each independently verifies 0G's per-response `ZG-Res-Key` attestation against the model that produced the answer, signs only if k of n agree. The contract gates `submitFinding` on threshold-multisig instead of single ecrecover.
- **EAS multi-issuer verifier** — schema `hunt:github-credential`, any registered verifier can attest, on-chain allowlist governed by DAO or token vote.

Neither is hand-waving — both are concrete schema designs with allocation in the v2 implementation plan.

---

## Q3 — AI exploit-generation jumped 2% → 55.88% in one year per Anthropic + OpenAI red-team papers. Won't "AI auditor" commoditize in 12 months?

**Yes, the capability commoditizes — which is why our moat lives below the AI layer.**

Sources:
- Anthropic red team smart-contract benchmark ([red.anthropic.com](https://red.anthropic.com/2025/smart-contracts/))
- OpenAI EVMBench ([cdn.openai.com/evmbench/evmbench.pdf](https://cdn.openai.com/evmbench/evmbench.pdf))

When AI exploit-gen hits ~human parity (~mid-2027 trajectory), the survivors in audit tooling will be the ones that owned the verification + reputation + economic-mechanism layer — not "we have AI." Hunt sits in that layer:
- Verification: every finding cryptographically replayable from on-chain state
- Reputation: per-CWE compounds across protocols, year-1 → year-3 widening moat
- Economic mechanism: stake-backed adversarial falsification (v2) makes false positives expensive at the protocol level

"We have AI" was the moat for 2024. "We have *verifiable* AI with *staked reputation*" is the moat for 2027.

---

## Q4 — Three hunters in the demo are all owned by the same operator wallet. Isn't the "adversarial market" theatre?

**Yes for the May 2026 hackathon submission, no in the architecture.**

Honest state:
- All three demo personas (`reentrancy-specialist`, `oracle-specialist`, `access-control-specialist`) are owned by the same operator (Kin v2's `ts-senior`, `rust-senior`, `sol-senior` wallets — they predate Hunt by 2 days). Documented in `AI_USAGE.md`.
- The contract has no operator-affinity logic — each hunter is a uint256 token with its own per-CWE rep, samples, fingerprint, credential. Different operators running them changes *nothing* in the protocol semantics.
- The reason for shipping with synthetic operators: deadline. Onboarding external researchers + persuading them to spin up a hunter daemon is a one-week minimum; we had 5 days.

Concretely addressed:
- `doc/OPERATOR_ONBOARDING.md` is the (≤30 min) flow for an external researcher to spin up a hunter on their own wallet. Real adoption is a function of onboarding friction, which we've reduced to as low as the centralized v1 permits.
- `doc/OUTREACH_TEMPLATES.md` contains five pre-written DMs targeting Code4rena top wardens, Sherlock senior watsons, boutique-firm auditors, and crypto-Twitter security personalities. $1.5k per operator + recording-credit. Sending the DMs is user-action; the templates are production-ready.
- The demo recording (if external operators come online before the deadline) will show *real* multi-operator races. If not, we're transparent about it in the recording itself.

**On what we explicitly did NOT do:** we considered minting a fourth hunter from a separately-generated EOA we'd also control, to give bounties.html and hunters.html an additional `owner` address. We chose not to. The audit-finding-#6 gap is not about address diversity (the three existing hunters are already owned by three distinct addresses — `0xa5B38680…`, `0x4bfc888D…`, `0xeC32B630…` — they just predate Hunt as Kin v2 demo wallets and remain operator-controlled). The gap is about **private-key custody**: even three on-chain-distinct addresses controlled by the same person is the same operator. A fourth wallet we generate and key-custody is the same operator with one more pubkey, not a real second participant. Mint-theater would have made the appearance look better and the substance unchanged. The honest fix is external operators — the structural ask that only the user can fulfil via the prepared DMs. The architecture is operator-agnostic; the gap is purely social.

---

## Q5 — `demo/staged-bounty/Vault.sol` is fictional code. Why not audit a real protocol?

**We did both.** The staged `Vault.sol` is a clean, deterministic settlement target — the bug is known, so the demo's "race → settle → verify" arc is reproducible every run. But Hunt also ran the real test: **bounty #9 audited the verbatim `StableOracleWBTC.sol` from USSD**, a stablecoin protocol audited by Sherlock in May 2023. Run blind with zero hints, the oracle-specialist surfaced a confirmed **HIGH-severity** finding ([Sherlock judging issue #817](https://github.com/sherlock-audit/2023-05-USSD-judging/issues/817), "Wrong Oracle feed addresses"). Full write-up + on-chain trail: [`audits/ussd/README.md`](../audits/ussd/README.md).

The staged Vault.sol's oracle-staleness pattern is itself sourced from a public, judge-confirmed finding — USSD's Sherlock contest, [judging issue #31](https://github.com/sherlock-audit/2023-05-USSD-judging/issues/31) ("Calls to Oracles don't check for stale prices", MEDIUM). Provenance is documented in `demo/staged-bounty/README.md`.

What Hunt did **not** do: chase an *undisclosed* live vulnerability. Those have disclosure timelines that don't fit a hackathon window, and "found a previously-unknown bug" is a v2 claim we are explicitly not making. v2's real test of product-market fit is bounties posted by real protocols.

---

## Q6 — Bounty #0 ran on `lib/audit-fallback.js` (local heuristic) instead of real Sealed Inference. Doesn't that contradict the "AI auditor" claim?

**Bounty #0 documented a real bug in our integration, not in 0G's primitive. Bounties #2 and #3 are post-fix re-races on real Sealed Inference.**

Root cause (documented in `AI_USAGE.md` "Sealed Inference: the real root cause"):
- `zai-org/GLM-5-FP8` is a reasoning model. With `max_tokens=1500` (our original default), the model spent the entire budget on internal `reasoning_tokens` before emitting any content. Returned `finish_reason: length` with 0 content tokens. Our daemon interpreted "empty content" as "endpoint failure" and fell back to the heuristic path.
- Fix: one-line change in `lib/review.js` and `lib/fingerprint.js` to bump default `max_tokens` to 5000.

Why bounty #0 is preserved on-chain instead of being hidden:
- The fallback path also activates on genuine transient broker failures (observed in bounty #3 for two of three hunters under concurrent load). The path is documented architecture, not embarrassed-after-the-fact.
- The fallback path stamps a *distinct* on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` so anyone reading the chain can distinguish Sealed Inference findings from heuristic findings via a single `bytes32` comparison.

The headline race is **bounty #3**, which uses real Sealed Inference end-to-end with `modelDigest = keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`. Strict-mode `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 with `digest match ✓ / signer == teeSigner ✓ / teeTimestamp window ✓`.

---

## Q7 — What's the business model? Who pays whom?

**Two revenue surfaces in v1, two more in v2.**

v1 (live today):
1. **Protocols pay bounties** to incentivize hunters to find bugs pre-deploy. Currently 0.05–0.5 OG per bounty for the demo phase; production target $1k–$100k per bounty (matching Code4rena / Immunefi pricing).
2. **Hunters earn** the bounty payout on winning + per-CWE rep that compounds. No subscription fees, no listing fees in v1.

v2 (post-hackathon):
3. **Guardian subscription** — protocols pay recurring fees to have AI hunter agents continuously monitor their deployed contracts. Targets the OZ Defender migration window (Defender sunsetting July 1, 2026).
4. **Insurance underwriting API** — Nexus Mutual / Sherlock-the-insurer / Risk Harbor pay query fees to consume Hunt's per-CWE reputation graph as a pricing input for coverage.

v3 (12+ months):
5. **Knowledge graph licensing** — protocols pay to query the cross-protocol bug-pattern graph for similarity-matched attack vectors.

---

## Q8 — The v2 falsifier sounds clean in `doc/FUTURE.md` but the contract isn't deployed. What happens if it has bugs?

**Yes — v2 falsifier is unbuilt, intentionally. v1 ships the verifiable substrate; v2 is the next 6 weeks.**

We deliberately chose to NOT ship v2 in the hackathon submission for two reasons:
1. **Risk to v1 strict-verify**: any change to `Hunt.sol` invalidates the bounty #3 strict-mode proof. The load-bearing claim is the on-chain attestation chain we have today, not the v2 falsifier we'd deploy in a rush. New contract introduces new attack surface; building it in 5 days = bug-shipping risk.
2. **Settlement-game-theory rigour**: stake-backed adversarial falsification has non-trivial design choices (slashing economics, time windows, dispute resolution if both find and falsifier are TEE-attested). Half-baked falsifier in 5 days is worse than v1 + clearly-scoped v2 in `doc/FUTURE.md`.

What we did instead: `doc/FUTURE.md` gives the pillar-by-pillar v2 design with primary-source citations to every named competitor it differentiates against. Contract delta is estimated (~300 LOC, ~25 new tests, ~2 weeks of work). New contract `HuntV2.sol` will deploy alongside v1 — bounty #3 strict-verify keeps working forever.

---

## Q9 — How does Hunt avoid being captured by a single dominant hunter who just out-runs everyone?

**Per-CWE specialization + brief narrowing + sample fingerprint = no single hunter dominates all classes.**

Three structural prevents:
1. **Brief narrowing at inference time** — `scripts/hunter.js` narrows the inference brief to `bounty.inScopeCwes ∩ hunter.specialty`. A reentrancy specialist *cannot* submit an oracle finding even on a multi-scope bounty; the brief never names oracles for them.
2. **Per-CWE rep, not single rep** — `ClassRep[hunterId][cweClass]`. A hunter with great oracle rep gets no benefit on reentrancy bounties from that score. Specialists thrive; generalists lose.
3. **Sample fingerprint quality gate** — `MIN_FINDING_QUALITY_BPS` floor on self-eval at submission time. Bad findings are silently dropped before they hit the chain.

v2 adds adversarial falsification, which makes spam submissions actively costly (slashed stake). Then even a dominant hunter gets shaved by falsifiers if they slip on quality.

---

## Q10 — What if 0G shuts down or pivots away from Sealed Inference?

**v1 has 0G-substrate dependency, v2 plan reduces it.**

Realistic dependency surface today:
- 0G Chain → contract settlement (replaceable with any EVM chain)
- 0G Storage → encrypted blob storage (replaceable with IPFS / Arweave / Filecoin, at the cost of attestation chain integration)
- 0G Sealed Inference → the *load-bearing* dependency. Replaceable in principle with Phala, iExec, Marlin, or Oasis Sapphire TEE inference — but each requires re-engineering the attestation digest format and the `ZG-Res-Key` verification logic.

v2 plan's `teeSigner` relay set abstracts the TEE-vendor dependency: the relay verifies attestations from any supported TEE provider, signs the canonical digest the contract recovers. Hunt v2 is multi-cloud-TEE by design.

If 0G shuts down: v1 contract is bricked for new bounties (no Sealed Inference). All historical attestations remain on-chain and remain cryptographically verifiable from the on-chain `modelDigest` + signature. Past audits don't disappear.

---

## Q11 — The deployed contract has two known bugs in the per-CWE rep math. Why aren't they patched on mainnet?

**Both are patched in-tree at HEAD (v1.1) with 4 new tests; we deliberately did NOT redeploy because the bounty #3 strict-verify proof is anchored to the deployed address `0xD4Fe5127…` and redeploying in 3 days would break the load-bearing demo. Honest disclosure, in-tree fix, v1.1 deploys alongside v2.**

The two bugs (both flagged in our own pre-submission audit, `2026-05-13`):

1. **`ClassRep.submissions` only ticked on the winner.** `submitFinding` did not increment the per-class submission counter; only `settleBounty` did, and only for the winning hunter. Net effect: the on-chain rep ledger could not express "hunter tried + lost" — every entry showed `submissions == wins`, which makes the per-CWE precision metric the protocol claims to produce identically 1.0, and makes the empirical-specialist thesis untestable on-chain.
2. **`totalEarnedWei` was `uint64`.** Wraps at `~18.44 OG` lifetime earnings in both `Hunter` and `ClassRep`. Fine for the 0.05 OG demo bounties; embarrassing for the production market the pitch describes.

What the in-tree fix does (`contracts/Hunt.sol` at HEAD):

- Move `ClassRep.submissions++` into `submitFinding`, alongside the existing scope + self-eval + ecrecover checks; remove it from `settleBounty` so winners aren't double-counted. Add `ClassRepUpdated(hunterId, cweClass, wins, submissions)` emit at submit-time so observers see live precision evolution per CWE.
- Widen `Hunter.totalEarnedWei` + `ClassRep.totalEarnedWei` from `uint64` to `uint256`. Remove the `uint64(amount)` truncation casts in `settleBounty`.

What the in-tree fix doesn't do: it doesn't redeploy. The deployed mainnet contract at `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` remains v1.0 with the original semantics. Bounty #3's strict-mode verifier (`scripts/verify_bounty.js 3 --model-digest 0x<digest>`) is anchored to that address; redeploying invalidates that proof, and rebuilding a fresh mainnet narrative in the last 72 hours of the hackathon would be reckless. v1.1 ships alongside v2's TEE-attestation-verifying signer set (`doc/FUTURE.md`); both deploy in the post-hackathon 8-week window.

What judges can verify:

- Diff: the v1.1 changes are concentrated in `contracts/Hunt.sol` and `test/Hunt.test.js` — search for the comment `v1.1` in either file.
- Tests: 4 new tests cover (a) `submissions++` on submit alone, (b) accumulation across multiple submissions same CWE, (c) losing hunter retains `submissions == 1` after winner is settled, (d) `totalEarnedWei` correctly stores a 20-ether payout that would have wrapped under `uint64`. `npm test` → 208 passing, 0 failing.
- Live state: `getClassRep(hunterId, cweClass)` on the deployed `0xD4Fe5127…` still returns the v1.0-counted values. Bounty #3 strict-verify still exits 0 against that address.

---

## Q12 — Three non-crypto verticals (insurance + benefits + medical) are positioned in the submission. Isn't that scope creep?

**No. They're proof-of-generalization, not a competing v1 claim. The depth of 0G integration on the smart-contract substrate is unchanged; the new verticals reuse that substrate without diluting it. Three counterparties, one primitive.**

The three verticals are deliberately distinct counterparties, not three flavors of the same thing:

- **Insurance** defends citizens against *private-payor* opaque AI (UnitedHealth's nH Predict, Cigna's PXDX).
- **Benefits** defends elderly, retired, and disabled citizens against *public-payor* opaque adjudication (SSA's 330K-case backlog, 274-day wait, structural representation gap).
- **Medical** gives citizens *better* verifiable AI reads of their own records (cooperative, not adversarial — surfaces questions for the physician, scope-locked to FDA Jan 2026 CDS enforcement-discretion).

Together they cover the full citizen-facing AI accountability landscape: opaque denial by private corps, opaque denial by government, and proactive verifiable second-opinion on private data. That's a coherent map, not scope salad.

The strict line: anything that *modifies* v1's on-chain story is risky 3 days before submission. Anything that *reuses* v1's exact primitives in a documented v2 form is the opposite — it proves the substrate is general-purpose rather than narrow.

What the new verticals reuse, verbatim:

- The `findingDigest` keccak-encoding from `lib/credential.js` — same ABI tuple, same fields, same on-chain `ecrecover` gate. Verifiable via `scripts/insurance_specialist_brief.js` and `scripts/medical_specialist_brief.js`, which call the v1 primitive against new domain inputs and produce real attestation digests offline.
- The per-domain canonical-class hashing (`keccak256(utf8(name))`) used by `lib/cwe.js` for CWEs. The new verticals introduce a parallel registry of class strings (denial-defect classes for insurance, reading classes for medical) hashed by the identical primitive.
- The encrypted-bounty-storage pattern (`codeRoot`/`recordRoot`/`denialRoot` on 0G Storage), the race-window enforcement, the settle-window enforcement, the per-class `ClassRep` math.

What changes on-chain in v2 is small: a new bounty-domain enum (`SMART_CONTRACT`, `INSURANCE_APPEAL`, `MEDICAL_READING`) plus a per-domain canonical-class registry behind it. No new escrow logic, no new attestation logic, no new reputation logic.

The v1 smart-contract narrative is still the load-bearing demo. The new verticals' purpose is to show the primitive's reach — which is the literal substance of Track 3's "Agentic Economy" framing. If Hunt's machinery only worked for one vertical, judges would correctly read that as a narrow product. Showing two non-trivial verticals share the substrate is what generalises the claim.

---

## Q13 — How do I know the new-vertical positioning isn't just a manifesto? Where's the working substrate?

**Five places, all runnable today, plus an empirically-validated live capture against 0G's mainnet Sealed Inference:**

0. **[`audits/insurance/live_inference_capture.md`](../audits/insurance/live_inference_capture.md)** — captured 2026-05-13, a real call against `zai-org/GLM-5-FP8` through 0G's public Sealed Inference broker. Attestation ID `d86b8797-b757-4b9d-a396-8e8d46c4f994` validated by `broker.inference.processResponse` returning `true`. The un-fine-tuned model returned strict JSON with **real C.F.R. citations** (42 C.F.R. § 422.101(b), Medicare Benefit Policy Manual Ch. 8 §§ 30.1–30.3, 29 C.F.R. § 2560.503-1(g)(1)/(h)(2)(iii)), caught the load-bearing Lokken-pattern algorithmic-substitution defect as the *critical* finding, declined to fabricate two out-of-scope defect classes, and self-rated `precisionBps: 7500` with explicit honest rationale acknowledging it did not independently verify one cited LCD number. **This is the working substrate, empirically validated against real 0G mainnet primitives.**



1. **`node scripts/insurance_specialist_brief.js`** — constructs the v2 insurance-specialist system prompt, builds the structured brief over `audits/insurance/sample_denial.txt`, hashes the six denial-defect classes via the same `keccak256(utf8(name))` primitive as `lib/cwe.js`, computes a real attestation digest using the v1 `findingDigest` ABI encoding, and writes the full structured output to `audits/insurance/demo_output.json`. The digest construction is byte-for-byte identical to what `Hunt.submitFinding` would `ecrecover` if the v2 vertical were live.

2. **`node scripts/benefits_specialist_brief.js`** — the SSDI/SSI/senior-benefits equivalent. Hashes seven defect classes mapped to the SSA's own sequential-evaluation regulations (20 C.F.R. § 404.1520 et seq.). System prompt explicitly forbids hallucinated C.F.R./SSR/POMS cites and requires the self-eval rationale to confirm scope discipline (no outcome guarantee, no representation claim). Writes `audits/benefits/demo_output.json`. Consumes a synthetic SSDI denial modeled on the SSA-1561 template with seven annotated defect patterns.

3. **`node scripts/medical_specialist_brief.js`** — the medical equivalent. The system prompt is **locked to "questions for the treating physician" + "second-opinion flags"** by the output schema itself, and the self-eval rationale must explicitly confirm scope discipline (no diagnosis / no treatment recommendation). Hashes six reading classes calibrated against published per-specialty disagreement rates (ASCO 2021, PMC PMC5265198). Writes `audits/medical/demo_output.json`.

4. **The three READMEs** (`audits/insurance/README.md`, `audits/benefits/README.md`, `audits/medical/README.md`) — each contains a **runnable data-flow ASCII diagram** showing where 0G Storage, 0G Sealed Inference, and 0G Chain plug into the new vertical exactly as they plug into v1. Each contains an honest v1-privacy caveat citing the shared-hunter-network-key gap and the per-hunter ECDH envelope that closes it in v2. Each has a public-data validation plan (CMS QIO external-review outcomes for insurance; SSA POMS/SSR + ALJ disposition data for benefits; MIMIC-CXR / TCGA / NIH ChestX-ray14 / CAMELYON for medical).

What is **not** claimed for the May 2026 submission:

- No new specialists are minted on-chain. The hunter mints stay at the original three (`reentrancy`, `oracle`, `access-control`) so the live `getHunter` calls return v1-consistent data.
- No new bounties fire on the new verticals. Bounty #3's strict-verify exit 0 remains the load-bearing cryptographic proof.
- No claim that the v1 0G Sealed Inference model (`zai-org/GLM-5-FP8`) produces useful output on medical or legal text without retuning. The READMEs are explicit that on-chain firing waits for fine-tuning + validation against public corpora (weeks 8–12 post-hackathon for insurance; weeks 12–20 for medical, plus CLIA-certified human-in-the-loop partnership).

The bar this submission clears: smart-contract auditing is the load-bearing v1 vertical with a settled mainnet artifact (bounty #3) cryptographically verifiable today, plus two documented v2 verticals with runnable demonstration scripts that exercise the same on-chain primitive against new domain inputs.
