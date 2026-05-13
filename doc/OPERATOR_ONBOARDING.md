# Hunt — operator onboarding (≤30 min)

This doc gets an external security researcher running a Hunt hunter daemon on 0G Aristotle mainnet. Aimed at Code4rena / Sherlock / Cyfrin senior auditors who don't know the codebase.

**What you'll have at the end:** a wallet-bound hunter identity on-chain, with per-CWE reputation that compounds with every bounty you win. Your hunter watches `BountyPosted` events, decrypts the sealed Solidity inside its TEE, runs Sealed Inference to find bugs, and submits attested findings. Pays out in OG.

---

## Prerequisites (5 min)

- **Wallet**: any secp256k1 wallet. MetaMask exports work fine. You'll paste the private key into a local `.env`. Cold wallet OK if you can export the key for this machine.
- **0G OG balance**: ≥0.2 OG on Aristotle mainnet (chain 16661). Covers mint (~0.05 OG), one finding submit (~0.02 OG), gas (~0.01 OG), plus margin. Bridge or DEX trade if needed.
- **Machine**: Node 20+ (any OS), 4 GB RAM free, stable internet. Mainnet RPC is `https://evmrpc.0g.ai`.
- **GitHub account**: ≥730 days old, ≥20 merged PRs, ≥10 reviews (verifier-signed Credential gates this). Tell us your GitHub handle and we issue the Credential.

---

## Step-by-step (15–20 min)

### 1. Clone + install

```bash
git clone https://github.com/Ridwannurudeen/hunt.git
cd hunt
npm install
```

Verify the existing strict-mode proof works end-to-end before touching anything:

```bash
node -e "import('ethers').then(({ethers})=>console.log(ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1'))))"
node scripts/verify_bounty.js 3 --model-digest 0x<paste>
```

Exit code 0 with three checkmarks means your environment can read the Hunt contract on Aristotle. Proceed.

### 2. `.env` setup

```bash
cp .env.example .env
# Edit .env:
#   PRIVATE_KEY=0x...   ← your hunter operator wallet
#   ZG_RPC_URL=https://evmrpc.0g.ai
```

Sanity check the wallet sees its balance:

```bash
node -e "require('dotenv').config(); const {ethers}=require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider(process.env.ZG_RPC_URL); const w=new ethers.Wallet(process.env.PRIVATE_KEY,p); console.log(w.address, ethers.formatEther(await p.getBalance(w.address)),'OG');})()"
```

### 3. Get your Credential + Fingerprint

These are signed off-chain by the Hunt verifier and teeSigner, then verified on-chain at `mintHunter` time.

**Credential** (verifier-signed, attests your GitHub activity):
- Send your GitHub handle + wallet address to the Hunt operator
- Operator runs `verifier/server.js` against your handle, returns a signed Credential blob
- ~2 min turnaround

**Sample fingerprint** (teeSigner-signed, scores your prior audit findings on 4 quality axes):
- Send 5 of your prior audit findings (Markdown or text, anonymised where needed) to the Hunt operator
- Operator runs `lib/fingerprint.js` against them via 0G Sealed Inference (4-axis rubric: severity calibration, precision, coverage, exploitability)
- Returns a signed Fingerprint with your overall `bps` score
- ~3 min turnaround

You receive a `credential.json` and a `fingerprint.json` to drop into your repo root.

### 4. Mint your hunter

Hunter mint requires three signatures (`Credential`, `Fingerprint`, plus the `mintHunter` tx itself). In v1, the Credential and Fingerprint signatures come from the centralised verifier + teeSigner the Hunt operator controls. v2 plan decentralises this (see `doc/FUTURE.md`).

For the demo phase, the Hunt operator runs the mint **on your behalf** using your wallet address as the new hunter's owner:

- You send: wallet address, GitHub handle, 5 prior-finding samples (Markdown), preferred specialty CWE class
- Hunt operator runs a customised `scripts/populate_hunters.js` flow that adds your persona to `demo/hunter-personas.json`, generates the encrypted samples + embeddings, computes the Sealed Inference fingerprint, signs the Credential, and calls `mintHunter` from a funder wallet that escrows the initial fund
- You receive: your `hunterId` (a uint256 token on-chain) — that's your auditor identity. Per-CWE reputation accrues to this id forever

`--specialty` options: `swc-107-reentrancy`, `oracle-manipulation`, `access-control`, `arithmetic-overflow`, `cross-protocol-composition`, `mev`, `storage-collision`, or a new class. Full CWE registry in `lib/cwe.js`.

Turnaround: ~15 min once samples are provided.

### 5. Get the hunter-network symmetric key

Bounty code is sealed against a shared symmetric key all registered hunters hold. Out-of-band channel only.

- Hunt operator sends you `.hunter-network-key.bin` (32 bytes, mode 0o600)
- Place at the repo root: `cp ~/Downloads/.hunter-network-key.bin .`

### 6. Run the hunter daemon

```bash
HUNTER_ID=<your-id> node scripts/hunter.js
```

Daemon behavior:
- Watches `BountyPosted` events on `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`
- For each new bounty whose `inScopeCwes` intersects your specialty, downloads the encrypted source from 0G Storage, decrypts inside a process-local TEE, runs top-K retrieval against your prior samples, calls 0G Sealed Inference with the brief narrowed to your specialty class
- On finding a bug, encrypts it to the poster's pubkey, uploads to 0G Storage, signs an attestation digest binding `(bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest, teeTimestamp, selfEvalBps×4)`, and submits to the contract
- Per-CWE rep ticks up when the poster picks you as winner

Logs stream to stdout. Run under `tmux` or `systemd` if you want it persistent across SSH disconnects.

---

## What you earn

Every bounty you win pays out the bounty's `payout` in OG (typically 0.05–0.5 OG per race for the demo phase; production bounties target $1k–$100k worth). Per-CWE reputation compounds — high `ClassRep[hunterId][cweClass]` is the input insurance protocols + protocols looking for paid audits will use to pick auditors.

## What you commit to

- **Specialty discipline**: don't submit findings outside your declared specialty CWE class. The contract rejects it, but more importantly, the brief is narrowed at inference time so you'd be submitting noise.
- **Sample integrity**: the samples you submit at fingerprint time should be your real audit findings. Forged samples make the rep score meaningless.
- **Key hygiene**: the hunter operator wallet you mint with becomes your on-chain identity. Lose the key, lose the rep.

## Troubleshooting

- **`mintHunter` reverts `CredentialReused`**: you've already minted with this Credential. One Credential per wallet.
- **`mintHunter` reverts `BadCredentialSignature` / `BadFingerprintSignature`**: the signatures don't recover to the expected on-chain addresses. Re-request from the Hunt operator with a fresh nonce.
- **Daemon doesn't pick up new bounties**: confirm `hunter-network-key.bin` exists at repo root; the daemon silently skips bounties it can't decrypt.
- **Sealed inference returns empty content**: known issue under concurrent broker load. Daemon retries 3× then falls back to `lib/audit-fallback.js` (heuristic path). The fallback stamps a distinct `modelDigest` on-chain so judges can audit which path each finding took.

## Contact

- Hunt operator: [your contact channel — Discord/Telegram/email]
- Repo issues: https://github.com/Ridwannurudeen/hunt/issues
- 0G Aristotle chainscan: https://chainscan.0g.ai
- Contract: `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`
