# Outreach templates — security researchers + 0G core team

For the 4 days leading to the 0G APAC Hackathon submission (deadline 2026-05-16). Goal: 2–3 external operators running Hunt hunters during the demo recording + at least one public acknowledgement from a recognizable handle.

**Personalise every send**. The templates below are skeletons. Replace `{HOOK}` with something specific to their recent public work (a c4 finding, a tweet thread, an audit report) so it doesn't read as cold spam.

---

## Template 1 — Code4rena top warden (DM via Twitter / Discord)

**Subject / opener**: "Quick paid gig — 0G hackathon demo this week"

> Hey {NAME} — caught your {HOOK: their most recent c4 finding or thread}. Sharp work.
>
> I'm shipping Hunt for the 0G APAC Hackathon (Track 3, deadline Friday). It's a sealed bug-bounty network — AI hunter agents race inside 0G Sealed Inference TEEs, per-CWE reputation accrues on-chain. Live mainnet: https://hunt.gudman.xyz, contract 0xD4Fe5127… on Aristotle.
>
> Looking for **2–3 external operators** to spin up a hunter on their own wallet for the demo recording on {DATE}. Total commitment: 30 min setup + sit through one 10-min live race. Pays $1.5k. Onboarding doc: https://github.com/Ridwannurudeen/hunt/blob/master/doc/OPERATOR_ONBOARDING.md
>
> Catch: I need someone recognised — your name in the participant list materially strengthens the "real adversarial market" claim vs my three demo personas. Down?

**Targets** (verify activity is current before sending):
- Top 10 c4 wardens for the last quarter (publicly listed on https://code4rena.com/leaderboard)
- @CyfrinJared, @CyfrinTincho, @PaulRBerg
- @0xRajeev, @0xfoobar, @samczsun (long-shots — high value if they engage)

---

## Template 2 — Sherlock senior watson (DM via Discord)

> {NAME} — your write-up on {HOOK: their most recent Sherlock contest finding} hit hard. Wanted to ping you on a fast paid gig.
>
> Hunt is a sealed AI-audit network on 0G mainnet (live https://hunt.gudman.xyz). For the 0G APAC Hackathon demo on {DATE}, I'm hiring 2–3 senior auditors to run an AI hunter agent against a live bounty. Your wallet, your CWE specialty, your name on-chain. Pays $1.5k for ~30 min of setup + one 10-min race.
>
> The point isn't that the AI is better than you — it's that the AI has provable execution and per-CWE rep that compounds. You being an external operator (not me running all 3 wallets) is the proof point I need for grand prize judges.
>
> Onboarding: https://github.com/Ridwannurudeen/hunt/blob/master/doc/OPERATOR_ONBOARDING.md
>
> Yes / no in the next 24h would help — recording's Friday.

**Targets**: top 3 watsons in current Sherlock contests; ex-Sherlock judges with public Twitter presence.

---

## Template 3 — Boutique firm auditor (more formal)

> Hi {NAME} — I'm Ridwan, building Hunt for the 0G APAC Hackathon (final submission Friday).
>
> Hunt is the first AI audit network where every finding carries an on-chain attestation digest binding (model, input, race-window timestamp) — v1 is operator-relayed over real 0G Sealed Inference, v2 swaps the relay for a TEE-attestation-verifying signer set (chain-enforced bind). Plus per-CWE on-chain reputation. We're verified-novel vs the May 2026 landscape (Olympix, Nethermind AuditAgent, Trail of Bits internal pipeline, Bittensor audit subnets — full scan at https://github.com/Ridwannurudeen/hunt/blob/master/doc/FUTURE.md).
>
> Looking to engage 2–3 recognised security researchers as external hunter operators for the live demo race on {DATE}. The hunter daemon does the work — you just spin it up on your wallet and watch. $1.5k flat for the engagement.
>
> Why I'm asking you specifically: {HOOK — be honest about the specific reason — a thread, a finding, their reputation in a CWE class}.
>
> Live frontend: https://hunt.gudman.xyz · Onboarding: https://github.com/Ridwannurudeen/hunt/blob/master/doc/OPERATOR_ONBOARDING.md
>
> Open to a 15-min call this week to talk through it.

**Targets**: ex-Trail of Bits / Zellic / Spearbit engineers who have their own audit boutiques or do independent work.

---

## Template 4 — Crypto Twitter security personality

> Hey {NAME} — fan of {HOOK: a specific tweet/thread of theirs}.
>
> Quick ask. Hunt is live on 0G Aristotle mainnet — sealed bug-bounty network where AI hunters race to find smart-contract bugs, every finding has an on-chain attestation digest (v1 operator-relayed over real Sealed Inference, v2 chain-enforced TEE bind), per-CWE rep on-chain. Friday is the 0G APAC Hackathon grand prize deadline.
>
> I'm getting 2–3 external operators to run hunters during the demo recording. Would you spin one up? Compensated either way ($1.5k flat) but I'd value the visibility of your name in the on-chain participant list more than the dollars matter.
>
> Even if you can't operate, would you be open to a quote like "Hunt's verifiable-execution substrate + on-chain reputation is the right shape" for the submission? Or RT the live race when it goes? Whichever works.
>
> Repo: https://github.com/Ridwannurudeen/hunt · Demo: https://hunt.gudman.xyz

**Targets**: @samczsun, @0xfoobar, @SmokeyTheBera, @cmichelio, @0xDeadc0de, @PatrickAlphaC, @itsdevbear.

---

## Template 5 — Friend / known contact (warmest)

> {NAME} — I'm pushing Hunt across the line for the 0G APAC Hackathon by Friday. Could really use one favor.
>
> Need 2–3 people with recognisable handles running an AI hunter on their own wallet during the live demo race. Total commitment: 30 min setup, 10-min race, you don't have to do anything during the race except watch the daemon do its thing. Paid or unpaid — your call.
>
> Submission's competing for the grand prize ($150k pool). The "real adversarial market" claim falls flat if all three hunters are my wallets. With you + a couple others, it becomes a real story.
>
> Got 15 min today or tomorrow for a call? https://hunt.gudman.xyz if you want to poke around first.

**Targets**: any known auditor / security researcher you've worked with directly or have a warm intro to.

---

## 0G core team DM

> Hi {NAME / Heinrich / 0G dev advocate} — Ridwan here. Submitting Hunt to the 0G APAC Hackathon Friday — sealed AI bug-bounty network on Aristotle mainnet, all 5 0G primitives load-bearing (Chain, Sealed Inference, Storage, TEE attestation chain, GitHub credential verifier).
>
> Bounty #3 strict-mode verifier exits 0 on Aristotle with `digest match ✓ / signer == teeSigner ✓ / teeTimestamp window ✓` — anyone can re-derive the proof with one command. Live frontend: https://hunt.gudman.xyz.
>
> Two asks, either / both helpful:
>
> 1. **15-min Discord call this week** to walk you through the architecture before the submission lands. Verified-novel vs every AI audit competitor I scanned (Olympix, Nethermind AuditAgent, Trail of Bits internal pipeline, Mira, Bittensor audit subnets). I want 0G to see this isn't another GPT-wrapper — it's compute-substrate-specific.
> 2. **One acknowledgement** before submission — even a "interesting build on Sealed Inference" reply on Twitter would massively help on the credibility axis.
>
> Repo: https://github.com/Ridwannurudeen/hunt · Submission doc: https://github.com/Ridwannurudeen/hunt/blob/master/doc/SUBMISSION.md
>
> Available any 15-min slot in the next 48h.

**Targets** (highest leverage first):
- 0G Labs CEO Michael Heinrich (@_mheinrich on X)
- 0G Labs core engineers active in Discord
- 0G dev advocate / ecosystem team
- 0G Compute team (closest fit — they built Sealed Inference)

---

## Sending sequence — recommended order

1. **Day -3 (today)**: 10 DMs to security researchers (Templates 1, 2, 3, 5). Goal: 3 yes's.
2. **Day -3 (today)**: 3 DMs to 0G core team. Goal: 1 call scheduled.
3. **Day -2**: Onboard whoever said yes. Hand them onboarding doc + materials.
4. **Day -1**: Coordinate operators for the race timing. Schedule recording window.
5. **Day 0 (deadline)**: Demo race + recording happens. Submission lands.

## Realistic conversion rates

Cold DMs to busy security researchers run ~10–20% positive response rate on a paid gig with a tight deadline. 10 DMs → 1–2 yes's. To get 3 external operators, plan to send 15–20 DMs and follow up at the 6h mark.

The 0G core team is the higher-leverage but lower-conversion channel — they're inundated with hackathon entries. Aim for ONE pre-submission acknowledgement; treat any more as bonus.
