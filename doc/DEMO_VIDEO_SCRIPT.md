# Hunt — Demo Video Script (≤3 min)

Record at 1080p, 30+ fps. Real voice, no TTS. Single take if you can; one cut at the join between the race and the verification beat is acceptable.

**Before recording (Plan A — preferred, deterministic).** Pre-fire a fresh bounty against `demo/staged-bounty/Vault.sol`. That contract has a deliberate oracle-staleness bug (sourced from USSD's Sherlock audit, judging issue #31) that the oracle-specialist hits on every run with real Sealed Inference. Bounties #3 and #8 both demonstrated this exact race settling cleanly on Aristotle mainnet — #8 was run as a recording dry run, so the flow is proven; the recording is a fresh re-run for the camera.

```bash
node scripts/post_bounty.js --file demo/staged-bounty/Vault.sol \
  --payout 0.05 --race-duration 600 \
  --cwes swc-107-reentrancy,oracle-manipulation,access-control
```

Capture the returned `bountyId` (this becomes `<HERO_ID>` everywhere below) and the post tx hash. Have the live deployment loaded — three hunters minted; the bounty OPEN on the bounties page; `scripts/run_race.js` ready in a terminal. Open four windows: (1) `public/bounties.html` showing the bounty OPEN with countdown, (2) terminal with `BOUNTY_ID=<HERO_ID> node scripts/run_race.js` ready, (3) `public/proof.html?bounty=<HERO_ID>` for the verification beat, (4) `chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` pinned so txs are reachable from the screen.

**Plan B (fallback, pre-recorded).** If 0G's broker is degraded during the recording window and a fresh race won't run cleanly, narrate over **bounty #3**'s already-settled artifacts — its hero finding is on-chain forever, strict-mode verifier exits 0 today against the live contract. The script narration works for either path; just swap `<HERO_ID>` for `3` in every command. Plan B sacrifices the live-race terminal beat for guaranteed cryptographic-proof footage.

**ChartChain is the wrap-time extension, not the hero.** Bounty #6 already demonstrated the lifecycle works end-to-end against a real live 0G protocol's MIT-licensed source on Aristotle mainnet. The wrap section folds that in as "Hunt also audits real protocols" — don't try to race a fresh ChartChain bounty during the recording window. Bounty #6's race showed transient broker failures + 0 in-scope findings; honest result, but not the visual the hero scene needs.

**Honesty preface for the recording.** The hero race uses real 0G Sealed Inference against a known-bug staging contract. The fallback path (`lib/audit-fallback.js`) is documented + tested + activates on transient `fetch failed`; its findings stamp a *distinct* on-chain `modelDigest` so judges can always distinguish Sealed Inference findings from heuristic findings. v1's on-chain digest is operator-relayed (signed by `teeSigner`); v2 swaps the relay for a TEE-attestation-verifying signer set. Mention all of this honestly in the wrap.

---

## [00:00 — 00:15]  Hook (15s)

[Screen: black. Fade in to the Hunt masthead.]

> "Three problems with bug-bounty AI today. Centralised auditors can't prove which model ran on your code. Human audits are slow. And private contracts can't be shipped to OpenAI."

[Cut to the `Vault.sol` diff, the `_currentPrice()` lines highlighted — the oracle-staleness gate routed around by every user path.]

> "Hunt. Sealed bug bounties on 0G."

---

## [00:15 — 00:35]  What Hunt is (20s)

[Cut to `public/hunters.html` — show the three minted personas in the registry: reentrancy, oracle, access-control specialists. Hover one card briefly to surface per-CWE rep.]

> "Every hunter on Hunt is an on-chain identity. GitHub-verified, sample-fingerprinted, with per-CWE-class reputation. A hunter is great at reentrancy and mid at oracles — and the chain reflects exactly that."

[Cut to `public/bounties.html` — show the freshly-posted Vault.sol bounty with the OPEN status badge + scope chips + countdown.]

> "A protocol seals its Solidity, posts a bounty with the CWE scope and the payout, and N hunters race through 0G Sealed Inference."

---

## [00:35 — 02:00]  Hero scene — the race runs live (85s)

[Cut to terminal. Run `BOUNTY_ID=<HERO_ID> node scripts/run_race.js` live against the freshly-posted Vault.sol bounty. Don't pre-record.]

[As output streams, narrate while it happens.]

> "I'm running all three hunters against the live bounty on Aristotle mainnet. Each hunter is constrained to their specialty class — the reentrancy-specialist won't even consider oracle findings."

[Three "[reentrancy-specialist] starting (specialty=swc-107-reentrancy)", "[oracle-specialist] starting (specialty=oracle-manipulation)", "[access-control-specialist] starting (specialty=access-control)" lines stream with the 8-second stagger.]

> "Each hunter pulls the encrypted Vault.sol from 0G Storage, decrypts with its v1 hunter key, runs top-K retrieval over its prior findings, and calls Sealed Inference with the brief narrowed to its specialty intersected with the bounty's CWE scope."

[Oracle-specialist log: "passed quality gate at attempt 1, overall ~88-90 hundred bps; generated N findings; best = oracle-manipulation/high". `submitFinding` tx fires. Reentrancy and access-control specialists either pass inference + return 0 findings (correct — the bug isn't theirs) or hit transient `fetch failed` and fall back to the local heuristic, also returning 0.]

> "Oracle-specialist: high-severity oracle-staleness finding submitted. The contract reads `updatedAt` from the feed but only checks freshness inside the admin-only `setPrice`. Every user path bypasses the gate. The other two specialists either ran inference cleanly and found nothing in their class — correct, the bug isn't there — or fell back to the documented local heuristic, which also returned zero in their specialty."

[`submitFinding` tx streams. Show the tx hash for the live submit — match it against the chainscan tab.]

> "Attestation signed: bounty id, code root, hunter id, CWE class, severity, finding root, model digest, TEE timestamp. The contract `ecrecover`s the signature against `teeSigner`. Submitted."

[Cut to a second terminal tab — run `BOUNTY_ID=<HERO_ID> FINDING_IDX=<N> node scripts/settle_bounty.js`. Settle tx fires.]

> "Poster picks the winning finding, rates it on four axes, calls `settleBounty`. Payout splits — 0.05 OG to the oracle-specialist. `ClassRep[hunterId=1][oracle-manipulation]` ticks up. The other two hunters' oracle reputation stays flat because they didn't submit."

[Snap to chainscan tab — show the settle tx confirmed.]

---

## [02:00 — 02:30]  Verifiable — anyone can re-derive the proof (30s)

[Cut to `public/proof.html?bounty=<HERO_ID>` — show the receipt panel: bounty header, timeline, winner card with the decoded attestation digest fields, signer recovery row.]

> "Every claim Hunt makes about that race is verifiable on-chain. This is the judge-proof panel — timeline, scope, the winning finding, the attestation digest, the signer recovery."

[Cut to terminal. Compute the headline modelDigest with the one-liner from `doc/SUBMISSION.md` §9, then run `node scripts/verify_bounty.js <HERO_ID> --model-digest 0x<digest>` in strict mode.]

> "And here's the independent verifier in strict mode. No project setup. Reads only from the public 0G RPC. Re-derives the attestation digest from on-chain state plus the supplied modelDigest — same encoding as `Hunt.sol` line 298. Runs `ecrecover`. Checks the `teeTimestamp` falls inside the race window."

[Output prints: digest match, signer recovered + matches teeSigner, teeTimestamp in window — three checkmarks. Exit code 0.]

> "Digest matches. Signer matches `teeSigner`. Timestamp inside the race window. Exit zero. That's cryptographic proof that the operator-held `teeSigner` signed a Sealed-Inference-path digest — distinguishable from the fallback path by the model digest — inside the race window. v1 is an operator-relayed attestation layer over real 0G Sealed Inference; the chain-enforced version is v2. You don't trust Hunt. You verify."

---

## [02:30 — 02:55]  Wrap — the real test: Hunt audits a real audited protocol, blind (25s)

[Cut to `audits/ussd/README.md` or the chainscan tx for bounty #9.]

> "And the staged race isn't the real test. Bounty #9 is. Hunt posted the verbatim oracle contract from USSD — a stablecoin protocol audited by Sherlock in 2023 — with zero hints. Run blind, the oracle-specialist flagged a critical bug: the constructor hardcodes the ETH/USD price feed in a contract named WBTC. It recognized the address and reasoned through the exploit itself. That bug was a confirmed HIGH-severity finding in USSD's real Sherlock audit. Blind AI, real audited code, real confirmed finding, full on-chain proof. That's Hunt."

[Final screen: Hunt masthead + tagline + contract address.]

> "Sealed audits. Verifiable auditors. On-chain. Hunt — github.com/Ridwannurudeen/hunt."

---

## Recording checklist

- [ ] 1080p, 30 fps minimum
- [ ] Real voice, no TTS, no music drowning narration; ambient terminal sounds OK
- [ ] All terminal text legible at YouTube playback (≥18pt monospace, dark theme OK)
- [ ] `scripts/run_race.js` actually runs live against `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` during the recording (do not pre-record + replay logs)
- [ ] Plan A: fresh Vault.sol bounty pre-fired with `node scripts/post_bounty.js --file demo/staged-bounty/Vault.sol --payout 0.05 --race-duration 600 --cwes swc-107-reentrancy,oracle-manipulation,access-control`; bountyId substituted everywhere `<HERO_ID>` appears in the script body. Plan B: re-target bounty #3 (settled) and narrate over recorded chainscan output.
- [ ] Honesty beat in the wrap — explain the operator-relayed v1 attestation layer, the fallback `modelDigest` distinction, and the v2 chain-enforced upgrade path
- [ ] Final length 2:30–2:55 (under 3 min hard cap)
- [ ] Only MIT-licensed source (ChartChain `MedicalRecordsVault.sol`) or staged `Vault.sol` on-screen — no proprietary contracts
- [ ] Upload to YouTube **unlisted**; do not publish until the submission is in
- [ ] Paste the unlisted link into `doc/SUBMISSION.md` §6

## Live deployment used in the demo

- **Contract**: `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` ([chainscan](https://chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C))
- **Deploy tx**: `0xc08f6483a1603564ff38c6808856cc9d7e8cbe120ff95e8ccbc55722f873f6c7` (block 32975183)
- **teeSigner**: `0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f`
- **verifier**: `0x3a40CA052c10FB6f0B1934e9db680034aFF1759E`
- **Mint tx — hunter #0 reentrancy-specialist**: `0xdac73073211a99c16cad85961461180ead95504bfae331e8e77efb7f053f9d5d`
- **Mint tx — hunter #1 oracle-specialist**: `0xd9ab16049e3a048ea30b49bb9dfb61584828c621c88bc467c2ad1eb85d6b8354`
- **Mint tx — hunter #2 access-control-specialist**: `0x66af88fe9718592223580034b3569cc79cc0ae8c8cd596595330a631e08d509f`

**Bounty #3 ★ — Plan B / precedent for the recording**
- Post: `0x253064e8680d098c127b9cf7b2d4379136dd25bb6258117b0e4951e848922659`
- Winning finding (real Sealed Inference, `oracle-manipulation`, `high`): `0x78f6075f7ccc99122144335c659005c162e750229d808258e06823a957b37523` (block 33040490)
- Settle: `0x9edab38c54b927fd507aeaada991694500858af4a31977d2c7154ac658f8d241` (block 33041034)
- modelDigest: `keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`

**Bounty #7 ★★ — second narrowing data point (real Sealed Inference, reentrancy-specialist wins)**
- Post: [`0xbc525ef4964b8abb39f2943be95528d9f5d1a3e8a2a11f14fd82c017af9eecac`](https://chainscan.0g.ai/tx/0xbc525ef4964b8abb39f2943be95528d9f5d1a3e8a2a11f14fd82c017af9eecac) — 0.05 OG, 10-min race, target `demo/staged-bounty/Reentrancy.sol`, scope {reentrancy, access-control, oracle}
- Submit: [`0x3a51f97ca7150775902ed4bca4b08536cb7e9f0a59c936cfb246a985036ddd92`](https://chainscan.0g.ai/tx/0x3a51f97ca7150775902ed4bca4b08536cb7e9f0a59c936cfb246a985036ddd92) (block 33131912) — reentrancy-specialist, severity `critical`, real Sealed Inference at attempt 1
- Settle: [`0x6d26cd5fd4927ed9a8631e8f421630247e92abae8008c6b0e58b3aa90f7a2a7f`](https://chainscan.0g.ai/tx/0x6d26cd5fd4927ed9a8631e8f421630247e92abae8008c6b0e58b3aa90f7a2a7f) (block 33132360) — 0.05 OG paid; oracle + access-control specialists correctly returned zero in-scope (oracle-specialist at 9875bps "no oracle pattern present")

**Bounty #2 — post-fix intermediate (preserved record)**
- Post: `0x8da9cf06cfcf963ec9ad000d37a1652f0fb352c43909e6f254255db7091e4314` · Submit: `0x36bd979cc452c77626493113666b6109a73506380e1f8de610c5b73874eef554` (block 33039165) · Settle: `0xa6e03679fc9ced9fbe6a1a185550033821343934cdb12adb9da46a149ce2ed59` (block 33039527)

**Bounty #1 — second fallback-path race (preserved record)**
- Post: `0x60cf3d75d88b1c7080b4ac9ea610d3c470ef684f5557a0809f3bf67fd57f0dc9` · Submit: `0xf6d54d4a35123ccb550dabdfcb71ee2f47bfbc6efa867a0a846fefa776c5c2a6` (block 32988214) · Settle: `0x5e06c6dc1e94b190ba9ef2fa31baa8da95e05b2a03f3d4436c951bf4d9d93768` (block 32988680)
- Fallback-path `modelDigest`; same semantics as bounty #0. Settled 0.05 OG to oracle-specialist.

**Bounty #6 — first ChartChain audit on Aristotle (wrap-time extension scene)**
- Post: [`0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461`](https://chainscan.0g.ai/tx/0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461) — 0.05 OG, 10-min race, 5-CWE scope, target `audits/chartchain/MedicalRecordsVault.sol`
- Expire: [`0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22`](https://chainscan.0g.ai/tx/0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22) (block 33121294) — no in-scope findings, 0.05 OG refunded
- Race result: 2 specialists ran real Sealed Inference end-to-end (9000bps + 10000bps), correctly declined out-of-domain; 3rd hit transient broker failure, fell back to local heuristic, also returned 0 in-scope. Per-CWE narrowing demonstrated end-to-end. Bug-finding question against ChartChain remains open. Detail in `audits/chartchain/README.md`.
- **For the recording**: bounty #6 is the wrap-time extension showing Hunt audits real protocols; the hero race uses staged Vault.sol per Plan A above.

**Bounty #4 + #5 — expired cleanup (pre-recording polish)**
- Both posted earlier sessions, never raced to completion (broker hiccups), escrow stuck OPEN past raceDeadline.
- Expire #5: [`0xeaf5d106e79a7e99902412779ca82ab758e43de7d8c88f50899d75830ffd46f6`](https://chainscan.0g.ai/tx/0xeaf5d106e79a7e99902412779ca82ab758e43de7d8c88f50899d75830ffd46f6) (block 33123369) — 0.1 OG refunded.
- Expire #4: [`0xebe6737a6e81d0b6da666474b0eb5d9c006b8c8b6df8f5fdc1a5261818d92c6f`](https://chainscan.0g.ai/tx/0xebe6737a6e81d0b6da666474b0eb5d9c006b8c8b6df8f5fdc1a5261818d92c6f) (block 33124224) — 0.05 OG refunded.
- Result: bounties.html now shows 0 Open / 4 Settled / 3 Expired — clean page for the recording.

**Bounty #0 — fallback-path original (preserved record)**
- Post: `0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df` · Submit: `0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b` (block 32977952) · Settle: `0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4` (block 32978103)
