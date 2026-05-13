# Hunt — HackQuest Submission Form Answers

Pre-filled answers for the 0G APAC Hackathon submission form. **Review each field before pasting into HackQuest.** Nothing is submitted until you give explicit approval.

> **Honesty preface — applies to every section below.** The headline live race is **bounty #3**: oracle-specialist submitted the winning finding via real 0G Sealed Inference (`zai-org/GLM-5-FP8`) with a `ZG-Res-Key` TEE attestation. The on-chain `modelDigest` is `keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))` — pass it to `scripts/verify_bounty.js 3 --model-digest 0x<digest>` for strict cryptographic re-derivation (one-liner to compute the digest is in §9). Bounty #0 was the original race, ran on the documented fallback path (`lib/audit-fallback.js`) because of a `max_tokens=1500` budget bug in `lib/review.js` — `zai-org/GLM-5-FP8` is a reasoning model and burned the entire budget on internal `reasoning_tokens` before emitting any content. The fix (bump to 5000) is one line in `lib/review.js` and one line in `lib/fingerprint.js`. Bounty #0 is preserved on-chain as an honest record; bounty #2 is the post-fix Sealed Inference race before per-hunter specialty narrowing; bounty #3 is the current headline. The fallback path's on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` is *distinct* from the Sealed Inference one, so the two paths are always distinguishable. Contract semantics, digest structure, and the `ecrecover` gate are identical between paths — only the `modelDigest` differs. `teeSigner` and `verifier` are operator-held single keys in v1; the v2 plan replaces both with attestation-verifying relay sets (`doc/FUTURE.md`).

---

## 1. Project name
**Hunt**

(Pivoted on 2026-05-11 from predecessor **Kin v2** on the same codebase. Kin v2 contract `0x47F25b…` is preserved on-chain as the historical reference. The credential / fingerprint / attestation plumbing is forked from Kin v2 — `contracts/Hunt.sol` carries the fork note in its docstring.)

## 2. One-sentence description (≤30 words)
Hunt is a sealed bug-bounty network for smart contracts — protocols post encrypted Solidity, AI hunter agents race in 0G Sealed Inference TEEs, per-CWE-class reputation accrues on-chain.

## 3. Short summary

**What it does.** Hunt turns smart-contract auditing into an on-chain race between specialist AI agents. A protocol seals its Solidity source against a shared hunter-network key, posts a bounty with an in-scope CWE class list and a payout, and escrows OG on `contracts/Hunt.sol`. Every registered hunter agent — each one a "senior auditor" identity with verifier-signed GitHub credential, TEE-signed sample fingerprint, and per-CWE reputation — watches `BountyPosted`, downloads + decrypts the code blob, runs top-K retrieval over its own prior-finding samples vs the bounty code, and calls Sealed Inference (`lib/review.js`) to produce a review + self-eval in one shot. The agent picks the highest-severity in-scope finding, encrypts it to the poster's wallet pubkey, uploads to 0G Storage, and signs an attestation digest binding `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps×4)`. `submitFinding` runs `ecrecover` against `teeSigner` and accepts only if `teeTimestamp ∈ [postedAt, raceDeadline]`. The poster picks the winning finding, submits a 4-axis rating, and `settleBounty` pays the winner and updates `ClassRep[hunterId][cweClass]`.

**The live demo proves the per-CWE-reputation thesis end-to-end.** The staged `demo/staged-bounty/Vault.sol` contains a subtle oracle-staleness bug: `_currentPrice()` reads `updatedAt` from `latestRoundData` but only compares it against `block.timestamp` inside the admin-only `setPrice()`. Every user path (`liquidate`, `withdraw`, `mint`, `_isHealthy`, `healthFactorBps`) bypasses the freshness gate. Headline race is **bounty #3** on Aristotle mainnet: three hunters fired in parallel against the bounty, each one's brief narrowed to `bounty.inScopeCwes ∩ hunter specialty` (a reentrancy specialist will never submit an oracle finding even on a multi-scope bounty). Oracle-specialist completed Sealed Inference on attempt 1, surfaced `oracle-manipulation / high` with model self-eval overall 88.75% (severityCalibration 8500 / precision 9200 / coverage 8800 / exploitability 9000), submitted with real `ZG-Res-Key` TEE attestation, and won the 0.05 OG payout. The other two specialists hit transient `fetch failed` on the inference proxy under concurrent broker load, fell back to the documented local heuristic per spec, and returned 0 findings in their respective specialty classes — correct, no reentrancy or access-control bug fires the matching heuristic on this Vault. Per-CWE reputation accrued only to the hunter with the matching specialty. Bounty #2 (pre-specialty-narrowing post-fix race) shows the same outcome with severity `critical`. Bounty #0 (pre-fix original race) shows the same outcome via the local-fallback path, with its distinct on-chain `modelDigest` proving exactly which path was taken.

**Problem solved.** Existing bug-bounty programs trust a central audit firm or a leaderboard of human pseudonyms. Centralised AI-auditor services are cheatable: you can't tell whether the model claimed actually ran on the input you submitted, or whether the firm replayed cached output. Putting the contract in plaintext on a marketplace also leaks pre-deployment code. Hunt fixes the first half of that today and lays the substrate for the second: code is sealed against the public chain and storage operators (only the storage root + scope go on-chain), and every finding carries an on-chain digest binding `(model, input, hunter, CWE-class, severity, finding-root, race-window timestamp, self-eval×4)`. In v1 that digest is signed by an operator-held `teeSigner` relaying over real 0G Sealed Inference — the hunter daemon validates each `ZG-Res-Key` via `broker.inference.processResponse` before submitting, but the chain witnesses the operator's relay, not the attestation directly. v2 (`doc/FUTURE.md`) replaces the operator with a TEE-attestation-verifying signer set so the chain enforces the bind. Reputation accrues *per CWE class*, so a hunter who's elite at reentrancy and mid at oracles can't game one rep score across domains — the chain reflects calibrated expertise.

**Where Hunt sits in May 2026 (verified competitive scan).** Existing AI auditors (Olympix BugPOCer, Nethermind AuditAgent at 30% recall, Cantina Apex, Trail of Bits' internal AI-native pipeline, Cyfrin Aderyn) produce findings you trust the firm to have run honestly — none ship verifiable execution. Existing continuous monitoring (Forta Firewall's Graph Neural Network, Hexagate's ML anomaly stack, Hypernative, Cyvers, SphereX) detects via statistical ML or hardcoded rules; none reason about novel attack patterns per event, and OpenZeppelin Defender is sunsetting July 1 2026. AI-on-chain alternatives (Mira Network's multi-model consensus voting, Bittensor's audit subnets — Bitsec SN60 + ReinforcedAI SN92 doing validator-vs-miner ground-truth scoring) exist but don't target smart-contract audit with finder-vs-falsifier adversarial verification, and neither ships per-CWE specialist reputation. **Hunt v1 ships the verifiable substrate**: an operator-relayed attestation layer over real 0G Sealed Inference + per-CWE on-chain reputation, both proven live on Aristotle mainnet (bounty #3 strict-mode verifier exits 0 with `digest match ✓ / signer == teeSigner ✓ / teeTimestamp window ✓` — meaning the operator-held `teeSigner` signed a Sealed-Inference-path digest, distinguishable from the fallback path by `modelDigest`, inside the race window). **Hunt v2 (post-hackathon, weeks 2–10)** adds stake-backed adversarial falsification and an always-on guardian network for post-deploy monitoring, both verified unbuilt in this space — full pillar-by-pillar plan with primary-source citations in `doc/FUTURE.md`.

**0G components used** — five primitives, all load-bearing, none decorative:

- **0G Chain (Aristotle, 16661)**: `contracts/Hunt.sol` — hunter registry, bounty escrow, race + settle window, finding submission with `ecrecover`-verified attestation, per-CWE `ClassRep` ledger, credential reuse protection. ~470 LOC, single file.
- **0G Compute / Sealed Inference**: two distinct TEE roles. (1) `lib/fingerprint.js` scores a hunter's prior-finding samples on 4 quality axes at mint time. (2) `lib/review.js` runs the review + self-eval in a single Sealed Inference call per bounty. Both consume 0G's `ZG-Res-Key` attestation via `broker.inference.processResponse`. The headline bounty #3 ran on real Sealed Inference end-to-end — winning finding's on-chain `modelDigest = keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`, strict re-verification via `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 with three checkmarks. `lib/audit-fallback.js` is the documented degraded path, exercised in bounty #3 for the two hunters whose concurrent inference calls hit transient `fetch failed` under simultaneous broker load — same on-chain semantics, distinct `modelDigest`.
- **0G Storage**: symmetric AES for the bounty code blob (shared hunter-network key in v1); per-hunter AES for samples + embeddings (per-hunter key, owner-held); ECIES (secp256k1 + HKDF + AES-GCM) for findings encrypted to the bounty poster's pubkey. Primitives in `lib/storage.js`, `lib/ecdh.js`.
- **TEE attestation chain-of-custody**: `teeSigner` address on-chain; off-chain relay produces the digest `Hunt.sol` recovers. v1 = one operator-held key. v2 = TEE-attestation-verifying relay set that signs only when 0G's per-response attestation validates against the model that produced the answer.
- **Credential verifier**: `verifier/server.js` enforces the GitHub-activity bar (≥730d account age, ≥20 merged PRs, ≥10 reviews) and signs a wallet-bound, replay-protected Credential the contract recovers on mint.

**Engineering depth.** 195 tests passing, 0 failing (68 Hunt contract — including the v1.1 ClassRep math regression suite added in self-audit response; 78 Kin contract foundation, 21 verifier, 13 ECDH, 10 embedding, 5 pubkey-recover). Two Kin v2 agent legacy test files target the older `review.summary` schema and are parked under `test-legacy/`, excluded from the default `npm test`. Race-deadline enforcement, settle-window enforcement, CWE-scope filter, per-hunter specialty intersection (`scripts/hunter.js` `hunterSpecialtyCwes` param), per-finding `teeTimestamp` window check, self-eval `MIN_FINDING_QUALITY_BPS` floor — all on-chain. Local-fallback path (`lib/audit-fallback.js`) is documented and stamps a distinct `modelDigest` on-chain so judges can audit which path each finding took. Standalone verifier (`scripts/verify_bounty.js`) re-derives the attestation digest from on-chain fields and runs `ecrecover` independently — judges can run it without project setup; pass `--model-digest 0x<digest>` for strict cryptographic re-derivation (one-liner in §9).

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

- **Primary live audit target — ChartChain**: Hunt audits [**ChartChain**](https://github.com/Ridwannurudeen/chartchain), a separate live 0G project (medical-records INFT + Sealed Inference query, mainnet [`0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`](https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00)). `audits/chartchain/MedicalRecordsVault.sol` is verbatim from ChartChain's master branch under MIT licence; `scripts/post_bounty.js` defaults to this file so any fresh race targets a real protocol's deployed source rather than a staged file. Plan + 5-CWE scope + honest forecast in [`audits/chartchain/README.md`](../audits/chartchain/README.md). Bounty #0–#3 above remain the cryptographically-verifiable historical record; ChartChain is the protocol's headline forward-looking audit target. Demonstrates Hunt extending beyond DeFi to healthcare/data verticals and "any domain with structured judgement against a known taxonomy."
- **Beyond crypto — verifiable AI for ordinary citizens**: Hunt's primitives (sealed inference, multi-specialist competition, on-chain per-domain reputation) apply 1:1 to **health-insurance claim-denial defense**. 73M ACA denials in 2023; <1% appealed; 40–75% appeal-success when they did. Three live AI-appeal products (Counterforce Health, Claimable, Fight Health Insurance) have validated the category at 70–80% reversal without TEE attestation; all route patient records through OpenAI/Anthropic. Hunt closes that gap. Architecture map, specialist subdomains (medical-necessity / coding-CPT / prior-auth / ERISA-procedural / state-external-review), regulatory framing (Colorado SB24-205/SB26-189, EU AI Act Annex III), and a synthetic denial letter modeled on the public *Estate of Lokken v. UnitedHealth* pleadings in [`audits/insurance/README.md`](../audits/insurance/README.md). Tier-A docs-only positioning for the May 2026 submission; first on-chain insurance bounty fires in v2 post-hackathon once specialist briefs are tuned for legal/clinical-policy reasoning.
- **Frontend (live)**: [https://hunt.gudman.xyz](https://hunt.gudman.xyz) — editorial-tone UI with home / hunters / bounties / judge-proof pages, Aristotle mainnet integration live. [`https://hunt.gudman.xyz/proof.html?bounty=3`](https://hunt.gudman.xyz/proof.html?bounty=3) renders the per-bounty receipt for the headline race — timeline, scope chips, per-finding table, winner panel with the decoded attestation digest fields. [`https://hunt.gudman.xyz/hunters.html`](https://hunt.gudman.xyz/hunters.html) shows the per-CWE empirical specialty board (declared specialty + dominant CWE from on-chain `ClassRepUpdated` wins, side-by-side with match indicator). Hosted on VPS via nginx static-serve of `public/` over Let's Encrypt TLS.
- **Standalone judge verifier**: `scripts/verify_bounty.js` — single-file, zero-setup, depends only on `ethers` + Node built-ins.
- **Bug provenance**: `demo/staged-bounty/README.md` walks the bug, the attack path, the fix, and the public references (Code4rena Prisma Finance Mar 2024, Sherlock Angle Protocol 2024) the staging is sourced from.
- **AI usage attribution**: `AI_USAGE.md`.

---

## Final pre-submission checklist (DO NOT submit until ALL checked)

- [ ] Repo public on GitHub (Ridwannurudeen/hunt)
- [ ] `scripts/deploy_hunt.js` recorded — Hunt address in `deployments/Hunt.json`
- [ ] `scripts/populate_hunters.js` — 3 hunter personas minted (ids 0, 1, 2)
- [ ] `scripts/post_bounty.js` — bounty #0 posted against Vault.sol
- [ ] `scripts/run_race.js` — race ran live; oracle-specialist submitted the winning finding
- [ ] `scripts/settle_bounty.js` — bounty #0 settled; 0.05 OG paid to oracle-specialist
- [ ] `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 — winning finding cryptographically verifies against `teeSigner` AND `modelDigest` (real Sealed Inference proof)
- [ ] README + SUBMISSION tx hashes match what's actually on-chain
- [ ] `npm test` — 195 tests green, 0 failing (legacy Kin v2 agent tests parked under `test-legacy/` and excluded from default suite)
- [ ] Demo video recorded per `doc/DEMO_VIDEO_SCRIPT.md` (≤3 min, 1080p, real voice)
- [ ] Demo video uploaded to YouTube unlisted; link added to §6
- [ ] X post drafted (`doc/X_POST.md`); clip attached
- [ ] X post published; URL added to §8
- [ ] AI_USAGE.md current
- [ ] **User explicit approval to submit**

When all boxes above are checked: log into HackQuest, paste each numbered section into the matching form field, **wait for user explicit go-ahead**, then click submit.
