# Hunt — Demo Video Script (≤3 min)

Record at 1080p, 30+ fps. Real voice, no TTS. Single take if you can; one cut at the join between the race and the verification beat is acceptable.

**Before recording.** Have the live deployment loaded — three hunters minted, a fresh bounty posted against the staged Vault.sol so the race can fire on demand (bounty #3 is the settled headline race already on-chain; for the recording either re-post a fresh bounty pre-take and run on that ID, or run on bounty #3 directly if it's still in the race window). Open four windows: (1) `public/bounties.html` showing the live bounty OPEN with the race countdown, (2) terminal with `scripts/run_race.js` ready to run, (3) `public/proof.html?bounty=3` for the verification beat, (4) `chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` pinned in a tab so the txs are reachable from the screen.

**Honesty preface for the recording.** Use **bounty #3** as the hero race — it ran on real 0G Sealed Inference with a TEE attestation, settled cleanly on Aristotle mainnet. The fallback path (`lib/audit-fallback.js`) is documented + tested + activated for the two hunters whose concurrent inference calls hit transient `fetch failed` during the race. Mention this honestly: graceful degradation under transient failure is a feature, and the fallback's distinct on-chain `modelDigest` makes the two paths always distinguishable on-chain.

---

## [00:00 — 00:15]  Hook (15s)

[Screen: black. Fade in to the Hunt masthead.]

> "Three problems with bug-bounty AI today. Centralised auditors can't prove which model ran on your code. Human audits are slow. And private contracts can't be shipped to OpenAI."

[Cut to the Vault.sol diff, the `_currentPrice()` lines highlighted.]

> "Hunt. Sealed bug bounties on 0G."

---

## [00:15 — 00:35]  What Hunt is (20s)

[Cut to `public/hunters.html` — show the three minted personas in the registry: reentrancy, oracle, access-control specialists. Hover one card briefly to surface per-CWE rep.]

> "Every hunter on Hunt is an on-chain identity. GitHub-verified, sample-fingerprinted, with per-CWE-class reputation. A hunter is great at reentrancy and mid at oracles — and the chain reflects exactly that."

[Cut to `public/bounties.html` — show bounty #0 with the OPEN status badge + scope chips + countdown.]

> "A protocol seals its Solidity, posts a bounty with the CWE scope and the payout, and N hunters race inside 0G Sealed Inference TEEs."

---

## [00:35 — 02:00]  Hero scene — the race runs live (85s)

[Cut to terminal. Run `BOUNTY_ID=3 node scripts/run_race.js` live, OR re-run a fresh race against a freshly-posted bounty (`scripts/post_bounty.js` first, then `run_race.js`). Don't pre-record.]

[As output streams, narrate while it happens.]

> "I'm running all three hunters against the live bounty on Aristotle mainnet. Each hunter is constrained to their specialty class — reentrancy-specialist will not even consider oracle findings."

[Three "[reentrancy-specialist] starting (specialty=swc-107-reentrancy)", "[oracle-specialist] starting (specialty=oracle-manipulation)", "[access-control-specialist] starting (specialty=access-control)" lines stream with the 8-second stagger.]

> "Each hunter pulls the encrypted Vault.sol from 0G Storage, decrypts inside its own TEE, runs top-K retrieval over its prior findings, and calls Sealed Inference with brief.focus narrowed to its specialty intersected with the bounty scope."

[Oracle-specialist log: "passed quality gate at attempt 1, overall 8875bps; generated 3 findings; best = oracle-manipulation/high". `submitFinding` tx fires. Reentrancy and access-control specialists may hit transient `fetch failed` and drop to the local heuristic — if they do, they return zero in-scope findings because the heuristic correctly finds no reentrancy or access-control bug in this Vault.]

> "Oracle-specialist: high-severity oracle-staleness finding submitted. The contract reads `updatedAt` from the feed but only checks freshness inside the admin-only `setPrice`. Every user path bypasses the gate. The other two specialists either ran inference and found nothing in their class — correct, the bug isn't there — or hit a transient inference failure and fell back to the documented local heuristic, which also correctly returned zero findings in their specialty."

[`submitFinding` tx streams. Show the tx hash for bounty #3's submit — match it against the chainscan tab.]

> "Attestation signed: bounty id, code root, hunter id, CWE class, severity, finding root, model digest, TEE timestamp. The contract `ecrecover`s the signature against `teeSigner`. Submitted."

[Cut to a second terminal tab — run `node scripts/settle_bounty.js`. Settle tx fires.]

> "Poster picks the winning finding, rates it on four axes, calls `settleBounty`. Payment splits — 0.05 OG to the oracle-specialist. `ClassRep[hunterId=1][oracle-manipulation]` ticks up. The other two hunters' oracle reputation stays flat because they didn't submit."

[Snap to chainscan tab — show the settle tx `0x9edab38c…d241` confirmed (bounty #3 settle).]

---

## [02:00 — 02:30]  Verifiable — anyone can re-derive the proof (30s)

[Cut to `public/proof.html?bounty=3` — show the receipt panel: bounty header, timeline, winner card with the decoded attestation digest fields, signer recovery row.]

> "Every claim Hunt makes about that race is verifiable on-chain. This is the judge-proof panel — timeline, scope, the winning finding, the attestation digest, the signer recovery."

[Cut to terminal. Compute the headline modelDigest with the one-liner from `doc/SUBMISSION.md` §9, then run `node scripts/verify_bounty.js 3 --model-digest 0x<digest>` in strict mode.]

> "And here's the independent verifier in strict mode. No project setup. Reads only from the public 0G RPC. Re-derives the attestation digest from on-chain state plus the supplied modelDigest — same encoding as `Hunt.sol` line 298. Runs `ecrecover`. Checks the `teeTimestamp` falls inside the race window."

[Output prints: digest match, signer recovered + matches teeSigner, teeTimestamp in window — three checkmarks. Exit code 0.]

> "Digest matches. Signer matches `teeSigner`. Timestamp inside the race window. Exit zero. That's cryptographic proof that real 0G Sealed Inference produced this finding inside the race window. You don't trust Hunt. You verify."

---

## [02:30 — 02:55]  Wrap (25s)

[Cut to the bounty page showing bounty #3 SETTLED.]

> "Sealed Inference is the anti-cheat — a TEE attestation that proves which model ran on which input at which timestamp. 0G Storage is the privacy — sealed code never reaches the public chain. 0G Chain is the settlement and the reputation layer. One vertical now: smart-contract audit. Same architecture extends to any domain where the output is a structured judgement against a known taxonomy."

[Final screen: Hunt masthead + tagline + contract address.]

> "Sealed audits. Verifiable auditors. On-chain. Hunt — github.com/Ridwannurudeen/hunt."

---

## Recording checklist

- [ ] 1080p, 30 fps minimum
- [ ] Real voice, no TTS, no music drowning narration; ambient terminal sounds OK
- [ ] All terminal text legible at YouTube playback (≥18pt monospace, dark theme OK)
- [ ] `scripts/run_race.js` actually runs live against `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` during the recording (do not pre-record + replay logs)
- [ ] Honesty beat in the hero scene — explain bounty #0's documented fallback path (max_tokens budget bug, now fixed) AND that the live race uses real Sealed Inference with TEE attestation
- [ ] Final length 2:30–2:55 (under 3 min hard cap)
- [ ] Synthetic / staged code only on-screen (no real proprietary contracts)
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

**Bounty #0 — fallback-path original (preserved record)**
- Post: `0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df` · Submit: `0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b` (block 32977952) · Settle: `0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4` (block 32978103)
