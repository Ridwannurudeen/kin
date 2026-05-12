# Kin — Future Work (v3 roadmap)

Items deliberately scoped out of the 2026-05 hackathon build. Each one has a concrete design path; none are speculative "wouldn't it be cool if."

## 1. Capability mesh — composite jobs across skills

v2 is one job → one skill. v3 introduces `postPipeline(skillIds[], briefRoot)` that:
- Escrows total payment across N skills
- Sequences calls (output of step N → encrypted context for step N+1)
- Per-stage TEE attestations + quality gates
- Per-stage payment release on quality-pass; failed stage halts pipeline + refunds remainder
- Cross-skill clients can be other contracts, enabling autonomous agents to hire pipelines without humans in the loop

**Why deferred from v2**: the original spec floated this. We pulled it back to ship rigorously on one vertical first. Mesh adds 5–7× the failure modes; we'd rather have a tight single-skill flow than a wobbly multi-skill one for the hackathon.

## 2. Multi-vertical expansion

Same architecture, different verticals. v3 ships at least:
- **Legal** — M&A deal memos. Highest WTP, most dramatic privacy story (precedents never leak, deal terms never leak).
- **Medical** — differential diagnosis from anonymised case notes. Compliance-grade audit trail.
- **Finance** — investment memos, due diligence summaries.

Each vertical needs its own structured-brief schema, rubric, and credential-bar (e.g., bar number, FINRA, NPI). The contract is vertical-agnostic; the verifier service grows verticals.

## 3. Real ERC-7857 oracle re-encryption on transfer

v2 `transferSkill` is simplified — new owner supplies a fresh sealed key, contract trusts. Full ERC-7857 uses a TEE oracle to atomically re-encrypt the per-skill AES key against the new owner's pubkey, per the [0gfoundation/0g-agent-nft](https://github.com/0gfoundation/0g-agent-nft/tree/eip-7857-draft) reference.

**To land**: deploy a `TEEReencryptOracle` (running inside the TEE), add `transferSkillWithRekey(skillId, newOwner, oracleProof)` that verifies the oracle's signature over `(oldOwner, newOwner, skillId)` against the on-chain oracle pubkey. Off-chain: skill owner submits their current AES key + new owner's pubkey to the oracle, oracle returns a re-encrypted blob + signed transfer proof.

## 4. Decentralised teeSigner via 0G TEE attestation relay

v2's `teeSigner` is a Kin-operated centralised key. It signs `SampleFingerprint` and submission attestations on the contract's behalf, having computed/verified the scores via Sealed Inference.

v3 decentralises this. The signing service evolves into a multi-relay verifier set, each relay running its own copy of the fingerprint / attestation logic. The contract switches from single-address `_recoverEth(...) == teeSigner` to a threshold-multisig check against a relay set (registered via an EAS schema).

Bonus: this also gives us a path to *on-chain* verification of 0G's per-response `ZG-Res-Key` attestation if 0G publishes the TEE pubkeys on-chain or via EAS.

## 5. Decentralised verifier via EAS multi-issuer

Same pattern for the GitHub verifier service. Currently one Kin-operated wallet signs Credentials. v3 introduces an EAS schema `kin:github-credential` where multiple independent verifiers can attest to a wallet's GitHub activity. The contract accepts attestations from any verifier in a registered allowlist (managed by Kin DAO or onchain governance).

## 6. LoRA fine-tuning loaded into Sealed Inference

v2 uses in-context learning over top-K retrieved samples. 0G's fine-tuning service produces a downloadable LoRA, but as of 2026-05 it does not load into Sealed Inference — the inference examples in 0G's docs show running fine-tuned LoRAs locally only. That defeats the privacy story.

**To land**: when 0G ships TEE-loadable LoRA (announced for their roadmap), wire onboarding to:
1. Upload samples as training data to 0G Compute fine-tuning
2. Get back a sealed LoRA pointer
3. Embed pointer in SkillNFT metadata (extend `Skill` struct)
4. Load LoRA into Sealed Inference at job time via `broker.inference.loadAdapter(lora_cid)`

This unlocks an additional 0G primitive and lifts review quality substantially over the in-context-learning ceiling.

## 7. OpenClaw runtime as the agent

v2 daemon is a Node.js process on the skill owner's machine. v3 packages it as an OpenClaw Skill bundle so users can host on rented OpenClaw runtimes rather than self-host.

## 8. Pooled / federated skills

Multiple expert contributors share one SkillNFT, payouts split prorata. Solves the bootstrap problem (one expert's 5 samples ≠ enough; 50 experts together = formidable). Requires:
- Multi-contributor `addContributor(skillId, contributor, weightBps)` flow
- Per-contributor sample provenance (each contributor's samples encrypted to a key only they hold; combined into the skill's retrievable corpus via lazy-decrypt at job time)
- `_settle` splits payment by weight

## 9. Real semantic embeddings inside the TEE

v2 uses local feature-hashing for embeddings (computed by the operator, encrypted, uploaded). Real semantic embeddings (sentence-transformer outputs) would dramatically improve retrieval quality. Two paths:
- TEE-loadable embedder when 0G ships one
- Off-chain sentence-transformer running on the skill owner's machine (same trust boundary as the current operator-side decryption — already privy to plaintext)

## 10. AI arbitration for disputes (Verdikt-style)

v2 dispute = full refund to client (favours clients, exploitable by sophisticated buyers). v3 invokes a Verdikt-style AI arbitrator (separate INFT-bound judge contract) to deliberate inside Sealed Inference and split the escrow appropriately. Off-chain: arbitrator agent sees both brief + output + dispute reason, produces a structured ruling, posts attested decision on-chain.

## 11. Browser wallet integration + key custody

v2 demo uses local wallets with private keys in env / .demo-wallets.json. Production needs MetaMask / Rabby / OKX / Phantom browser-wallet integration so users hold their own keys. The brief-encryption flow (`encryptToPubkey` to operator pubkey) already works with any signer that can sign a tx; the operator-side decryption (`decryptWithPrivkey`) needs a wallet that exposes secp256k1 ECDH — not standard in browser wallets today. Workaround: tie ECDH-decryption to a dedicated app keypair derived from a wallet signature.

## 12. Production polish (sub-features)

- Mobile-first UI redesign
- Discovery filters: skillType, language, avgPerDim sort, "recently active"
- Subscription pricing: skill licensed for batch jobs (10-job pack discount)
- Gig referrals + revenue share
- USDC / USDT settlement via 0G Pay when it ships
- Solidity audit (Trail of Bits / OpenZeppelin / Quantstamp) before any real-value usage
