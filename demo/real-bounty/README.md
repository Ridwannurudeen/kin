# Real-bounty demo — Hunt audits ChartChain (live 0G project)

This directory stages a real cross-pollination demo: Hunt auditing **ChartChain**, a separate live 0G project (medical-records vault as INFT with Sealed Inference query, deployed at [`0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`](https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00) on 0G Aristotle).

## Why this matters

The single weakest claim in Hunt v1's submission narrative is **"no real protocol team has used Hunt to audit real code."** The staged `Vault.sol` is intentionally simple and modelled on public audit findings, but it's not a deployed protocol.

Auditing ChartChain via Hunt addresses that gap directly:
- **Real Solidity** — MIT-licensed source verbatim from [github.com/Ridwannurudeen/chartchain](https://github.com/Ridwannurudeen/chartchain)
- **Live mainnet deployment** — same chain as Hunt (Aristotle, chain 16661)
- **Different protocol team narrative possible** — even though Ridwan owns both (cross-pollination disclosure), the audit pattern is real: one 0G project being audited by another via the protocol's standard interface
- **Different vertical** — ChartChain is healthcare data (HIPAA-relevant patterns), not DeFi. Demonstrates Hunt's "extends to any domain with structured judgement against a known taxonomy" claim

## Source

`MedicalRecordsVault.sol` is copied verbatim from `Ridwannurudeen/chartchain` master branch as of 2026-05-13. 100 lines, MIT licensed. No modifications.

Original repo and live contract:
- Repo: https://github.com/Ridwannurudeen/chartchain
- Contract: `0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00`
- Chainscan: https://chainscan.0g.ai/address/0x5DDD81e39b2f3022AB9188D4eacaCdDC16566D00

## Posting the bounty

Run when ready to start the recording (10-min race window — fire it immediately before hitting "record"):

```bash
node scripts/post_bounty.js \
  --file demo/real-bounty/MedicalRecordsVault.sol \
  --payout 0.1 \
  --race-duration 900 \
  --cwes swc-107-reentrancy,oracle-manipulation,access-control,arithmetic-overflow,storage-collision
```

Note `--race-duration 900` (15 min) — gives breathing room around the recording. CWE scope deliberately wide so all 3 specialists fire briefs (and we see how each one handles a domain outside its strongest specialty).

After posting, capture the printed `bountyId` and use that for the race:

```bash
BOUNTY_ID=<id> node scripts/run_race.js
```

## What we expect Hunt to find (or not)

Honest forecast: we do **not** know what Hunt will surface. The whole point is that the audit is run blind in Sealed Inference — there's no fix-list staged. Possible signal classes that the access-control specialist might surface:

- **Authorization residue on transfer** (`transfer` re-points `ownerOf` and overwrites `encryptedKey` but does not clear prior `authorizedUntil` mappings — new owner inherits previous patient's doctor whitelist)
- **`logQuery` attestation forgery surface** (caller emits an event with arbitrary `attestationId`; no on-chain proof the attestation came from Sealed Inference for that vault)
- **TEE pubkey is set once at construction with no rotation path** (centralisation + key-rotation gap)
- **Record array unbounded growth** (`addRecord` has no length cap, gas-DOS surface for any future pagination caller)

If Hunt surfaces any of these via real Sealed Inference with a TEE attestation, that's a real cross-protocol finding on mainnet — exactly the kind of artifact a grand-prize judge can re-derive cryptographically.

If Hunt surfaces nothing, the demo still works as a "Hunt validated a peer 0G protocol" narrative, plus exercises the per-CWE specialty narrowing logic (each hunter declines to submit outside its specialty).

## Disclosure

Ridwan owns both Hunt and ChartChain. Self-disclosure applies — any finding surfaced is auto-disclosed to the protocol owner. Findings are documented on-chain via Hunt's attestation chain; remediation in ChartChain happens post-hackathon as the next ChartChain release.

## After the race

Update `doc/SUBMISSION.md §10` with:
- Bounty ID
- Settle tx
- Winning hunter (if any)
- Strict-mode verifier output

And cite chainscan + repo links so judges can reproduce the audit independently.
