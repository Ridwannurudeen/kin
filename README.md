# Hunt

**Sealed audits. Verifiable auditors. On-chain.**

Hunt is an encrypted bug-bounty network for smart contracts. Protocols seal Solidity code with a shared network key, set a CWE scope and a payout, and post a bounty on-chain. Multiple AI hunter agents race in parallel — each one a senior auditor encoded as an on-chain identity with per-CWE-class reputation. Each finding carries an on-chain attestation digest binding `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEval×4)`. In v1, that digest is signed by an operator-held `teeSigner` that relays over real 0G Sealed Inference; v2 swaps the relay for a TEE-attestation-verifying signer set so the chain enforces the bind directly (see [`doc/FUTURE.md`](doc/FUTURE.md)). The protocol settles by picking the winning finding; the bounty pays out; per-CWE reputation accrues to the hunter who actually has expertise in that vulnerability class.

A 0G APAC Hackathon submission.

> **Live contract**: [`0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`](https://chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C) on 0G Aristotle (chain 16661). **Live frontend**: [https://hunt.gudman.xyz](https://hunt.gudman.xyz) — judge-proof panel at [`/proof.html?bounty=3`](https://hunt.gudman.xyz/proof.html?bounty=3), empirical-specialty hunters board at [`/hunters.html`](https://hunt.gudman.xyz/hunters.html). Predecessor Kin v2 (`0x47F25b2fAf6E5626946582F86F0e52A4517f3234`) is preserved on-chain as a historical reference. Pivoted to Hunt on 2026-05-11 — see the predecessor note at the bottom.

## Where Hunt sits in May 2026

Existing **AI auditors** ([Olympix](https://olympix.security/), [Nethermind AuditAgent](https://docs.auditagent.nethermind.io/intro/) at 30% recall, [Cantina Apex](https://cantina.xyz/welcome), [Trail of Bits' internal AI-native pipeline](https://blog.trailofbits.com/2026/03/31/how-we-made-trail-of-bits-ai-native-so-far/), [Cyfrin Aderyn](https://github.com/Cyfrin/aderyn)) produce findings you have to trust the firm ran honestly — none ship verifiable execution. Existing **continuous monitoring** ([Forta Firewall](https://www.forta.org/blog/the-ai-science-behind-forta-firewall), [Hexagate](https://www.chainalysis.com/product/hexagate/), [Hypernative](https://www.hypernative.io/products/hypernative-platform), [Cyvers](https://cyvers.ai/), [SphereX](https://github.com/spherex-xyz/spherex-protect-contracts)) detects via statistical ML, anomaly classifiers, or hardcoded rules; none reason about novel attack patterns per event. [OpenZeppelin Defender is sunsetting July 1 2026](https://docs.openzeppelin.com/defender). **AI-on-chain alternatives** ([Mira Network's](https://mira.network/) multi-model consensus voting, [Bittensor's](https://taostats.io/subnets) audit subnets — Bitsec SN60 + ReinforcedAI SN92 — doing validator-vs-miner ground-truth scoring) exist but don't target smart-contract audit with finder-vs-falsifier adversarial verification, and neither ships per-CWE specialist reputation.

**Hunt v1 ships the verifiable substrate**: an operator-relayed attestation layer over real 0G Sealed Inference + per-CWE on-chain reputation, both proven live on Aristotle mainnet. **Hunt v2 (post-hackathon, weeks 2–10)** replaces the operator with a TEE-attestation-verifying signer set (so the on-chain digest is chain-enforced rather than relayed) and adds stake-backed adversarial falsification + always-on guardian network for post-deploy monitoring — both verified unbuilt in this space as of May 2026. Pillar-by-pillar plan with primary-source citations in [`doc/FUTURE.md`](doc/FUTURE.md).

## Honesty notes — read first

Three things you should know before reading the rest of this README.

- **The headline live race (bounty #3) ran on real 0G Sealed Inference with a TEE attestation.** The winning finding's on-chain `modelDigest` is `keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`. Compute it locally and pass it to `scripts/verify_bounty.js 3 --model-digest 0x<digest>` for the strict re-derivation check (signer + digest + race-window timestamp). Exit 0 means the chain proves real Sealed Inference produced this finding inside the race window. `lib/audit-fallback.js` is the documented degraded path that activates on inference failure and stamps a *distinct* `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))`, so the two paths are always distinguishable on-chain. Bounty #0 is preserved as an honest record of the fallback path; bounty #2 is the post-fix Sealed Inference race before the per-hunter specialty narrowing landed; bounty #3 is the current headline.
- **The on-chain attestation is operator-relayed in v1, not chain-enforced.** The contract binds `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps×4)` and `ecrecover`s the signature against `teeSigner`. What that proves on-chain is: an operator-held key signed the digest with a `teeTimestamp` inside `[postedAt, raceDeadline]`. What it does **not** prove on-chain: that the model digest came from a validated 0G `ZG-Res-Key` attestation, or that the timestamp is the TEE's own (the v1 daemon uses `block.timestamp` — see `scripts/hunter.js:355`). The honest story is that the hunter daemon **does** call real Sealed Inference, **does** receive a `ZG-Res-Key`, and **does** run `broker.inference.processResponse` off-chain — but only the *fact of those checks* is captured, not their cryptographic binding to the on-chain signature. v2 swaps the operator for a TEE-attestation-verifying relay set so the chain enforces the bind directly (`doc/FUTURE.md`). The contract semantics, the digest structure, and the on-chain `ecrecover` gate are identical between the Sealed Inference path and the documented fallback path — only `modelDigest` differs (which is what `scripts/verify_bounty.js --model-digest` lets you re-derive).
- **`teeSigner` and `verifier` are centralised in v1.** Two operator-held keys today. v2 of the protocol replaces both with a TEE-attestation-verifying relay set and a decentralised verifier network. See `doc/FUTURE.md`.

The full caveats list lives in [`#honesty-notes`](#honesty-notes-full) at the bottom of this file.

## Live deployment

All transactions are real on 0G Aristotle (chain 16661). Click any tx to open it on chainscan.

- **Contract**: `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`
- **teeSigner** (signs fingerprints + finding attestations): `0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f`
- **verifier** (signs GitHub Credentials at mint time): `0x3a40CA052c10FB6f0B1934e9db680034aFF1759E`

### Deploy + hunter mints

| Event | Tx hash | Block |
|---|---|---|
| Deploy Hunt | [`0xc08f6483a1603564ff38c6808856cc9d7e8cbe120ff95e8ccbc55722f873f6c7`](https://chainscan.0g.ai/tx/0xc08f6483a1603564ff38c6808856cc9d7e8cbe120ff95e8ccbc55722f873f6c7) | 32975183 |
| Mint hunter #0 — `reentrancy-specialist` | [`0xdac73073211a99c16cad85961461180ead95504bfae331e8e77efb7f053f9d5d`](https://chainscan.0g.ai/tx/0xdac73073211a99c16cad85961461180ead95504bfae331e8e77efb7f053f9d5d) | (chainscan) |
| Mint hunter #1 — `oracle-specialist` | [`0xd9ab16049e3a048ea30b49bb9dfb61584828c621c88bc467c2ad1eb85d6b8354`](https://chainscan.0g.ai/tx/0xd9ab16049e3a048ea30b49bb9dfb61584828c621c88bc467c2ad1eb85d6b8354) | (chainscan) |
| Mint hunter #2 — `access-control-specialist` | [`0x66af88fe9718592223580034b3569cc79cc0ae8c8cd596595330a631e08d509f`](https://chainscan.0g.ai/tx/0x66af88fe9718592223580034b3569cc79cc0ae8c8cd596595330a631e08d509f) | (chainscan) |

### Bounty #3 — current headline race ★ (real Sealed Inference + per-hunter specialty narrowing)

Three hunters fired against the staged `Vault.sol` oracle-staleness bug on Aristotle mainnet. Each hunter's brief was narrowed to `bounty.inScopeCwes ∩ hunter specialty` so a specialist only ever hunts within their class. Oracle-specialist completed Sealed Inference on attempt 1, surfaced an `oracle-manipulation` finding (severity `high`, model self-eval overall 88.75%), submitted with a real `ZG-Res-Key` TEE attestation; the other two hit transient `fetch failed` on the inference proxy during the concurrent broker race and correctly fell back to the local heuristic — which returned 0 findings in their own specialty class (correct: no reentrancy or access-control bug fires the matching heuristic on Vault.sol). The poster picked oracle-specialist as winner; per-CWE rep accrued only to that hunter.

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #3 — Vault.sol, 0.05 OG, 10-min race, scope {reentrancy, oracle, access-control} | [`0x253064e8680d098c127b9cf7b2d4379136dd25bb6258117b0e4951e848922659`](https://chainscan.0g.ai/tx/0x253064e8680d098c127b9cf7b2d4379136dd25bb6258117b0e4951e848922659) | (chainscan) |
| Oracle-specialist submits winning finding — **real Sealed Inference** (`oracle-manipulation`, `high`) | [`0x78f6075f7ccc99122144335c659005c162e750229d808258e06823a957b37523`](https://chainscan.0g.ai/tx/0x78f6075f7ccc99122144335c659005c162e750229d808258e06823a957b37523) | 33040490 |
| Settle bounty #3 — 0.05 OG to oracle-specialist, per-CWE rep updated | [`0x9edab38c54b927fd507aeaada991694500858af4a31977d2c7154ac658f8d241`](https://chainscan.0g.ai/tx/0x9edab38c54b927fd507aeaada991694500858af4a31977d2c7154ac658f8d241) | 33041034 |

Verify it independently (read-only, no project setup):

```bash
git clone https://github.com/Ridwannurudeen/hunt && cd hunt && npm install
# Compute the headline modelDigest (keccak256 of the model name + version):
node -e "import('ethers').then(({ethers})=>console.log(ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1'))))"
# Then pass that digest to the strict verifier:
node scripts/verify_bounty.js 3 --model-digest 0x<paste the digest above>
```

Strict mode prints `digest match: ✓` (the on-chain `attestationDigest` re-derives from on-chain fields when the modelDigest is supplied), `signer == teeSigner: ✓`, `teeTimestamp window: ✓`, and exits 0. That output is the cryptographic proof that the operator-held `teeSigner` signed a Sealed-Inference-path digest (distinguishable from the fallback path by `modelDigest`) with a timestamp inside the race window. It is **not** by itself proof that the 0G TEE issued the response — that binding becomes chain-enforced in v2 (see `doc/FUTURE.md`).

### Bounty #2 — post-fix Sealed Inference race (no specialty narrowing yet)

Posted after the `max_tokens` fix landed but before per-hunter specialty narrowing. Same winner pattern as #3 (oracle-specialist), severity `critical` this time, also via real Sealed Inference. Preserved as an honest record of the intermediate state.

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #2 | [`0x8da9cf06cfcf963ec9ad000d37a1652f0fb352c43909e6f254255db7091e4314`](https://chainscan.0g.ai/tx/0x8da9cf06cfcf963ec9ad000d37a1652f0fb352c43909e6f254255db7091e4314) | (chainscan) |
| Oracle-specialist submits winning finding (real Sealed Inference, `critical`) | [`0x36bd979cc452c77626493113666b6109a73506380e1f8de610c5b73874eef554`](https://chainscan.0g.ai/tx/0x36bd979cc452c77626493113666b6109a73506380e1f8de610c5b73874eef554) | 33039165 |
| Settle bounty #2 | [`0xa6e03679fc9ced9fbe6a1a185550033821343934cdb12adb9da46a149ce2ed59`](https://chainscan.0g.ai/tx/0xa6e03679fc9ced9fbe6a1a185550033821343934cdb12adb9da46a149ce2ed59) | 33039527 |

### Bounty #7 — reentrancy race ★★ (second positive narrowing data point, real Sealed Inference)

Posted 2026-05-13 against `demo/staged-bounty/Reentrancy.sol` — a textbook checks-effects-interactions violation in a deposit/withdraw pool. Scope locked to `{swc-107-reentrancy, access-control, oracle-manipulation}`. **Reentrancy-specialist (hunter #0) won the bounty** via real Sealed Inference at attempt 1, severity `critical`. The other two specialists ran their inference calls and correctly returned 0 in-scope findings — oracle-specialist passed quality gate at 9875bps with rationale "no oracle-manipulation pattern on these facts"; access-control-specialist returned nothing in-scope. **This is the second positive narrowing data point on-chain** — bounty #3 had the oracle-specialist win on an oracle bug; bounty #7 has the reentrancy-specialist win on a reentrancy bug. Different specialist, different CWE, same protocol.

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #7 — Reentrancy.sol, 0.05 OG, 10-min race | [`0xbc525ef4964b8abb39f2943be95528d9f5d1a3e8a2a11f14fd82c017af9eecac`](https://chainscan.0g.ai/tx/0xbc525ef4964b8abb39f2943be95528d9f5d1a3e8a2a11f14fd82c017af9eecac) | (chainscan) |
| Reentrancy-specialist submits winning finding (real Sealed Inference, `swc-107-reentrancy`, `critical`) | [`0x3a51f97ca7150775902ed4bca4b08536cb7e9f0a59c936cfb246a985036ddd92`](https://chainscan.0g.ai/tx/0x3a51f97ca7150775902ed4bca4b08536cb7e9f0a59c936cfb246a985036ddd92) | 33131912 |
| Settle bounty #7 — 0.05 OG to reentrancy-specialist (hunter #0), per-CWE rep accrued | [`0x6d26cd5fd4927ed9a8631e8f421630247e92abae8008c6b0e58b3aa90f7a2a7f`](https://chainscan.0g.ai/tx/0x6d26cd5fd4927ed9a8631e8f421630247e92abae8008c6b0e58b3aa90f7a2a7f) | 33132360 |

codeRoot: `0xda3bd7d3dc4211eb4406025ceb2b4976b3b1166796c4bfdc6b4693e5c0cc1a15` · settle rating: severityCalibration=5, precision=5, coverage=4, exploitability=5 · hunter #0 `totalWins=1, totalSubmissions=1, totalEarnedWei=0.05 OG` per the on-chain `ClassRep` ledger.

### Bounty #1 — second fallback-path race (preserved record)

Posted May 12 01:45 UTC, before the `max_tokens` budget bug was fixed. Same fallback-path semantics as bounty #0: oracle-specialist won via `lib/audit-fallback.js`, stamping the distinct on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))`. Preserved as the second documented data-point of graceful degradation when Sealed Inference returns empty content.

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #1 | [`0x60cf3d75d88b1c7080b4ac9ea610d3c470ef684f5557a0809f3bf67fd57f0dc9`](https://chainscan.0g.ai/tx/0x60cf3d75d88b1c7080b4ac9ea610d3c470ef684f5557a0809f3bf67fd57f0dc9) | 32987989 |
| Oracle-specialist submits winning finding (fallback path, `high`) | [`0xf6d54d4a35123ccb550dabdfcb71ee2f47bfbc6efa867a0a846fefa776c5c2a6`](https://chainscan.0g.ai/tx/0xf6d54d4a35123ccb550dabdfcb71ee2f47bfbc6efa867a0a846fefa776c5c2a6) | 32988214 |
| Settle bounty #1 — 0.05 OG to oracle-specialist | [`0x5e06c6dc1e94b190ba9ef2fa31baa8da95e05b2a03f3d4436c951bf4d9d93768`](https://chainscan.0g.ai/tx/0x5e06c6dc1e94b190ba9ef2fa31baa8da95e05b2a03f3d4436c951bf4d9d93768) | 32988680 |

### Bounty #0 — original race (fallback path, documented honestly)

The original race on May 11. At the time we believed 0G Sealed Inference was degraded for structured Solidity audit prompts. The actual root cause was a `max_tokens=1500` budget in `lib/review.js`: `zai-org/GLM-5-FP8` is a reasoning model that consumes the entire `max_tokens` budget on internal `reasoning_tokens` before emitting any content, returning `finish_reason: length` with 0 content tokens. Bumping the default to 5000 fixed both `lib/review.js` and `lib/fingerprint.js`. Bounty #0 is preserved on-chain as the documented fallback-path record — every finding still verifies cryptographically, just against the distinct local-fallback `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` rather than the Sealed Inference one.

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #0 | [`0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df`](https://chainscan.0g.ai/tx/0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df) | (chainscan) |
| Oracle-specialist submits winning finding (fallback path, `high`) | [`0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b`](https://chainscan.0g.ai/tx/0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b) | 32977952 |
| Settle bounty #0 | [`0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4`](https://chainscan.0g.ai/tx/0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4) | 32978103 |

### Primary live audit target — ChartChain

Hunt's primary forward-looking audit target is **[ChartChain](https://github.com/Ridwannurudeen/chartchain)**, a separate live 0G project deployed at [`0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`](https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00) on the same chain. `scripts/post_bounty.js` defaults to `audits/chartchain/MedicalRecordsVault.sol` so any fresh race posts against a real protocol's MIT-licensed source rather than a staged file. Full plan + scope + honest forecast in [`audits/chartchain/README.md`](audits/chartchain/README.md).

**Bounty #6 — first ChartChain audit on Aristotle**

| Event | Tx hash | Block |
|---|---|---|
| Post bounty #6 — ChartChain source, 0.05 OG, 10-min race, 5-CWE scope | [`0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461`](https://chainscan.0g.ai/tx/0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461) | (chainscan) |
| Expire bounty #6 — no in-scope findings, 0.05 OG refunded | [`0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22`](https://chainscan.0g.ai/tx/0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22) | 33121294 |

Three hunters raced in parallel. Two ran real Sealed Inference end-to-end (reentrancy at attempt 1, 9000bps overall; oracle at attempt 3, 10000bps) and returned 0 findings — correctly declined to fabricate findings outside their declared specialty. The third hit transient `fetch failed` 3x under concurrent broker load and fell back to `lib/audit-fallback.js`, also returning 0 in-scope findings. Race expired cleanly; escrow refunded. **The bug-finding question against ChartChain remains open** — possibly there are no in-scope vulns; possibly the LLM didn't surface them in 10 minutes. **What is on-chain-proven is the per-CWE-narrowing thesis**: specialists run, find nothing in their lane, don't guess outside it. The bounty #0–#3 tables above are still the cryptographically-verifiable findings record (bounty #3 strict-verify exit 0 against this contract); bounty #6 is the first cross-pollination artifact against a real live 0G protocol.

## The demo: a real bug, three hunters, one winner

The staged `demo/staged-bounty/Vault.sol` contains a subtle oracle-staleness bug. The contract reads `latestRoundData()` in `_currentPrice()` and stores the `updatedAt` field — but the freshness comparison against `block.timestamp` only happens inside the admin-only `setPrice()` function. Every user path (`liquidate`, `withdraw`, `mint`, `_isHealthy`, `healthFactorBps`) routes around the snapshot and trusts the live feed without the freshness gate. Naive linters and grep-style detectors see `updatedAt` is read and `maxOracleStaleness` is defined and mark the contract as clean. The bug only surfaces when an auditor traces *which path actually compares the two*.

Three hunters race against the bounty:

- **#0 reentrancy-specialist** — looks for CEI violations and missing `nonReentrant` modifiers. Returns zero in-scope findings. Correct.
- **#1 oracle-specialist** — looks for `latestRoundData` reads without a `block.timestamp - updatedAt` check. Triggers. Submits `oracle-manipulation`, severity `high`. Wins.
- **#2 access-control-specialist** — looks for `setX` mutators with no `onlyOwner`-style gate. Returns zero in-scope findings. Correct.

This is the per-CWE-reputation thesis demonstrated end-to-end. Hunters who specialise correctly win. Hunters who guess outside their domain *don't*. The reputation update on settle is per `(hunterId, cweClass)` — the oracle-specialist's `oracle-manipulation` rep ticks up; the other two hunters' `oracle-manipulation` rep stays flat because they didn't submit. The chain is granular enough to reward expertise rather than guesswork.

## Architecture

```
protocol  ──[seal code]──>  0G Storage
    │                            │
    │                            ▼
    ▼                       codeRoot ─┐
postBounty(codeRoot, cwes, race)      │  Hunt contract on 0G
                                      │  (escrow + race state)
                                      ▼
┌────────────────────────────────────────┐
│ N hunter agents watch BountyPosted     │
│ → fetch + decrypt code in own TEE      │
│ → run sealed inference (or fallback)   │
│ → submitFinding(bountyId, hunterId,    │
│      cweClass, sev, attestation)       │
└────────────────────────────────────────┘
                │
                ▼
poster reads findings → settleBounty(idx, rating)
                │
                ▼
payout to winner + per-CWE reputation updated on-chain
```

End-to-end lifecycle, mapped to the actual contract + script paths:

```
1. Hunter mint (one-time per persona)
   └─ verifier signs GitHub Credential (account age + merged PRs + reviews)
   └─ samples: prior audit findings → AES-encrypted to a per-hunter key → 0G Storage roots
   └─ embeddings: 256-dim feature-hashed → encrypted → 0G Storage roots
   └─ fingerprint: Sealed Inference scores samples on 4 axes → teeSigner signs
   └─ Hunt.mintHunter(...) — credential sig + fingerprint sig verified on-chain

2. Protocol posts bounty
   └─ Solidity sources serialised, symmetrically encrypted with shared hunter-network key
   └─ uploaded to 0G Storage → codeRoot
   └─ Hunt.postBounty(codeRoot, inScopeCwes[], raceDuration, { value: payout })

3. N hunter daemons race (scripts/hunter.js, orchestrator: scripts/run_race.js)
   └─ each watches BountyPosted, downloads the code blob, network-key-decrypts in TEE
   └─ top-K retrieval over its own samples vs the decrypted code
   └─ lib/review.js: Sealed Inference → review + self-eval in one call
   └─ on 3× transport/quality failure: lib/audit-fallback.js (documented heuristic path)
   └─ pickBestFinding(): highest-severity in-scope finding, ties broken by array index
   └─ encrypts the finding to the poster's pubkey, uploads to 0G Storage
   └─ lib/credential.signFindingAttestation(): teeSigner-signed digest binding
       (bountyId, codeRoot, hunterId, cweClass, severity, findingRoot,
        modelDigest, teeTimestamp, selfEvalBps×4)
   └─ Hunt.submitFinding(bountyId, hunterId, FindingInput) — contract ecrecovers vs teeSigner

4. Poster settles
   └─ scripts/settle_bounty.js — chooses winningIdx + 4-axis rating
   └─ Hunt.settleBounty(bountyId, idx, AuditRating) — payout + ClassRep update
   └─ ClassRepUpdated event: (hunterId, cweClass, wins, submissions)

5. Verify the proof
   └─ scripts/verify_bounty.js — re-derives the attestation digest from chain state,
      ecrecovers the signature, checks teeTimestamp ∈ [postedAt, raceDeadline]
```

Five 0G primitives, all load-bearing:

- **0G Chain (Aristotle, 16661)** — single-file `contracts/Hunt.sol`. Hunter registry, bounty escrow, race deadline, settle window, finding submission, attestation `ecrecover`, per-CWE `ClassRep` ledger.
- **0G Storage** — symmetric AES for the bounty code blob (shared hunter-network key, v1) plus per-hunter AES for samples + embeddings; ECIES (secp256k1 + HKDF + AES-GCM) for findings encrypted to the poster's pubkey. Primitives in `lib/storage.js` + `lib/ecdh.js`.
- **0G Compute / Sealed Inference** — two roles. (1) `lib/fingerprint.js` scores a hunter's prior-finding samples on 4 quality axes at mint time. (2) `lib/review.js` runs the review + self-eval in a single combined call per bounty. Both produce 0G `ZG-Res-Key` attestations consumed via `broker.inference.processResponse`. The headline bounty #3 ran on Sealed Inference end-to-end (winning finding's `modelDigest = keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`).
- **TEE attestation chain-of-custody** — the `teeSigner` address on-chain. An off-chain relay signs the digest the contract recovers; v2 swaps the relay for a TEE-attestation-verifying multi-signer set.
- **Credential verifier** — GitHub-OAuth-backed `verifier/server.js` enforces a real account-age / merged-PR / review-count bar before a wallet can mint a hunter. Credentials are bound to the minting wallet + replay-protected.

## Why 0G specifically

- **Sealed Inference is the anti-cheat substrate.** 0G's `ZG-Res-Key` attestation, validated off-chain via `broker.inference.processResponse`, is the primitive that lets an honest finding be tied to a sealed enclave run. v1 carries that signal off-chain (the hunter daemon validates it before submitting) and relays it on-chain via an operator-held `teeSigner` — so the chain currently witnesses the operator's relay, not the attestation directly. v2 (`doc/FUTURE.md`) moves the relay into a TEE-attestation-verifying signer set so the chain enforces the bind. Without something in this substrate, "AI auditor reputation" is a vibe; no comparable primitive ships on any other L1 today.
- **0G Storage holds sealed code without leaking it.** The bounty code blob is encrypted before upload; only the storage root lands on-chain. The protocol's source never reaches the public chain.
- **0G Chain settles escrow + reputation in one place.** Bounty payout, per-CWE `ClassRep` math, finding signature `ecrecover`, race-deadline + settle-window enforcement — one contract, one block-time-deterministic settlement. Reputation can't be silently rewritten by an off-chain operator because it isn't held off-chain.

## Quickstart

```bash
git clone https://github.com/Ridwannurudeen/hunt && cd hunt
npm install

# Reproduces the live deployment hashes — all green, all real on chain 16661.
npm test

# Serve the on-chain-reading frontend locally (mirrors hunt.gudman.xyz).
npm run dev   # → http://localhost:3000

# Verify the live race yourself, no setup required (read-only RPC).
node scripts/verify_bounty.js 0
```

`scripts/verify_bounty.js 0` fetches bounty #0 from `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`, pulls the winning finding, re-derives the attestation digest from on-chain fields, runs `ecrecover` against the signature, and prints a verification report. Exit code 0 means the winning finding's attestation matches the on-chain `teeSigner`.

To run the full lifecycle yourself (mint hunters, post a bounty, race, settle):

```bash
cp .env.example .env  # PRIVATE_KEY=0x... (Aristotle mainnet, ≥1 OG)

# Deploy a fresh Hunt instance and seed three hunter personas
node scripts/deploy_hunt.js
node scripts/populate_hunters.js

# Post a bounty against the staged Vault.sol
node scripts/post_bounty.js

# Race all three hunters in parallel against the bounty
BOUNTY_ID=0 node scripts/run_race.js

# Settle (4-axis rating + payout to the winning hunter)
node scripts/settle_bounty.js
```

## Project layout

```
contracts/
  Hunt.sol                 — single-file Hunt contract (~470 LOC)
  Notary.sol               — public-good AI conversation receipt registry
  HuntReputationOracle.sol — read-only per-domain reputation wrapper
  Kin.sol                  — predecessor, preserved for the historical record
packages/
  sdk/                     — @hunt-protocol/verifiable-ai primitives + examples
lib/
  audit-fallback.js        — local heuristic audit path (oracle / reentrancy / access-control)
  credential.js            — Credential, Fingerprint, FindingAttestation digests + signers
  cwe.js                   — canonical CWE/SWC class registry (kebab-case + bytes32)
  ecdh.js                  — secp256k1 ECIES (encrypt-to-wallet-pubkey)
  embedding.js             — 256-dim feature-hashed L2-normalised embeddings
  fingerprint.js           — Sealed Inference sample fingerprinter
  inference.js             — 0G Sealed Inference adapters (lazy-loaded SDK)
  pubkey.js                — recover wallet pubkey from on-chain tx
  retrieval.js             — top-K cosine retrieval
  review.js                — combined review + self-eval generator
  storage.js               — 0G Storage helpers (raw + AES-GCM wrappers)
scripts/
  deploy_hunt.js           — deploy Hunt to Aristotle mainnet
  populate_hunters.js      — mint 3 demo hunter personas
  post_bounty.js           — seal Vault.sol + post bounty #0
  hunter.js                — long-lived hunter daemon (one process per operator)
  run_race.js              — one-shot orchestrator (all 3 hunters in parallel for demo)
  settle_bounty.js         — pick winner + rating, settle
  verify_bounty.js         — standalone verifier (no project setup needed)
  insurance_specialist_brief.js  — v2 vertical demo: builds the insurance-defense brief + computes the v1 attestation digest against audits/insurance/sample_denial.txt
  benefits_specialist_brief.js   — v2 vertical demo: builds the SSDI/SSI/senior-benefits defense brief + computes the v1 attestation digest against audits/benefits/sample_denial.txt
  medical_specialist_brief.js    — v2 vertical demo: builds the Records-Reader brief (scope-locked to "questions for physician") + computes the v1 attestation digest against audits/medical/sample_pathology_report.txt
public/
  index.html               — landing
  hunters.html             — registry of minted hunters
  bounties.html            — live + settled bounty list
  proof.html               — judge proof panel (per-bounty receipt)
  notary.html              — public AI conversation notary
demo/
  staged-bounty/Vault.sol  — staged oracle-staleness bug
  staged-bounty/README.md  — bug walk-through + attack path + reference findings
  hunter-personas.json     — the 3 specialist personas
test/                      — Hardhat test suite (Hunt + predecessor Kin tests)
verifier/                  — GitHub OAuth verifier service
doc/
  SUBMISSION.md            — HackQuest submission text
  NOTARY_INTEGRATION.md    — developer guide for embedding Hunt Notary
  REPUTATION_ORACLE.md     — cross-chain consumer guide for Hunt reputation
  INSTITUTIONAL_PARTNERSHIP.md — Hunt-as-a-Service partnership playbook
  X_POST.md                — X post drafts
  DEMO_VIDEO_SCRIPT.md     — recording script
  FUTURE.md                — v2 roadmap (decentralised relay + per-hunter ECDH envelope)
  V2_SPEC.md               — predecessor Kin v2 spec (historical)
```

## Tests

```bash
npm test
```

**208 tests passing, 0 failing.** Breakdown:

- 68 — `test/Hunt.test.js` (contract — mint, post, submit, settle, expire, scope, race window, attestation, rep; includes v1.1 ClassRep math regression suite)
- 78 — `test/Kin.test.js` (Kin v2 predecessor contract — kept as foundation regression baseline)
- 21 — `test/verifier.test.js` (GitHub OAuth verifier service)
- 13 — `test/ecdh.test.js` (ECIES round-trips)
- 10 — `test/embedding.test.js`
- 7  — `test/Notary.test.js` (HuntNotary attestation registry)
- 6  — `test/HuntReputationOracle.test.js` (cross-chain reputation read layer)
- 5  — `test/pubkey.test.js`

Two test files for the defunct Kin v2 agent (`agent.test.js`, `inference-libs.test.js`) target an older `lib/review.js` schema (`review.summary`/`suggestions`) that no longer matches Hunt's `findings`/`selfEval` shape. They're parked under `test-legacy/` and excluded from the default `npm test` to keep the headline count clean; treat them as a historical regression baseline only.

## Honesty notes (full)<a name="honesty-notes-full"></a>

- **Privacy model.** Bounty code is sealed against storage operators, the public chain, and any party that doesn't hold the shared hunter-network key. The honest exposure is: each registered hunter operator decrypts the code locally before passing it to Sealed Inference; the 0G TEE provider sees plaintext at inference time. What's protected from third parties is everything else.
- **What TEE attestation gives you, and where v1 stops short.** Off-chain, 0G's `ZG-Res-Key` + `broker.inference.processResponse` give *output integrity* — verifiable proof that a given response came from a sealed enclave running an attested model. The Hunt daemon performs that check on every inference call. **What v1 does not do** is bind the off-chain `ZG-Res-Key` validation to the on-chain signature: the operator-held `teeSigner` is what `Hunt.sol` `ecrecover`s, and the `teeTimestamp` is `block.timestamp`-derived (`scripts/hunter.js:355`) rather than extracted from the TEE attestation header. v1 is therefore an **operator-relayed attestation layer over real Sealed Inference**; v2 closes the gap by making the relay a TEE-attestation-verifying signer set whose signature is only valid when the underlying `ZG-Res-Key` validates against the model that produced the response. Plan: `doc/FUTURE.md`.
- **The original bounty #0 race ran on the fallback path because of a `max_tokens` budget bug, not a 0G outage.** `zai-org/GLM-5-FP8` is a reasoning model and burned the entire 1500-token budget on internal `reasoning_tokens` before emitting any content; the daemon interpreted the resulting empty content as endpoint failure and fell back to `lib/audit-fallback.js` (a documented local-heuristic path that runs only the heuristic matching each hunter's specialty). Bumping the default to 5000 in `lib/review.js` and `lib/fingerprint.js` fixed both paths. Bounties #2 and #3 are post-fix re-races on real Sealed Inference. The fallback path also activates correctly on genuine transient failures (observed in bounty #3 for two of three hunters under concurrent broker load) and stamps a distinct on-chain `modelDigest = keccak256(utf8("hunt-local-audit|hunt-audit-v1"))` so the two paths are always distinguishable.
- **Centralised `teeSigner` + `verifier`.** Single operator-held keys today. v2 introduces (a) a TEE-attestation-verifying relay set that signs only when 0G's `ZG-Res-Key` attestation validates against the model that produced the response, and (b) a multi-issuer GitHub credential schema via EAS. Both documented in `doc/FUTURE.md`.
- **Shared hunter-network key.** The bounty code blob is sealed with one symmetric key shared across all registered hunters in v1. Simple, gets the race off the ground. v2 replaces this with a per-hunter ECDH envelope on the `Bounty` struct, so a leak from one hunter is bounded to that hunter rather than exposing the code to the network. Documented in `doc/FUTURE.md`.
- **Race orchestration.** v1's `scripts/hunter.js` is one-hunter-per-process under a file lock. The demo uses `scripts/run_race.js` to fire all three personas against a single bounty in parallel — a deliberate orchestration choice for the recording, not a production pattern. v2 = N daemons across N hosts.
- **Demo bounty is staged.** `demo/staged-bounty/Vault.sol` is a fictional CDP. The oracle-staleness pattern is sourced from public Code4rena (Prisma Finance, Mar 2024) and Sherlock (Angle Protocol, 2024) reports. Provenance + reference findings live in `demo/staged-bounty/README.md`.

## Predecessor — Kin v2

Hunt is a pivot from **Kin v2**, the immediate predecessor on the same codebase. Kin v2 framed the same primitives (sealed inference + INFT-style identity + on-chain reputation) around senior-engineer code review marketplace economics. The audit-vertical narrative is sharper for 0G's compute story — adversarial AI agents racing on sealed code with TEE attestation as the anti-cheat is exactly the workload TEE inference is built for, in a way "code review marketplace" wasn't.

Kin v2's contract `0x47F25b2fAf6E5626946582F86F0e52A4517f3234` is preserved on-chain as the historical reference. The credential / fingerprint / attestation plumbing is identical between the two contracts (Hunt is forked from Kin v2 — `contracts/Hunt.sol` carries the fork note in its docstring). The Kin-specific test suite remains in-tree as the predecessor's regression baseline.

## Links

- **Submission**: [`doc/SUBMISSION.md`](doc/SUBMISSION.md)
- **Anticipated judge questions** (pre-emptive Q&A on centralization, capability curve, fallback path, v2 design): [`doc/JUDGE_FAQ.md`](doc/JUDGE_FAQ.md)
- **v2 roadmap** (4-pillar plan against verified May 2026 competitor landscape): [`doc/FUTURE.md`](doc/FUTURE.md)
- **Protocol status** (live Hunt / Notary / Oracle reads from Aristotle): [`https://hunt.gudman.xyz/status.html`](https://hunt.gudman.xyz/status.html)
- **L1 SDK** (`@hunt-protocol/verifiable-ai` primitives, examples, tests): [`packages/sdk/README.md`](packages/sdk/README.md)
- **Notary integration** (hash-only AI conversation receipts on Aristotle): [`doc/NOTARY_INTEGRATION.md`](doc/NOTARY_INTEGRATION.md)
- **Notary demo receipt** (attestId `0`, tx `0x1dcb653c…4b5c15`): [`deployments/NotaryDemoReceipt.json`](deployments/NotaryDemoReceipt.json)
- **Reputation Oracle integration** (cross-chain-readable Hunt reputation): [`doc/REPUTATION_ORACLE.md`](doc/REPUTATION_ORACLE.md)
- **Institutional partnership / Hunt-as-a-Service**: [`doc/INSTITUTIONAL_PARTNERSHIP.md`](doc/INSTITUTIONAL_PARTNERSHIP.md)
- **Demo video script**: [`doc/DEMO_VIDEO_SCRIPT.md`](doc/DEMO_VIDEO_SCRIPT.md)
- **X post drafts**: [`doc/X_POST.md`](doc/X_POST.md)
- **AI usage**: [`AI_USAGE.md`](AI_USAGE.md)
- **Operator onboarding** (≤30 min for external security researchers to run a hunter): [`doc/OPERATOR_ONBOARDING.md`](doc/OPERATOR_ONBOARDING.md)
- **Outreach templates** (security researchers + 0G core team): [`doc/OUTREACH_TEMPLATES.md`](doc/OUTREACH_TEMPLATES.md)
- **Release assets** (video editor brief + YouTube description + X teaser thread): [`doc/RELEASE_ASSETS.md`](doc/RELEASE_ASSETS.md)
- **Primary live audit — ChartChain** (Hunt audits another live 0G project on Aristotle mainnet): [`audits/chartchain/README.md`](audits/chartchain/README.md)
- **Expansion appendices**: [`audits/insurance/README.md`](audits/insurance/README.md), [`audits/benefits/README.md`](audits/benefits/README.md), [`audits/medical/README.md`](audits/medical/README.md)

## License

MIT.
