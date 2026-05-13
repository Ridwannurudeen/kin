# Hunt Notary

Hunt Notary is the public-good receipt layer for AI conversations.

The Hunt v1 bounty contract proves an AI hunter submitted a signed finding
inside a race window. The Notary extracts the same accountability shape into a
minimal standalone contract: a user commits to a transcript hash, a model digest,
a domain hash, an optional 0G Storage root, and a chain timestamp.

The contract does not store prompts, answers, medical records, legal facts,
financial data, or any other private content. It stores hashes only.

## Who uses it

The first user is any 0G builder who needs a low-friction receipt for what an AI
system said:

- A consumer AI app can give users timestamped receipts for high-stakes outputs.
- An auditor can notarize AI triage output before a human review stage.
- A partner can commit a sealed transcript root before routing it into a Hunt
  bounty or appeal workflow.
- Judges can see Hunt become protocol infrastructure rather than only a single
  bug-bounty vertical.

## Why it sits above Hunt v1

`contracts/Hunt.sol` handles escrow, hunter identities, race windows, and
per-CWE reputation. That is the right shape for adversarial bounty races.

`contracts/Notary.sol` is intentionally thinner:

- no payout
- no escrow
- no reputation accounting
- no winner selection
- no privileged writer

Anyone can attest. The receipt is a timestamped public commitment that can be
read later by wallet, block, transaction, or `attestId`.

## Deployed address

Post-deploy artifact: `deployments/Notary.json`.

Address: `0x968d5E070152A90Ae7a3c5251222FC163b72C7E2`

Chainscan: https://chainscan.0g.ai/address/0x968d5E070152A90Ae7a3c5251222FC163b72C7E2

## Interaction model

v1 is wallet-required. The frontend at `/notary.html` connects a browser wallet,
hashes transcript/model/domain locally, and calls:

```solidity
attest(bytes32 contentHash, bytes32 modelDigest, bytes32 domain, bytes32 sealedInputRoot)
```

The returned `attestId` can be used with:

```solidity
getAttestation(uint256 attestId)
```

v2 can add operator-sponsored gas or session-key flows for consumer products
that cannot assume every user has OG for gas.

## Privacy boundary

Hash-only receipts are useful, but they are not magic privacy. If a transcript is
short or guessable, a third party could hash guesses and compare them to the
public `contentHash`. For sensitive workflows, store the full transcript as an
encrypted 0G Storage blob and use `sealedInputRoot` as the public commitment.

The Notary is admissible provenance evidence, not a truth oracle. It proves that
a wallet recorded a content hash, model digest, domain, and timestamp. It does
not prove the AI answer was correct.
