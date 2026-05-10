# AI Usage Attribution

Kin was built solo with substantial AI pair-programming assistance from Claude (Anthropic) over the May 10–16 2026 hackathon window.

## Where AI was used

**Architecture + product design**
- The "AI agents earn money while you sleep" framing was developed through iterative pressure-testing with Claude. We rejected several adjacent ideas first (medical records vault, AI mediator, AI court for content moderation) before settling on Kin based on:
  1. Direct alignment with 0G's named narrative ("Web 4.0 = AI agents own/earn/transact")
  2. Universal hook (every knowledge worker can imagine using it)
  3. Multi-primitive integration that's genuinely needed, not bolted on
  4. Demo arc that's visceral in 3 minutes
- Researched competing 0G APAC submissions (~30 named projects) to ensure no direct collision in the AI-marketplace space.
- Researched 0G's stack maturity, Sealed Inference launch (Mar 2026), AIverse INFT marketplace, and OpenClaw track positioning to align our submission with what judges have rewarded historically.

**Code**
- `contracts/Kin.sol` — Claude-authored. Single contract combining SkillNFT (ERC-7857-pattern) + JobMarketplace + Reputation. Audited for re-entrancy on `_settle` (CEI pattern), gas-efficient storage layout, and revert paths.
- `lib/storage.js`, `lib/inference.js` — Claude-authored, originally for ChartChain (a prior 0G prototype), reused for Kin.
- `scripts/{deploy, setup_demo_wallets, e2e_job}.js` — Claude-authored.
- `server.js` and `public/*.html`, `public/styles.css`, `public/app.js` — Claude-authored.
- README, AI_USAGE.md, demo video script, X post draft, SUBMISSION.md.

**Where AI was NOT used**
- Smart contract security review: contract was hand-read before mainnet deploy. (Not audited — this is a hackathon prototype; an external audit would be required before production.)
- Decision on what to build: every architectural commit was a go/no-go I made after Claude presented options + risks.
- Submission decisions: nothing posted publicly without my explicit approval.

## Which model

Claude Opus 4.7 (1M context) via Claude Code CLI. Approximate session length: ~16 hours of paired work over the build window.

## Synthetic content

The demo writing samples + sample brief in `scripts/e2e_job.js` are synthetic (fabricated for demo purposes). The "M" memo style is a stylized founder voice, not a real person's writing.

## Repo licensing

MIT. Use at your own risk. The contract is unaudited — do not deposit real value beyond hackathon demo amounts.
