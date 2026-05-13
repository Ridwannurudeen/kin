# Hunt's primary live audit — ChartChain on 0G Aristotle

Hunt's headline audit target: **ChartChain**, a separate live 0G project (medical-records vault as INFT with Sealed Inference query, deployed at [`0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`](https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00) on 0G Aristotle, chain 16661).

`scripts/post_bounty.js` now defaults to this file. The staged `demo/staged-bounty/Vault.sol` (oracle-staleness demo) is preserved as a fallback for the per-CWE-specialty teaching example; ChartChain is what the protocol runs against by default.

## Why this is the primary target

The standing weakness in any v1 bug-bounty narrative is **"no real protocol team has used the platform to audit real code."** The staged `Vault.sol` is modelled on public audit findings, but it's not a deployed protocol.

Auditing ChartChain via Hunt closes that gap:

- **Real Solidity** — MIT-licensed source verbatim from [github.com/Ridwannurudeen/chartchain](https://github.com/Ridwannurudeen/chartchain)
- **Live mainnet deployment** — same chain as Hunt (Aristotle, chain 16661)
- **The audit pattern is real** — Ridwan owns both Hunt and ChartChain (cross-pollination disclosure), but the pattern itself — one 0G project being audited by another via the protocol's standard interface — is exactly what an external poster would do
- **Different vertical** — healthcare data (HIPAA-relevant patterns), not DeFi. Substantiates Hunt's "extends to any domain with structured judgement against a known taxonomy" claim

## Source

`MedicalRecordsVault.sol` is copied verbatim from `Ridwannurudeen/chartchain` master branch as of 2026-05-13. 100 lines, MIT licensed. No modifications.

Original repo and live contract:
- Repo: https://github.com/Ridwannurudeen/chartchain
- Contract: `0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`
- Chainscan: https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00

## Posting the bounty

`post_bounty.js` defaults pick up this file + the full 5-CWE scope automatically:

```bash
node scripts/post_bounty.js --payout 0.1 --race-duration 900
```

`--race-duration 900` (15 min) gives breathing room around recording. The default scope `{swc-107-reentrancy, oracle-manipulation, access-control, arithmetic-overflow, storage-collision}` is wide on purpose so all three specialists fire briefs (and you see how each handles a domain outside its strongest specialty).

After posting, capture the printed `bountyId` and use it for the race:

```bash
BOUNTY_ID=<id> node scripts/run_race.js
```

## What we expect Hunt to find (or not)

Honest forecast: we do **not** know what Hunt will surface. The whole point is that the audit runs blind in Sealed Inference — no fix-list is staged. Plausible signal classes:

- **Authorization residue on transfer** — `transfer` re-points `ownerOf` and overwrites `encryptedKey` but does not clear prior `authorizedUntil` mappings; new owner inherits the previous patient's doctor whitelist
- **`logQuery` attestation forgery surface** — caller emits an event with arbitrary `attestationId`; no on-chain proof the attestation came from Sealed Inference for that vault
- **TEE pubkey set once at construction, no rotation path** — centralisation + key-rotation gap
- **`addRecord` unbounded growth** — no length cap, gas-DOS surface for any future pagination caller

If Hunt surfaces any of these via real Sealed Inference with a TEE attestation, that's a real cross-protocol finding on mainnet — exactly the kind of artifact a grand-prize judge can re-derive cryptographically.

If Hunt surfaces nothing in-scope, the audit still serves as "Hunt validated a peer 0G protocol against a multi-CWE scope" plus exercises the per-CWE specialty narrowing logic (each hunter declines to submit outside its specialty).

## Disclosure

Ridwan owns both Hunt and ChartChain. Self-disclosure applies — any finding surfaced is auto-disclosed to the protocol owner. Findings are recorded on-chain via Hunt's attestation chain; remediation in ChartChain happens post-hackathon as the next ChartChain release.

## After the race

Update `doc/SUBMISSION.md §5` + §10 with:

- Bounty ID
- Settle tx (or expire tx if the race produced no in-scope findings)
- Winning hunter (if any)
- Strict-mode verifier output

Cite chainscan + repo links so judges can reproduce the audit independently.
