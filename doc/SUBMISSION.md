# Hunt — HackQuest Submission Form Answers

Pre-filled answers for the 0G APAC Hackathon submission form. **Review each field before pasting into HackQuest.** Nothing is submitted until you give explicit approval.

> **Honesty preface — applies to every section below.** The headline live race is **bounty #3**: oracle-specialist submitted the winning finding via real 0G Sealed Inference (`zai-org/GLM-5-FP8`) with a `ZG-Res-Key` TEE attestation. The on-chain `modelDigest` is `keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))` — pass it to `scripts/verify_bounty.js 3 --model-digest 0x<digest>` for strict cryptographic re-derivation (one-liner to compute the digest is in §9). Bounty #0 was the original race, ran on the documented fallback path (`lib/audit-fallback.js`) because of a `max_tokens=1500` budget bug in `lib/review.js` — `zai-org/GLM-5-FP8` is a reasoning model and burned the entire budget on internal `reasoning_tokens` before emitting any content. The fix (bump to 5000) is one line in `lib/review.js` and one line in `lib/fingerprint.js`. Bounty #0 is preserved on-chain as an honest record; bounty #2 is the post-fix Sealed Inference race before per-hunter specialty narrowing; bounty #3 is the current headline. The fallback path's on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` is *distinct* from the Sealed Inference one, so the two paths are always distinguishable. Contract semantics, digest structure, and the `ecrecover` gate are identical between paths — only the `modelDigest` differs. `teeSigner` and `verifier` are operator-held single keys in v1; the v2 plan replaces both with attestation-verifying relay sets (`doc/FUTURE.md`).

---

## 1. Project name
**Hunt**

(Pivoted on 2026-05-11 from predecessor **Kin v2** on the same codebase. Kin v2 contract `0x47F25b…` is preserved on-chain as the historical reference. The credential / fingerprint / attestation plumbing is forked from Kin v2 — `contracts/Hunt.sol` carries the fork note in its docstring.)

## 2. One-sentence description (≤30 words)
Hunt is a sealed bug-bounty network for smart contracts — protocols post encrypted Solidity, AI hunter agents race through 0G Sealed Inference, and v1 relays validated findings on-chain for per-CWE-class reputation.

## 3. Short summary

**What it does.** Hunt turns smart-contract auditing into an on-chain race between specialist AI agents. A protocol seals its Solidity source against a shared hunter-network key, posts a bounty with an in-scope CWE class list and a payout, and escrows OG on `contracts/Hunt.sol`. Every registered hunter agent — each one a "senior auditor" identity with verifier-signed GitHub credential, TEE-signed sample fingerprint, and per-CWE reputation — watches `BountyPosted`, downloads + decrypts the code blob, runs top-K retrieval over its own prior-finding samples vs the bounty code, and calls Sealed Inference (`lib/review.js`) to produce a review + self-eval in one shot. The agent picks the highest-severity in-scope finding, encrypts it to the poster's wallet pubkey, uploads to 0G Storage, and signs an attestation digest binding `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps×4)`. `submitFinding` runs `ecrecover` against `teeSigner` and accepts only if `teeTimestamp ∈ [postedAt, raceDeadline]`. The poster picks the winning finding, submits a 4-axis rating, and `settleBounty` pays the winner and updates `ClassRep[hunterId][cweClass]`.

**The live demo proves the per-CWE-reputation thesis end-to-end.** The staged `demo/staged-bounty/Vault.sol` contains a subtle oracle-staleness bug: `_currentPrice()` reads `updatedAt` from `latestRoundData` but only compares it against `block.timestamp` inside the admin-only `setPrice()`. Every user path (`liquidate`, `withdraw`, `mint`, `_isHealthy`, `healthFactorBps`) bypasses the freshness gate. Headline race is **bounty #3** on Aristotle mainnet: three hunters fired in parallel against the bounty, each one's brief narrowed to `bounty.inScopeCwes ∩ hunter specialty` (a reentrancy specialist will never submit an oracle finding even on a multi-scope bounty). Oracle-specialist completed Sealed Inference on attempt 1, surfaced `oracle-manipulation / high` with model self-eval overall 88.75% (severityCalibration 8500 / precision 9200 / coverage 8800 / exploitability 9000), submitted with real `ZG-Res-Key` TEE attestation, and won the 0.05 OG payout. The other two specialists hit transient `fetch failed` on the inference proxy under concurrent broker load, fell back to the documented local heuristic per spec, and returned 0 findings in their respective specialty classes — correct, no reentrancy or access-control bug fires the matching heuristic on this Vault. Per-CWE reputation accrued only to the hunter with the matching specialty. Bounty #2 (pre-specialty-narrowing post-fix race) shows the same outcome with severity `critical`. Bounty #0 (pre-fix original race) shows the same outcome via the local-fallback path, with its distinct on-chain `modelDigest` proving exactly which path was taken.

**Problem solved.** Existing bug-bounty programs trust a central audit firm or a leaderboard of human pseudonyms. Centralised AI-auditor services are cheatable: you can't tell whether the model claimed actually ran on the input you submitted, or whether the firm replayed cached output. Putting the contract in plaintext on a marketplace also leaks pre-deployment code. Hunt fixes the first half of that today and lays the substrate for the second: code is sealed against the public chain and storage operators (only the storage root + scope go on-chain), and every finding carries an on-chain digest binding `(model, input, hunter, CWE-class, severity, finding-root, race-window timestamp, self-eval×4)`. In v1 that digest is signed by an operator-held `teeSigner` relaying over real 0G Sealed Inference — the hunter daemon validates each `ZG-Res-Key` via `broker.inference.processResponse` before submitting, but the chain witnesses the operator's relay, not the attestation directly. v2 (`doc/FUTURE.md`) replaces the operator with a TEE-attestation-verifying signer set so the chain enforces the bind. Reputation accrues *per CWE class*, so a hunter who's elite at reentrancy and mid at oracles can't game one rep score across domains — the chain reflects calibrated expertise.

**0G components used** — five primitives, all load-bearing, none decorative:

- **0G Chain (Aristotle, 16661)**: `contracts/Hunt.sol` — hunter registry, bounty escrow, race + settle window, finding submission with `ecrecover`-verified attestation, per-CWE `ClassRep` ledger, credential reuse protection. ~470 LOC, single file.
- **0G Compute / Sealed Inference**: two distinct TEE roles. (1) `lib/fingerprint.js` scores a hunter's prior-finding samples on 4 quality axes at mint time. (2) `lib/review.js` runs the review + self-eval in a single Sealed Inference call per bounty. Both consume 0G's `ZG-Res-Key` attestation via `broker.inference.processResponse`. The headline bounty #3 ran on real Sealed Inference end-to-end — winning finding's on-chain `modelDigest = keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`, strict re-verification via `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 with three checkmarks. `lib/audit-fallback.js` is the documented degraded path, exercised in bounty #3 for the two hunters whose concurrent inference calls hit transient `fetch failed` under simultaneous broker load — same on-chain semantics, distinct `modelDigest`.
- **0G Storage**: symmetric AES for the bounty code blob (shared hunter-network key in v1); per-hunter AES for samples + embeddings (per-hunter key, owner-held); ECIES (secp256k1 + HKDF + AES-GCM) for findings encrypted to the bounty poster's pubkey. Primitives in `lib/storage.js`, `lib/ecdh.js`.
- **TEE attestation chain-of-custody**: `teeSigner` address on-chain; off-chain relay produces the digest `Hunt.sol` recovers. v1 = one operator-held key. v2 = TEE-attestation-verifying relay set that signs only when 0G's per-response attestation validates against the model that produced the answer.
- **Credential verifier**: `verifier/server.js` enforces the GitHub-activity bar (≥730d account age, ≥20 merged PRs, ≥10 reviews) and signs a wallet-bound, replay-protected Credential the contract recovers on mint.

**Engineering depth.** 212 tests passing, 0 failing (68 Hunt contract — including the v1.1 ClassRep math regression suite added in self-audit response; 78 Kin contract foundation, 21 verifier, 13 ECDH, 10 embedding, 7 HuntNotary, 6 HuntReputationOracle, 5 pubkey-recover, 3 strict verifier semantics, 1 Sealed Inference attestation gate). Two Kin v2 agent legacy test files target the older `review.summary` schema and are parked under `test-legacy/`, excluded from the default `npm test`. Race-deadline enforcement, settle-window enforcement, CWE-scope filter, per-hunter specialty intersection (`scripts/hunter.js` `hunterSpecialtyCwes` param), per-finding `teeTimestamp` window check, self-eval `MIN_FINDING_QUALITY_BPS` floor — all on-chain. Local-fallback path (`lib/audit-fallback.js`) is documented and stamps a distinct `modelDigest` on-chain so judges can audit which path each finding took. Standalone verifier (`scripts/verify_bounty.js`) re-derives the attestation digest from on-chain fields and runs `ecrecover` independently — judges can run it without project setup; pass `--model-digest 0x<digest>` for strict cryptographic re-derivation (one-liner in §9).

**Judge-runnable surface (no setup, no clone).**

| Surface | What it does |
|---|---|
| [`hunt.gudman.xyz/verify.html`](https://hunt.gudman.xyz/verify.html) | Browser: paste a bountyId + canonical Sealed-Inference modelDigest; in-browser re-derives the on-chain attestation digest, `ecrecover`'s `teeSigner`, prints the same three checkmarks as the CLI. Same semantics as `scripts/verify_bounty.js`. |
| [`hunt.gudman.xyz/status.html`](https://hunt.gudman.xyz/status.html) | Browser: live read of `totalHunters()`, `totalBounties()`, `teeSigner()`, `verifier()`, HuntNotary attestation count, ReputationOracle domain count — one card per number. |
| [`hunt.gudman.xyz/proof.html?bounty=3`](https://hunt.gudman.xyz/proof.html?bounty=3) | Browser: per-bounty receipt explorer with timeline, scope chips, per-finding rows, winner card with decoded attestation digest fields. |
| [`hunt.gudman.xyz/post-bounty.html`](https://hunt.gudman.xyz/post-bounty.html) | Browser: connect wallet → post a real bounty on Aristotle mainnet (demo mode reuses bounty #3 codeRoot for the off-chain seal). Visitor sees assigned bountyId on-chain. |
| [`hunt.gudman.xyz/mint-hunter.html`](https://hunt.gudman.xyz/mint-hunter.html) | Browser: two-phase hunter onboarding — (1) package a credential request blob for the operator; (2) paste operator-returned Credential + SampleFingerprint and sign `mintHunter` from the visitor's wallet. |
| [`hunt.gudman.xyz/expire-bounty.html`](https://hunt.gudman.xyz/expire-bounty.html) | Browser: anyone-callable cleanup action. Refunds escrowed payout to the original poster when race window ended with no findings, or settle window closed without a winner. Bounty #17 currently expirable as live demo target. |
| [`hunt.gudman.xyz/api/`](https://hunt.gudman.xyz/api/) | **Public read API.** JSON, CORS-open, 30s cache. Endpoints: `/api/stats`, `/api/hunters`, `/api/hunters/:id`, `/api/bounties`, `/api/bounties/:id`, `/api/bounties/:id/findings`, `/api/rep/:hunterId/:cwe` (accepts bytes32 OR canonical kebab-case CWE name). No clone, no ABI — `curl` works. |
| [`hunt-mcp-server`](https://www.npmjs.com/package/hunt-mcp-server) | **MCP server for Claude Desktop, Cursor, any MCP client.** 10 tools wrap the same primitives (`hunt_stats`, `hunt_list_hunters`, `hunt_verify_bounty`, `hunt_get_class_rep`, `hunt_canonical_digest`, etc). AI agents query Hunt natively. Install: `npx -y hunt-mcp-server`. |
| [`hunt-verifiable-ai`](https://www.npmjs.com/package/hunt-verifiable-ai) | **npm SDK** — `findingDigest`, `classToBytes32`, `signAttestation`, `verifyAttestation`, ECIES helpers. 9 tests passing. 5 example scripts (smart-contract / insurance / medical / benefits / generic-classification). Install: `npm i hunt-verifiable-ai`. |

**What Hunt isn't (honesty surface).**

- Hunt is **not chain-enforced TEE attestation** in v1. The chain enforces that `teeSigner` signed the finding digest; the off-chain `ZG-Res-Key` validation the daemon does before signing is not chain-witnessed. v2 (`doc/FUTURE.md`) replaces the operator-held `teeSigner` with a relay set that signs only after attestation verification.
- Hunt is **not a replacement for human security review.** It is an adversarial, AI-only, per-CWE pre-screen layer. Findings are attested, not proven correct.
- **On-chain integrity proves the digest was signed and recorded; it does not prove the finding is correct.** The audit work itself still needs human triage.
- **All three current demo hunters are operator-owned wallets.** External-operator participation is a known gap and the most direct path from "verifiable" to "adversarial". Outreach in `doc/OUTREACH_TEMPLATES.md`.

## 4. Track

**Track 3 — Agentic Economy & Autonomous Applications.**

Hunt is a multi-agent economic protocol with on-chain reputation, escrow + payment, and verifiable autonomous execution. Three independent hunter agents race against a single bounty; each is an on-chain identity with its own samples, fingerprint, and per-CWE reputation; the protocol settles by paying the winner and updating reputation. The agents run autonomously off a `BountyPosted` watch loop; there is no human in the inference loop. That is the Track 3 mandate at the literal level.

## 5. 0G Integration Proof

**Contract**: [`0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`](https://chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C) on 0G Aristotle (chain 16661).

**teeSigner**: `0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f` — signs sample fingerprints + finding attestations. `ecrecover`'d on-chain in `Hunt.mintHunter` (fingerprint check, line 224) and `Hunt.submitFinding` (attestation check, line 303).

**verifier**: `0x3a40CA052c10FB6f0B1934e9db680034aFF1759E` — signs GitHub Credentials. `ecrecover`'d on-chain in `Hunt.mintHunter` (line 221).

**Live mainnet activity — every tx hash is real, all settled on chain 16661.**

**Deploy + hunter mints**

| Event | Tx hash | Block |
|---|---|---|
| Deploy Hunt | `0xc08f6483a1603564ff38c6808856cc9d7e8cbe120ff95e8ccbc55722f873f6c7` | 32975183 |
| Mint hunter #0 — `reentrancy-specialist` | `0xdac73073211a99c16cad85961461180ead95504bfae331e8e77efb7f053f9d5d` | (chainscan) |
| Mint hunter #1 — `oracle-specialist` | `0xd9ab16049e3a048ea30b49bb9dfb61584828c621c88bc467c2ad1eb85d6b8354` | (chainscan) |
| Mint hunter #2 — `access-control-specialist` | `0x66af88fe9718592223580034b3569cc79cc0ae8c8cd596595330a631e08d509f` | (chainscan) |

**Bounty #3 ★ — headline race (real Sealed Inference + per-hunter specialty narrowing)**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #3 — Vault.sol, 0.05 OG, 10-min race, scope {reentrancy, oracle, access-control} | `0x253064e8680d098c127b9cf7b2d4379136dd25bb6258117b0e4951e848922659` | (chainscan) |
| Oracle-specialist submits winning finding — **real Sealed Inference** (`oracle-manipulation`, `high`) | `0x78f6075f7ccc99122144335c659005c162e750229d808258e06823a957b37523` | 33040490 |
| Settle bounty #3 — 0.05 OG to oracle-specialist + per-CWE rep update | `0x9edab38c54b927fd507aeaada991694500858af4a31977d2c7154ac658f8d241` | 33041034 |

Headline finding's `modelDigest = keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))` (compute with the one-liner in §9). Strict-mode `scripts/verify_bounty.js 3 --model-digest 0x<digest>` prints `digest match: ✓ / signer == teeSigner: ✓ / teeTimestamp window: ✓` and exits 0 — cryptographic proof that the operator-held `teeSigner` signed a Sealed-Inference-path digest (distinguishable from the fallback path by `modelDigest`) inside the race window. The off-chain `ZG-Res-Key` validation the daemon performs before signing is not chain-enforced in v1; that's the upgrade in v2 (`doc/FUTURE.md`).

**Bounty #2 — post-fix Sealed Inference race (no specialty narrowing yet)**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #2 | `0x8da9cf06cfcf963ec9ad000d37a1652f0fb352c43909e6f254255db7091e4314` | (chainscan) |
| Oracle-specialist submits winning finding (real Sealed Inference, `critical`) | `0x36bd979cc452c77626493113666b6109a73506380e1f8de610c5b73874eef554` | 33039165 |
| Settle bounty #2 | `0xa6e03679fc9ced9fbe6a1a185550033821343934cdb12adb9da46a149ce2ed59` | 33039527 |

**Bounty #7 ★★ — second positive narrowing data point (reentrancy specialist wins, real Sealed Inference)**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #7 — `Reentrancy.sol`, 0.05 OG, 10-min race, scope {reentrancy, access-control, oracle} | `0xbc525ef4964b8abb39f2943be95528d9f5d1a3e8a2a11f14fd82c017af9eecac` | (chainscan) |
| Reentrancy-specialist submits winning finding — **real Sealed Inference** (`swc-107-reentrancy`, `critical`) | `0x3a51f97ca7150775902ed4bca4b08536cb7e9f0a59c936cfb246a985036ddd92` | 33131912 |
| Settle bounty #7 — 0.05 OG to reentrancy-specialist, per-CWE rep accrued | `0x6d26cd5fd4927ed9a8631e8f421630247e92abae8008c6b0e58b3aa90f7a2a7f` | 33132360 |

Fired 2026-05-13 specifically to produce a **second positive per-CWE-narrowing data point** alongside bounty #3. Bounty #3 had the oracle-specialist win on an oracle-staleness bug while reentrancy and access-control specialists correctly returned zero. Bounty #7 inverts the casting: the reentrancy-specialist won on a CEI-violation bug while oracle and access-control specialists correctly returned zero (oracle-specialist passed quality gate at 9875bps with explicit rationale "no oracle-manipulation pattern on these facts"). Two specialists, two different CWE classes, two different bugs, each won by the matching specialist on real Sealed Inference. The per-class-narrowing thesis is now demonstrated **twice independently** on-chain.

**Bounty #1 — second fallback-path race (preserved record, pre-fix)**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #1 | `0x60cf3d75d88b1c7080b4ac9ea610d3c470ef684f5557a0809f3bf67fd57f0dc9` | 32987989 |
| Oracle-specialist submits winning finding (fallback path, `high`) | `0xf6d54d4a35123ccb550dabdfcb71ee2f47bfbc6efa867a0a846fefa776c5c2a6` | 32988214 |
| Settle bounty #1 — 0.05 OG to oracle-specialist | `0x5e06c6dc1e94b190ba9ef2fa31baa8da95e05b2a03f3d4436c951bf4d9d93768` | 32988680 |

Same fallback-path semantics as bounty #0; stamped the distinct on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))`. Preserved as the second data-point that graceful degradation under transient Sealed Inference failure produces a clean settled audit.

**Bounty #0 — original race (fallback path)**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #0 | `0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df` | (chainscan) |
| Oracle-specialist submits winning finding (fallback path, `high`) | `0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b` | 32977952 |
| Settle bounty #0 | `0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4` | 32978103 |

**Bounty #6 — first ChartChain audit on Aristotle (full lifecycle, per-CWE narrowing demonstrated end-to-end)**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #6 — `audits/chartchain/MedicalRecordsVault.sol` (MIT-licensed source verbatim from [ChartChain](https://github.com/Ridwannurudeen/chartchain), mainnet `0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`), 0.05 OG, 10-min race, scope {reentrancy, oracle, access-control, swc-101-int-overflow, storage-collision} | `0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461` | (chainscan) |
| Expire bounty #6 — no in-scope findings, 0.05 OG refunded to poster | `0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22` | 33121294 |

What happened: three hunters raced in parallel. The reentrancy-specialist completed Sealed Inference at attempt 1 with self-eval overall 9000bps and returned 0 findings — correctly declined to submit outside its specialty. The oracle-specialist completed Sealed Inference at attempt 3 with 10000bps and returned 0 findings — same. The access-control-specialist hit transient `fetch failed` on the inference proxy 3x under concurrent broker load and fell back to `lib/audit-fallback.js`, the documented local heuristic, which also returned 0 in-scope findings. Race expired cleanly; `expireBounty(6)` refunded the 0.05 OG to the poster. **The bug-finding question against ChartChain remains open** — possibly there are no vulns in the in-scope CWE classes; possibly the LLM didn't surface them in a 10-min window. **What is proven on-chain is the per-CWE-narrowing thesis**: specialists run real Sealed Inference, find nothing in their lane, and *don't fabricate findings outside it*. The chain reflects calibrated expertise rather than guesswork.

**Primary live audit target going forward — ChartChain.** `scripts/post_bounty.js` defaults to `audits/chartchain/MedicalRecordsVault.sol`. The historical bounty #0/#2/#3 tables above remain the cryptographically-verifiable record for v1 (bounty #3 is the load-bearing settled audit with strict-mode verifier exit 0). Bounty #6 above is the first on-chain artifact of Hunt auditing a separate live 0G protocol. Plan, 5-CWE scope, and honest forecast in [`audits/chartchain/README.md`](../audits/chartchain/README.md).

**Primitive-by-primitive call-site references.**

- **0G Compute / Sealed Inference**
  - `scripts/hunter.js:384` — `createZGComputeNetworkBroker(operator)` initialises the broker per daemon.
  - `scripts/hunter.js:386–389` — `broker.inference.listService()` resolves the provider, then `lib/inference.js:sealedQuery` issues the call.
  - `scripts/run_race.js:50–56` — same plumbing for the demo orchestrator (shared funder broker so three personas don't each need a separate inference ledger).
  - `lib/review.js` — combined review + self-eval prompt; consumes the broker via dependency injection.
  - `lib/fingerprint.js` — sample fingerprinter; called at hunter-mint time.
  - `lib/audit-fallback.js` — documented fallback path triggered when the daemon's 3× retry budget on Sealed Inference is exhausted (transport failure or empty content). Stamps `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` so on-chain readers can tell the two paths apart from a single bytes32 read.

- **0G Storage**
  - `lib/storage.js` — `uploadRaw`, `downloadRaw`, `uploadEncryptedRecord`, `downloadEncryptedRecord` over `@0gfoundation/0g-storage-ts-sdk`. AES-256-GCM wrapper for encrypted blobs.
  - `scripts/post_bounty.js` — symmetric-encrypts the Vault.sol blob with the shared hunter-network key, uploads, lands `codeRoot` on-chain via `Hunt.postBounty`.
  - `scripts/hunter.js:159–169` — downloads + symmetric-decrypts the code blob, then parallel-downloads + AES-decrypts the hunter's samples + embeddings.
  - `scripts/hunter.js:264` — encrypts the chosen finding to the poster's pubkey via `lib/ecdh.encryptToPubkey`, uploads, captures `findingRoot`.

- **0G Chain (Aristotle, 16661)**
  - `contracts/Hunt.sol:200–239` — `mintHunter`: credential + fingerprint signatures `ecrecover`'d, credential replay-protected, sample-count and quality-bar enforced.
  - `contracts/Hunt.sol:250–271` — `postBounty`: escrows payout, persists `codeRoot` + `inScopeCwes[]` + `raceDeadline` + `settleDeadline`.
  - `contracts/Hunt.sol:277–325` — `submitFinding`: race-deadline check, CWE-scope check, self-eval floor check, `teeTimestamp` window check, attestation `ecrecover` against `teeSigner`.
  - `contracts/Hunt.sol:329–366` — `settleBounty`: rating validation, per-CWE `ClassRep` update, payout, `BountySettled` + `ClassRepUpdated` events.
  - `contracts/Hunt.sol:370–385` — `expireBounty`: no-findings refund OR settle-window-expired refund.
  - `scripts/verify_bounty.js` — judge-runnable standalone verifier; re-derives the attestation digest from on-chain fields (mirrors `Hunt.sol:298–302`), runs `ecrecover`.

**Sealed Inference attestations.** Each finding carries an attestation signature over the digest. The chain enforces the signature recovers to `teeSigner`. v1 uses an off-chain attestation relay that the operator controls; v2 swaps that for a relay set that signs only when 0G's `ZG-Res-Key` attestation validates against the model that produced the response. The contract semantics don't change between v1 and v2 — the relay set is.

## 6. Demo Video

*[YouTube unlisted link — record per `doc/DEMO_VIDEO_SCRIPT.md`, paste here]*

- Length: 2:30–2:55 (under 3 min cap).
- 1080p, real voice, no slides-only.
- Hero scene: `BOUNTY_ID=0 node scripts/run_race.js` against the live deployment — three personas fire in parallel, reentrancy and access-control specialists return zero in-scope findings, oracle-specialist surfaces the high-severity oracle-staleness finding and submits. Then `scripts/settle_bounty.js` settles + shows the per-CWE rep update. Then `scripts/verify_bounty.js 0` independently re-derives the attestation digest + `ecrecover`s.

## 7. README / Documentation

See repo root `README.md` for the live-deployment table (with all four bounty races: #3 headline, #2 post-fix intermediate, #0 fallback-path original), lifecycle diagram, primitive call-sites, project layout, quickstart, and honesty notes (root-cause analysis of the bounty #0 fallback, centralised relay, shared hunter-network key v1 → per-hunter envelope v2). Roadmap: `doc/FUTURE.md`. Demo bug walk-through: `demo/staged-bounty/README.md`. AI usage: `AI_USAGE.md`.

## 8. Public X Post

*[Post URL — see `doc/X_POST.md` for the two drafts]*

- Includes a 30–45s demo clip cut from the hero scene (the live race in terminal).
- Hashtags: `#0GHackathon` `#BuildOn0G`.
- Tags: `@0G_labs` `@0g_CN` `@0g_Eco` `@HackQuest_`.

## 9. Verify the proof yourself

Anyone, no setup required, can verify the live race independently. Clone the repo (read-only — no private key needed) and run:

```bash
git clone https://github.com/Ridwannurudeen/hunt && cd hunt
npm install
# Compute the headline modelDigest (keccak256 of the model name + version):
node -e "import('ethers').then(({ethers})=>console.log(ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1'))))"
# Strict-mode verify against bounty #3 (the real-Sealed-Inference headline):
node scripts/verify_bounty.js 3 --model-digest 0x<paste the digest above>
```

Expected output (abridged):

```
────────────────────────────────────────────────────────────
Hunt verifier  ·  bounty #3
────────────────────────────────────────────────────────────
contract:      0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C
teeSigner:     0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f
status:        Settled
poster:        0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f
maxPayout:     0.05 OG
codeRoot:      0x…
postedAt:      <timestamp>
raceDeadline:  <timestamp + 600s>
findings:      1
winningIdx:    0

finding[0] ★ WINNING
  hunter:                #1 (oracle-specialist)
  cweClass:              0x… (keccak("oracle-manipulation"))
  severity:              high (3)
  findingRoot:           0x…
  teeTimestamp:          <ts in window>
  signer recovered:      0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f
  signer == teeSigner:   ✓
  teeTimestamp window:   ✓

Result: ✓ winning finding fully verifies against on-chain teeSigner
```

Exit code 0 means the winning finding's attestation matches the on-chain `teeSigner`, the digest re-derives cleanly from on-chain state, and the `teeTimestamp` falls inside the race window. The script depends on nothing except the project's `ethers` install + Node built-ins; it reads only from the public `evmrpc.0g.ai` RPC.

For the strict re-derivation, pass `--model-digest 0x…` matching the encrypted finding payload (the `modelDigest` is not on-chain; it's bound into the attestation digest signed off-chain). Without the flag, the script reports the digest re-derived with a zero `modelDigest` and surfaces the expected mismatch clearly.

## 10. Bonus materials

- **Hunt as protocol infrastructure (L1-L4 shipped)**: the submission now includes a reusable SDK, a live Notary, a live Reputation Oracle, and an institutional partnership playbook. `packages/sdk/` extracts the verifiable-AI primitives into `@hunt-protocol/verifiable-ai`; [`HuntNotary`](https://chainscan.0g.ai/address/0x968d5E070152A90Ae7a3c5251222FC163b72C7E2) records hash-only AI conversation receipts on Aristotle, including demo receipt attestId `0` ([tx `0x1dcb653c…4b5c15`](https://chainscan.0g.ai/tx/0x1dcb653cd5095a6a4cd8e58e003f3672a111dc7785760bf88b8efe8e724b5c15)); [`HuntReputationOracle`](https://chainscan.0g.ai/address/0xdf2f9587D5746cd1358d40804bE7885BDaaE45d2) exposes per-domain Hunt reputation for other apps and bridges; [`https://hunt.gudman.xyz/status.html`](https://hunt.gudman.xyz/status.html) reads all three live contracts in one judge-facing status page; [`doc/INSTITUTIONAL_PARTNERSHIP.md`](INSTITUTIONAL_PARTNERSHIP.md) packages the system as Hunt-as-a-Service for ecosystems, audit desks, and risk partners. This is the grand-prize direction: not a single audit app, but reusable 0G AI accountability infrastructure.
- **Primary live audit target — ChartChain**: Hunt audits [**ChartChain**](https://github.com/Ridwannurudeen/chartchain), a separate live 0G project (medical-records INFT + Sealed Inference query, mainnet [`0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`](https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00)). `audits/chartchain/MedicalRecordsVault.sol` is verbatim from ChartChain's master branch under MIT licence; `scripts/post_bounty.js` defaults to this file so any fresh race targets a real protocol's deployed source rather than a staged file. Plan + 5-CWE scope + honest forecast in [`audits/chartchain/README.md`](../audits/chartchain/README.md). Bounty #0–#3 above remain the cryptographically-verifiable historical record; ChartChain is the protocol's headline forward-looking audit target. Demonstrates the same primitive can be pointed at a real live 0G protocol.
- **Beyond crypto — verifiable AI for ordinary citizens**: Hunt's primitives (sealed inference, multi-specialist competition, on-chain per-domain reputation) apply 1:1 to three non-crypto verticals positioned for v2, but they are expansion material rather than the submission's main claim:

  > Hunt deliberately does not mint autonomous AI hunters for non-Solidity domains in v1. An unsupervised AI determining a medical diagnosis or a federal-benefits claim would be a regulatory and ethical failure mode, not a feature. v2 mints those specialists in tandem with credentialed partnerships (NOSSCR-attorney for SSDI, claims professional for insurance, radiologist for medical), not before. The infra readiness is the proof; the absence of demo-data hunters is the discipline signal.

  - **Insurance-claim-denial defense** ([`audits/insurance/README.md`](../audits/insurance/README.md)) — defends citizens against *private-payor* opaque AI. 73M ACA denials in 2023; <1% appealed; 40–75% appeal-success when they did. Three live AI-appeal products (Counterforce Health, Claimable, Fight Health Insurance) validated the category at 70–80% reversal without TEE attestation; all route patient records through OpenAI/Anthropic. Hunt closes that gap. Specialist subdomains (medical-necessity / coding-CPT / prior-auth / ERISA-procedural / state-external-review), regulatory framing (Colorado SB24-205/SB26-189, EU AI Act Annex III), and a synthetic denial letter modeled on the public *Estate of Lokken v. UnitedHealth* pleadings included.
  - **Disability + Senior Benefits defense** ([`audits/benefits/README.md`](../audits/benefits/README.md)) — defends elderly, retired, and disabled citizens against *public-payor* opaque adjudication. ~330K SSDI cases pending an ALJ hearing as of Jan 2026 (the largest adjudication backlog in any US administrative system); 274-day average wait; 60-70% initial denial rate; appeal-success >50% with representation, but attorney contingency capped at 25% under 42 U.S.C. § 406 makes representation economically inaccessible for many claimants. Seven-class defect registry mapped to the SSA's own sequential-evaluation regulations (medical-listing-misapplication, RFC error, vocational-expert misclassification, duration-rule misapplication, SGA miscalculation, combined-impairments omission, treating-physician opinion-weight failure). Secondary surfaces: Medicare reconsideration + VA claims. Synthetic SSDI denial modeled on SSA-1561 template with seven annotated defect patterns included.
  - **Medical Records Reader** ([`audits/medical/README.md`](../audits/medical/README.md)) — the *cooperative* face of the same primitive: gives citizens better verifiable AI reads of their records than they could otherwise afford. Published per-specialty disagreement rates (14% major in general surgical pathology, 20-32% radiology oncologic CT, up to 52% neuro-oncology) make per-specialty reputation accrual *empirically calibrated* — a stronger claim than smart-contract CWE reputation can support. Scoped strictly as a "Records Reader" (surfaces questions to ask your physician, never diagnoses) inside 21st Century Cures CDS exemption + FDA Jan 2026 enforcement-discretion guidance. Includes a synthetic surgical-pathology report exhibiting the hardest interobserver call in breast biopsy (ADH vs. low-grade DCIS).

  The appendix scripts (`scripts/insurance_specialist_brief.js`, `scripts/benefits_specialist_brief.js`, `scripts/medical_specialist_brief.js`) prove the same attestation primitive generalizes, but they are support material. The headline claim stays on the live smart-contract-audit wedge on 0G.
- **Frontend (live)**: [https://hunt.gudman.xyz](https://hunt.gudman.xyz) — editorial-tone UI with home / hunters / bounties / judge-proof pages, Aristotle mainnet integration live. [`https://hunt.gudman.xyz/proof.html?bounty=3`](https://hunt.gudman.xyz/proof.html?bounty=3) renders the per-bounty receipt for the headline race — timeline, scope chips, per-finding table, winner panel with the decoded attestation digest fields. [`https://hunt.gudman.xyz/hunters.html`](https://hunt.gudman.xyz/hunters.html) shows the per-CWE empirical specialty board (declared specialty + dominant CWE from on-chain `ClassRepUpdated` wins, side-by-side with match indicator). Hosted on VPS via nginx static-serve of `public/` over Let's Encrypt TLS.
- **Standalone judge verifier**: `scripts/verify_bounty.js` — single-file, zero-setup, depends only on `ethers` + Node built-ins.
- **Bug provenance**: `demo/staged-bounty/README.md` walks the bug, the attack path, the fix, and the public reference the staging is sourced from — USSD's Sherlock May 2023 contest, judging issue #31. Hunt also audited USSD's real oracle source live and blind (bounty #9, confirmed HIGH finding) — see `audits/ussd/README.md`.
- **AI usage attribution**: `AI_USAGE.md`.

---

## Final pre-submission checklist (DO NOT submit until ALL checked)

- [x] Repo public on GitHub (Ridwannurudeen/hunt) — HTTP 200 verified 2026-05-15
- [x] `scripts/deploy_hunt.js` recorded — Hunt address in `deployments/Hunt.json` (`0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`, tx `0xc08f6483…`)
- [x] `scripts/populate_hunters.js` — 3 hunter personas minted (ids 0, 1, 2) — txs `0xdac73073` / `0xd9ab1604` / `0x66af88fe`
- [x] `scripts/post_bounty.js` — bounty #0 posted against Vault.sol (tx `0xafa7c31e`); the **headline live race for the submission is bounty #3** per the §3 honesty preface
- [x] `scripts/run_race.js` — race ran live; oracle-specialist submitted the winning finding (bounty #3 winner via real Sealed Inference, finding tx `0x371f2a32`)
- [x] `scripts/settle_bounty.js` — bounty #0 settled (tx `0xe67459a1`); bounty #3 settled at tx `0x9edab38c…d241`
- [x] `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 — winning finding cryptographically verifies against `teeSigner` AND `modelDigest` (real Sealed Inference proof) — confirmed live against Aristotle mainnet
- [x] README + SUBMISSION tx hashes match what's actually on-chain
- [x] `npm test` — 212 tests green, 0 failing (legacy Kin v2 agent tests parked under `test-legacy/` and excluded from default suite) — last run 2026-05-15
- [ ] Demo video recorded per `doc/DEMO_VIDEO_SCRIPT.md` (≤3 min, 1080p, real voice)
- [ ] Demo video uploaded to YouTube unlisted; link added to §6
- [x] X post drafted (`doc/X_POST.md`); clip attached _(draft exists in doc/X_POST.md; clip attachment is part of the publish step)_
- [ ] X post published; URL added to §8
- [x] AI_USAGE.md current — updated 2026-05-15 with the v1 attestation-claim honesty pass and 212-test breakdown
- [ ] **User explicit approval to submit**

When all boxes above are checked: log into HackQuest, paste each numbered section into the matching form field, **wait for user explicit go-ahead**, then click submit.
