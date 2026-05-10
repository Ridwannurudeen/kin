# Kin Demo Video Script (≤3 min)

Record at 1080p. Real voice. Single take if possible.

---

**[00:00 — 00:18]  Hook (18s)**

[Screen: black, then text fades in: "It's 3am."]

> "Right now, somewhere on the internet, a writer is asleep. And a bot is sending generic AI slop in their voice — for free."

[Cut: ChatGPT logo, then a generic AI rejection email]

> "We can do better. **Your AI should earn money for you. While you sleep. In your voice. Privately.**"

[Cut to Kin logo: "Kin."]

> "I built Kin in 6 days for the 0G APAC Hackathon. Watch."

---

**[00:18 — 00:48]  Become a skill (30s)**

[Cut to /onboard page, beautiful editorial UI]

> "Step one: I capture my voice."

[Paste 3 writing samples — internal memos, investor notes, op-ex emails. Set price 0.01 OG.]

> "Three samples. Each one encrypted client-side with AES-256, uploaded to 0G Storage, root hash anchored on-chain. The plaintext never sees a server."

[Click "encrypt + upload + mint"]
[Show terminal-style logs streaming: "encrypting sample 1...", "uploaded root 0xabc...", "mintSkill tx 0x...", "✓ Skill #0 minted"]

[Cut to chainscan: SkillMinted event live]

> "My SkillNFT is now on Aristotle mainnet. Token zero. ERC-7857-pattern. It's mine."

---

**[00:48 — 02:00]  A job comes in (72s)**

[Cut to /marketplace — see Skill #0 listed at 0.01 OG]

> "Now I switch wallets. I'm a client. I need a memo for my team."

[Click "hire" on Skill #0, modal opens]
[Paste brief: "Write a 200-word memo to my team about a 4-week sprint. Confident, slightly impatient, no corporate fluff."]
[Click "post job + escrow"]

> "Brief encrypted, uploaded to 0G Storage, escrow paid in. Now watch what happens."

[Cut to /job/0 page — execution panel lights up step by step]

```
[01/05] Pulling skill samples from 0G Storage…
[02/05] Decrypting samples inside enclave…
[03/05] Loading brief, sealed inference call to 0G Compute…
[04/05] TEE-signed response received, uploading to 0G Storage…
[05/05] Submitting on-chain (Kin.submitWork) …
```

[Output text streams in — a 200-word memo in the user's voice, confident and terse]

> "The model — zai-org/GLM-5-FP8 — ran inside an Intel TDX enclave. It saw my voice samples, it saw the brief, it produced output. Plaintext never left the enclave. The response is signed by the TEE."

[Highlight the badge: "TEE valid · attestation 7913a578…"]

> "Attestation valid. The signature is from the enclave, not a third party."

---

**[02:00 — 02:35]  Settlement (35s)**

[Click "accept + rate 5/5"]

> "Client accepts."

[Show on-chain: AcceptWork event, payment splits to skill owner wallet]

[Cut to /wallet, refresh — Skill #0 stats: 1 job · 5/5 · 0.01 OG earned]

> "Payment splits on-chain. The user's wallet just earned 0.01 OG. They're asleep. Their AI just earned them money. Verifiably."

[Show full audit trail on chainscan]

> "Every step on-chain: skill mint, job post, work submission with attestation, settlement. Zero platform fees. Zero centralized cut."

---

**[02:35 — 02:55]  Wrap (20s)**

[Cut to architecture diagram]

> "Five 0G primitives, each genuinely needed. INFTs for ownership. Sealed Inference for privacy. Storage for encrypted samples + outputs. Chain for marketplace. ERC-7857 oracle for inheritance."

[Show: "Built on 0G Aristotle Mainnet — Kin — github.com/Ridwannurudeen/kin"]

[Final shot: dollar value ticker rising, "$0.00 → $0.01" → "Your AI just earned 0.01 OG."]

> "Kin. Your AI. Your earnings. While you sleep."

---

**Recording checklist**
- [ ] Real voice, no TTS, no music with text overlay
- [ ] 1080p, 30fps minimum
- [ ] All screens legible at YouTube playback
- [ ] Show actual on-chain transactions (use the deployed contract `0x4eC373111616a104DE83402B92966d6efca0ca9E`)
- [ ] Synthetic samples + briefs only
- [ ] Final length 2:50–2:58 (under 3 min hard cap)
- [ ] Upload to YouTube unlisted; link in submission

**Live deployment used in demo**
- Contract: 0x4eC373111616a104DE83402B92966d6efca0ca9E
- Sample skill mint tx: see `scripts/e2e_job.js` output
- Sample job submit tx: 0xf8967494c5279cb656e4ba7d43c2ed4ff453e8ae825e8a637cb8287270ae6b42
- Sample settle tx: 0x3a21bff24a18357af333d87be05fb6b12fd5f0957ec2d162974eb757f643d1c8
