# Codex brief — Hunt L1-L4 build

You (Codex) are extending an existing, working 0G hackathon project called **Hunt**. The repo is shipping-ready as a v1 product; you are adding four post-hackathon protocol layers that have been positioned in docs but not yet implemented as code. Treat this as a focused multi-day build with strict scope discipline. Acceptance criteria are concrete; please satisfy them exactly.

## Context — what already exists

Hunt is a sealed bug-bounty network deployed on 0G Aristotle mainnet (chain 16661):

- Contract: `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`
- Live frontend: `https://hunt.gudman.xyz`
- 8 bounties on chain (5 settled, 3 expired), 3 hunters minted
- Bounty #3 strict-verify is the load-bearing cryptographic proof
- Bounty #7 is the second positive per-CWE narrowing data point (reentrancy-specialist won 2026-05-13)

Key existing files you will reuse (DO NOT MODIFY):

| File | Purpose |
|---|---|
| `contracts/Hunt.sol` | Deployed v1.0 + in-tree v1.1; load-bearing, untouchable |
| `lib/credential.js` | `findingDigest()` — the attestation ABI encoding |
| `lib/cwe.js` | Canonical CWE registry + `cweToBytes32()` helper |
| `lib/ecdh.js` | secp256k1 ECIES envelope (`encryptToPubkey`, `decryptFromPrivkey`) |
| `lib/inference.js` | 0G Sealed Inference adapter (`sealedQuery`, `getBroker`) |
| `lib/storage.js` | 0G Storage helpers (`uploadRaw`, `uploadEncryptedRecord`, etc.) |
| `lib/pubkey.js` | Wallet pubkey recovery |
| `bin/serve.js` | Zero-dep static server for `public/` + `/deployments/*.json` |
| `deployments/Hunt.json` | Deployed contract artifact (address + ABI) |

Conventions to follow:

- **Module system**: ESM (`type: "module"` in `package.json`). All new JS files use `import`/`export`.
- **Solidity version**: `^0.8.20` (matches `Hunt.sol`).
- **ethers version**: `6.13.x` (matches existing). Use `ethers.AbiCoder.defaultAbiCoder()` for encoding.
- **Tests**: Node's built-in test runner (`node --test` or `import { describe, it } from 'node:test'`) + `node:assert/strict`. Do NOT introduce vitest, jest, or mocha.
- **Contracts**: Hardhat 3.x (matches existing config). `npx hardhat test` runs the suite.
- **Style**: Match existing code style — single quotes for JS strings, prefer named exports, JSDoc-style top-of-file headers explaining purpose.
- **Lint**: No new linter. Match existing whitespace/formatting.

## Goal

Build out Layers 1, 2, 3 (docs only), and 4 from `doc/FUTURE.md` Pillar 5 plan so Hunt graduates from "single-vertical product" to "AI accountability protocol on 0G." Specifics below. **Total estimated work: 14-22 hours.**

Do NOT touch the deployed Hunt contract or any of bounties #0-#7. The new contracts (`Notary.sol`, `HuntReputationOracle.sol`) deploy as **separate addresses** alongside Hunt and never call into it for state changes.

---

## Layer 1 — Hunt SDK (`packages/sdk/`)

Extract the verifiable-AI primitives Hunt already implements into a standalone npm-shaped package that any 0G developer can drop into their project.

### Files to create

```
packages/sdk/
  package.json                — name "@hunt-protocol/verifiable-ai", version "0.1.0", type "module"
  README.md                   — overview, install, API reference, 4 example walkthroughs
  CHANGELOG.md                — single "0.1.0 — initial release" entry
  LICENSE                     — MIT
  src/
    index.js                  — main exports
    digest.js                 — findingDigest() — copied from lib/credential.js, ABI-encoded keccak
    classes.js                — classToBytes32() + canonical-class registries (smart-contract CWEs + 3 v2 verticals)
    ecdh.js                   — re-exported encryptToPubkey + decryptFromPrivkey from lib/ecdh.js logic
    attestation.js            — high-level signAttestation() + verifyAttestation() wrappers
  examples/
    01-smart-contract-audit.js
    02-insurance-defense.js
    03-medical-records-reader.js
    04-benefits-defense.js
    05-generic-classification.js
  test/
    digest.test.js
    classes.test.js
    attestation.test.js
```

### `package.json` exact shape

```json
{
  "name": "@hunt-protocol/verifiable-ai",
  "version": "0.1.0",
  "description": "Verifiable AI primitives for 0G Aristotle — attestation digests, per-domain class hashing, ECIES envelopes. Extracted from the Hunt protocol.",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./digest": "./src/digest.js",
    "./classes": "./src/classes.js",
    "./ecdh": "./src/ecdh.js",
    "./attestation": "./src/attestation.js"
  },
  "scripts": {
    "test": "node --test test/*.test.js",
    "example:audit": "node examples/01-smart-contract-audit.js",
    "example:insurance": "node examples/02-insurance-defense.js",
    "example:medical": "node examples/03-medical-records-reader.js",
    "example:benefits": "node examples/04-benefits-defense.js",
    "example:generic": "node examples/05-generic-classification.js"
  },
  "peerDependencies": {
    "ethers": "^6.13.0"
  },
  "repository": "github:Ridwannurudeen/hunt",
  "homepage": "https://hunt.gudman.xyz",
  "license": "MIT",
  "keywords": ["0g", "ai", "verifiable", "tee", "attestation", "ethereum"]
}
```

### `src/digest.js` — exact API

```js
// Verbatim re-implementation of lib/credential.js findingDigest, with renamed
// parameters to be domain-agnostic. Used by all four Hunt verticals + any
// downstream consumer.
import { ethers } from 'ethers';

const ABI = ethers.AbiCoder.defaultAbiCoder();

/**
 * Compute the attestation digest for a finding/output. Matches the byte-for-byte
 * encoding the Hunt v1 contract ecrecover's against `teeSigner`.
 *
 * @param {object} params
 * @param {bigint} params.bountyId         — uint256 — the bounty/job identifier
 * @param {string} params.inputRoot        — bytes32 — keccak of the sealed input blob (codeRoot in v1)
 * @param {bigint} params.agentId          — uint256 — the agent/hunter identifier
 * @param {string} params.classBytes32     — bytes32 — keccak256(utf8(canonical class name))
 * @param {number} params.severity         — uint8   — 1..4 (low..critical)
 * @param {string} params.outputRoot       — bytes32 — keccak of the encrypted output blob (findingRoot in v1)
 * @param {string} params.modelDigest      — bytes32 — keccak256(utf8(model name + version))
 * @param {bigint} params.teeTimestamp     — uint64  — timestamp the agent claims it ran the model at
 * @param {number} params.severityCalibrationBps — uint16 — 0..10000
 * @param {number} params.precisionBps     — uint16  — 0..10000
 * @param {number} params.coverageBps      — uint16  — 0..10000
 * @param {number} params.exploitabilityBps — uint16 — 0..10000
 * @returns {string} bytes32 keccak digest as 0x-prefixed hex
 */
export function findingDigest(params) {
  return ethers.keccak256(ABI.encode(
    ['uint256', 'bytes32', 'uint256', 'bytes32', 'uint8', 'bytes32', 'bytes32',
     'uint64', 'uint16', 'uint16', 'uint16', 'uint16'],
    [params.bountyId, params.inputRoot, params.agentId, params.classBytes32,
     params.severity, params.outputRoot, params.modelDigest, params.teeTimestamp,
     params.severityCalibrationBps, params.precisionBps, params.coverageBps,
     params.exploitabilityBps],
  ));
}

export const FINDING_DIGEST_ABI = [
  'uint256', 'bytes32', 'uint256', 'bytes32', 'uint8', 'bytes32', 'bytes32',
  'uint64', 'uint16', 'uint16', 'uint16', 'uint16',
];
```

### `src/classes.js` — exact API

Export a `classToBytes32(name)` function plus 4 frozen registries:

- `SMART_CONTRACT_CWES` — the 12 existing canonical classes from `lib/cwe.js`
- `INSURANCE_DEFECT_CLASSES` — the 6 from `scripts/insurance_specialist_brief.js`
- `BENEFITS_DEFECT_CLASSES` — the 7 from `scripts/benefits_specialist_brief.js`
- `MEDICAL_READING_CLASSES` — the 6 from `scripts/medical_specialist_brief.js`

Plus `canonicalise(name)` — the kebab-case canonicaliser. Same logic as `lib/cwe.js` lines 34-42.

Plus `classToBytes32(name)` — keccak256(utf8(canonicalise(name))). DO NOT throw on unknown names; let consumers register their own classes.

Plus `bytes32ToClass(hash, registry)` — inverse lookup across a registry.

### `src/ecdh.js`

Re-implement using the standard secp256k1 + HKDF + AES-GCM pattern from `lib/ecdh.js`. Same function signatures:

- `encryptToPubkey(plaintextBytes, recipientPubkeyHex) → encryptedBytes`
- `decryptFromPrivkey(encryptedBytes, recipientPrivkeyHex) → plaintextBytes`

If `lib/ecdh.js` exports these directly, the SDK file can `export * from '../../lib/ecdh.js'` — but cleaner to copy the implementation into `packages/sdk/src/ecdh.js` so the package has no parent-tree imports. Use the copy approach.

### `src/attestation.js` — high-level wrappers

```js
import { ethers } from 'ethers';
import { findingDigest } from './digest.js';

/**
 * Sign an attestation digest with a wallet (typically the operator-held teeSigner).
 * Returns { digest, sig } — sig is an EIP-191 personal-message signature.
 */
export async function signAttestation(signer, params) {
  const digest = findingDigest(params);
  const sig = await signer.signMessage(ethers.getBytes(digest));
  return { digest, sig };
}

/**
 * Verify an attestation signature against the claimed signer. Returns true iff
 * the signature recovers to expectedSigner.
 */
export function verifyAttestation(params, sig, expectedSigner) {
  const digest = findingDigest(params);
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), sig);
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
```

### `src/index.js`

Re-export everything from the four files above.

### Examples

Each example file is 30-60 lines, runnable with `node examples/0X-*.js`, prints the constructed brief + computed digest + a verifyAttestation check. Look at `scripts/insurance_specialist_brief.js`, `scripts/medical_specialist_brief.js`, `scripts/benefits_specialist_brief.js` for the existing patterns — the examples are simplified versions of those.

The `05-generic-classification.js` example demonstrates a NEW domain: e.g., "tweet sentiment classification" with a custom class registry of 3-5 sentiment labels. Shows that the SDK supports arbitrary verticals beyond Hunt's 4 existing ones.

### Tests

Three test files using `node:test`. Acceptance:

- `digest.test.js` — at minimum 3 tests: (a) digest is deterministic for fixed inputs, (b) changing any field changes the digest, (c) digest matches the value produced by the existing `lib/credential.js` `findingDigest()` against identical inputs. Import both and assert equal.
- `classes.test.js` — at minimum 4 tests: (a) `canonicalise` produces stable kebab-case, (b) `classToBytes32` is deterministic, (c) all 4 registries contain expected entries, (d) `bytes32ToClass` round-trips.
- `attestation.test.js` — at minimum 2 tests: (a) `signAttestation` + `verifyAttestation` round-trip with a random ethers wallet, (b) `verifyAttestation` returns false for a tampered digest.

### README.md

~150-250 lines:

```markdown
# @hunt-protocol/verifiable-ai

Verifiable AI primitives for 0G Aristotle, extracted from the Hunt protocol.

## Install
## Quickstart (5-line example)
## API reference
## Examples (one section per example file)
## Used by (Hunt's four verticals)
## Status (pre-1.0, expect breaking changes)
## License
## Links (Hunt repo, live demo, /verticals page)
```

### Acceptance for Layer 1

1. `cd packages/sdk && node --test test/*.test.js` exits 0 with all tests passing.
2. All 5 example scripts run without throwing.
3. The SDK's `findingDigest()` produces byte-identical output to `lib/credential.js`'s `findingDigest()` for the same inputs (asserted in tests).
4. README has all sections above.
5. `npm test` at the repo root still passes 195/195 (you did not modify any existing test).

---

## Layer 2 — AI Notary

A public-good frontend on `hunt.gudman.xyz/notary.html` where any user can paste an AI conversation transcript and receive a TEE-attested on-chain receipt. The receipt is admissible evidence of what an AI said at a given time.

### Files to create

```
contracts/Notary.sol             — minimal attestation contract (~80 LOC)
test/Notary.test.js              — 5+ tests for the contract
scripts/deploy_notary.js         — one-shot deploy to Aristotle
deployments/Notary.json          — written by deploy script
public/notary.html               — frontend, matches verticals.html palette
audits/notary/README.md          — short README explaining the layer
doc/NOTARY_INTEGRATION.md        — developer docs for embedding the notary
```

### `contracts/Notary.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// HuntNotary — public-good AI attestation registry.
///
/// Any caller can record that a specific AI model produced a specific output
/// for a specific (hashed) input at a specific time. The contract does NOT
/// store the input or output — only the keccak hashes. Used as a notarized
/// timestamp + provenance receipt that anyone can later prove they had at
/// a given block height.
///
/// No payment, no escrow, no reputation accounting — that's Hunt v1's job.
/// This contract is a thin notary log on top of the same v1 primitive.
contract HuntNotary {
    struct Attestation {
        address    user;            // who recorded this attestation
        bytes32    contentHash;     // keccak256 of the AI conversation transcript
        bytes32    modelDigest;     // keccak256(utf8(modelName + version))
        bytes32    domain;          // keccak256(utf8(domain name)) — "medical", "legal", "general"
        uint64     attestedAt;      // block.timestamp
        bytes32    sealedInputRoot; // 0G Storage root of the sealed transcript (optional, 0x0 if not used)
    }

    Attestation[] public attestations;

    event AttestationRecorded(
        uint256 indexed attestId,
        address indexed user,
        bytes32 indexed modelDigest,
        bytes32 contentHash,
        bytes32 domain,
        uint64  attestedAt,
        bytes32 sealedInputRoot
    );

    /// Anyone can record an attestation. Returns the attestId.
    function attest(
        bytes32 contentHash,
        bytes32 modelDigest,
        bytes32 domain,
        bytes32 sealedInputRoot
    ) external returns (uint256 attestId) {
        require(contentHash != bytes32(0), "empty content");
        require(modelDigest != bytes32(0), "empty modelDigest");
        attestId = attestations.length;
        attestations.push(Attestation({
            user: msg.sender,
            contentHash: contentHash,
            modelDigest: modelDigest,
            domain: domain,
            attestedAt: uint64(block.timestamp),
            sealedInputRoot: sealedInputRoot
        }));
        emit AttestationRecorded(attestId, msg.sender, modelDigest, contentHash, domain, uint64(block.timestamp), sealedInputRoot);
    }

    function getAttestation(uint256 attestId) external view returns (Attestation memory) {
        require(attestId < attestations.length, "out of range");
        return attestations[attestId];
    }

    function totalAttestations() external view returns (uint256) {
        return attestations.length;
    }
}
```

### `test/Notary.test.js` — exact tests

Use the same test pattern as `test/Hunt.test.js` (node:test + hardhat). Tests:

1. `attest()` increments `totalAttestations`
2. `attest()` reverts on empty contentHash
3. `attest()` reverts on empty modelDigest
4. `getAttestation(id)` returns the stored struct
5. `AttestationRecorded` event fires with the right indexed fields
6. Multiple users can independently attest

### `scripts/deploy_notary.js`

Pattern matches `scripts/deploy_hunt.js`. Reads `PRIVATE_KEY` from `.env`, deploys `contracts/Notary.sol`, writes `deployments/Notary.json` with `{name, address, txHash, blockNumber, chainId, abi}` (same shape as `deployments/Hunt.json`).

**DEPLOY TO ARISTOTLE.** This is intentional — the Notary becomes part of the live submission.

### `public/notary.html`

Match the editorial-cryptographic palette of `public/verticals.html`. Sections:

1. Header + nav (include `/notary.html` as a nav item; update the nav on all existing pages: `index.html`, `hunters.html`, `bounties.html`, `verticals.html`, `proof.html`)
2. Hero: "Notarize an AI conversation" + lede paragraph explaining what + why
3. Input form:
   - Textarea: paste your AI conversation transcript
   - Select: which model produced this? (free text field; we hash it)
   - Select: domain — `general | medical | legal | financial | other`
   - Button: "Notarize" (connects wallet, signs `attest()` tx)
4. Result panel: when tx confirms, show attestId, tx hash, chainscan link, content hash, model digest, attestedAt timestamp
5. Footer note: "This is a public-good attestation log. The contract does NOT store your content — only the keccak hash. Your content stays on your machine."

Use the same wallet-connection pattern as `public/bounties.html` and `public/proof.html`. Use `window.mkProvider()` and `window.withRetry()` from `public/contracts.js` (extend it to also load `deployments/Notary.json` and expose `NOTARY_ADDRESS` + a small `NOTARY_ABI`).

### `audits/notary/README.md`

~1 page explaining: what the Notary is, who uses it, why it's a public-good layer over Hunt's v1 primitive, deployed address (filled in post-deploy), how to interact (wallet-required v1; v2 ships operator-sponsored gas).

### `doc/NOTARY_INTEGRATION.md`

~1-2 pages for developers who want to embed Notary attestations in their own consumer AI products. Includes:
- Call signature (contract ABI fragment for `attest()`)
- TypeScript example using ethers
- How to verify an attestation later (read by attestId)
- Note that the SDK from Layer 1 has a `notary.js` helper (write this in the SDK during this work — small additional file `packages/sdk/src/notary.js`)

### Acceptance for Layer 2

1. `npx hardhat test test/Notary.test.js` passes all tests.
2. `npm test` still passes 195+ tests (yours add to the count).
3. `node scripts/deploy_notary.js` succeeds on Aristotle, writes `deployments/Notary.json`.
4. `public/notary.html` loads at `localhost:3000/notary.html` (via `npm run dev`) and renders the form.
5. Nav link to `/notary.html` is added to ALL existing pages.
6. The `attest()` tx fires successfully when a wallet is connected (manual smoke test acceptable).

---

## Layer 3 — Institutional partnership documentation

A single document. No code.

### File to create

`doc/INSTITUTIONAL_PARTNERSHIP.md` — ~2-3 pages, ~600-1000 words.

Sections:

1. **Audience** — who this doc is for (state insurance regulators / IROs, bar associations, medical boards, plaintiff-side firms, consumer-advocacy organizations).
2. **What Hunt-as-a-Service provides** — a deployed Hunt instance with their domain spec (canonical class registry), running on 0G Aristotle, with their wallet as the verifier.
3. **Architecture diagram** (ASCII, reuse the format from `audits/*/README.md`) showing partner → Hunt instance → 0G primitives.
4. **Deployment model** — partner provides: (a) domain spec (kebab-case class strings), (b) verifier wallet, (c) optional model-tuning corpus. Hunt operator provides: deployment, hosting, monitoring, primitives upgrade path.
5. **Data residency + privacy** — partner inputs sealed on 0G Storage; attestations on 0G Chain Aristotle; partner retains control of decryption keys.
6. **Pricing model** — TBD/illustrative: $25k annual + $0.10 per attestation OR $50k flat. Document is exploratory, not contractual.
7. **How to engage** — mailto link (placeholder: `partnerships@hunt.gudman.xyz`), expected response time, evaluation period.
8. **Reference deployments** — points at the 4 existing public verticals as proof-of-pattern.

Link from `README.md` "Links" section and from `doc/SUBMISSION.md` §10 Bonus materials.

### Acceptance for Layer 3

1. File exists and is well-written, well-cited prose.
2. Linked from `README.md` and `doc/SUBMISSION.md`.
3. No code, no tests required.

---

## Layer 4 — Hunt Reputation Oracle

A read-only contract on Aristotle that exposes per-(model, domain) reputation in a stable interface for cross-chain consumers.

### Files to create

```
contracts/HuntReputationOracle.sol   — read-only contract (~150 LOC)
test/HuntReputationOracle.test.js    — 5+ tests
scripts/deploy_reputation_oracle.js  — one-shot deploy + initial domain registration
deployments/HuntReputationOracle.json — written by deploy script
doc/REPUTATION_ORACLE.md             — cross-chain consumer integration docs
```

### `contracts/HuntReputationOracle.sol` — exact API

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IHunt {
    struct ClassRep {
        uint32 wins;
        uint32 submissions;
        uint256 totalEarnedWei;
        uint64 sumSeverityCalibration;
        uint64 sumPrecision;
        uint64 sumCoverage;
        uint64 sumExploitability;
    }

    function getClassRep(uint256 hunterId, bytes32 cweClass) external view returns (ClassRep memory);
    function totalHunters() external view returns (uint256);
}

/// HuntReputationOracle — stable, cross-chain-readable view of per-domain
/// reputation accrued on Hunt. Wraps the deployed Hunt contract and exposes a
/// normalized interface that's safe for any chain to query via JSON-RPC or
/// future cross-chain message bridges.
contract HuntReputationOracle {
    address public immutable HUNT;
    address public admin;

    // Domain registry — admin registers a domain (string name) and its set of
    // canonical class strings (also strings). Both stored as keccak hashes.
    mapping(bytes32 => bytes32[]) public domainClasses;          // domain → [classBytes32]
    mapping(bytes32 => string)    public domainName;             // domain → readable name
    mapping(bytes32 => string)    public className;              // classBytes32 → readable name
    bytes32[]                     public domains;

    event DomainRegistered(bytes32 indexed domain, string name);
    event ClassRegistered(bytes32 indexed domain, bytes32 indexed classBytes32, string name);

    constructor(address huntAddress) {
        require(huntAddress != address(0), "hunt=0");
        HUNT = huntAddress;
        admin = msg.sender;
    }

    function registerDomain(string memory name) external {
        require(msg.sender == admin, "not admin");
        bytes32 d = keccak256(bytes(name));
        if (bytes(domainName[d]).length == 0) {
            domains.push(d);
            domainName[d] = name;
            emit DomainRegistered(d, name);
        }
    }

    function registerClass(string memory domain, string memory classNameStr) external {
        require(msg.sender == admin, "not admin");
        bytes32 d = keccak256(bytes(domain));
        require(bytes(domainName[d]).length != 0, "domain not registered");
        bytes32 c = keccak256(bytes(classNameStr));
        // dedupe
        bytes32[] storage cs = domainClasses[d];
        for (uint256 i = 0; i < cs.length; i++) {
            if (cs[i] == c) return;
        }
        cs.push(c);
        className[c] = classNameStr;
        emit ClassRegistered(d, c, classNameStr);
    }

    function getDomains() external view returns (bytes32[] memory) { return domains; }
    function getClasses(bytes32 domain) external view returns (bytes32[] memory) { return domainClasses[domain]; }

    /// Get raw class rep for a specific hunter + class. Pass-through to Hunt.
    function getReputationByClass(uint256 hunterId, bytes32 classBytes32)
        external view returns (IHunt.ClassRep memory)
    {
        return IHunt(HUNT).getClassRep(hunterId, classBytes32);
    }

    struct AggregateView {
        uint256 totalWins;
        uint256 totalSubmissions;
        uint256 totalEarnedWei;
        uint256 hunterCount;       // number of hunters with any wins in this domain
    }

    /// Aggregate reputation across all hunters for a given domain. O(hunters x classes).
    /// Read-only and gas-limit-bound; reasonable for ≤100 hunters x ≤20 classes per domain.
    function aggregateDomain(bytes32 domain) external view returns (AggregateView memory v) {
        uint256 hunters = IHunt(HUNT).totalHunters();
        bytes32[] memory classes = domainClasses[domain];
        for (uint256 h = 0; h < hunters; h++) {
            uint256 hWins = 0;
            uint256 hSubs = 0;
            uint256 hEarn = 0;
            for (uint256 c = 0; c < classes.length; c++) {
                IHunt.ClassRep memory rep = IHunt(HUNT).getClassRep(h, classes[c]);
                hWins += rep.wins;
                hSubs += rep.submissions;
                hEarn += rep.totalEarnedWei;
            }
            v.totalWins += hWins;
            v.totalSubmissions += hSubs;
            v.totalEarnedWei += hEarn;
            if (hWins > 0) v.hunterCount += 1;
        }
    }

    function transferAdmin(address newAdmin) external {
        require(msg.sender == admin, "not admin");
        require(newAdmin != address(0), "admin=0");
        admin = newAdmin;
    }
}
```

### `test/HuntReputationOracle.test.js`

Tests (at least 6):

1. `registerDomain` only callable by admin; emits event.
2. `registerClass` only callable on registered domain; deduplicates.
3. `getDomains` + `getClasses` return registered values.
4. `getReputationByClass` matches `Hunt.getClassRep` byte-for-byte (deploy a small mock Hunt that returns canned ClassRep struct).
5. `aggregateDomain` correctly sums across hunters × classes.
6. `transferAdmin` rotates the admin; old admin loses access.

Use a small `MockHunt` contract inside the test file (or as a fixture) that conforms to the `IHunt` interface and returns deterministic ClassRep values. DO NOT depend on the live `0xD4Fe5127…` contract in tests.

### `scripts/deploy_reputation_oracle.js`

Pattern matches `scripts/deploy_hunt.js`. Deploy with `huntAddress = 0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`. After deploy, register the 4 domains:

1. `smart-contract-audit` with classes: `swc-107-reentrancy`, `oracle-manipulation`, `access-control`, `swc-101-int-overflow`, `storage-collision`, `swc-115-tx-origin`, `unchecked-external-call`, `front-running`, `price-manipulation`, `signature-replay`, `unsafe-delegatecall`, `denial-of-service` (12 classes from `lib/cwe.js`).
2. `insurance-claim-denial-defense` with the 6 classes from `scripts/insurance_specialist_brief.js`.
3. `benefits-defense` with the 7 classes from `scripts/benefits_specialist_brief.js`.
4. `medical-records-reader` with the 6 classes from `scripts/medical_specialist_brief.js`.

Write `deployments/HuntReputationOracle.json` with `{name, address, txHash, blockNumber, chainId, abi, huntAddress, registeredDomains: [...]}`.

### `doc/REPUTATION_ORACLE.md`

~2-3 pages:

1. What the Oracle is + why a separate contract from Hunt
2. Address on Aristotle (filled in post-deploy)
3. Read patterns for cross-chain consumers — JSON-RPC `eth_call` examples in 3 languages (Solidity, ethers TS, web3.py)
4. How to register a new domain (admin-only for v1; DAO-governed in v2)
5. How to consume via future cross-chain bridge (Wormhole / LayerZero / Hyperlane) — describe the pattern, no integration code yet
6. Roadmap: v2 will federate across multiple Hunt instances; v3 will support staked-attestation challenges

### Acceptance for Layer 4

1. `npx hardhat test test/HuntReputationOracle.test.js` passes all tests.
2. `npm test` still passes (all old tests + the new Notary + Oracle tests).
3. `node scripts/deploy_reputation_oracle.js` succeeds on Aristotle, writes `deployments/HuntReputationOracle.json` with the 4 domains registered + their tx hashes.
4. Documentation file exists with all sections above.

---

## Cross-cutting requirements

### What to NOT do

- DO NOT modify `contracts/Hunt.sol`. The deployed v1.0 + in-tree v1.1 stays exactly as-is.
- DO NOT modify any of bounties #0-#7. They are load-bearing on-chain artifacts.
- DO NOT touch `lib/credential.js`, `lib/cwe.js`, `lib/ecdh.js`, `lib/inference.js`, `lib/storage.js`. The SDK COPIES from these; it does not replace them.
- DO NOT republish to npm; the SDK lives in `packages/sdk/` only, referenced via `npm install github:Ridwannurudeen/hunt#main --workspace=@hunt-protocol/verifiable-ai` from external consumers post-hackathon.
- DO NOT introduce new test frameworks. Use `node:test` for new tests.
- DO NOT modify the existing `package.json` at the repo root, EXCEPT to add a `workspaces: ["packages/*"]` field if needed for the SDK.
- DO NOT add new dependencies to the repo root `package.json`. The SDK has its own `package.json`.

### Quality gates (run after every layer, run all again after all 4 layers)

```bash
# Repo root
npm test                                                     # must still pass — 195 existing + your new ones
# SDK
cd packages/sdk && node --test test/*.test.js && cd ../..
# Examples
cd packages/sdk && for f in examples/*.js; do node "$f"; done && cd ../..
# Contracts
npx hardhat compile                                          # both new contracts compile
npx hardhat test                                             # all hardhat tests including Notary + Oracle
```

All four blocks must exit 0.

### Output format

Commit as you go, one commit per layer plus one final "wrap" commit. Commit message convention follows existing repo style:

- `feat(sdk): extract Hunt's verifiable-AI primitives into packages/sdk/`
- `feat(notary): public-good AI attestation registry on Aristotle`
- `docs(partnership): institutional Hunt-as-a-Service playbook`
- `feat(oracle): cross-chain readable HuntReputationOracle`
- `docs: link L1-L4 from README + SUBMISSION + verticals page`

No `Co-Authored-By: Codex` or similar attribution tags — repo convention is no AI attribution in commits. See user's CLAUDE.md.

Push to `origin/master` once all four layers are committed AND all quality gates pass. Then deploy to VPS (`ssh root@gudman.xyz 'cd /opt/hunt && git pull origin master'`).

### Cross-references to update

In the FINAL wrap commit:

- `README.md` — update the "Beyond crypto" section to add a fifth bullet referencing the SDK + Notary + Oracle as the "infrastructure layer." Update Project Layout to include `packages/sdk/`, `contracts/Notary.sol`, `contracts/HuntReputationOracle.sol`. Update Links to point at the new `doc/INSTITUTIONAL_PARTNERSHIP.md` + `doc/REPUTATION_ORACLE.md` + `doc/NOTARY_INTEGRATION.md`.
- `doc/SUBMISSION.md §10` — add a bullet: "Hunt as protocol infrastructure (L1-L4 shipped): SDK + Notary + Reputation Oracle + Institutional partnership playbook."
- `public/verticals.html` — add a fifth section below the 4-card grid titled "Infrastructure layer (post-hackathon shipped)" with 4 stat-cards pointing at SDK / Notary / Reputation Oracle / Partnership Playbook.
- `doc/FUTURE.md` Pillar 5 — mark sections 5a/5b/5c as "v2 verticals positioned" and add a new section "5d — protocol infrastructure layer (L1-L4 shipped 2026-05-XX, see audits/notary, packages/sdk, doc/REPUTATION_ORACLE.md, doc/INSTITUTIONAL_PARTNERSHIP.md)".

---

## Verification handoff

When all four layers are complete, run the four quality gates in order and paste the output back to the human. Specifically the output of:

```bash
cd "C:/Users/gudma/OneDrive/Desktop/GITHUB-FILES/kin"
npm test 2>&1 | tail -5
cd packages/sdk && node --test test/*.test.js 2>&1 | tail -10 && cd ../..
cd packages/sdk && for f in examples/*.js; do echo "=== $f ==="; node "$f" 2>&1 | tail -5; done && cd ../..
npx hardhat test 2>&1 | tail -10
git log --oneline -8
ls -la deployments/Notary.json deployments/HuntReputationOracle.json packages/sdk/package.json
```

The human will then verify:

1. Notary contract is deployed to Aristotle — chainscan link works
2. Reputation Oracle is deployed to Aristotle with 4 domains registered — chainscan link works
3. `npm run dev` boots the static server and `/notary.html` loads + renders
4. SDK example apps run end-to-end
5. All quality gates green
6. VPS pulled the changes; live frontend at hunt.gudman.xyz/notary.html serves the new page

If anything fails, fix and re-run the gates. Iteration is expected.

---

## Time budget

| Layer | Estimated hours |
|---|---|
| L1 SDK | 6-10 |
| L2 Notary | 6-8 |
| L3 Partnership doc | 1-2 |
| L4 Reputation Oracle | 4-6 |
| Cross-cutting + wrap | 1-2 |
| **Total** | **18-28 hours** |

Realistic over 1-2 focused days. If you hit a blocker that would force you to deviate from this brief (e.g., the Hunt contract's ABI shape changed since this brief was written, a 0G primitive isn't available, an acceptance criterion can't be satisfied), STOP and surface the question to the human rather than guessing.

Good luck. Ship clean.
