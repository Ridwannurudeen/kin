# Hunt — Demo Video Script (≤3 min)

Record at 1080p, 30+ fps. Real voice, no TTS. Single take if you can; one cut at the join between the race and the verification beat is acceptable.

**Before recording.** Have the live deployment loaded — three hunters minted, bounty #0 already posted against the staged Vault.sol (so the race can fire on demand without depending on a fresh post tx). Open four windows: (1) `public/bounties.html` showing bounty #0 OPEN with the race countdown, (2) terminal with `scripts/run_race.js` ready to run, (3) `public/proof.html?bounty=0` for the verification beat, (4) `chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` pinned in a tab so the txs are reachable from the screen.

**Honesty preface for the recording.** Sealed Inference was degraded during the submission window; the daemon retries 3× then drops to the documented `lib/audit-fallback.js` heuristic path. The fallback stamps a distinct on-chain `modelDigest` so judges can audit which path each finding took. Mention this in the wrap beat — it strengthens the pitch.

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

[Cut to terminal. Run `BOUNTY_ID=0 node scripts/run_race.js` live. Don't pre-record.]

[As output streams, narrate while it happens. Be explicit that the demo is using the documented local-fallback path because 0G Sealed Inference was degraded; the on-chain semantics are identical.]

> "I'm running all three hunters against bounty zero on Aristotle mainnet. Watch."

[Three "[reentrancy] starting…", "[oracle] starting…", "[access-control] starting…" lines stream interleaved. Each one fetches + decrypts the code, runs top-K retrieval, hits the inference path, then drops to the local fallback after 3× retry — call this out.]

> "Each hunter pulls the encrypted Vault.sol from 0G Storage, decrypts inside its own TEE, runs top-K retrieval over its prior findings, and calls Sealed Inference. Inference was degraded during the submission window — the daemon retries three times then falls back to the documented local heuristic. The chain stamps a distinct model digest on that path so judges can audit which one ran."

[Reentrancy log: "no in-scope findings; skipping". Access-control log: "no in-scope findings; skipping". Oracle log: "generated 1 findings; best = oracle-manipulation/high".]

> "Reentrancy specialist: nothing. Access-control specialist: nothing. Both correct — the bug is not in their CWE class. Oracle-specialist: a high-severity oracle-staleness finding. The contract reads `updatedAt` from the Chainlink feed but only checks freshness inside the admin-only `setPrice`. Every user path bypasses the gate."

[`submitFinding` tx streams. Show the tx hash — `0x371f2a32…` — match it against the chainscan tab.]

> "Attestation signed: bounty id, code root, hunter id, CWE class, severity, finding root, model digest, TEE timestamp. The contract `ecrecover`s the signature against `teeSigner`. Submitted."

[Cut to a second terminal tab — run `node scripts/settle_bounty.js`. Settle tx fires.]

> "Poster picks the winning finding, rates it on four axes, calls `settleBounty`. Payment splits — 0.05 OG to the oracle-specialist. `ClassRep[hunterId=1][oracle-manipulation]` ticks up. The other two hunters' oracle reputation stays flat because they didn't submit."

[Snap to chainscan tab — show the settle tx `0xe67459a1…` confirmed.]

---

## [02:00 — 02:30]  Verifiable — anyone can re-derive the proof (30s)

[Cut to `public/proof.html?bounty=0` — show the receipt panel: bounty header, timeline, winner card with the decoded attestation digest fields, signer recovery row.]

> "Every claim Hunt makes about that race is verifiable on-chain. This is the judge-proof panel — timeline, scope, the winning finding, the attestation digest, the signer recovery."

[Cut to terminal. Run `node scripts/verify_bounty.js 0`.]

> "And here's the independent verifier. No project setup. Reads only from the public 0G RPC. Re-derives the attestation digest from on-chain state — same encoding as `Hunt.sol` line 298. Runs `ecrecover`. Checks the `teeTimestamp` falls inside the race window."

[Output prints: signer recovered, signer matches teeSigner, teeTimestamp in window — three checkmarks. Exit code 0.]

> "Signer matches `teeSigner`. Timestamp inside the race window. Exit zero. You don't trust Hunt. You verify."

---

## [02:30 — 02:55]  Wrap (25s)

[Cut to the bounty page showing bounty #0 SETTLED.]

> "Sealed Inference is the anti-cheat — a TEE attestation that proves which model ran on which input at which timestamp. 0G Storage is the privacy — sealed code never reaches the public chain. 0G Chain is the settlement and the reputation layer. One vertical now: smart-contract audit. Same architecture extends to any domain where the output is a structured judgement against a known taxonomy."

[Final screen: Hunt masthead + tagline + contract address.]

> "Sealed audits. Verifiable auditors. On-chain. Hunt — github.com/Ridwannurudeen/kin."

---

## Recording checklist

- [ ] 1080p, 30 fps minimum
- [ ] Real voice, no TTS, no music drowning narration; ambient terminal sounds OK
- [ ] All terminal text legible at YouTube playback (≥18pt monospace, dark theme OK)
- [ ] `scripts/run_race.js` actually runs live against `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C` during the recording (do not pre-record + replay logs)
- [ ] Honesty beat in the hero scene — name the Sealed Inference outage + fallback path explicitly
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
- **Post bounty #0**: `0xafa7c31ea102f4543ac851711fc822e41871d139220bd7bff7d9abcd831fb2df`
- **Winning finding submission**: `0x371f2a328c5af8c0d75f867bda9f12048ba941e99efa6a210087c0b84a2cab8b` (block 32977952)
- **Settle bounty #0**: `0xe67459a13b8b0df690847560e97249eac9a23d3ef7d2cce594338b8222cdcec4` (block 32978103)
