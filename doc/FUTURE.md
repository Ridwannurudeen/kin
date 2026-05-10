# Kin — Future Work

Items deliberately scoped out of the 6-day hackathon build, with notes on how to land them properly post-hackathon.

## 1. Real ERC-7857 oracle re-encryption

Current `transferSkill()` is simplified — new owner provides a fresh sealed key. The full ERC-7857 pattern uses a TEE oracle to re-encrypt the patient's AES key against the new owner's pubkey atomically with the transfer, per the [0gfoundation/0g-agent-nft](https://github.com/0gfoundation/0g-agent-nft/tree/eip-7857-draft) reference.

**To land**: deploy `TEEVerifier` with the actual 0G TEE oracle pubkey (need confirmed value from 0G team), add `transferSkill()` variant that requires + verifies the oracle's transfer proof, build the off-chain TEE re-encrypt service.

## 2. LoRA fine-tuning loaded into Sealed Inference

v1 uses in-context learning (samples as context). 0G's fine-tuning service produces a downloadable LoRA, but as of May 2026 it does not load into Sealed Inference — the inference examples in 0G's docs only show running fine-tuned LoRAs locally. That breaks the privacy story.

**To land**: When 0G ships TEE-loadable LoRA (planned per their roadmap), wire the skill onboarding to:
1. Upload samples as training data to 0G Compute fine-tuning
2. Get back a sealed LoRA pointer
3. Embed pointer in SkillNFT metadata
4. Load LoRA into Sealed Inference at job time via `broker.inference.loadAdapter(lora_cid)`

This unlocks an additional 0G primitive (fine-tuning) and dramatically improves voice fidelity.

## 3. OpenClaw runtime as the agent

The "agent runtime" in v1 is co-located with the operator (server.js). Production should run OpenClaw on the skill owner's machine, with skills delivered as OpenClaw-format Skill packages.

**To land**: package SkillNFT metadata as an OpenClaw Skill bundle, publish a Kin-Bridge OpenClaw plugin that handles job lifecycle (claim → run → submit), users self-host or rent OpenClaw runtimes from a marketplace.

## 4. ECDH-based brief encryption (no key sharing)

Currently the operator co-decrypts the client's brief inside its own process, which means the operator's TLS endpoint sees plaintext briefly. Production: client encrypts the brief directly to the TEE provider's enclave pubkey via ECDH, brief is decrypted only inside the enclave.

**To land**: extract enclave pubkey from `broker.inference.getAttestation(provider)`, expose it in `Kin.teePubkey()`, client app uses ECDH to derive a shared secret with the enclave for brief encryption.

## 5. Reputation as a separate INFT

Skill reputation lives as `(jobsCompleted, totalRating, totalEarnedWei)` in the SkillNFT struct. v2 should split reputation into its own INFT that aggregates across multiple skills owned by the same wallet — your "Kin profile" as an INFT, transferable as a unit.

## 6. Dispute arbitration via AI court

`disputeWork()` in v1 = full refund to client (favors clients, exploitable). v2 should invoke a Verdikt-style AI arbitrator (separate INFT-bound judge contract) to deliberate inside Sealed Inference and split the escrow appropriately.

## 7. Production polish

- Mobile-first UI redesign
- Skill discovery: search by skill type, filter by reputation, sort by earnings
- Browser wallet (MetaMask / OKX / Phantom) integration so users hold their own keys
- Multi-currency: USDC, USDT settlements via 0G Pay
- Subscription pricing: skills can be licensed for batch jobs (e.g., 10-job pack discount)
- Gig referrals + revenue share
- Solidity audit (Trail of Bits / OpenZeppelin / Quantstamp) before any real-value usage
