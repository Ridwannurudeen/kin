# AI Usage Attribution

Kin was built solo with substantial AI pair-programming assistance from Claude (Anthropic) over the May 10–16 2026 hackathon window.

## v1 → v2 — what changed and why

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
- 159 tests written across `test/Kin.test.js`, `test/verifier.test.js`, `test/ecdh.test.js`, `test/pubkey.test.js`, `test/embedding.test.js`, `test/inference-libs.test.js`, `test/agent.test.js`.
- README, AI_USAGE.md, demo video script, X post draft, SUBMISSION.md.

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

## Sealed Inference + the documented fallback (encountered live during populate)

`scripts/populate_marketplace.js` ran against Aristotle mainnet on 2026-05-11. Three skills minted:

- **Skill #0 — typescript (ts-senior)**: 0G Sealed Inference (`zai-org/GLM-5-FP8`) returned a parseable JSON fingerprint on attempt 1. Overall = 8620 bps. LLM-judged.
- **Skill #1 — rust (rust-senior)**: 0G Sealed Inference returned empty responses on all 3 attempts (valid TEE attestations each time — IDs logged — but `answer length: 0` in each. Suspected cause: model tokenizer choking on Rust syntax like `Arc<Mutex<T>>` / `::` in the prompt). `lib/fingerprint.js` fell back to a deterministic local feature-stats fingerprinter as authorised in `doc/V2_SPEC.md §14` (risk register row: *"0G Sealed Inference can't run our evaluator prompts reliably → fall back to inference-model self-eval (single call) instead of a separate evaluator"*). Overall = 7237 bps. `modelDigest = keccak256("kin-local-stats|kin-fingerprint-v1")` on-chain — a buyer can verify this skill's quality signal came from local stats, not from a TEE LLM judgement.
- **Skill #2 — solidity (sol-senior)**: Same pattern as Skill #1 (3 empty LLM responses → fallback). Overall = 6239 bps via local feature stats.

The local fingerprinter is honest about its provenance: distinct `modelDigest`, distinct rationale text on-chain (`"0G Sealed Inference unavailable; scored locally via lexical+structural feature stats over the samples"`), and the `fallback: true` flag returned from `fingerprintSamples`. Real users who hit the empty-response issue would either retry until 0G inference recovers, or use the local path knowingly. v3 will instrument 0G's per-response attestation directly into the on-chain verification path so the trust shift from "LLM-judged" to "stats-judged" is enforced at the contract level rather than just documented.

## Repo licensing

MIT. The contract is unaudited — do not deposit real value beyond hackathon demo amounts.
