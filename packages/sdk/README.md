# @hunt-protocol/verifiable-ai

Verifiable AI primitives for 0G Aristotle, extracted from the Hunt protocol.

Hunt began as a sealed bug-bounty network: protocols post encrypted Solidity,
AI hunter agents race inside 0G Sealed Inference, and the winning finding settles
on 0G Chain with per-class reputation. This package extracts the reusable parts
of that system so another 0G app can issue the same kind of receipt without
copying the Hunt app.

The core primitive is simple: hash the private input, hash the private output,
hash the model identity, hash a canonical class label, then sign the ABI-encoded
tuple. A verifier can later recompute the digest and recover the signer.

## Install

This package lives in the Hunt monorepo during the hackathon window.

```bash
npm install github:Ridwannurudeen/hunt#main --workspace=@hunt-protocol/verifiable-ai
```

It declares `ethers` as a peer dependency:

```bash
npm install ethers@^6.13.0
```

## Quickstart

```js
import { ethers } from 'ethers';
import { classToBytes32, signAttestation, verifyAttestation } from '@hunt-protocol/verifiable-ai';

const signer = ethers.Wallet.createRandom();
const params = {
  bountyId: 1n,
  inputRoot: ethers.keccak256(ethers.toUtf8Bytes('sealed input')),
  agentId: 7n,
  classBytes32: classToBytes32('oracle-manipulation'),
  severity: 3,
  outputRoot: ethers.keccak256(ethers.toUtf8Bytes('encrypted output')),
  modelDigest: ethers.keccak256(ethers.toUtf8Bytes('model-name|v1')),
  teeTimestamp: BigInt(Math.floor(Date.now() / 1000)),
  severityCalibrationBps: 8800,
  precisionBps: 9000,
  coverageBps: 8500,
  exploitabilityBps: 8700,
};

const { sig } = await signAttestation(signer, params);
console.log(verifyAttestation(params, sig, signer.address));
```

## API reference

### `findingDigest(params)`

Computes the byte-identical digest used by `contracts/Hunt.sol` for finding
attestations. The SDK renames the fields to be domain-agnostic:

| SDK field | Hunt v1 field | Solidity type |
| --- | --- | --- |
| `bountyId` | `bountyId` | `uint256` |
| `inputRoot` | `codeRoot` | `bytes32` |
| `agentId` | `hunterId` | `uint256` |
| `classBytes32` | `cweClass` | `bytes32` |
| `severity` | `severity` | `uint8` |
| `outputRoot` | `findingRoot` | `bytes32` |
| `modelDigest` | `modelDigest` | `bytes32` |
| `teeTimestamp` | `teeTimestamp` | `uint64` |
| `severityCalibrationBps` | `severityCalibrationBps` | `uint16` |
| `precisionBps` | `precisionBps` | `uint16` |
| `coverageBps` | `coverageBps` | `uint16` |
| `exploitabilityBps` | `exploitabilityBps` | `uint16` |

The digest is:

```js
keccak256(abi.encode(uint256, bytes32, uint256, bytes32, uint8, bytes32, bytes32, uint64, uint16, uint16, uint16, uint16))
```

### `FINDING_DIGEST_ABI`

The ABI type list used by `findingDigest`. Exported for consumers that need to
encode the tuple themselves.

### `canonicalise(name)`

Normalizes arbitrary class names to Hunt's kebab-case form. It lowercases,
collapses whitespace and underscores to hyphens, drops punctuation, collapses
repeated hyphens, and trims leading or trailing hyphens.

### `classToBytes32(name)`

Returns `keccak256(utf8(canonicalise(name)))`. Unlike Hunt v1's closed CWE
helper, the SDK does not reject unknown names. Consumer apps can define their
own class registries.

### `bytes32ToClass(hash, registry)`

Performs an inverse lookup against a registry array. Returns `undefined` if the
hash is not present.

### Class registries

The SDK ships four frozen registries:

- `SMART_CONTRACT_CWES`
- `INSURANCE_DEFECT_CLASSES`
- `BENEFITS_DEFECT_CLASSES`
- `MEDICAL_READING_CLASSES`

These registries are convenience constants, not protocol limits. Any domain can
hash its own canonical labels with `classToBytes32`.

### `signAttestation(signer, params)`

Computes `findingDigest(params)` and signs the digest bytes with an ethers
signer using EIP-191 `signMessage`. Returns `{ digest, sig }`.

### `verifyAttestation(params, sig, expectedSigner)`

Recomputes the digest, recovers the EIP-191 signer, and compares it to
`expectedSigner`. Returns `true` or `false`.

### `encryptToPubkey(plaintextBytes, recipientPubkeyHex)`

Encrypts bytes or a string to a secp256k1 compressed or uncompressed public key.
The return value is a single binary blob:

```text
[33-byte ephemeral pubkey][12-byte iv][16-byte gcm tag][ciphertext]
```

### `decryptFromPrivkey(encryptedBytes, recipientPrivkeyHex)`

Decrypts a blob produced by `encryptToPubkey` with the recipient's private key.

### Notary helpers

`src/notary.js` exports:

- `NOTARY_ABI`
- `ZERO_BYTES32`
- `hashContent(transcript)`
- `modelToDigest(modelName)`
- `domainToBytes32(domain)`
- `buildNotaryArgs({ transcript, model, domain, sealedInputRoot })`

These helpers prepare arguments for `HuntNotary.attest(bytes32,bytes32,bytes32,bytes32)`.

## Examples

### Smart-contract audit

```bash
npm run example:audit
```

Builds a Hunt v1-style attestation for an oracle-manipulation finding against a
sealed Solidity bounty.

### Insurance defense

```bash
npm run example:insurance
```

Builds an attestation for an insurance denial-defect class such as
`medical-necessity-misapplication`.

### Medical records reader

```bash
npm run example:medical
```

Builds an attestation for a scope-limited medical Records Reader output. The
class registry covers second-read and interpretation-disagreement surfaces.

### Benefits defense

```bash
npm run example:benefits
```

Builds an attestation for an SSDI/SSI benefits-defense defect class such as
`residual-functional-capacity-error`.

### Generic classification

```bash
npm run example:generic
```

Demonstrates a new domain, tweet sentiment classification, with a custom class
registry. This example is the shortest proof that the primitive is not limited
to Hunt's current verticals.

## Used by

Hunt's four verticals use the same digest shape:

- Smart-contract bug-bounty auditing
- Insurance-claim-denial defense
- Disability and senior benefits defense
- Medical Records Reader

Only the canonical class strings change between domains. The input root, output
root, model digest, timestamp, and self-evaluation fields keep the same encoding.

## Status

This is a pre-1.0 SDK. Expect breaking changes while the Hunt protocol hardens
its TEE-attestation relay, Notary, and Reputation Oracle layers.

The v0.1.0 API intentionally stays close to the deployed Hunt v1 digest so
judges and downstream 0G builders can verify that the package did not invent a
second receipt format.

## License

MIT.

## Links

- Hunt repo: https://github.com/Ridwannurudeen/hunt
- Live demo: https://hunt.gudman.xyz
- Verticals page: https://hunt.gudman.xyz/verticals.html
- Judge proof: https://hunt.gudman.xyz/proof.html?bounty=3
