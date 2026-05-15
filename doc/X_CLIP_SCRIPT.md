# X Post Clip — 30–45s Record Plan

Companion to `doc/X_POST.md`. This is the **clip you attach to the tweet**, not the demo video (the 3-min unlisted YouTube goes in SUBMISSION §6). Goal: judges who only watch the tweet preview see Hunt's race + verifier in one tight take.

**Target length:** 35–40s. Hard cap 45s (X autoplay sweet spot).

---

## Setup (5 min)

- Two browser windows side-by-side, both pointed at `hunt.gudman.xyz`:
  - **Window L (1280×720 zoom)**: `/proof.html?bounty=3` already loaded — judge proof panel with bounty #3 receipt visible
  - **Window R (1280×720 zoom)**: `/verify.html` already loaded — empty form
- One terminal at the right of the screen, monospace 16pt+, dark theme, transparency off:
  ```
  cd /path/to/hunt
  ```
  ready to type `node scripts/verify_bounty.js 3 --model-digest 0x<digest>` (do not pre-fill — typing it live reads better)
- Pre-compute the digest one-liner in a separate scratch terminal so you have it on clipboard:
  ```bash
  node -e "console.log(require('ethers').keccak256(require('ethers').toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1')))"
  ```
  Save the `0xba2eccd8…` output to clipboard before recording.
- Screen recorder: OBS or QuickTime, 1080p, no music bed, ambient room mic OK.

---

## Shot list (record in one continuous take if possible)

**[0:00 – 0:06] Hook (6s).**
Cursor over `proof.html?bounty=3` winner panel — winner card with `oracle-specialist`, `severity: high`, signature recovery row visible. Don't speak yet. Let the panel render. Tab title shows "Judge Proof — Hunt".

**[0:06 – 0:14] Voice + show what happened on-chain (8s).**
> "Bounty #3 on 0G Aristotle. Three AI hunters raced. The oracle-specialist won — finding submitted with a TEE attestation digest, 0.05 OG paid."

Pan slowly down the proof panel showing the per-finding rows + the winning attestation digest.

**[0:14 – 0:24] Switch to verify.html in browser (10s).**
> "Anyone can verify in the browser, no clone."

Click into the bountyId field, type `3`. Click "Fill in canonical Hunt-audit digest" — the modelDigest field auto-fills with `0xba2eccd8…`. Click **Verify**.

**[0:24 – 0:35] The three checkmarks (11s).**
> "Signer matches teeSigner. Race-window timestamp holds. Digest re-derives from the on-chain fields plus the supplied modelDigest. Three checkmarks. Cryptographic proof — no trust required."

Pan over the three green ticks. Pause on the verdict banner ("winning finding verifies in strict mode").

**[0:35 – 0:40] Close (5s).**
Cut to Hunt masthead. Title text: `Hunt — hunt.gudman.xyz`.
> "Sealed audits. Verifiable auditors. On-chain."

---

## Post-record checklist

- [ ] Total length 35–45s
- [ ] Audio is your real voice, no TTS, ambient mic OK
- [ ] All on-screen text legible at X autoplay zoom (16pt minimum monospace)
- [ ] No flicker / focus-jump between cuts
- [ ] Final frame shows `hunt.gudman.xyz` clearly
- [ ] Export as MP4, 1080p, under 15MB (X's mobile-friendly cap)
- [ ] Attach to X post per `doc/X_POST.md` Variant A or C

**If you only have 25 seconds**, drop section [0:14–0:24] (browser switch) and go straight from the proof panel to the CLI in a terminal — same three checkmarks, same verdict, just less visual.

---

## Don't include

- Don't run the live race (`scripts/run_race.js`) in this clip — that's the 3-min demo video. This clip is the *proof*, not the *race*.
- Don't show MetaMask popups — keep the wallet-connect dance for the demo video.
- Don't show the post-bounty / mint-hunter forms — same reason. This clip = receipt verification only.
- Don't slow-narrate. Trust the visuals. Speak ~150 wpm.
