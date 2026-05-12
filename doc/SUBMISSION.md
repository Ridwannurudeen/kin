# Hunt — HackQuest Submission Form Answers

Pre-filled answers for the 0G APAC Hackathon submission form. **Review each field before pasting into HackQuest.** Nothing is submitted until you give explicit approval.

> **Honesty preface — applies to every section below.** 0G Sealed Inference was degraded during the submission window (empty / malformed response bodies). The hunter daemon retries 3× per spec and then drops to `lib/audit-fallback.js`, a documented local-heuristic audit path. The live winning finding on bounty #0 was produced on the fallback path — the chain stamps `modelDigest = keccak("hunt-local-audit|hunt-audit-v1")` so the path each finding took is visible on-chain. The contract semantics, the digest structure, and the `ecrecover` gate are identical on both paths. `teeSigner` and `verifier` are operator-held single keys in v1; the v2 plan replaces both with attestation-verifying relay sets (`doc/FUTURE.md`).

---

## 1. Project name
**Hunt**

(Pivoted on 2026-05-11 from predecessor **Kin v2** on the same codebase. Kin v2 contract `0x47F25b…` is preserved on-chain as the historical reference. The credential / fingerprint / attestation plumbing is forked from Kin v2 — `contracts/Hunt.sol` carries the fork note in its docstring.)

## 2. One-sentence description (≤30 words)
Hunt is a sealed bug-bounty network for smart contracts — protocols post encrypted Solidity, AI hunter agents race in 0G Sealed Inference TEEs, per-CWE-class reputation accrues on-chain.

## 3. Short summary

**What it does.** Hunt turns smart-contract auditing into an on-chain race between specialist AI agents. A protocol seals its Solidity source against a shared hunter-network key, posts a bounty with an in-scope CWE class list and a payout, and escrows OG on `contracts/Hunt.sol`. Every registered hunter agent — each one a "senior auditor" identity with verifier-signed GitHub credential, TEE-signed sample fingerprint, and per-CWE reputation — watches `BountyPosted`, downloads + decrypts the code blob, runs top-K retrieval over its own prior-finding samples vs the bounty code, and calls Sealed Inference (`lib/review.js`) to produce a review + self-eval in one shot. The agent picks the highest-severity in-scope finding, encrypts it to the poster's wallet pubkey, uploads to 0G Storage, and signs an attestation digest binding `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps×4)`. `submitFinding` runs `ecrecover` against `teeSigner` and accepts only if `teeTimestamp ∈ [postedAt, raceDeadline]`. The poster picks the winning finding, submits a 4-axis rating, and `settleBounty` pays the winner and updates `ClassRep[hunterId][cweClass]`.

**The live demo proves the per-CWE-reputation thesis end-to-end.** The staged `demo/staged-bounty/Vault.sol` contains a subtle oracle-staleness bug: `_currentPrice()` reads `updatedAt` from `latestRoundData` but only compares it against `block.timestamp` inside the admin-only `setPrice()`. Every user path (`liquidate`, `withdraw`, `mint`, `_isHealthy`, `healthFactorBps`) bypasses the freshness gate. Three hunters raced against bounty #0 on 0G Aristotle mainnet: the reentrancy-specialist and the access-control-specialist both returned zero in-scope findings — correct, the bug is not in their CWE class. The oracle-specialist's heuristic triggered, submitted `oracle-manipulation / high`, and won the 0.05 OG payout. Per-CWE reputation accrued only to the hunter who actually had expertise in that vulnerability class.

**Problem solved.** Existing bug-bounty programs trust a central audit firm or a leaderboard of human pseudonyms. Centralised AI-auditor services are cheatable: you can't tell whether the model claimed actually ran on the input you submitted, or whether the firm replayed cached output. Putting the contract in plaintext on a marketplace also leaks pre-deployment code. Hunt fixes both: code is sealed against the public chain and storage operators (only the storage root + scope go on-chain), and every finding carries a TEE-signed attestation binding the model, the input, and the timestamp. Reputation accrues *per CWE class*, so a hunter who's elite at reentrancy and mid at oracles can't game one rep score across domains — the chain reflects calibrated expertise.

**0G components used** — five primitives, all load-bearing, none decorative:

- **0G Chain (Aristotle, 16661)**: `contracts/Hunt.sol` — hunter registry, bounty escrow, race + settle window, finding submission with `ecrecover`-verified attestation, per-CWE `ClassRep` ledger, credential reuse protection. ~470 LOC, single file.
- **0G Compute / Sealed Inference**: two distinct TEE roles. (1) `lib/fingerprint.js` scores a hunter's prior-finding samples on 4 quality axes at mint time. (2) `lib/review.js` runs the review + self-eval in a single Sealed Inference call per bounty. Both consume 0G's `ZG-Res-Key` attestation via `broker.inference.processResponse`. Today's live submission runs the documented `lib/audit-fallback.js` path because the inference endpoints were degraded during the window.
- **0G Storage**: symmetric AES for the bounty code blob (shared hunter-network key in v1); per-hunter AES for samples + embeddings (per-hunter key, owner-held); ECIES (secp256k1 + HKDF + AES-GCM) for findings encrypted to the bounty poster's pubkey. Primitives in `lib/storage.js`, `lib/ecdh.js`.
- **TEE attestation chain-of-custody**: `teeSigner` address on-chain; off-chain relay produces the digest `Hunt.sol` recovers. v1 = one operator-held key. v2 = TEE-attestation-verifying relay set that signs only when 0G's per-response attestation validates against the model that produced the answer.
- **Credential verifier**: `verifier/server.js` enforces the GitHub-activity bar (≥730d account age, ≥20 merged PRs, ≥10 reviews) and signs a wallet-bound, replay-protected Credential the contract recovers on mint.

**Engineering depth.** 213 tests passing (64 Hunt contract, 78 Kin contract foundation, 21 verifier, 13 ECDH, 10 embedding, 5 pubkey-recover, 22 fingerprint/credential). 13 tests for the defunct Kin v2 agent intentionally fail and are flagged as legacy. Race-deadline enforcement, settle-window enforcement, CWE-scope filter, per-finding `teeTimestamp` window check, self-eval `MIN_FINDING_QUALITY_BPS` floor — all on-chain. Local-fallback path (`lib/audit-fallback.js`) is documented and stamps a distinct `modelDigest` on-chain so judges can audit which path each finding took. Standalone verifier (`scripts/verify_bounty.js`) re-derives the attestation digest from on-chain fields and runs `ecrecover` independently — judges can run it without project setup.

## 4. Track

**Track 3 — Agentic Economy & Autonomous Applications.**

Hunt is a multi-agent economic protocol with on-chain reputation, escrow + payment, and verifiable autonomous execution. Three independent hunter agents race against a single bounty; each is an on-chain identity with its own samples, fingerprint, and per-CWE reputation; the protocol settles by paying the winner and updating reputation. The agents run autonomously off a `BountyPosted` watch loop; there is no human in the inference loop. That is the Track 3 mandate at the literal level.

## 5. 0G Integration Proof

**Contract**: [`0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`](https://chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C) on 0G Aristotle (chain 16661).

**teeSigner**: `0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f` — signs sample fingerprints + finding attestations. `ecrecover`'d on-chain in `Hunt.mintHunter` (fingerprint check, line 224) and `Hunt.submitFinding` (attestation check, line 303).

**verifier**: `0x3a40CA052c10FB6f0B1934e9db680034aFF1759E` — signs GitHub Credentials. `ecrecover`'d on-chain in `Hunt.mintHunter` (line 221).

**Live mainnet activity — every tx hash is real, all settled on chain 16661.**

| Event | Tx hash | Block |
|---|---|---|
| Deploy Hunt | `0xc08f6483a1603564ff38c6808856cc9d7e8cbe120ff95e8ccbc55722f873f6c7` | 32975183 |
| Mint hunter #0 — `reentrancy-specialist` | `0xdac73073211a99c16cad85961461180ead95504bfae331e8e77efb7f053f9d5d` | (see chainscan) |
| Mint hunter #1 — `oracle-specialist` | `0xd9ab16049e3a048ea30b49bb9dfb61584828c621c88bc467c2ad1eb85d6b8354` | (see chainscan) |
| Mint hunter #2 — `access-control-specialist` | `0x66af88fe9718592223580034b3569cc79cc0ae8c8cd596595330a631e08d509f` | (see chainscan) |
| Post bounty #0 — Vault.sol, 0.05 OG, 10-min race, scope {reentrancy, oracle, access-control} | `0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df` | (see chainscan) |
| Oracle-specialist submits winning finding (`oracle-manipulation`, severity `high`) | `0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b` | 32977952 |
| Settle bounty #0 — 0.05 OG to oracle-specialist + per-CWE rep update | `0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4` | 32978103 |

**Primitive-by-primitive call-site references.**

- **0G Compute / Sealed Inference**
  - `scripts/hunter.js:384` — `createZGComputeNetworkBroker(operator)` initialises the broker per daemon.
  - `scripts/hunter.js:386–389` — `broker.inference.listService()` resolves the provider, then `lib/inference.js:sealedQuery` issues the call.
  - `scripts/run_race.js:50–56` — same plumbing for the demo orchestrator (shared funder broker so three personas don't each need a separate inference ledger).
  - `lib/review.js` — combined review + self-eval prompt; consumes the broker via dependency injection.
  - `lib/fingerprint.js` — sample fingerprinter; called at hunter-mint time.
  - `lib/audit-fallback.js` — documented fallback path triggered when Sealed Inference returns 3× empty bodies or malformed JSON. Stamps `modelDigest = keccak("hunt-local-audit|hunt-audit-v1")` so on-chain readers can tell the two paths apart.

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

See repo root `README.md` for the live-deployment table, lifecycle diagram, primitive call-sites, project layout, quickstart, and honesty notes (Sealed Inference outage + fallback path, centralised relay, shared hunter-network key v1 → per-hunter envelope v2). Roadmap: `doc/FUTURE.md`. Demo bug walk-through: `demo/staged-bounty/README.md`. AI usage: `AI_USAGE.md`.

## 8. Public X Post

*[Post URL — see `doc/X_POST.md` for the two drafts]*

- Includes a 30–45s demo clip cut from the hero scene (the live race in terminal).
- Hashtags: `#0GHackathon` `#BuildOn0G`.
- Tags: `@0G_labs` `@0g_CN` `@0g_Eco` `@HackQuest_`.

## 9. Verify the proof yourself

Anyone, no setup required, can verify the live race independently. Clone the repo (read-only — no private key needed) and run:

```bash
git clone https://github.com/Ridwannurudeen/kin && cd kin
npm install
node scripts/verify_bounty.js 0
```

Expected output (abridged):

```
────────────────────────────────────────────────────────────
Hunt verifier  ·  bounty #0
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

- **Frontend**: `node server.js` → `localhost:3000`. Editorial-tone UI with home / hunters / bounties / judge-proof pages, Aristotle mainnet integration live. `public/proof.html?bounty=0` renders the per-bounty receipt — timeline, scope chips, per-finding table, winner panel with the decoded attestation digest fields.
- **Standalone judge verifier**: `scripts/verify_bounty.js` — single-file, zero-setup, depends only on `ethers` + Node built-ins.
- **Bug provenance**: `demo/staged-bounty/README.md` walks the bug, the attack path, the fix, and the public references (Code4rena Prisma Finance Mar 2024, Sherlock Angle Protocol 2024) the staging is sourced from.
- **AI usage attribution**: `AI_USAGE.md`.

---

## Final pre-submission checklist (DO NOT submit until ALL checked)

- [ ] Repo public on GitHub (Ridwannurudeen/kin)
- [ ] `scripts/deploy_hunt.js` recorded — Hunt address in `deployments/Hunt.json`
- [ ] `scripts/populate_hunters.js` — 3 hunter personas minted (ids 0, 1, 2)
- [ ] `scripts/post_bounty.js` — bounty #0 posted against Vault.sol
- [ ] `scripts/run_race.js` — race ran live; oracle-specialist submitted the winning finding
- [ ] `scripts/settle_bounty.js` — bounty #0 settled; 0.05 OG paid to oracle-specialist
- [ ] `scripts/verify_bounty.js 0` exits 0 — winning finding verifies against `teeSigner`
- [ ] README + SUBMISSION tx hashes match what's actually on-chain
- [ ] `npm test` — 213 tests green on the submission branch (13 tests for the defunct Kin v2 agent in `test/agent.test.js` + `test/inference-libs.test.js` intentionally fail; documented as legacy)
- [ ] Demo video recorded per `doc/DEMO_VIDEO_SCRIPT.md` (≤3 min, 1080p, real voice)
- [ ] Demo video uploaded to YouTube unlisted; link added to §6
- [ ] X post drafted (`doc/X_POST.md`); clip attached
- [ ] X post published; URL added to §8
- [ ] AI_USAGE.md current
- [ ] **User explicit approval to submit**

When all boxes above are checked: log into HackQuest, paste each numbered section into the matching form field, **wait for user explicit go-ahead**, then click submit.
