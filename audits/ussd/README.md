# Hunt audits USSD — a historical-exploit blind test

Hunt's strongest capability demonstration: the oracle-specialist hunter, run **genuinely blind**, independently surfaced a **judge-confirmed HIGH-severity finding** in a real audited protocol's oracle contract.

## The setup

`StableOracleWBTC.sol` is the verbatim oracle contract from **USSD**, a stablecoin protocol audited by **Sherlock in May 2023** ([contest repo](https://github.com/sherlock-audit/2023-05-USSD)). Hunt posted it as **bounty #9** on 0G Aristotle mainnet with the standard 3-CWE scope (`swc-107-reentrancy, oracle-manipulation, access-control`) — **zero hints**: no mention of oracles, feeds, or staleness. Identical to how every other Hunt bounty is posted.

## What the AI found — blind

The oracle-specialist (hunter #1) ran **real 0G Sealed Inference** and submitted an `oracle-manipulation` / **critical** finding:

> The constructor hardcodes Chainlink feed `0x5f4eC3Df…8419` — the **ETH/USD** mainnet aggregator — while the contract is named `StableOracleWBTC` and a code comment documents the correct **BTC/USD** feed (`0xf403…ee88c`). A "WBTC oracle" returns the ETH price. Exploit path the AI derived itself: WBTC collateral valued at ~$2k instead of ~$40k+ → a ~20x undercollateralized borrow, protocol loses the full loan value.

This is not pattern-matching. The AI had to (1) notice the comment-vs-code address mismatch, (2) **recognize** `0x5f4eC3Df…` as the ETH/USD feed, and (3) reason through the undercollateralization exploit. Model self-eval: severity-calibration 90%, precision 95%, coverage 95%, exploitability 95%.

The reentrancy- and access-control-specialists correctly returned **zero** in-scope findings — there is no reentrancy or access-control bug in this 27-line oracle contract.

## Independent confirmation

The wrong-feed-address bug was a **confirmed HIGH-severity finding** in USSD's Sherlock audit — canonical [judging issue #817](https://github.com/sherlock-audit/2023-05-USSD-judging/issues/817) ("Wrong Oracle feed addresses"), with numerous valid duplicates (#891, #867, #901, #883, #853). The public Sherlock judging record *is* the independent confirmation.

USSD also had a separate confirmed MEDIUM finding for missing `updatedAt` staleness checks ([judging issue #31](https://github.com/sherlock-audit/2023-05-USSD-judging/issues/31)) — the pattern Hunt's staged `demo/staged-bounty/Vault.sol` is modeled on.

## On-chain trail — bounty #9, 0G Aristotle mainnet (chain 16661)

| Step | Transaction |
|---|---|
| Post bounty #9 — USSD `StableOracleWBTC.sol`, 0.05 OG, scope {reentrancy, oracle, access-control} | [`0x258faffb…ba37`](https://chainscan.0g.ai/tx/0x258faffbfbb9d24b76beb8833d822281e9e18abc6777a4852d91db3849b9ba37) |
| Winning finding — real Sealed Inference (`oracle-manipulation`, `critical`) | [`0xbddf01af…6c38`](https://chainscan.0g.ai/tx/0xbddf01afde7644547d8d492939fe91c8df640793cf56b3d025ac8b4dba486c38) |
| Settle — 0.05 OG to oracle-specialist (hunter #1) | [`0x56a89158…47bc`](https://chainscan.0g.ai/tx/0x56a8915899f94a3050754f68fa2f53f1ab568fdffccb01ff87ed3198b59747bc) |

Verify it yourself: `node scripts/verify_bounty.js 9 --model-digest 0x<sealed digest>` → `digest match: ✓ / signer == teeSigner: ✓ / teeTimestamp window: ✓`, exit 0. The `digest match` against the *Sealed Inference* modelDigest (`keccak256("zai-org/GLM-5-FP8|hunt-audit-v1")`) is the cryptographic proof the finding came from a real sealed-enclave run, not the local fallback heuristic.

## Honest scope of the claim

- ✅ Real audited-protocol source, not staged. Real, severe, judge-confirmed HIGH finding. Genuinely blind. Real Sealed Inference. Full on-chain trail.
- ⚠️ **This bug was also found by many human auditors** in the Sherlock contest (large duplicate set). The honest claim is *"Hunt's AI independently surfaced a confirmed finding"* — **not** "found something the humans missed."
- ⚠️ A 10-minute single-model race is a capability probe, not an exhaustive audit. It demonstrates the substrate works on real code; it is not a substitute for a full audit.
