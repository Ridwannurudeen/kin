# Hunt Notary Integration

Hunt Notary lets any AI product embed a timestamped, hash-only receipt on 0G
Aristotle. It is the public-good version of Hunt's attestation primitive: no
escrow, no race, no reputation, just a durable commitment to an AI transcript.

## Contract ABI fragment

```solidity
function attest(
    bytes32 contentHash,
    bytes32 modelDigest,
    bytes32 domain,
    bytes32 sealedInputRoot
) external returns (uint256 attestId);

function getAttestation(uint256 attestId) external view returns (
    address user,
    bytes32 contentHash,
    bytes32 modelDigest,
    bytes32 domain,
    uint64 attestedAt,
    bytes32 sealedInputRoot
);

function totalAttestations() external view returns (uint256);
```

`contentHash` is `keccak256(utf8(transcript))` or the hash of a canonical JSON
transcript. `modelDigest` is `keccak256(utf8(modelName + version))`. `domain` is
`keccak256(utf8(domainName))`, for example `general`, `medical`, `legal`, or
`financial`. `sealedInputRoot` is optional and can be `bytes32(0)` if the
transcript is not stored on 0G Storage.

## TypeScript example

```ts
import { ethers } from 'ethers';
import {
  NOTARY_ABI,
  ZERO_BYTES32,
  buildNotaryArgs,
} from '@hunt-protocol/verifiable-ai/notary';

const notaryAddress = '0x...';
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const notary = new ethers.Contract(notaryAddress, NOTARY_ABI, signer);

const args = buildNotaryArgs({
  transcript: 'User: ...\nAssistant: ...',
  model: 'zai-org/GLM-5-FP8|notary-v1',
  domain: 'general',
  sealedInputRoot: ZERO_BYTES32,
});

const tx = await notary.attest(...args);
const receipt = await tx.wait();
console.log(receipt.hash);
```

## Verify later

Read the attestation by id:

```ts
const att = await notary.getAttestation(0n);
const transcriptHash = ethers.keccak256(ethers.toUtf8Bytes(transcript));

if (att.contentHash !== transcriptHash) {
  throw new Error('transcript does not match receipt');
}
```

Verification is intentionally simple:

1. Recompute `contentHash` from the transcript the user presents.
2. Recompute `modelDigest` and `domain` from the declared strings.
3. Fetch `getAttestation(attestId)`.
4. Compare hashes and inspect `attestedAt`, `user`, and transaction block.

The contract is not a truth oracle. It proves timestamped provenance for a hash.
The product using the receipt decides what content format and review policy make
the receipt meaningful.

## Storage pattern

For sensitive content, do not rely on hashing alone. A short transcript may be
guessable. The stronger pattern is:

1. Encrypt the transcript client-side.
2. Upload the encrypted blob to 0G Storage.
3. Put the storage root in `sealedInputRoot`.
4. Put the transcript hash in `contentHash`.
5. Give the user the decryption key through their own wallet flow.

This makes the public chain useful for provenance without publishing the content.

## Where it fits in Hunt

The Notary is Layer 2 of the protocol infrastructure build:

- Layer 1: SDK primitives for digest/class/envelope handling.
- Layer 2: Notary receipts for arbitrary AI outputs.
- Layer 3: institutional deployment model.
- Layer 4: Reputation Oracle for cross-chain consumers.

Together these move Hunt from a single smart-contract audit app into reusable 0G
AI accountability infrastructure.
