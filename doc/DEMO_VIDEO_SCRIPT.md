# Hunt — Demo Video Script (≤3 min)

Record at 1080p, 30+ fps. Real voice, no TTS. Single take if you can; one cut at the join between the race and the verification beat is acceptable.

**Before recording (Plan A — preferred).** Hunt's primary live audit target is **ChartChain**, a separate live 0G project on Aristotle mainnet (`0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`). Pre-fire a fresh bounty against `audits/chartchain/MedicalRecordsVault.sol`:

```bash
node scripts/post_bounty.js --payout 0.1 --race-duration 900   # 15 min so recording fits comfortably
```

Capture the returned `bountyId` (this becomes `<CC_ID>` everywhere below) and the post tx hash. Have the live deployment loaded — three hunters minted; the bounty OPEN on the bounties page; `scripts/run_race.js` ready in a terminal. Open four windows: (1) `public/bounties.html` showing the ChartChain bounty OPEN with countdown, (2) terminal with `BOUNTY_ID=<CC_ID> node scripts/run_race.js` ready, (3) `public/proof.html?bounty=<CC_ID>` for the verification beat, (4) `chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` pinned so txs are reachable from the screen.

**Plan B fallback.** If the ChartChain race fails, hits a 0G outage, or produces no in-scope findings during the recording window, fall back to bounty #3 (settled headline race against the staged `demo/staged-bounty/Vault.sol`, real Sealed Inference, fully verifiable today). The script narration is written to work for either path; the strict-verify scene runs identically against whichever bounty id is the hero. Replace `<CC_ID>` with `3` in the commands.

**Honesty preface for the recording.** The hero race targets a real live 0G protocol (ChartChain) under real 0G Sealed Inference. The fallback path (`lib/audit-fallback.js`) is documented + tested + activates on transient `fetch failed` under concurrent broker load; its findings stamp a *distinct* on-chain `modelDigest` so judges can always distinguish Sealed Inference findings from heuristic findings. v1's on-chain digest is operator-relayed (signed by `teeSigner`); v2 swaps the relay for a TEE-attestation-verifying signer set. Mention all of this honestly in the wrap.

---

## [00:00 — 00:15]  Hook (15s)

[Screen: black. Fade in to the Hunt masthead.]

> "Three problems with bug-bounty AI today. Centralised auditors can't prove which model ran on your code. Human audits are slow. And private contracts can't be shipped to OpenAI."

[Cut briefly to `audits/chartchain/MedicalRecordsVault.sol` opened in the editor — scroll past the `transfer` + `logQuery` + `addRecord` functions.]

> "Hunt. Sealed bug bounties on 0G. Tonight Hunt is auditing ChartChain — a separate live 0G protocol, on Aristotle mainnet, right now."

---

## [00:15 — 00:35]  What Hunt is (20s)

[Cut to `public/hunters.html` — show the three minted personas in the registry: reentrancy, oracle, access-control specialists. Hover one card briefly to surface per-CWE rep.]

> "Every hunter on Hunt is an on-chain identity. GitHub-verified, sample-fingerprinted, with per-CWE-class reputation. A hunter is great at reentrancy and mid at oracles — and the chain reflects exactly that."

[Cut to `public/bounties.html` — show bounty #0 with the OPEN status badge + scope chips + countdown.]

> "A protocol seals its Solidity, posts a bounty with the CWE scope and the payout, and N hunters race inside 0G Sealed Inference TEEs."

---

## [00:35 — 02:00]  Hero scene — the race runs live (85s)

[Cut to terminal. Run `BOUNTY_ID=<CC_ID> node scripts/run_race.js` live against the freshly-posted ChartChain bounty (Plan A); if recording Plan B, substitute `BOUNTY_ID=3`. Don't pre-record.]

[As output streams, narrate while it happens.]

> "I'm running all three hunters against the live bounty on Aristotle mainnet. Each hunter is constrained to their specialty class — the reentrancy-specialist won't even consider oracle findings."

[Three "[reentrancy-specialist] starting (specialty=swc-107-reentrancy)", "[oracle-specialist] starting (specialty=oracle-manipulation)", "[access-control-specialist] starting (specialty=access-control)" lines stream with the 8-second stagger.]

> "Each hunter pulls the encrypted ChartChain source from 0G Storage, decrypts inside its own TEE, runs top-K retrieval over its prior findings, and calls Sealed Inference with the brief narrowed to its specialty intersected with the bounty's CWE scope."

[Watch which specialist(s) submit. ChartChain's most plausible finding classes (per `audits/chartchain/README.md`) are access-control or storage-collision; oracle-specialist may legitimately return zero. Whoever submits, narrate the actual finding the daemon logs print, don't pre-script the result.]

> "Whichever specialist's domain the bug lives in submits. The others — if their inference ran cleanly and found nothing in scope, that's the correct result; if they hit a transient inference failure they fall back to the documented local heuristic, which stamps a distinct `modelDigest` on-chain so the two paths are always distinguishable."

[`submitFinding` tx streams. Show the tx hash for the actual submit — match it against the chainscan tab.]

> "Attestation signed: bounty id, code root, hunter id, CWE class, severity, finding root, model digest, TEE timestamp. The contract `ecrecover`s the signature against `teeSigner`. Submitted."

[Cut to a second terminal tab — run `node scripts/settle_bounty.js`. Settle tx fires. If no in-scope finding was submitted, run `expireBounty(<CC_ID>)` instead and narrate that result honestly.]

> "Poster picks the winning finding, rates it on four axes, calls `settleBounty`. Payout splits to the winning hunter. `ClassRep[hunterId][cweClass]` updates per CWE — only the matching specialty's rep moves. The other hunters' rep in that class stays flat because they didn't submit. The chain reflects calibrated expertise, not a single fungible 'is-good' score."

[Snap to chainscan tab — show the settle (or expire) tx confirmed.]

---

## [02:00 — 02:30]  Verifiable — anyone can re-derive the proof (30s)

[Cut to `public/proof.html?bounty=<CC_ID>` — show the receipt panel: bounty header, timeline, winner card with the decoded attestation digest fields, signer recovery row.]

> "Every claim Hunt makes about that race is verifiable on-chain. This is the judge-proof panel — timeline, scope, the winning finding, the attestation digest, the signer recovery."

[Cut to terminal. Compute the headline modelDigest with the one-liner from `doc/SUBMISSION.md` §9, then run `node scripts/verify_bounty.js <CC_ID> --model-digest 0x<digest>` in strict mode.]

> "And here's the independent verifier in strict mode. No project setup. Reads only from the public 0G RPC. Re-derives the attestation digest from on-chain state plus the supplied modelDigest — same encoding as `Hunt.sol` line 298. Runs `ecrecover`. Checks the `teeTimestamp` falls inside the race window."

[Output prints: digest match, signer recovered + matches teeSigner, teeTimestamp in window — three checkmarks. Exit code 0.]

> "Digest matches. Signer matches `teeSigner`. Timestamp inside the race window. Exit zero. That's cryptographic proof that the operator-held `teeSigner` signed a Sealed-Inference-path digest — distinguishable from the fallback path by the model digest — inside the race window. v1 is an operator-relayed attestation layer over real 0G Sealed Inference; the chain-enforced version is v2. You don't trust Hunt. You verify."

---

## [02:30 — 02:55]  Wrap (25s)

[Cut to the bounty page showing the ChartChain bounty SETTLED (or EXPIRED if no in-scope findings).]

> "Hunt just audited a separate live 0G protocol on Aristotle mainnet — sealed code in, attested finding out, payout settled, reputation updated per CWE class. Sealed Inference is the anti-cheat substrate: 0G's `ZG-Res-Key` attestation lets us bind which model ran on which input. v1 relays that signal on-chain through an operator-held key; v2 makes the relay a TEE-attestation-verifying signer set. 0G Storage is the privacy — sealed code never reaches the public chain. 0G Chain is the settlement and the reputation layer. One vertical now: smart-contract audit. Same architecture extends to any domain where the output is a structured judgement against a known taxonomy."

[Final screen: Hunt masthead + tagline + contract address.]

> "Sealed audits. Verifiable auditors. On-chain. Hunt — github.com/Ridwannurudeen/hunt."

---

## Recording checklist

- [ ] 1080p, 30 fps minimum
- [ ] Real voice, no TTS, no music drowning narration; ambient terminal sounds OK
- [ ] All terminal text legible at YouTube playback (≥18pt monospace, dark theme OK)
- [ ] `scripts/run_race.js` actually runs live against `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` during the recording (do not pre-record + replay logs)
- [ ] Plan A: ChartChain bounty pre-fired with `node scripts/post_bounty.js --payout 0.1 --race-duration 900`; bountyId substituted everywhere `<CC_ID>` appears in the script body. Plan B: re-target bounty #3 if Plan A fails.
- [ ] Honesty beat in the hero scene — explain the operator-relayed v1 attestation layer, the fallback `modelDigest` distinction, and the v2 chain-enforced upgrade path
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

**Bounty #3 ★ — headline race for the recording**
- Post: `0x253064e8680d098c127b9cf7b2d4379136dd25bb6258117b0e4951e848922659`
- Winning finding (real Sealed Inference, `oracle-manipulation`, `high`): `0x78f6075f7ccc99122144335c659005c162e750229d808258e06823a957b37523` (block 33040490)
- Settle: `0x9edab38c54b927fd507aeaada991694500858af4a31977d2c7154ac658f8d241` (block 33041034)
- modelDigest: `keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1"))`

**Bounty #2 — post-fix intermediate (preserved record)**
- Post: `0x8da9cf06cfcf963ec9ad000d37a1652f0fb352c43909e6f254255db7091e4314` · Submit: `0x36bd979cc452c77626493113666b6109a73506380e1f8de610c5b73874eef554` (block 33039165) · Settle: `0xa6e03679fc9ced9fbe6a1a185550033821343934cdb12adb9da46a149ce2ed59` (block 33039527)

**Bounty #6 — first ChartChain audit on Aristotle (dry-run, lifecycle proven)**
- Post: [`0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461`](https://chainscan.0g.ai/tx/0x7600cf2dd3ad137904832349416acaf4747410d0eebfc031633e1f5c4e03c461) — 0.05 OG, 10-min race, 5-CWE scope, target `audits/chartchain/MedicalRecordsVault.sol`
- Expire: [`0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22`](https://chainscan.0g.ai/tx/0xabbb0dd840e81f89d8cb9a25aac1ae2817b9fb95009bddb3cf2ba6445fc6ee22) (block 33121294) — no in-scope findings, 0.05 OG refunded
- Race result: 2 specialists ran real Sealed Inference end-to-end (9000bps + 10000bps), correctly declined out-of-domain; 3rd hit transient broker failure, fell back to local heuristic, also returned 0 in-scope. Per-CWE narrowing demonstrated end-to-end. Bug-finding question against ChartChain remains open. Detail in `audits/chartchain/README.md`.
- **For the recording (Plan A)**: fire a fresh bounty so the bounties.html page shows OPEN status during the take; bounty #6 is a proven dry-run, not a substitute for a live race on camera.

**Bounty #0 — fallback-path original (preserved record)**
- Post: `0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df` · Submit: `0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b` (block 32977952) · Settle: `0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4` (block 32978103)
