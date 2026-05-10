# Kin — HackQuest Submission Form Answers

Pre-filled answers for the 0G APAC Hackathon submission form. Review each field before pasting into HackQuest.

---

## 1. Project name
**Kin**

## 2. One-sentence description (≤30 words)
Your AI earns money while you sleep — skills as INFTs, jobs run inside Sealed Inference, payment splits on-chain on 0G Aristotle mainnet.

## 3. Short summary

**What it does**: Kin is a marketplace for AI agents that earn for their owners. A user pastes 3-10 work samples (writing, code reviews, design notes) → samples are AES-encrypted client-side → uploaded to 0G Storage → a SkillNFT (ERC-7857-pattern) is minted on Aristotle mainnet with the sample roots + a sealed key. The skill lists publicly with a per-job price. When a buyer posts a job (encrypted brief + escrowed payment), the agent runs inside a Sealed Inference TEE on 0G Compute — pulling the user's samples as voice context, generating output in their style, returning a TEE-signed response. Output goes back to 0G Storage; the agent calls `submitWork` on-chain with the attestation ID. After a 24h dispute window, payment splits to the skill owner. Reputation accumulates per skill.

**Problem solved**: Today's AI marketplaces (HuggingFace, Replicate, GPT Store) leak everything — your training data, your outputs, your style fingerprint. Generic AI bots sell impersonal output in your professional space without your consent or compensation. Kin solves both: your skill is a sovereign INFT you actually own, every job runs privately inside a TEE, and every settlement splits to your wallet automatically.

**0G components used** (5 primitives, all genuinely needed):
- **INFT (ERC-7857-pattern)**: SkillNFT encodes skill type, sample roots, sealed key, price, reputation. Transferable, inheritable.
- **0G Compute / Sealed Inference**: every job runs inside Intel TDX enclave on `zai-org/GLM-5-FP8` (or other available providers); response signed by enclave.
- **0G Storage**: AES-256-GCM encrypted writing samples + briefs + outputs, addressed by root hash.
- **0G Chain (Aristotle mainnet, chain 16661)**: marketplace contract, escrow, dispute window, payment split, on-chain reputation.
- **ERC-7857 oracle pattern**: documented for re-encrypted INFT transfers (full implementation in `doc/FUTURE.md`).

## 4. Code Repository
https://github.com/Ridwannurudeen/kin *(public)*

## 5. 0G Integration Proof

- **0G Mainnet contract address**: `0x4eC373111616a104DE83402B92966d6efca0ca9E`
- **0G Explorer link**: https://chainscan.0g.ai/address/0x4eC373111616a104DE83402B92966d6efca0ca9E
- **Sample on-chain settled job (full flow on-chain)**:
  - **Skill mint**: Skill #0 (writing) by user `0xA1855fBf...`
  - **submitWork tx**: `0xf8967494c5279cb656e4ba7d43c2ed4ff453e8ae825e8a637cb8287270ae6b42` (block 32853399)
  - **acceptWork settlement tx**: `0x3a21bff24a18357af333d87be05fb6b12fd5f0957ec2d162974eb757f643d1c8` (block 32853415) — payment split executed on-chain
- **Storage upload**: encrypted sample root `0x27cefe2f1b260d9c18a56fcbc88da0466e6a3c378282cea1464d0951d778e3ae` (lipid panel test), and output blob with TEE attestation on-chain.
- **Sealed Inference attestation**: model `zai-org/GLM-5-FP8`, attestation ID validated via `broker.inference.processResponse()`.

## 6. Demo Video
*[YouTube unlisted link — record per `doc/DEMO_VIDEO_SCRIPT.md`, paste here]*
- Length: 2:50–2:58 (under 3 min cap)
- 1080p / real voice / no slides-only
- Shows actual on-chain mints, job submission, settlement

## 7. README / Documentation
See repo root `README.md`. Includes: architecture diagram, full job lifecycle, 0G primitives table, reproduction steps (`scripts/{deploy,setup_demo_wallets,e2e_job}.js`), honesty notes on what's v1 vs v2.

## 8. Public X Post
*[Post URL — see `doc/X_POST.md` for the draft]*
- Includes 30-45s demo clip
- Hashtags: `#0GHackathon` `#BuildOn0G`
- Tags: `@0G_labs` `@0g_CN` `@0g_Eco` `@HackQuest_`

## 9. Track
**Track 1 — Agentic Infrastructure & OpenClaw Lab** (primary)

*Reasoning*:
- Kin is the literal embodiment of 0G's "Web 4.0 = AI agents own, earn, transact" narrative.
- Multi-primitive depth (5 of the 5 named in the docs) — not bolted-on integration.
- INFT use is non-trivial: skill ownership, transferability, reputation accumulation, royalty splits.
- Sealed Inference is mission-critical, not decoration: privacy is the entire moat.
- Aligns with VP Salerno's named bet on agentic finance + consumer apps.

Optional cross-listing to **Track 3 (Agentic Economy)** — Kin literally is "AI commerce + Agent-as-a-Service".

## 10. Bonus materials
- ✅ Pitch deck — generate from architecture diagram + 5-primitive table (6 slides max)
- ✅ Frontend demo — running at `localhost:3000`; deploys to Vercel/Railway with `node server.js` + a single env var. Judges can run locally per README.
- ✅ Backend API documentation — JSDoc inline in `server.js`; routes documented in README.
- ✅ Technical write-up — `doc/FUTURE.md` covers v2 work (full ERC-7857 oracle, LoRA in Sealed Inference, OpenClaw runtime, ECDH brief encryption).

---

## Final pre-submission checklist (DO NOT submit until ALL checked)

- [ ] Repo public on GitHub (Ridwannurudeen/kin)
- [ ] README contract addresses match deployed
- [ ] Demo video recorded (≤3 min, real voice, 1080p)
- [ ] Demo video uploaded to YouTube unlisted; link added above
- [ ] X post drafted, screenshot/clip attached
- [ ] X post published; URL added above
- [ ] AI_USAGE.md present in repo
- [ ] All sample tx hashes verified live on chainscan.0g.ai
- [ ] `scripts/e2e_job.js` runs end-to-end on a fresh laptop (final reproducibility check)
- [ ] **User explicit approval to submit**

When ready: log into HackQuest, paste this content, **wait for user explicit approval**, then click submit.
