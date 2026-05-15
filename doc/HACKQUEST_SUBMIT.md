# Hunt — HackQuest Paste-Ready Submission

Single-doc paste sheet for the 0G APAC Hackathon submission form. Each section below maps to one HackQuest form field. Open HackQuest, paste each block into the matching field, fill the `PASTE-HERE` placeholders, review, then submit yourself.

> **Source of truth**: every field below is derived from `doc/SUBMISSION.md` sections 1-10 (re-read 2026-05-15). The HackQuest form fields were confirmed by a logged-out fetch of https://www.hackquest.io/hackathons/0G-APAC-Hackathon on 2026-05-15. The fetch returned only the public field list — exact UI labels and any hidden fields can only be confirmed by you when you log in. Treat the headers below as **likely** field names; map by meaning if a label differs.
>
> **The AI assistant will NEVER click submit on your behalf — that's your call after pasting and reviewing.** (Per `~/.claude/CLAUDE.md`: "NEVER submit anything without explicit user approval first.")

---

## Before You Submit — Quick Pre-Flight

Do NOT open the HackQuest form until **every** item below is true:

- [ ] Demo video recorded per `doc/DEMO_VIDEO_SCRIPT.md` (under 3 min, 1080p, real voice) and uploaded unlisted to YouTube — URL ready to paste
- [ ] X post published per `doc/X_POST.md` with the 30-45s demo clip attached, `#0GHackathon #BuildOn0G` hashtags, `@0G_labs @0g_CN @0g_Eco @HackQuest_` tags — URL ready to paste
- [ ] `npm test` passes locally (212/212 green as of 2026-05-15)
- [ ] `node scripts/verify_bounty.js 3 --model-digest 0x<digest>` exits 0 against Aristotle mainnet
- [ ] You have re-read every block below and confirmed nothing in it has drifted since the last edit of `doc/SUBMISSION.md`

---

## 1. Project Name

**Field label (likely):** "Project Name"

```
Hunt
```

---

## 2. One-Sentence Description

**Field label (likely):** "One-Sentence Description" — capped at **30 words**.

```
Hunt is a sealed bug-bounty network for smart contracts — protocols post encrypted Solidity, AI hunter agents race through 0G Sealed Inference, and v1 relays validated findings on-chain for per-CWE-class reputation.
```

**Word count:** 30 / 30 (at the cap).

---

## 3. Project Summary

**Field label (likely):** "Project Summary" — must cover what it does, problems solved, and which 0G components are used.

> Paste the full block below verbatim. It already includes the honesty preface, the judge-runnable surface table, the 0G-components inventory, and the "what Hunt isn't" callout. If HackQuest has a character cap that rejects this length, trim from the bottom of the "Where Hunt sits" paragraph first, then the "What Hunt isn't" bullets — keep the "0G components used" and "Judge-runnable surface" sections intact.

```
Honesty preface. The headline live race is bounty #3: oracle-specialist submitted the winning finding via real 0G Sealed Inference (zai-org/GLM-5-FP8) with a ZG-Res-Key TEE attestation. The on-chain modelDigest is keccak256(utf8("zai-org/GLM-5-FP8|hunt-audit-v1")). Pass it to scripts/verify_bounty.js 3 --model-digest 0x<digest> for strict cryptographic re-derivation. Bounty #0 was the original race, ran on the documented fallback path (lib/audit-fallback.js) and stamps a distinct on-chain modelDigest so the two paths are always distinguishable. Contract semantics are identical between paths; only modelDigest differs. teeSigner and verifier are operator-held single keys in v1; v2 replaces both with attestation-verifying relay sets.

What it does. Hunt turns smart-contract auditing into an on-chain race between specialist AI agents. A protocol seals its Solidity source against a shared hunter-network key, posts a bounty with an in-scope CWE class list and a payout, and escrows OG on contracts/Hunt.sol. Every registered hunter agent — each one a "senior auditor" identity with verifier-signed GitHub credential, TEE-signed sample fingerprint, and per-CWE reputation — watches BountyPosted, downloads + decrypts the code blob, runs top-K retrieval over its own prior-finding samples vs the bounty code, and calls Sealed Inference to produce a review + self-eval in one shot. The agent picks the highest-severity in-scope finding, encrypts it to the poster's wallet pubkey, uploads to 0G Storage, and signs an attestation digest binding (bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps x 4). submitFinding runs ecrecover against teeSigner and accepts only if teeTimestamp is inside [postedAt, raceDeadline]. The poster picks the winning finding, submits a 4-axis rating, and settleBounty pays the winner and updates ClassRep[hunterId][cweClass].

The live demo proves the per-CWE-reputation thesis end-to-end. The staged demo/staged-bounty/Vault.sol contains a subtle oracle-staleness bug: _currentPrice() reads updatedAt from latestRoundData but only compares it against block.timestamp inside the admin-only setPrice(). Every user path (liquidate, withdraw, mint, _isHealthy, healthFactorBps) bypasses the freshness gate. Headline race is bounty #3 on Aristotle mainnet: three hunters fired in parallel, each one's brief narrowed to bounty.inScopeCwes intersect hunter specialty. Oracle-specialist completed Sealed Inference on attempt 1, surfaced "oracle-manipulation / high" with model self-eval overall 88.75% (severityCalibration 8500 / precision 9200 / coverage 8800 / exploitability 9000), submitted with real ZG-Res-Key TEE attestation, and won the 0.05 OG payout. The other two specialists hit transient fetch failed on the inference proxy under concurrent broker load, fell back to the documented local heuristic per spec, and returned 0 findings in their respective specialty classes — correct, no reentrancy or access-control bug fires the matching heuristic on this Vault. Per-CWE reputation accrued only to the hunter with the matching specialty. Bounty #7 inverts the casting on a different staged file: reentrancy-specialist wins on CEI-violation while oracle-specialist correctly returns zero with explicit rationale. Two specialists, two CWE classes, two bugs, each won by the matching specialist — per-class-narrowing thesis demonstrated twice independently on-chain.

Problem solved. Existing bug-bounty programs trust a central audit firm or a leaderboard of pseudonyms. Centralised AI-auditor services are cheatable — you can't tell whether the claimed model ran on the input you submitted, or whether the firm replayed cached output. Putting the contract in plaintext on a marketplace also leaks pre-deployment code. Hunt fixes the first half today: code is sealed against the public chain and storage operators (only the storage root + scope go on-chain), and every finding carries an on-chain digest binding (model, input, hunter, CWE-class, severity, finding-root, race-window timestamp, self-eval x 4). Reputation accrues per CWE class, so a hunter who's elite at reentrancy and mid at oracles can't game one rep score across domains — the chain reflects calibrated expertise.

0G components used — five primitives, all load-bearing:

- 0G Chain (Aristotle, 16661): contracts/Hunt.sol — hunter registry, bounty escrow, race + settle window, finding submission with ecrecover-verified attestation, per-CWE ClassRep ledger, credential reuse protection. ~470 LOC.
- 0G Compute / Sealed Inference: lib/fingerprint.js scores hunter sample quality at mint time; lib/review.js runs review + self-eval in a single Sealed Inference call per bounty. Both consume ZG-Res-Key attestation via broker.inference.processResponse. Bounty #3 ran on real Sealed Inference end-to-end. lib/audit-fallback.js is the documented degraded path with a distinct on-chain modelDigest.
- 0G Storage: symmetric AES for the bounty code blob (shared hunter-network key); per-hunter AES for samples + embeddings; ECIES (secp256k1 + HKDF + AES-GCM) for findings encrypted to the bounty poster's pubkey.
- TEE attestation chain-of-custody: teeSigner address on-chain; off-chain relay produces the digest Hunt.sol recovers. v1 = one operator key. v2 (doc/FUTURE.md) = TEE-attestation-verifying relay set.
- Credential verifier: verifier/server.js enforces a GitHub-activity bar (730d+ account age, 20+ merged PRs, 10+ reviews) and signs a wallet-bound, replay-protected Credential the contract recovers on mint.

Engineering depth. 212 tests passing, 0 failing. Race-deadline, settle-window, CWE-scope filter, per-hunter specialty intersection, teeTimestamp window, self-eval quality floor — all on-chain. Standalone verifier (scripts/verify_bounty.js) re-derives the attestation digest from on-chain fields and runs ecrecover independently — judges can run it without project setup.

Judge-runnable surface (no setup, no clone):

- hunt.gudman.xyz/verify.html — browser-side in-browser re-derivation of the attestation digest + ecrecover, same semantics as scripts/verify_bounty.js.
- hunt.gudman.xyz/status.html — live read of totalHunters, totalBounties, teeSigner, verifier, Notary attestation count, ReputationOracle domain count.
- hunt.gudman.xyz/proof.html?bounty=3 — per-bounty receipt explorer with timeline, scope chips, per-finding rows, winner card with decoded attestation digest fields.
- hunt.gudman.xyz/api/ — public read API (JSON, CORS-open, 30s cache): /stats, /hunters, /hunters/:id, /bounties, /bounties/:id, /bounties/:id/findings, /rep/:hunterId/:cwe.
- hunt-mcp-server on npm — 10 MCP tools wrap the same primitives; any MCP client (Claude Desktop, Cursor) queries Hunt natively. Install: npx -y hunt-mcp-server.
- hunt-verifiable-ai on npm — SDK with findingDigest, classToBytes32, signAttestation, verifyAttestation, ECIES helpers. Install: npm i hunt-verifiable-ai.

What Hunt isn't (honesty surface):

- Not chain-enforced TEE attestation in v1. The chain enforces teeSigner signed the digest; the off-chain ZG-Res-Key validation the daemon does before signing is not chain-witnessed. v2 closes that.
- Not a replacement for human security review. It is an adversarial, AI-only, per-CWE pre-screen layer. Findings are attested, not proven correct.
- All three current demo hunters are operator-owned wallets. External-operator participation is a known gap and the most direct path from "verifiable" to "adversarial".
```

**Approx word count:** ~810 words. If HackQuest enforces a hard cap below this, cut from the bottom up (drop "What Hunt isn't" first, then "Engineering depth").

---

## 4. GitHub Repository Link

**Field label (likely):** "GitHub Repository" / "Project Repository URL"

```
https://github.com/Ridwannurudeen/hunt
```

---

## 5. 0G Mainnet Contract Address

**Field label (likely):** "0G Mainnet Contract Address" — single address field. If HackQuest accepts multiple, also list HuntNotary + HuntReputationOracle from the optional materials block below.

```
0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C
```

(Chain: 0G Aristotle, chainId 16661.)

---

## 6. 0G Explorer Link

**Field label (likely):** "0G Explorer Link" / "On-Chain Verification Link"

```
https://chainscan.0g.ai/address/0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C
```

If HackQuest asks for a specific transaction instead of the contract page, grab the **bounty #3 settle tx** from `doc/SUBMISSION.md` section 5 (its tx-hash row prefixed `0x9edab38c...d241`). Paste a URL of the form `https://chainscan.0g.ai/tx/<that-full-hash>`. The full hash is intentionally not duplicated here — copying from `SUBMISSION.md` guarantees you paste the same string both places.

---

## 7. Demo Video URL

**Field label (likely):** "Demo Video URL" — under 3 minutes, publicly accessible (YouTube unlisted is fine).

```
PASTE-HERE: YouTube unlisted URL of the demo recorded per doc/DEMO_VIDEO_SCRIPT.md
```

Spec reminder: 2:30-2:55 runtime, 1080p, real voice. Hero scene = live race against bounty #3 on Aristotle mainnet, then `scripts/verify_bounty.js 3 --model-digest 0x<digest>` exit 0.

---

## 8. README / Documentation Link

**Field label (likely):** "README / Documentation Link"

```
https://github.com/Ridwannurudeen/hunt/blob/main/README.md
```

Architecture, 0G module call-sites, quickstart, honesty notes, and roadmap are all linked from the README — judges can read top-down without clicking through every doc.

---

## 9. Public X Post Link

**Field label (likely):** "X Post Link" / "Social Post URL" — must include project name + demo screenshot/clip, hashtags `#0GHackathon #BuildOn0G`, and tag `@0G_labs @0g_CN @0g_Eco @HackQuest_`.

```
PASTE-HERE: URL of the published X post (draft text is in doc/X_POST.md)
```

---

## 10. Live Frontend / Demo Link

**Field label (likely):** "Live Demo URL" — usually optional but Hunt has a live frontend, so include it.

```
https://hunt.gudman.xyz
```

Direct deep-links judges should bookmark:

- Headline-race receipt: https://hunt.gudman.xyz/proof.html?bounty=3
- Browser-side verifier: https://hunt.gudman.xyz/verify.html
- Live system status: https://hunt.gudman.xyz/status.html

---

## 11. Optional / Bonus Materials

**Field label (likely):** "Additional Materials" / "Bonus Submissions" — paste this block if there's a free-text optional materials field; skip otherwise.

```
- Reusable SDK: hunt-verifiable-ai on npm (https://www.npmjs.com/package/hunt-verifiable-ai) — findingDigest, classToBytes32, signAttestation, verifyAttestation, ECIES helpers. 9 tests passing, 5 example scripts.
- MCP server: hunt-mcp-server on npm (https://www.npmjs.com/package/hunt-mcp-server) — 10 tools wrap the Hunt primitives for any MCP client.
- HuntNotary (live on Aristotle): 0x968d5E070152A90Ae7a3c5251222FC163b72C7E2 — hash-only AI conversation receipts.
- HuntReputationOracle (live on Aristotle): 0xdf2f9587D5746cd1358d40804bE7885BDaaE45d2 — per-domain Hunt reputation for other apps and bridges.
- Public read API: https://hunt.gudman.xyz/api/ — JSON, CORS-open, 30s cache.
- Standalone judge verifier: scripts/verify_bounty.js — single-file, zero-setup, depends only on ethers + Node built-ins.
- Primary live audit target — ChartChain: bounty #6 on Aristotle audits the real MedicalRecordsVault.sol from https://github.com/Ridwannurudeen/chartchain. Demonstrates the same primitive on a separate live 0G protocol.
- Institutional partnership playbook: doc/INSTITUTIONAL_PARTNERSHIP.md.
- Roadmap: doc/FUTURE.md (4-pillar v2 plan with primary-source competitive citations).
- AI usage attribution: AI_USAGE.md (last updated 2026-05-15).
```

---

## 12. Track Selection

**Field label (likely):** "Track" — dropdown or radio. Hunt is single-track only.

```
Track 3 — Agentic Economy & Autonomous Applications
```

Justification (only paste if the form has a free-text "why this track" sub-field):

```
Hunt is a multi-agent economic protocol with on-chain reputation, escrow + payment, and verifiable autonomous execution. Three independent hunter agents race against a single bounty; each is an on-chain identity with its own samples, fingerprint, and per-CWE reputation; the protocol settles by paying the winner and updating reputation. The agents run autonomously off a BountyPosted watch loop; there is no human in the inference loop. That is the Track 3 mandate at the literal level.
```

---

## 13. Team Information

**OPTIONAL — only if HackQuest asks for a team roster.** Hunt is a solo build; if the form requires names, paste the single-builder line below into the field labelled "Team Members" / "Builders":

```
PASTE-HERE: your HackQuest handle / display name (solo build)
```

---

## Fields HackQuest May Not Have

The following were drafted in case HackQuest asks for them — **skip if no matching field appears in the form**:

- **Pitch deck URL** — Hunt does not currently ship a deck. Leave blank or paste the README link as a substitute.
- **API documentation URL** — use `https://hunt.gudman.xyz/api/` (the API is self-describing via JSON responses).
- **Testing notes** — paste: "`npm test` — 212 tests green, 0 failing as of 2026-05-15. Race-deadline, settle-window, CWE-scope filter, per-hunter specialty intersection, teeTimestamp window, self-eval quality floor — all on-chain and covered by the contract suite (68 Hunt tests)."

---

## Final Manual Review Gate

Before you click submit on HackQuest:

1. Confirm every `PASTE-HERE:` placeholder above is filled in.
2. Confirm the demo video plays publicly from a logged-out browser.
3. Confirm the X post URL resolves to a public, non-deleted post with the demo clip attached.
4. Re-read section 3 once more — it's the longest field and the most likely to get truncated by a hidden char cap.

**The AI assistant will NEVER click submit on your behalf.** That's your call, after pasting and reviewing, with explicit go-ahead from you alone.
