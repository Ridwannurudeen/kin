# AI Usage Attribution

Hunt was built solo with substantial AI pair-programming assistance from Claude (Anthropic) over the May 10–16 2026 hackathon window. Hunt is a 2026-05-11 pivot from the predecessor **Kin v2** on the same codebase — same credential / fingerprint / TEE-attestation plumbing, refocused from "code review marketplace" to "sealed bug-bounty network for smart contracts" (a sharper fit for 0G's TEE + reputation primitives). The Kin v1 → Kin v2 history below covers the deeper architectural pivot that landed the design Hunt now uses. Hunt-specific additions are called out in **"Hunt — what AI added on top of Kin v2"** further down.

## v1 → v2 — what changed and why (predecessor Kin history)

The first 24 hours produced a v1 demo end-to-end on Aristotle mainnet (skill mint, job post, sealed inference, on-chain settle). Re-reading the code with fresh eyes, several claims didn't hold up:

- "Sealed key never leaves your wallet" was false in practice — the operator decrypted samples + brief locally before passing plaintext into Sealed Inference.
- TEE attestation was decorative — `submitWork` accepted any `bytes32` with zero verification.
- "Earns while you sleep" was a manual script, not a daemon.
- Quality was unenforced at every layer — free-form skill strings, free-form briefs, no fingerprinting, no retrieval, no output self-check, single-axis rating.

The pivot to **v2 — narrow vertical (code review only), deep on every quality gate** — was made on the morning of May 11 after pushing the v1 design against the question "what's the strongest version of this that solves a 0G problem?" Capability-mesh / autonomous-agent-network framings were considered and pushed to v3 ([`doc/FUTURE.md`](doc/FUTURE.md)) because depth-not-breadth was the right hackathon call.

## Where AI was used

**Architecture + product design**
- v2 framing locked through ~6 rounds of pressure-testing: "is this idea good enough" + "what's the killer wedge where TEE+INFT is genuinely necessary, not nice-to-have." Settled on code-review-as-vertical because the output is judgeable on screen, real expert samples exist publicly, and the B2B path is the most obvious of any vertical we considered.
- Full v2 spec ([`doc/V2_SPEC.md`](doc/V2_SPEC.md)) written before any code was touched. Ten quality gates enumerated. Ten open questions resolved with explicit user sign-off.
- The honest privacy model (V2_SPEC §6) was rewritten mid-build when it became clear that 0G's Sealed Inference doesn't run user decryption code — only its LLM. The original "operator never sees plaintext" claim was retracted and replaced with the accurate model: protected from third parties, not from the skill owner running the LLM call.

**Code**
- `contracts/Kin.sol` — Claude-authored v2 contract. Adds verifier-signed Credential verification, TEE-signed SampleFingerprint verification, structured StructuredBrief schema, 4-axis PerDimRating, sybil-resistant client gate with three paths (stake / verify-GitHub / 7-day wait), on-chain attestation signature verification via EIP-191 ecrecover, credential reuse protection.
- `lib/credential.js` — shared signing primitives (Credential, Fingerprint, Attestation digests) used by tests, verifier service, and agent daemon.
- `lib/ecdh.js` — secp256k1 ECIES for encrypt-to-wallet-pubkey (HKDF-SHA256 + AES-256-GCM, 33+12+16 byte header).
- `lib/pubkey.js` — recover wallet pubkey from on-chain tx signature (`SigningKey.recoverPublicKey` over the unsigned tx hash).
- `lib/embedding.js`, `lib/retrieval.js` — 256-dim feature-hashed L2-normalized embeddings + top-K cosine ranking.
- `lib/fingerprint.js`, `lib/review.js` — Sealed Inference rubric scorer + combined review-generator with self-evaluation. Pure helpers (prompt build, response parse) split from live LLM driver via dependency injection, so tests don't need 0G.
- `verifier/server.js`, `verifier/github.js` — GitHub OAuth verifier service with two-call ticket flow + admin issuance for demo personas.
- `scripts/agent.js` — autonomous agent daemon. Lazy-loads 0G SDK (dodges a broken ESM re-export at test load time), file-locked against double-start.
- `scripts/e2e_v2.js` — end-to-end mainnet runner (mint → post → process → accept).
- 212 tests written and passing across `test/Hunt.test.js` (68 — includes v1.1 ClassRep math regression suite added in self-audit response), `test/Kin.test.js` (78, retained as predecessor regression baseline), `test/verifier.test.js` (21), `test/ecdh.test.js` (13), `test/embedding.test.js` (10), `test/Notary.test.js` (7), `test/HuntReputationOracle.test.js` (6), `test/pubkey.test.js` (5), `test/verify_bounty.test.js` (3), and `test/review.test.js` (1). Two Kin v2 agent test files target the older `review.summary` schema and are parked under `test-legacy/`, excluded from the default `npm test`.
- README, AI_USAGE.md, demo video script, X post draft, SUBMISSION.md.

## Hunt — what AI added on top of Kin v2

The pivot on 2026-05-11 reframed the same primitives around audit economics. Hunt-specific code (all Claude-paired):

- `contracts/Hunt.sol` — single-file Hunt contract (~470 LOC). Bounty escrow with race deadline + settle window, per-CWE `ClassRep` ledger (not the Kin v2 single PerDimRating), finding submission with `ecrecover` against `teeSigner` over an attestation binding `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps×4)`, in-scope CWE filter, self-eval floor, `teeTimestamp` race-window enforcement, no-findings refund + settle-window-expired refund paths. Forked from Kin v2 — docstring carries the fork note.
- `lib/audit-fallback.js` — documented degraded path with three heuristic detectors (CEI/reentrancy, oracle staleness, setter-without-modifier access control). Activates only when Sealed Inference fails the 3× transport/quality retry budget. Stamps a distinct on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` so the two paths are always distinguishable from a single bytes32 read.
- `lib/cwe.js` — canonical CWE/SWC class registry (kebab-case + bytes32 hashes); used by both the contract scope filter and the agent specialty-narrowing logic.
- `scripts/hunter.js` — long-lived hunter daemon (one process per operator). Watches `BountyPosted`, downloads + decrypts the code blob via `lib/storage.js`, runs top-K retrieval over the hunter's own samples, calls Sealed Inference with `brief.focus` narrowed to `bounty.inScopeCwes ∩ hunter specialty` (a reentrancy specialist never submits an oracle finding even on a multi-scope bounty), encrypts the chosen finding to the poster's pubkey, signs the attestation digest, submits.
- `scripts/run_race.js` — one-shot orchestrator firing all three hunter personas in parallel against a single bounty under a shared funder broker (so three personas don't each need a separate inference ledger). Used for the demo recording; production = N daemons across N hosts.
- `scripts/post_bounty.js` — seals a Solidity blob with the shared hunter-network key, uploads to 0G Storage, posts the bounty on-chain with the in-scope CWE list and the payout escrow.
- `scripts/settle_bounty.js` — poster's settle path; chooses `winningIdx`, submits 4-axis `AuditRating`, contract pays the winner and updates `ClassRep[hunterId][cweClass]`.
- `scripts/verify_bounty.js` — standalone judge verifier. Single file, depends only on `ethers` + Node built-ins. Re-derives the attestation digest from on-chain fields (mirrors `Hunt.sol:298–302`), runs `ecrecover`, checks the `teeTimestamp` is inside the race window. Strict mode (`--model-digest 0x…`) re-derives the digest with the supplied `modelDigest`; exit code 0 means the winning finding's attestation matches the on-chain `teeSigner` AND the supplied model.
- `demo/staged-bounty/Vault.sol` — staged oracle-staleness bug. Reads `latestRoundData()` in `_currentPrice()` and stores `updatedAt`, but only compares against `block.timestamp` inside the admin-only `setPrice()`. Every user path (`liquidate`, `withdraw`, `mint`, `_isHealthy`, `healthFactorBps`) bypasses the freshness gate. Pattern sourced from public Code4rena (Prisma Finance Mar 2024) and Sherlock (Angle Protocol 2024) reports; provenance + reference findings in `demo/staged-bounty/README.md`.
- 64 Hunt-specific contract tests (`test/Hunt.test.js`) covering mint, post, submit, settle, expire, scope filter, race window, attestation `ecrecover`, per-CWE `ClassRep` math, credential reuse protection.
- Hunt-framed README, SUBMISSION.md, DEMO_VIDEO_SCRIPT.md, X_POST.md, FUTURE.md.

**Reused from prior 0G work**
- AES-GCM upload/download patterns in `lib/storage.js` originate from a prior 0G prototype (ChartChain). Refactored in v2 to expose `uploadRaw`/`downloadRaw` primitives that ECDH-encrypted blobs route through directly.
- The Sealed Inference broker setup in `lib/inference.js` was also seeded from that prototype.

**Where AI was NOT used**
- Smart-contract security review: read by hand after Claude wrote it. CEI pattern verified, ecrecover edge cases (high-s rejection per EIP-2) verified, reentrancy paths walked. (Not externally audited — this is a hackathon prototype; production deployment would require an audit.)
- Decision on what to build at every fork: every architectural commit (vertical = code review not legal, mesh deferred to v3, narrow-and-deep over broad-and-shallow, dropping the broken "operator never sees plaintext" claim) was a go/no-go made after Claude presented options + tradeoffs.
- Submission decisions: nothing posted publicly without explicit approval.

## Which model

Claude Opus 4.7 (1M context) via Claude Code CLI. Approximate session length over the v2 rebuild: ~14 hours of paired work, distributed across days 11–15 of the hackathon window.

## Synthetic content

- The five sample code reviews per persona in `demo/personas.json`, `scripts/e2e_v2.js`, and `test/agent.test.js` are stylised — they read like real senior-engineer reviews and reflect real categories of bugs (TOCTOU, swallowed retries, catastrophic regex backtracking, partial-failure tests, missing mutex, oracle manipulation, storage-slot collision, etc.) but are not attributed to specific PRs. The three demo personas (`ts-senior`, `rust-senior`, `sol-senior`) are explicitly labelled "demo skill" in the UI.
- The reviews produced by `scripts/e2e_v2.js` at job time are real LLM output from 0G Sealed Inference, not pre-baked.

## Sealed Inference: the real root cause, discovered 2026-05-12

The Kin v2 populate run on 2026-05-11 produced an apparent partial outage: typescript Skill #0 fingerprinted via Sealed Inference cleanly, but rust Skill #1 and solidity Skill #2 returned empty bodies on all 3 attempts and fell back to the local feature-stats fingerprinter. The same empty-body symptom appeared on Hunt bounty #0's race the same evening. We initially attributed this to "model tokenizer choking on Rust/Solidity syntax" and shipped bounty #0 with the documented fallback narrative.

On 2026-05-12, during a thorough re-investigation, the actual root cause surfaced: `zai-org/GLM-5-FP8` is a **reasoning model** (similar architecture to OpenAI o1/o3). It consumes `completion_tokens` on internal `reasoning_tokens` *before* emitting any content. With `max_tokens=1500` (the budget passed by `lib/review.js` and `max_tokens=1000` passed by `lib/fingerprint.js`), the model spent the entire budget on reasoning, returned `finish_reason: length` with 0 content tokens, and our code interpreted the empty content as "endpoint broken → fall back."

The raw HTTP response makes it unambiguous:

| max_tokens | reasoning_tokens | content_tokens | finish_reason | content length |
|---|---|---|---|---|
| 1500 (production) | 1500 | 0 | `length` (cut off) | 0 |
| 4000 | 1018 | 828 | `stop` (clean) | 3734 chars valid JSON |

The fix is a single line in each of two files: `lib/review.js` default `maxTokens 1500 → 5000`; `lib/fingerprint.js` explicit `maxTokens 1000 → 5000`. Comments in both files document the reasoning-model rationale so future contributors don't reintroduce the bug.

The honest narrative: bounty #0 fell back not because 0G was broken, but because of our budget bug. `lib/audit-fallback.js` activated correctly and produced a verifiable on-chain receipt — graceful degradation as designed — but the original diagnosis ("model can't handle rust/solidity") was wrong. Bounties #2 and #3 are post-fix re-races on real Sealed Inference. Bounty #3 is the current headline: oracle-specialist submitted via Sealed Inference with a real TEE attestation, on-chain `modelDigest = keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`, strict re-verification via `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 with three checkmarks. The fallback path remains in-tree and is exercised in bounty #3 too (by the two hunters whose concurrent inference calls hit transient `fetch failed` on the inference proxy under simultaneous broker load — same observable end-state, with distinct `modelDigest` proving which path was taken).

The Kin v2 Skill #1 and #2 fingerprints (`modelDigest = keccak256("kin-local-stats|kin-fingerprint-v1")` on-chain) are kept as honest historical records of the fallback path; rerunning `populate_marketplace.js` against the fixed `lib/fingerprint.js` would now produce Sealed-Inference fingerprints on rust + solidity too.

## Repo licensing

MIT. The contract is unaudited — do not deposit real value beyond hackathon demo amounts.
