# Hunt — release assets (video editor brief + YouTube + X teaser)

Everything below is paste-ready. Editor brief is for the freelancer; YouTube description is for the upload; X teaser is for the 24h pre-submission push.

---

## 1. Video editor brief — paste into Upwork / Fiverr / personal-network engagement

**Project**: 0G APAC Hackathon submission video (Hunt — sealed bug-bounty network on 0G Aristotle mainnet)

**Deliverable**: one polished 2:30–2:55 video (≤3 min hard cap per hackathon rules), 1080p ≥30fps, MP4 H.264 + AAC audio. Source script: `doc/DEMO_VIDEO_SCRIPT.md` in the repo.

**Turnaround**: 24–48 hours. Final by {DATE -1 day before submission}.

**Budget**: $500–1500 (negotiable based on portfolio — looking for hackathon-grade not Hollywood-grade).

**Style references**:
- [a16z crypto explainer videos](https://www.youtube.com/@a16zcrypto) — the "calm, technical, motion-typography-heavy" style
- [Levels.fyi office tour videos](https://www.youtube.com/@levelsfyi) — the "real screen, real terminal, clean cuts" style
- NOT vapor-tech, NOT crypto-pump aesthetics, NOT trailer music with thumping bass — this is a serious technical demo for serious judges

**Source materials provided**:
- Raw screen recording (4K @ 30fps or higher, single take with one cut acceptable)
- Voice-over track (real voice, no TTS, recorded on a USB condenser mic — Blue Yeti or equivalent)
- 5 transaction hashes to overlay (on-chain proof points)
- Hunt logo / masthead (extracted from `public/styles.css` colour palette: red `#bf3133`, gold `#b8884c`, paper `#fdfbf5`, ink `#1a1a1a`)
- Architecture diagram (extracted from `README.md` ASCII diagram, redraw as motion graphic)

**Scene-by-scene cut list** (timestamps relative to final, not raw):

| Time | Source | Treatment | Motion graphics |
|---|---|---|---|
| 0:00–0:15 | Black → masthead fade-in | Title card: "Hunt — sealed bug-bounty network on 0G Aristotle mainnet" | Logo fade + subtle radial glow |
| 0:15–0:35 | hunters.html on hunt.gudman.xyz | Show 3 minted hunters, hover one card to surface per-CWE rep, narrate "every hunter is an on-chain identity" | Highlight per-CWE rep table with subtle box outline animation |
| 0:35–2:00 | Terminal `BOUNTY_ID=X node scripts/run_race.js` against fresh bounty | Real-time race execution, all 3 hunters firing | Caption overlays for the key log lines ("starting", "passed quality gate", "submitting finding") |
| 2:00–2:20 | Terminal continues into `node scripts/settle_bounty.js` + chainscan tab | Show settle tx confirmation | Lower-third with tx hash for chainscan |
| 2:20–2:40 | proof.html?bounty=X panel + `verify_bounty.js --model-digest 0x…` strict mode | Show three checkmarks: digest / signer / window | Highlight each ✓ with a subtle pulse |
| 2:40–2:55 | Final masthead + tagline + URL | "Sealed audits. Verifiable auditors. On-chain. hunt.gudman.xyz" | Logo + URL on hold |

**Audio**:
- Voice-over: clean, no echo, normalised to -16 LUFS
- Music bed: instrumental, royalty-free (Epidemic Sound or Artlist), subtle, never overpowering voice. Tempo ~80bpm. No vocals, no drops.
- Ambient terminal sounds (keystrokes, beeps) acceptable at low gain

**Captions / subtitles**: full caption track in SRT format. Burned-in optional, but the SRT file is mandatory for accessibility.

**Specific motion graphics asks** (~6 needed):
1. Logo intro animation (2s) — radial glow build-up
2. Architecture diagram → animate from `README.md` ASCII art (≤8s)
3. "Hunter race" transition — three vertical lanes briefly visible, labelled with specialty
4. On-chain tx hash lower-thirds — clean monospace text with chainscan URL underneath
5. ✓ pulse for each verifier checkmark (3× separate cuts)
6. Outro masthead with URL — clean wipe to end card

**Out of scope**:
- Custom 3D animation
- Stock footage
- Talking-head shots of the founder (this is a screen-record demo, not a founder story)

**Reference files**:
- Script: https://github.com/Ridwannurudeen/hunt/blob/master/doc/DEMO_VIDEO_SCRIPT.md
- Live frontend (for visual styling reference): https://hunt.gudman.xyz
- Architecture diagram source: https://github.com/Ridwannurudeen/hunt/blob/master/README.md
- Style palette: red `#bf3133`, gold `#b8884c`, paper `#fdfbf5`, ink `#1a1a1a`, mono font `IBM Plex Mono`, serif font `Spectral`

---

## 2. YouTube video description — paste at upload time

**Title**: `Hunt — sealed bug-bounty network on 0G | AI auditors race in TEEs, per-CWE on-chain reputation`

**Description**:

```
Hunt is an AI bug-bounty network where protocols seal Solidity code, AI hunter agents race inside 0G Sealed Inference TEEs to find vulnerabilities, and per-CWE reputation accrues on-chain. Every finding carries a TEE attestation proving which model ran on which input at which time — the anti-cheat guarantee that traditional AI auditors (Olympix, Nethermind AuditAgent, Cantina Apex) can't match without rebuilding on a verifiable compute substrate.

Live mainnet: https://hunt.gudman.xyz
Contract: 0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C on 0G Aristotle (chain 16661)
Open source: https://github.com/Ridwannurudeen/hunt

— Timestamps —
0:00 Three problems with AI bug-bounty today
0:15 Every hunter is an on-chain identity, per-CWE reputation
0:35 The live race — three hunters fire against a sealed Vault.sol on mainnet
2:00 Settle + payout, per-CWE rep updates on-chain
2:20 Independent strict-mode verifier: digest ✓ signer ✓ window ✓
2:40 Sealed audits. Verifiable auditors. On-chain.

— Verify any race yourself, no project setup required —
1. Clone:   git clone https://github.com/Ridwannurudeen/hunt && cd hunt && npm install
2. Digest:  node -e "import('ethers').then(({ethers})=>console.log(ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1'))))"
3. Verify:  node scripts/verify_bounty.js 3 --model-digest 0x<paste>

Exit code 0 = real Sealed Inference proven inside the race window.

— Why 0G —
Sealed Inference (March 2026 launch) is the only TEE-attested LLM substrate in any L1 today. Every Hunt finding is signed inside an Intel TDX + H100/H200 enclave with a downloadable Remote Attestation report. No comparable primitive ships on Ethereum, Solana, or any rollup.

— 0G primitives used (5/5, all load-bearing) —
• 0G Chain — single-file Hunt.sol enforces race-deadline, settle-window, CWE-scope filter, attestation ecrecover, per-CWE ClassRep ledger
• 0G Sealed Inference — review + self-eval in one TEE call, ZG-Res-Key attestation chain
• 0G Storage — symmetric AES for sealed code, per-hunter AES for samples, ECIES for findings encrypted to poster pubkey
• TEE attestation chain — teeSigner ecrecover'd on-chain, off-chain relay signs only when 0G's per-response attestation validates
• Credential verifier — GitHub-OAuth-backed, ≥730d account + ≥20 merged PRs + ≥10 reviews

— v2 roadmap (post-hackathon) —
• Stake-backed adversarial falsification (finder vs falsifier with skin in the game)
• Always-on guardian network (continuous post-deploy monitoring — opens after July 2026 OZ Defender sunset)
• Cross-protocol bug-pattern knowledge graph (on-chain citation provenance, compounds with every race)
• Insurance underwriting endpoint (per-CWE rep as Nexus/Sherlock/Risk Harbor pricing input)

Full pillar-by-pillar plan + verified competitive landscape:
https://github.com/Ridwannurudeen/hunt/blob/master/doc/FUTURE.md

— A 0G APAC Hackathon submission —
https://github.com/Ridwannurudeen/hunt/blob/master/doc/SUBMISSION.md
#0GHackathon #BuildOn0G
```

**Tags** (paste into YouTube tag field): `0G`, `Sealed Inference`, `TEE`, `bug bounty`, `smart contract audit`, `AI auditor`, `Aristotle mainnet`, `on-chain reputation`, `DeFi security`, `0G APAC Hackathon`

**Visibility**: Upload as **Unlisted**. Do not publish until the HackQuest form is submitted. Once submitted, you can flip to Public for X amplification.

**Thumbnail**: design a thumbnail with:
- Hunt logo top-left
- Large text: "AI HUNTER FOUND A REAL BUG ON 0G MAINNET" (3-line layout, bold sans-serif)
- Terminal screenshot bottom-right showing "digest match: ✓ / signer == teeSigner: ✓"
- Cost: $50–100 on Fiverr; turnaround 12h
- Specs: 1280×720, JPG/PNG <2MB

---

## 3. X teaser thread — paste 24h pre-submission

**Timing**: Post at {SUBMISSION_DEADLINE - 24h}. So if deadline is Friday 12pm EDT, post Thursday 12pm EDT. Pin the post.

**Variant A — single post (recommended, 278 chars)**

```
An AI auditor just found a real bug on @0G_labs Aristotle mainnet in 90 seconds.

Sealed code. TEE-attested model. Per-CWE on-chain reputation.

The whole audit is cryptographically replayable — exit code 0 = proof.

chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C

#0GHackathon #BuildOn0G
```

Attach the 30-45s clip from the demo video showing the hero race + strict-mode verifier.

**Variant B — 5-post thread (engagement depth)**

**1/5** — Hook (280 chars)
```
3 problems with AI bug bounty today:
— You can't prove which model audited your code
— Human audits take weeks and cost $50k+
— Private code can't go to OpenAI

Built Hunt on @0G_labs Aristotle. Sealed audits. Verifiable auditors. On-chain.

hunt.gudman.xyz
```

**2/5** — How it works (278 chars)
```
1. Protocol seals Solidity, posts bounty on-chain with CWE scope + payout
2. N AI hunter agents race inside 0G Sealed Inference TEEs
3. Each finding carries a TEE attestation: which model, which input, which timestamp
4. Per-CWE reputation accrues on-chain
```

**3/5** — Live race (273 chars)
```
Live race on Aristotle:

3 hunters fired against a sealed Vault.sol with oracle-staleness.
Oracle-specialist caught it on attempt 1 via real Sealed Inference.
Reentrancy + access-control specialists: 0 findings (correct — not their CWE).

settle tx 0x9edab38c…
```

**4/5** — Verify yourself (262 chars)
```
The whole race is cryptographically replayable:

git clone github.com/Ridwannurudeen/hunt
node scripts/verify_bounty.js 3 --model-digest 0x<paste>

Reads only the public 0G RPC. Re-derives the attestation digest. Exit 0 = real Sealed Inference proven.

@0G_labs @0g_CN @HackQuest_
```

**5/5** — Why now (264 chars)
```
AI exploit-gen success: 2% → 55.88% in one year (@AnthropicAI red-team).

By mid-2027, "AI auditor" commoditises. Survivors = verifiable execution + on-chain reputation.

Hunt is the first AI audit network shipped on a TEE-attested compute substrate.

#0GHackathon
```

**Targets to tag in replies (one per reply, don't spam):**
- @0G_labs — primary
- @_mheinrich — 0G CEO
- @HackQuest_ — hackathon platform
- @0g_CN, @0g_Eco — 0G regional accounts
- Any security researcher who agreed to operate a hunter

---

## 4. Post-submission victory tweets (templates, fire conditionally)

**If shortlisted top-10**: 
```
honored to see Hunt in the top 10 of @0G_labs APAC Hackathon — sealed AI bug-bounty network with TEE-attested execution + per-CWE on-chain reputation.

every race we ran is still cryptographically verifiable on Aristotle mainnet:
node scripts/verify_bounty.js 3 --model-digest 0x…

hunt.gudman.xyz
```

**If grand prize wins**:
```
hunt won the @0G_labs APAC Hackathon grand prize. thank you.

what's next: stake-backed adversarial falsification on Aristotle (v2), always-on guardian network for post-deploy AI monitoring (v2.5), cross-protocol bug-pattern knowledge graph (v3).

builders welcome: github.com/Ridwannurudeen/hunt
```

**If not in top-3 but mentioned by judges**:
```
grateful for the @0G_labs APAC Hackathon judging. didn't take grand prize this round but the structural moat is real — TEE-attested AI audit + per-CWE on-chain rep isn't shipped anywhere else in May 2026.

shipping v2 (falsification + guardian net) over the next 8 weeks. hunt.gudman.xyz
```
