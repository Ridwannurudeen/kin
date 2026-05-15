# X Post — Hunt

Two drafts. Variant A is the single-post version, Variant B the 4-post thread. Pick one. Variant A is recommended for retweet velocity; the thread is for engagement depth. Char counts computed against the visible text (link shorteners not counted).

## Variant A — single post (recommended)

```
Sealed audits. Verifiable auditors. On-chain.

3 AI hunters raced on @0G_labs Aristotle mainnet.
The oracle-specialist found the smart-contract bug — the other two correctly stayed silent.
Per-CWE reputation accrues on-chain.

Verify, post, mint — all from your wallet → hunt.gudman.xyz

@0g_CN @HackQuest_ #0GHackathon #BuildOn0G
```

Pin this post for the duration of judging. Attach a 30–45s clip from the recorded demo (the live race in terminal — three hunters fire, two return silent, oracle-specialist submits + settle tx confirms).

## Variant C — interactive-surface lead (alt single post)

If the recorded clip is a screen-capture of the browser flow rather than the terminal, use this version. It leads with the "judge can use this right now" angle — the single biggest differentiator vs every other Track 3 submission.

```
Hunt isn't a brochure. It's a dApp.

→ verify any past finding cryptographically in your browser
→ post a real bounty on @0G_labs Aristotle mainnet from your wallet
→ mint a hunter agent

Sealed audits, verifiable auditors, on-chain → hunt.gudman.xyz

@0g_CN @HackQuest_ #0GHackathon #BuildOn0G
```

## Variant B — 4-post thread

**1/4** — hook + tagline

```
Bug bounty AI is broken three ways:
— centralised AI auditors are cheatable (no proof the model ran)
— human auditors are slow + expensive
— private code can't go to OpenAI

Built Hunt — sealed bug-bounty network on @0G_labs.
Sealed audits. Verifiable auditors. On-chain.
```

**2/4** — how it works

```
How Hunt works:

1. Protocol seals Solidity, posts bounty on-chain with CWE scope + payout
2. N AI hunter agents race through 0G Sealed Inference
3. Findings carry an on-chain attestation digest, operator-relayed in v1; v2: chain-enforced bind
4. Per-CWE reputation on-chain
```

**3/4** — the live race result

```
Bounty #3 went live on @0G_labs Aristotle. 3 AI hunters raced against a staged Vault.sol oracle-staleness bug.

Oracle-specialist won via real Sealed Inference + TEE attestation: severity high, 0.05 OG.
The other two: 0 findings (correct — not their CWE).

settle tx 0x9edab38c…
```

**4/4** — verify yourself

```
Or no clone, no setup — verify in your browser:

hunt.gudman.xyz/verify.html → paste bountyId 3, click "fill canonical digest", Verify.

Same checks as scripts/verify_bounty.js: signer = teeSigner, teeTimestamp in race window, digest re-derives from on-chain fields + modelDigest. Strict-mode exit 0.

@0G_labs @0g_CN @0g_Eco @HackQuest_
#0GHackathon #BuildOn0G
```

## Mandatory checklist (per HackQuest rules)

- [ ] Project name: Hunt
- [ ] Demo screenshot or short clip
- [ ] Hashtags: `#0GHackathon` `#BuildOn0G`
- [ ] Tags: `@0G_labs` `@0g_CN` `@0g_Eco` `@HackQuest_`

## Posting plan

- Cut a 30–45s clip from the hero scene of the recorded demo — three hunters fire in parallel, two return silent, oracle-specialist submits, settle tx confirms, chainscan tab visible. No music drowning the narration; ambient terminal sounds OK.
- Post **after** the demo video is unlisted on YouTube and **before** the HackQuest submission. Link the post URL into `doc/SUBMISSION.md` §8.
- Pin the post on profile for the duration of judging.
