# hunt-verifiable-ai

Verifiable AI primitives for 0G Aristotle, extracted from the Hunt protocol.

This package pulls out the reusable parts of Hunt's attestation stack:

- deterministic attestation digests
- canonical class hashing across Hunt's four current domains
- secp256k1 ECIES envelopes for sealed payload exchange
- high-level signing and verification wrappers for operator-held `teeSigner` flows

The code here is intentionally small. It is the protocol substrate, not the full Hunt app.

## Install

Published on npm:

```bash
npm install hunt-verifiable-ai
```

Your app must provide `ethers` as a peer dep:

```bash
npm install ethers
```

Or work from source:

```bash
git clone https://github.com/Ridwannurudeen/hunt
cd hunt/packages/sdk
npm install && npm test
```

## Quickstart

```js
import { ethers } from 'ethers';
import { classToBytes32, findingDigest, signAttestation, verifyAttestation } from 'hunt-verifiable-ai';

const wallet = ethers.Wallet.createRandom();
const params = {
  bountyId: 3n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes('sealed input')),
  agentId: 1n,
  classBytes32: classToBytes32('oracle-manipulation'),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('sealed output')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('zai-org/GLM-5-FP8|hunt-audit-v1')),
  teeTimestamp: 1_715_430_000n,
  severityCalibrationBps: 8500,
  precisionBps: 9200,
  coverageBps: 8800,
  exploitabilityBps: 9000,
};

const digest = findingDigest(params);
const { sig } = await signAttestation(wallet, params);
console.log(digest, verifyAttestation(params, sig, wallet.address));
```

## API reference

### `findingDigest(params)`

Re-derives the byte-for-byte digest Hunt uses on-chain for `submitFinding`.

Parameters:

- `bountyId` - `uint256`
- `inputRoot` - `bytes32`
- `agentId` - `uint256`
- `classBytes32` - `bytes32`
- `severity` - `uint8`
- `outputRoot` - `bytes32`
- `modelDigest` - `bytes32`
- `teeTimestamp` - `uint64`
- `severityCalibrationBps` - `uint16`
- `precisionBps` - `uint16`
- `coverageBps` - `uint16`
- `exploitabilityBps` - `uint16`

Returns:

- `bytes32` hex string

### `FINDING_DIGEST_ABI`

The canonical ABI tuple used by `findingDigest`.

### `canonicalise(name)`

Lowercases, converts whitespace and underscores to hyphens, strips non `[a-z0-9-]`, collapses repeated hyphens, and trims leading or trailing hyphens.

### `classToBytes32(name)`

`keccak256(utf8(canonicalise(name)))`.

Unlike Hunt's smart-contract-only `lib/cwe.js`, this helper does not throw on unknown names. That lets downstream consumers define their own domain registries while still staying compatible with Hunt's hashing rules.

### `bytes32ToClass(hash, registry)`

Inverse lookup helper across any registry array. Returns the first matching canonical class string or `undefined`.

### `SMART_CONTRACT_CWES`

The 12 canonical Hunt v1 smart-contract classes:

- `swc-107-reentrancy`
- `swc-115-tx-origin`
- `access-control`
- `oracle-manipulation`
- `swc-101-int-overflow`
- `storage-collision`
- `unchecked-external-call`
- `front-running`
- `price-manipulation`
- `signature-replay`
- `unsafe-delegatecall`
- `denial-of-service`

### `INSURANCE_DEFECT_CLASSES`

The 6 Hunt insurance-defense classes:

- `medical-necessity-misapplication`
- `coding-cpt-error`
- `prior-auth-overreach`
- `network-adequacy-violation`
- `erisa-procedural-defect`
- `state-external-review-misclassification`

### `BENEFITS_DEFECT_CLASSES`

The 7 Hunt disability and benefits-defense classes:

- `medical-listing-misapplication`
- `residual-functional-capacity-error`
- `vocational-expert-misclassification`
- `duration-requirement-misapplication`
- `substantial-gainful-activity-miscalculation`
- `combined-impairments-omission`
- `treating-physician-opinion-weight`

### `MEDICAL_READING_CLASSES`

The 6 Hunt Records Reader classes:

- `pathology-borderline-interpretation`
- `radiology-second-read-discrepancy`
- `oncology-staging-revision`
- `cardiology-ecg-echo-revision`
- `dermatology-pigmented-lesion-revision`
- `hematology-flow-cytometry-discordance`

### `encryptToPubkey(plaintextBytes, recipientPubkeyHex)`

Encrypts bytes to a secp256k1 public key using:

- ephemeral secp256k1 ECDH
- HKDF-SHA256
- AES-256-GCM

Output format:

```txt
[33-byte ephemeral compressed pubkey][12-byte IV][16-byte GCM tag][ciphertext]
```

### `decryptFromPrivkey(encryptedBytes, recipientPrivkeyHex)`

Decrypts a payload emitted by `encryptToPubkey`.

### `signAttestation(signer, params)`

High-level helper that computes `findingDigest(params)` and signs it as an EIP-191 personal message. Returns `{ digest, sig }`.

### `verifyAttestation(params, sig, expectedSigner)`

Recomputes the digest, recovers the signer, and compares it to `expectedSigner`.

## Examples

### `examples/01-smart-contract-audit.js`

Minimal Hunt-native example using the v1 smart-contract registry and an `oracle-manipulation` class.

### `examples/02-insurance-defense.js`

Shows the same digest structure against an insurance denial-defense workflow where the domain class is `medical-necessity-misapplication`.

### `examples/03-medical-records-reader.js`

Uses the medical reading registry for a physician-question workflow. Same digest, different class vocabulary.

### `examples/04-benefits-defense.js`

Uses the benefits-defense registry for a benefits denial with `vocational-expert-misclassification`.

### `examples/05-generic-classification.js`

Demonstrates a completely new vertical with custom labels such as `positive`, `negative`, `mixed`, and `urgent-review`.

Run them one at a time:

```bash
node examples/01-smart-contract-audit.js
node examples/02-insurance-defense.js
node examples/03-medical-records-reader.js
node examples/04-benefits-defense.js
node examples/05-generic-classification.js
```

Each example prints:

- a compact domain brief
- the computed digest
- a `verifyAttestation` result

## Used by

Hunt uses this primitive across four current verticals:

1. smart-contract bug-bounty audit
2. insurance-claim-denial defense
3. disability and senior benefits defense
4. medical Records Reader

The important design choice is that the attestation shape stays fixed while the canonical class registry changes per domain.

## Development

Run the SDK tests:

```bash
node --test test/*.test.js
```

The test suite covers:

- deterministic digest generation
- digest parity with Hunt's existing `lib/credential.js`
- class canonicalisation and registry lookups
- sign and verify round-trips

## Status

Pre-1.0. Expect breaking changes.

The digest wire format is intentionally stable because it must match Hunt's live contract behavior, but package structure and helper surface may still change while the SDK is being extracted into a standalone protocol layer.

## License

MIT.

## Links

- Hunt repo: `https://github.com/Ridwannurudeen/hunt`
- Live Hunt demo: `https://hunt.gudman.xyz`
- Hunt verticals page: `https://hunt.gudman.xyz/verticals.html`
