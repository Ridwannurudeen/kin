# Kin

**Your AI earns money while you sleep.**

A 0G APAC Hackathon submission. Train an AI on your skills — your writing voice, code review style, research instincts. Mint as an INFT (ERC-7857-pattern) on 0G Aristotle mainnet. List on the marketplace. When jobs come in, your AI runs them inside a Sealed Inference TEE on 0G Compute. Payment splits to your wallet automatically.

> **Live deployment**: contract `0x4eC373111616a104DE83402B92966d6efca0ca9E` on 0G Aristotle mainnet (chain 16661) → [chainscan.0g.ai](https://chainscan.0g.ai/address/0x4eC373111616a104DE83402B92966d6efca0ca9E)

## What it is

Kin is a marketplace for human-quality AI work where the human's distinctive voice and skill are encoded as a transferable INFT they actually own. It hits 0G's "Web 4.0 = AI agents own, earn, transact" narrative directly:

- **Own**: each skill is a SkillNFT (ERC-7857-pattern) with encrypted samples on 0G Storage and a sealed key only its owner controls
- **Earn**: jobs pay into an on-chain escrow; settle to the skill owner after a 24h dispute window
- **Transact**: the agent runs jobs inside Sealed Inference (TEE), so the user's voice + the buyer's brief stay private end-to-end

Five 0G primitives, all genuinely needed:

| Layer | Primitive | Purpose |
|---|---|---|
| Skill identity + ownership | INFT (ERC-7857-pattern) | encoded skill type, samples list, sealed key, price, reputation |
| Skill + brief storage | 0G Storage | AES-256-GCM encrypted; samples per skill, brief per job, output per job |
| Inference | 0G Compute / Sealed Inference | every job's LLM call runs inside TEE with attestation surfaced |
| Marketplace + escrow + reputation | 0G Chain (Aristotle mainnet) | postJob/escrow, submitWork, accept/dispute, on-chain reputation |
| Agent runtime | OpenClaw bridge (planned v2) | runtime that loads skill INFTs as Skills |

## How a job actually flows

```
1. User mints SkillNFT
   └─ 3 writing samples → AES-encrypted → uploaded to 0G Storage (3 root hashes)
   └─ MintSkill(type="writing", description, sampleRoots, sealedKey, pricePerJob)
   └─ on-chain: SkillMinted event

2. Client posts job
   └─ brief encrypted with per-job key, uploaded to 0G Storage
   └─ Kin.postJob(skillId, briefRoot) payable {value: pricePerJob}
   └─ on-chain: JobPosted event, payment escrowed

3. Agent (skill owner) executes inside TEE
   └─ pulls samples + brief from 0G Storage
   └─ Sealed Inference call with samples as voice context, brief as task
   └─ enclave returns signed response (ZG-Res-Key attestation)
   └─ output uploaded to 0G Storage

4. Agent submits on-chain
   └─ Kin.submitWork(jobId, outputRoot, attestationId)
   └─ 24h dispute window starts

5. Client accepts (or disputes within 24h)
   └─ Kin.acceptWork(jobId, rating 1..5)
   └─ payment splits to skill owner; reputation updates
```

## Project status

Built solo over 6 days for the 0G APAC Hackathon (May 10 → May 16, 2026).

| Component | Status |
|---|---|
| `Kin.sol` deployed to Aristotle mainnet | ✅ `0x4eC373111616a104DE83402B92966d6efca0ca9E` |
| Skill mint + sample upload pipeline | ✅ |
| Job post + escrow + sealed inference + on-chain submit | ✅ |
| Multi-actor demo (user + client wallets) | ✅ via `scripts/setup_demo_wallets.js` |
| Editorial UI (home, onboard, marketplace, job, wallet) | ✅ pure-Node static + http server |
| Demo video, README, AI_USAGE | in flight |
| HackQuest submission | pending user approval |

## Reproduce locally

```bash
git clone <repo>
cd kin
cp .env.example .env  # fill PRIVATE_KEY (Aristotle mainnet, ≥3 OG)
npm install

# Deploy contract (or use the deployed address above)
node scripts/deploy.js

# Generate + fund demo persona wallets (user + client)
node scripts/setup_demo_wallets.js

# Run the full E2E: mint skill → post job → agent runs → settle
node scripts/e2e_job.js

# Or run the UI:
node server.js
# → http://localhost:3000
```

## Why this could win

- **Hits 0G's exact narrative** — Web 4.0 = agents own/earn/transact. Kin is the literal embodiment.
- **5 primitives genuinely integrated**, not bolted on — each one solves a specific failure mode of every-other-AI-marketplace.
- **Universal hook**: every freelancer / creator / knowledge worker can imagine using this.
- **Privacy is the moat**: this isn't possible without TEE + INFT. ChatGPT marketplaces leak voice + outputs. Kin can't.
- **Live demo is visceral**: watch an AI complete a real job and see the payment split fire on-chain.

## Honesty notes

- Built fresh during the 2026-05 hackathon window. Borrowed plumbing patterns from a prior 0G prototype (ChartChain, public at https://github.com/Ridwannurudeen/chartchain) — `lib/storage.js` and `lib/inference.js` are reused; everything else is new.
- The SkillNFT is **ERC-7857-pattern, not full ERC-7857**. Full TEE-mediated re-encryption on transfer is documented in `doc/FUTURE.md` as v2 work.
- v1 uses **in-context learning** (samples passed as context to Sealed Inference), not LoRA fine-tuning. 0G's fine-tuning service produces local-only LoRA files that can't yet be loaded into Sealed Inference. v2 will adopt fine-tuning when 0G ships TEE-loadable LoRA.
- For the demo, the agent runtime (skill owner's environment) is co-located with the operator. Production would use OpenClaw runtimes that the skill owner controls.
- Sample writing content in the demo is synthetic.

## Links

- **Live contract**: [0x4eC373111616a104DE83402B92966d6efca0ca9E](https://chainscan.0g.ai/address/0x4eC373111616a104DE83402B92966d6efca0ca9E)
- **AI usage**: [AI_USAGE.md](AI_USAGE.md)
- **Future work**: [doc/FUTURE.md](doc/FUTURE.md)
- **Demo video**: (recorded Day 5)
- **Submission**: [doc/SUBMISSION.md](doc/SUBMISSION.md)

## License

MIT.
