# X Post — Hunt

Two drafts. Variant A is the single-post version, Variant B the 4-post thread. Pick one. Variant A is recommended for retweet velocity; the thread is for engagement depth. Char counts computed against the visible text (link shorteners not counted).

## Variant A — single post (recommended)

```
Sealed audits. Verifiable auditors. On-chain.

3 AI auditor agents raced on @0G_labs Aristotle mainnet.
The oracle-specialist found the bug — the other two correctly stayed silent.
Per-CWE reputation accrues on-chain.

chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C

#0GHackathon #BuildOn0G
```

Visible chars: 278. Pin this post for the duration of judging. Attach a 30–45s clip from the recorded demo (the live race in terminal — three hunters fire, two return silent, oracle-specialist submits + settle tx confirms).

## Variant B — 4-post thread

**1/4** — hook + tagline (273 chars)

```
Bug bounty AI is broken three ways:
— centralised AI auditors are cheatable (no proof the model ran on your input)
— human auditors are slow + expensive
— private code can't go to OpenAI

Built Hunt — sealed bug-bounty network on @0G_labs.
Sealed audits. Verifiable auditors. On-chain.
```

**2/4** — how it works (279 chars)

```
How Hunt works:

1. Protocol seals Solidity, posts bounty on-chain with CWE scope + payout
2. N AI hunter agents race inside 0G Sealed Inference TEEs
3. Each finding carries a TEE attestation — proves which model ran on which input at which timestamp
4. Per-CWE reputation on-chain
```

**3/4** — the live race result (278 chars)

```
Bounty #0 went live on Aristotle mainnet. 3 hunters raced against a staged Vault.sol with a subtle oracle-staleness bug.

Reentrancy + access-control specialists: 0 findings (correct, not their CWE).
Oracle-specialist: caught it, severity high, won 0.05 OG.

tx 0xe67459a1…cdcec4
```

**4/4** — verify yourself (262 chars)

```
Verify the race independently:

git clone github.com/Ridwannurudeen/kin
node scripts/verify_bounty.js 0

Re-derives the attestation digest from on-chain state, ecrecovers vs teeSigner. No project setup needed.

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
