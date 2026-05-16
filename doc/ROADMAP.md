# Hunt — Roadmap

Structured plan for v1.1, v2, and beyond. Each item: **what** it changes, **why** it matters, **what gates it** (contract redeploy, partnership, etc.), and **status**.

This document is intentionally scoped to Hunt's own architecture. It does not compare Hunt to other products.

---

## v1.1 — frontend & sidecar improvements (no Hunt.sol redeploy required)

These items ship without touching the deployed Hunt contract at `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`. Most are deploy-as-you-build.

### ✅ Shipped (live today)
- **Notarize-any-file end-user MVP.** `public/notary.html` accepts text paste OR file upload (any binary). Browser hashes locally; file never leaves the user's machine. `notary.attest()` records the keccak hash on-chain.
- **CWE registry expanded to 4 domains.** Smart-contract (12), insurance (6), medical reading (6), SSDI benefits (7). `lib/cwe.js`.
- **First non-Solidity bounties on-chain.** Bounties #23 / #24 / #25 demonstrate the substrate works for insurance / medical / benefits class hashes.
- **SSRF + DNS-rebinding defense in `lib/inference.js`.** Public-IP enforcement, HTTPS-only, hostname-preserving SNI, bounded inference timeout.
- **XSS + input-validation hardening across `public/proof.html`, `mint-hunter.html`, `post-bounty.html`.** Integer validation on bounty-id query params; escapeHtml on user-visible substitutions.

### Planned (v1.1, no contract change)

**TEE-attested document fingerprint for Notary (Option C — opt-in only).**
- **What:** Optional user-toggled flow on `/notary.html`: encrypt the uploaded document, upload the ciphertext to 0G Storage, call 0G Sealed Inference (`zai-org/GLM-5-FP8`) to produce a structural fingerprint of the content (length, document-type classifier, sectional structure — NOT advice, NOT diagnosis, NOT appeal recommendations). The `ZG-Res-Key` attestation + sealed-input root get written into the existing `sealedInputRoot` + `modelDigest` fields of `notary.attest()` (the contract already supports both).
- **Why:** Stronger chain-of-custody. Today the receipt proves "this hash was committed at this time." With this, the receipt also proves "a sealed-inference model inside a TEE saw this exact document at this time." Useful for: appeal proceedings (proving original document existed before any AI review), legal-evidence timestamping, due-diligence records.
- **Hard constraints:** No advice, no diagnosis, no appeal-grounds output. The fingerprint is structural metadata only. Explicit consent UI required before the AI call ("an AI model inside a sealed TEE will read your document — confirm").
- **Cost:** Real OG per submission (Sealed Inference broker cost; Hunt absorbs). 30–120s latency. ~1 day of focused engineering.
- **Status:** Designed; deferred until after the 0G APAC submission window so the demo discipline stays clean.

**Notarize batch + receipt-sharing.**
- Batch-notarize multiple files into one tx (cheaper per file).
- Shareable receipt URL — `/notary.html?attestId=N` deep-link.
- Status: planned, low priority.

**Wallet-free read paths everywhere.**
- Every page that currently requires wallet for *reading* should fall back to a no-wallet view (currently true for `/verify.html`, `/proof.html`, `/status.html`, `/notary.html` lookup panel; partially true for others).
- Status: small audit pass needed.

---

## v1.1 — Hunt.sol redeploy (single redeploy ships these together)

Source already has these validations; deployed bytecode does not. They ship as a coherent v1.1 contract at a new address. Tests pin both deployed-bytecode behavior (today) and source-side hardening (post-redeploy).

- **`MAX_SCOPE_CWES = 32`** — caps the size of `inScopeCwes[]` on `postBounty()`. Prevents DoS via oversized scope arrays.
- **`MAX_SELF_EVAL_BPS = 10000`** — caps hunter self-evaluation bps values, prevents malformed findings bypassing quality gates.
- **Empty-class guards** — rejects `bytes32(0)` cweClass on `submitFinding()` and on `inScopeCwes[i]` entries.
- **`totalEarnedWei` widening** — `uint64 → uint256` in the `Hunter` and `ClassRep` structs.
- **`ClassRep.submissions++` at submit-time, not settle-time** — winners aren't double-counted; observers see live precision evolution per CWE.

**Gating:** v1.1 redeploys to a NEW contract address. The current `0xD4Fe5127…0d68C` stays live as the v1.0 anchor for bounty #3's strict-mode verifier (and every other historical proof). v1.1 deploys alongside v1.0; bounty #3 strict-verify keeps working forever.

**Timing:** post-hackathon-submission window. Redeploying during the submission window would invalidate the headline race's cryptographic chain.

---

## v2 — architecture changes (separate contract `HuntV2.sol`)

Larger structural upgrades. Each one removes a v1 trust assumption explicitly disclaimed in the README's Honesty notes.

### TEE-attestation-verifying relay set
- **What:** Replaces the operator-held `teeSigner` (one key today) with a k-of-n signer set. Each signer independently verifies 0G's per-response `ZG-Res-Key` attestation against the model that produced the answer, then signs only if it validates. The contract gates `submitFinding` on threshold-multisig instead of single `ecrecover`.
- **Why:** Closes the v1 honesty gap — today the chain witnesses the operator's relay, not the attestation's cryptographic binding to the inference output. v2 makes the bind chain-enforced.
- **Gating:** New contract; relay-set operator recruitment; threshold-multisig design hardening (slashing economics, dispute resolution).

### Per-hunter ECDH envelopes on `Bounty`
- **What:** Replaces the shared symmetric hunter-network key with per-hunter ECDH-encrypted envelopes inside the on-chain `Bounty` struct. Each registered hunter receives a separately-encrypted code blob.
- **Why:** Closes the v1 "sealed-from-third-parties, not sealed-from-the-specialist" gap — today, a key leak from any one hunter exposes every posted bounty's code to that hunter. v2 bounds leakage to the leaked-hunter alone.
- **Gating:** Contract change (Bounty struct expansion); per-hunter pubkey registration flow.

### Multi-issuer GitHub credential schema via EAS
- **What:** Replaces the single operator-held `verifier` (one key today) with a multi-issuer credential schema on the Ethereum Attestation Service.
- **Why:** Today, hunter minting trusts one centralised key to vouch for GitHub-activity credentials. EAS lets multiple independent verifiers issue compatible credentials.
- **Gating:** EAS schema design; verifier recruitment; contract migration of `mintHunter`'s credential verification.

### N-daemon production race orchestration
- **What:** Replaces v1's `scripts/run_race.js` (one process spawns 3 hunters in parallel under one broker — a demo orchestration) with N independent daemons across N hosts, each with their own 0G Compute ledger.
- **Why:** Production-grade race: no single broker bottleneck, no shared-process failure mode, no operator-controlled co-ordination.
- **Gating:** Daemon-runtime hardening (lock files, watchdog, broker-ledger funding flows); operator onboarding documentation.

### Stake-backed adversarial falsification
- **What:** Adds a *falsifier* role: a second class of agent that stakes OG to challenge a finding as bogus before settle. If a challenge succeeds (the finding fails replay), the finder loses payout + reputation; if it fails, the falsifier loses stake.
- **Why:** Today, a finding's correctness is judged subjectively by the bounty poster. Adversarial falsification adds an economic incentive for finders to submit only correct findings, and for falsifiers to police the network.
- **Gating:** Contract change (new role + state machine + slashing); economic-parameter design (stake size, time windows, dispute resolution if both find and falsifier are TEE-attested); non-trivial game-theory work.
- **Risk:** Half-baked falsifier ships worse than v1 + a clearly-scoped v2 plan. Estimated ~300 LOC contract delta, ~25 new tests, ~2 weeks of focused work.

---

## v2 — partnership-gated end-user verticals

The architecture-change items above are pure engineering. These items are **deliberately blocked on credentialed human-in-the-loop partnerships** — see the discipline-signal paragraph in README. Hunt does not mint these specialist hunters until partners are in place. The infra readiness is the proof; partnerships are the gate.

### Insurance specialist hunter — paired with claims-pro partner
- **Domain classes (live in `lib/cwe.js`):** medical-necessity-misapplication, coding-cpt-error, prior-auth-overreach, network-adequacy-violation, erisa-procedural-defect, state-external-review-misclassification.
- **Partner needed:** A licensed claims professional, NOSSCR-equivalent attorney, or independent review organization willing to co-sign specialist hunter mints, validate findings, and own the user-facing advice claim.
- **Status:** Infra ready (bounty #23 on-chain), specialist hunter not minted.

### SSDI specialist hunter — paired with NOSSCR-credentialed attorney
- **Domain classes:** medical-listing-misapplication, residual-functional-capacity-error, vocational-expert-misclassification, duration-requirement-misapplication, substantial-gainful-activity-miscalculation, combined-impairments-omission, treating-physician-opinion-weight.
- **Partner needed:** NOSSCR-credentialed attorney or accredited SSDI representative.
- **Status:** Infra ready (bounty #25 on-chain), specialist hunter not minted.

### Medical reading specialist hunter — paired with board-certified MD
- **Domain classes:** pathology-borderline-interpretation, radiology-second-read-discrepancy, oncology-staging-revision, cardiology-ecg-echo-revision, dermatology-pigmented-lesion-revision, hematology-flow-cytometry-discordance.
- **Partner needed:** Board-certified radiologist, pathologist, or oncologist for the relevant subspecialty.
- **Status:** Infra ready (bounty #24 on-chain), specialist hunter not minted.

---

## v3 — exploratory (no committed timeline)

Items past the v2 horizon, kept here so the trajectory is visible:

- **Cross-protocol bug-pattern knowledge graph** — every Hunt finding contributes citations to a public, on-chain pattern graph. Future bounties can cite-and-reuse the same pattern.
- **Capability mesh** — autonomous-agent-network framings where hunter specialties can compose (a reentrancy specialist + an oracle specialist co-author a finding that requires both).
- **AI arbitration of disputes** — replace the human-bounty-poster settle step with a multi-AI arbitration contract (each arbitrator inside its own TEE; majority vote settles).

---

## Status check — what's anchored where

| Layer | Anchor | What v2 changes |
|---|---|---|
| Contract address | `0xD4Fe5127…0d68C` (v1.0) | `HuntV2.sol` deploys at a NEW address. v1.0 stays live as the historical anchor for every existing race + verifier. |
| Strict-mode verifier proofs | Bounty #3 + tx hashes pinned in `README.md`, `doc/SUBMISSION.md`, `doc/DEMO_VIDEO_SCRIPT.md` | All v1 proofs keep working forever — `scripts/verify_bounty.js` reads v1.0 contract regardless of v2 deployment. |
| Operator keys | `teeSigner = 0xc9c0…cCa3f`, `verifier = 0x3a40…1759E` | v2 retires both into multi-signer constructs. v1 keys keep signing for v1 bounties. |
| Sealed-input root | `bytes32(0)` (unused in v1) | v2 + the new Notary fingerprint feature populate this with real 0G Storage roots. |

---

## How this roadmap stays honest

Two rules:

1. **Items move OUT of the roadmap only when shipped** (move to "Shipped" with a date) **or when explicitly dropped** (move to a "Not Pursued" section with a one-line reason). No silent drift.
2. **Partnership-gated items stay gated.** The discipline signal is load-bearing — autonomous AI specialist review of medical / insurance / SSDI cases without credentialed humans-in-the-loop is the *wrong* product, not just an unbuilt one. Specialist hunter mints require the partnership signature first; the contract enforces the credential check.
