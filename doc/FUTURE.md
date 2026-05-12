# Hunt — v2 / v3 roadmap

Items scoped out of the 2026-05 hackathon build. Each pillar attacks a specific gap not closed by any verified competitor as of May 2026 — the competitive scan at the bottom of this file documents the gap pillar-by-pillar with primary-source citations.

## Where Hunt stands today (v1)

v1 ships the verifiable substrate:
- TEE-attested sealed inference per finding (0G `ZG-Res-Key`) with on-chain `modelDigest` distinguishing the inference path from the local-fallback path
- Per-CWE-class reputation ledger (`ClassRep[hunterId][cweClass]`) accruing wins + submissions per class — not a single fungible score
- Single-file `contracts/Hunt.sol` enforcing race-deadline, settle-window, CWE-scope filter, attestation `ecrecover`, self-eval floor, credential reuse protection
- Hunter agents as on-chain identities with verifier-signed GitHub credential + TEE-signed sample fingerprint
- Standalone judge-runnable verifier (`scripts/verify_bounty.js`) with strict-mode digest re-derivation

Bounty #3 on Aristotle mainnet is the load-bearing demo: strict-mode verifier exits 0 with `digest match: ✓ / signer == teeSigner: ✓ / teeTimestamp window: ✓`. That output is the cryptographic proof real Sealed Inference produced the winning finding inside the race window.

## Pillar 1 — Stake-backed adversarial falsification (v2, weeks 2–6 post-hackathon)

Sibling to `submitFinding`: `submitFalsification(findingId, attestation, stake)`. Within a falsification window (e.g. 30% of race duration after race ends), any other hunter can stake reputation + a counter-bond to challenge a finding. They submit a counter-attestation from sealed inference (signed by `teeSigner` over the falsification digest), plus an optional counter-PoC showing the alleged exploit doesn't fire in a forked simulation.

Settlement logic:
- **Finder survives**: paid in full, falsifier slashed (loses stake + per-CWE rep in the contested class)
- **Falsifier wins**: finder slashed, falsifier paid from finder's stake, no payout to original bounty
- **No falsifier engages**: current settle path applies

Why this is novel (verified May 2026):
- Trail of Bits ships "adversarial reasoning agents" as an *internal consulting pipeline stage* ([blog, Mar 2026](https://blog.trailofbits.com/2026/03/31/how-we-made-trail-of-bits-ai-native-so-far/)) — not settlement-gating, not on-chain, not staked
- Mira Network does **multi-model consensus voting**, not adversarial debate; not for smart-contract audit ([whitepaper](https://mira.network/research/mira-whitepaper.pdf))
- Bittensor audit subnets do **validator-vs-miner ground-truth scoring**, not miner-vs-miner staked falsification ([Bitsec SN60](https://chaindefender.ai/), [ReinforcedAI SN92](https://subnetalpha.ai/subnet/reinforcedai/))

Hunt is the first AI audit system to make falsification settlement-gating with skin in the game on both sides.

Contract delta: ~300 LOC. New struct `Falsification`, new event `FalsificationSubmitted`, new function, new test class (~25 tests). Existing 64 Hunt contract tests stay green.

## Pillar 2 — Always-on guardian network (v2, weeks 6–10 post-hackathon)

`Hunt.subscribeGuardian(targetContract, hunterId, periodSeconds, { value: fee })`. Subscribed hunters run a watch loop: on each new block touching the target contract, the daemon queries on-chain state (parameters, balances, oracle freshness, role assignments, cross-protocol composition) and calls sealed inference with a brief narrowed to the hunter's CWE specialty: "given current on-chain state, is the contract vulnerable *right now*?" Findings fire `GuardianFinding` events with TEE attestation. Per-CWE rep accrues when alerts validate (via peer consensus or post-exploit outcome).

Why this is novel (verified May 2026): every continuous-monitoring incumbent detects via classifiers, anomaly, or hardcoded rules — **none run per-event LLM reasoning, none are TEE-attested, none have per-CWE specialist agents**.

- [Forta Firewall](https://www.forta.org/blog/the-ai-science-behind-forta-firewall) — custom Graph Neural Network on labelled tx data; pattern detection, not reasoning
- [Hexagate](https://www.chainalysis.com/product/hexagate/) (Chainalysis, $60M acq.) — ML anomaly + Gatelang rule DSL
- [Hypernative](https://www.hypernative.io/products/hypernative-platform) — ML + heuristics + simulations + graph detection; no LLM
- [Cyvers](https://cyvers.ai/) — geometric ML + behavioural anomaly
- [SphereX Protect](https://github.com/spherex-xyz/spherex-protect-contracts) — behavioural-baseline runtime firewall
- [OpenZeppelin Defender](https://docs.openzeppelin.com/defender) — **sunsetting July 1 2026** (new signups disabled June 30 2025) → active customer migration window

Strategic timing: announce Guardian in June 2026 alongside the Defender shutdown to capture migrating customers actively searching for an AI-attested replacement.

Architecture delta: `Guardian.sol` (or extend `Hunt.sol`), subscription escrow, daemon mode in `scripts/hunter.js`, frontend "guardian set" panel per subscribed contract.

## Pillar 3 — Cross-protocol bug-pattern knowledge graph (v2/v3, weeks 10–16)

Every Hunt finding is a 256-dim embedding (already computed by `lib/embedding.js`). v2 publishes this as an on-chain knowledge graph: new findings auto-link to nearest-neighbour priors with citation provenance. Public GraphQL endpoint answers "given this contract's embedding fingerprint, what attack patterns have hit structurally-similar contracts?"

Why this is novel (verified May 2026): closest analogue is **Knowdit** — academic paper ([arXiv 2603.26270](https://arxiv.org/html/2603.26270v1)) with 475 DeFi semantics + 579 vuln patterns + 2096 links. Research only; not deployed; not on-chain. **No deployed competitor has a public, queryable, citation-linked bug-pattern graph.**

Compounding moat: Year 1 Hunt has ~1k vectors, Year 3 has ~100k. A new entrant launching with the same code has zero. Data-and-time moat that strengthens the longer Hunt operates.

Architecture: Ponder subgraph indexer over `FindingSubmitted` events, off-chain embedding similarity precomputation, public GraphQL endpoint exposing both vector similarity and on-chain provenance.

## Pillar 4 — Insurance underwriting endpoint (v3, post-Pillar-3)

Read-only API: `GET /reputation/score?contract=0x…&cwe=oracle-manipulation` returns a contract's audit coverage score derived from `guardian-set-rep × subscription-duration × bounty-history`. Nexus Mutual / Sherlock-the-insurer / Risk Harbor consume this as a pricing input.

Positioning: Hunt becomes infrastructure *under* the insurance economy, not a competitor *to* it. Insurance protocols price coverage actuarially today; they don't know what the underlying audit said. Per-CWE on-chain reputation is exactly the input they need.

Verification caveat: this pillar was not directly verified against Nexus/Sherlock product roadmaps in the May 2026 competitive scan. Pursue after Pillar 3 with validation conversations.

## Decentralisation roadmap (carried from v2 design notes)

- **TEE-attestation-verifying relay set replacing centralised `teeSigner`** — multi-signer set, each independently verifying 0G's `ZG-Res-Key` attestation, signing the digest only when ≥k of n agree
- **EAS multi-issuer GitHub verifier** replacing the centralised `verifier` key
- **Per-hunter ECDH envelope** on the `Bounty` struct, replacing the shared hunter-network key (so a leak from one hunter is bounded to that hunter)
- **Real ERC-7857 oracle re-encryption** on hunter transfer (per [0gfoundation/0g-agent-nft](https://github.com/0gfoundation/0g-agent-nft/tree/eip-7857-draft))
- **TEE-loadable LoRA fine-tuning** when 0G ships TEE-loadable LoRA (on 0G roadmap)
- **TEE-loadable semantic embedder** replacing the current operator-side feature-hash
- **Browser-wallet integration** (MetaMask / Rabby / Phantom) for hunter operators

## Dropped from the public pitch (still in the product)

Things that were claimed as differentiators by Hunt's early framing but have been shipped by competitors as of May 2026:

- **PoC-validated severity** — [Olympix BugPOCer](https://olympix.security/) ships this; [A1 paper](https://arxiv.org/abs/2507.05558) does forked-chain PoC validation; [EVMBench](https://cdn.openai.com/evmbench/evmbench.pdf) and [Anthropic SCONE-bench](https://red.anthropic.com/2025/smart-contracts/) do it at benchmark scale. Hunt keeps PoC validation inside `submitFinding` for severity confidence, but doesn't lead with it.
- **"AI does the audit"** — [Nethermind AuditAgent](https://www.nethermind.io/blog/how-nethermind-security-uses-auditagent-alongside-manual-audits) reports 30% recall; Olympix, Cantina Apex, Sherlock AI, Immunefi AI ship today. Lead with verifiable execution + on-chain reputation, not "AI."

## Competitive scan (verified May 2026)

| Category | Incumbents | What they ship | What they don't |
|---|---|---|---|
| AI pre-deploy audit | Olympix, Nethermind AuditAgent, Cantina Apex, Cyfrin Aderyn / CodeHawks, Trail of Bits (Slither-MCP), AuditWizard, QuillAI Shield | Static analysis + LLM explanations + PoC generation | TEE attestation, on-chain reputation, **stake-backed adversarial falsification**, per-CWE specialization |
| AI post-deploy monitoring | Forta Firewall (GNN), Hexagate (ML), Hypernative (statistical), Cyvers (geometric ML), SphereX (behavioural), Ironblocks; OZ Defender sunsetting July 1 2026 | Pattern detection, anomaly, rule alerts | LLM reasoning per event, TEE attestation, agent specialization, on-chain reputation |
| AI-on-chain verifiers | Mira Network, Bittensor Bitsec SN60, ReinforcedAI SN92, BitAudit | Multi-model consensus (Mira); validator-vs-miner ground-truth scoring (Bittensor) | Adversarial finder-vs-falsifier with stake on both sides, per-CWE specialization, smart-contract-audit focus + on-chain settlement |
| 0G APAC hackathon overlap | shieldai (wallet protection), AgentCourt (dispute arbitration), AgentBattle (trading), 13 others (none in audit) | Different problem domains | No overlap with Hunt's AI-audit slot in the 16 visible submissions |

## Capability-curve context

Anthropic's red-team paper + OpenAI EVMBench show AI exploit-generation success rates jumped **2% → 55.88% in one year**. By mid-2027 AI is plausibly ~human-grade at exploit generation. The implication: "AI auditor" loses meaning as a category differentiator within ~12 months. Hunt's defensible position lives in the **verification + reputation + economic-mechanism layer**, not in "we have AI." The four pillars above all sit in that layer.

Timeline urgency:
- 7 weeks: OZ Defender shutdown — Pillar 2 GTM window
- 6–12 months: adversarial AI audit design space likely gets crowded
- ~12 months: "AI auditor" commoditizes; verifiability + reputation layers are the survivors
