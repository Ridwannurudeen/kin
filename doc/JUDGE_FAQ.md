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

Hunt's structural difference: **verifiable execution** (TEE attestation as anti-cheat) + **on-chain reputation per CWE class** (not single fungible score). Centralized auditors structurally cannot match without rebuilding on a TEE+chain substrate — that's an 18-month migration for them. Documented in detail at `doc/FUTURE.md`.

---

## Q2 — `teeSigner` and `verifier` are single operator-held keys. Isn't this centralized?

**Yes — v1 is centralized. We're explicit about it; the public README + SUBMISSION + AI_USAGE all say so. v2 decentralises both.**

Honest scope of v1:
- `teeSigner` (`0xc9c0754f…`) signs sample fingerprints and finding attestation digests. Off-chain relay that derives the digest from 0G's `ZG-Res-Key` attestation chain and signs.
- `verifier` (`0x3a40CA05…`) signs GitHub Credentials at hunter-mint time, enforcing the ≥730d account + ≥20 merged PRs + ≥10 reviews bar.

Both are operator-held in v1 because shipping a TEE-attestation-verifying relay set + an EAS multi-issuer credential schema would have eaten the entire hackathon window. We chose to ship the *cryptographic settlement layer* correctly and document the path away from centralised v1.

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
- The demo recording (if external operators come online before the deadline) will show *real* multi-operator races. If not, we're transparent about it in the recording itself.

---

## Q5 — `demo/staged-bounty/Vault.sol` is fictional code. Why not audit a real protocol?

**The CWE pattern is real and cited; the contract is staged to give us a clean settlement target.**

The Vault.sol oracle-staleness pattern (read `updatedAt` from `latestRoundData`, only compare against `block.timestamp` inside the admin-only `setPrice()`, all user paths bypass the freshness gate) is sourced from public audit reports:
- **Code4rena Prisma Finance, March 2024** — same pattern, classified as high-severity finding
- **Sherlock Angle Protocol, 2024** — same pattern in a different protocol's CDP logic

Provenance is documented in `demo/staged-bounty/README.md`.

We didn't audit a live deployed protocol for the hackathon because:
- Real undisclosed bugs have disclosure timelines that don't fit a 5-day window
- Re-staging the published patterns gives us a clean "demonstration → settlement → verification" arc without dragging anyone else's protocol into our demo

v2 plan: real bounties posted by real protocols are the test of product-market fit. We're not claiming Hunt has that yet.

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
