# Kin v2 — specification

**Status**: draft, awaiting user sign-off before any code is written.
**Owner**: Ridwan.
**Window**: 2026-05-11 → 2026-05-16 (0G APAC Hackathon submission).
**Supersedes**: the v1 design in `README.md` + `Kin.sol`.

This spec is the source of truth for every contract, lib, service, and copy change. If something here is wrong, fix the spec first, then derive code from it. Anything not in this spec is out of scope for v2.

---

## 1. Why v2 exists

v1 is a working end-to-end demo with the right narrative shape but shallow execution:

- **Privacy claim is false in practice.** Operator decrypts samples and brief locally before passing them into the TEE. Anyone reading `e2e_job.js:52` and `:113` sees it.
- **TEE attestation is decorative.** `submitWork` accepts any `bytes32` as `attestationId` with no on-chain verification.
- **"Earns while you sleep" is a manual script.** There is no agent runtime. The operator runs five steps in sequence.
- **Quality is unenforced at every layer.** Free-form skill strings, free-form briefs, no sample fingerprinting, no retrieval, no output self-check, single-axis rating, no sybil resistance, no identity proof.
- **Marketplace is unpopulated.** One skill, one client, one job.

v2 fixes those, narrows the vertical so quality can be enforced rigorously instead of waved at, and reframes the pitch around the use case that needs TEE+INFT most.

---

## 2. Pitch (locked)

> **Kin is the marketplace senior engineers will actually use.** Encode your code-review judgment as a SkillNFT. Your proprietary review patterns stay sealed on 0G — the buyer's codebase never leaves the TEE either. Junior engineers query your skill at 3am and get a TEE-attested senior-level review in two minutes. You wake up paid. Built on 0G because every other stack leaks one side or the other.

**Vertical**: code review only for v2. Specifically: PR-level reviews of code diffs in any mainstream language. Same architecture extends to legal, medical, finance in v3 — documented in `FUTURE.md`, not built.

**Three taglines we lead with, in order**:
1. *"Senior code review while you sleep."*
2. *"Your review patterns stay private. The buyer's code stays private. The work stays verifiable."*
3. *"Built end-to-end on 0G — Storage, Sealed Inference, Chain, INFT."*

**What we do not say**: "capability mesh", "agent economy", "agents own/earn/transact", anything abstract. We earn the right to those words in v3 by being rigorous in v2.

---

## 3. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Senior engineer (skill owner)                                       │
│   ├─ GitHub OAuth → verifier service signs credential attestation    │
│   ├─ samples (their public code reviews) encrypted to TEE pubkey     │
│   ├─ embeddings computed inside TEE during mint, stored on 0G        │
│   └─ mintSkill(credential, sampleRoots, embedRoots, fingerprint,...) │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────────┐
│  Kin.sol on 0G Aristotle mainnet                                     │
│   ├─ skills[]: credential, sampleRoots, embedRoots, fingerprint,     │
│   │            structuredRubric, perDimReputation                    │
│   ├─ jobs[]:   structuredBrief, qualityScore, attestationDigest,     │
│   │            perDimRating                                          │
│   ├─ events:   SkillMinted, JobPosted, WorkSubmitted, JobAccepted    │
│   └─ verifyAttestation: ecrecover over (jobId,outputRoot,quality...) │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────────┐
│  Junior engineer (client) posts job                                  │
│   ├─ structured brief: { repo, language, diff_root, focus[],...}     │
│   ├─ diff encrypted to TEE pubkey (ECDH-derived)                     │
│   └─ postJob(skillId, briefRoot, briefSchemaVersion) {value}         │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────────┐
│  Agent daemon (skill owner's machine)                                │
│   ├─ watches JobPosted events for owned skills                       │
│   ├─ retrieves encrypted samples + embeddings + brief (still sealed) │
│   ├─ Sealed Inference (one call carries decryption + retrieval +     │
│   │   review + self-eval — operator never sees plaintext)            │
│   ├─ output evaluator returns qualityScore + rubric                  │
│   ├─ if qualityScore < threshold → retry up to N times               │
│   └─ submitWork(jobId, outputRoot, attestationDigest, sig, quality)  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────────┐
│  Junior accepts with per-dimension rubric                            │
│   ├─ acceptWork(jobId, voiceMatch, completeness, accuracy, structure)│
│   └─ payment splits, perDimReputation updates                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Contract API — `Kin.sol` v2

### 4.1 Structs

```solidity
struct Credential {
    bytes32 githubHandleHash;   // keccak256 of GitHub login (privacy: hash, not raw)
    uint32  accountAgeDays;     // GitHub account age at verification time
    uint32  mergedPRs;          // total merged PRs across repos > starThreshold
    uint32  codeReviewCount;    // review comments in last 12mo on merged PRs
    uint64  verifiedAt;         // unix timestamp
    address verifier;           // address of Kin-operated verifier (v1) — schema for multi-verifier in v3
    bytes   sig;                // verifier signature over (wallet, fields)
}

struct SampleFingerprint {
    uint16 vocabEntropyBps;     // 0..10000, lexical diversity
    uint16 domainTermBps;       // 0..10000, density of code-review-domain terms
    uint16 structuralBps;       // 0..10000, sentence structure complexity
    uint16 specificityBps;      // 0..10000, fraction of statements with concrete code refs
    uint16 overallBps;          // 0..10000, weighted aggregate; mint reverts if < MIN_QUALITY_BPS
    bytes32 modelDigest;        // hash of evaluator model+version that produced this
    bytes   teeSig;             // TEE signature over the above
}

struct Skill {
    address owner;
    Credential credential;
    bytes32[] sampleRoots;      // encrypted sample blobs on 0G Storage
    bytes32[] embedRoots;       // 1:1 with sampleRoots — per-sample embedding blobs
    SampleFingerprint fingerprint;
    string  language;           // "any" | "javascript" | "rust" | "solidity" | ...
    string  description;        // human-readable, max 280 chars
    uint256 pricePerJob;
    PerDimReputation rep;
    bool    paused;
}

struct PerDimReputation {
    uint64 jobsCompleted;
    uint64 sumVoiceMatch;       // each 1..5, sum
    uint64 sumCompleteness;
    uint64 sumAccuracy;
    uint64 sumStructure;
    uint64 totalEarnedWei;
}

struct StructuredBrief {
    uint8   briefSchemaVersion; // = 1 for v2
    bytes32 briefRoot;          // encrypted brief blob on 0G Storage
    bytes32 repoFingerprint;    // optional: keccak of repo URL for analytics, no leak
    uint16  diffLinesEstimate;  // client-asserted; agent re-checks inside TEE
    uint8   urgency;            // 0=normal, 1=fast (24h SLA premium)
}

struct Job {
    uint256 skillId;
    address client;
    uint256 payment;
    StructuredBrief brief;
    bytes32 outputRoot;
    bytes32 attestationDigest;  // keccak(jobId, outputRoot, qualityScore, modelDigest)
    bytes   attestationSig;     // TEE signature over attestationDigest
    uint16  qualityScore;       // 0..10000, from TEE output evaluator
    JobStatus status;
    PerDimRating rating;
    uint64  createdAt;
    uint64  deadline;
    uint64  submittedAt;
}

struct PerDimRating {
    uint8 voiceMatch;       // 0 = unrated; 1..5 valid
    uint8 completeness;
    uint8 accuracy;
    uint8 structure;
}
```

### 4.2 Constants

```solidity
uint16  constant MIN_QUALITY_BPS         = 6000;   // 0.60 — minimum sample fingerprint score
uint16  constant MIN_OUTPUT_QUALITY_BPS  = 7000;   // 0.70 — agent must re-roll below this
uint64  constant DISPUTE_WINDOW          = 24 hours;
uint64  constant DEFAULT_DEADLINE        = 7 days;
uint32  constant MIN_CLIENT_WALLET_AGE_S = 7 days; // sybil: client wallet older than 7d
address public teeSigner;                          // pubkey of accepted TEE provider, set in constructor
address public verifier;                           // GitHub verifier address, set in constructor
```

### 4.3 External functions

```solidity
// MINT — credential + fingerprint required, both verified on-chain
function mintSkill(
    Credential calldata cred,
    bytes32[] calldata sampleRoots,
    bytes32[] calldata embedRoots,
    SampleFingerprint calldata fp,
    string calldata language,
    string calldata description,
    uint256 pricePerJob
) external returns (uint256 skillId);
//   • require sampleRoots.length == embedRoots.length, 3..20
//   • require pricePerJob > 0
//   • require cred.verifier == verifier && _verifyCred(cred, msg.sender)
//   • require fp.overallBps >= MIN_QUALITY_BPS && _verifyFingerprint(fp, sampleRoots)
//   • emit SkillMinted

function updateSkill(uint256 skillId, uint256 pricePerJob, bool paused) external;
//   • owner-only, no re-mint needed for price/pause changes; sample refresh = new mint

// JOB
function postJob(uint256 skillId, StructuredBrief calldata brief) external payable returns (uint256 jobId);
//   • require msg.value == skill.pricePerJob
//   • require brief.briefSchemaVersion == 1
//   • require brief.briefRoot != 0
//   • require !skill.paused
//   • sybil gate: require block.timestamp - _firstSeen(msg.sender) >= MIN_CLIENT_WALLET_AGE_S
//     (in practice: tracked via first-call timestamp on a side mapping)
//   • require msg.sender != skill.owner

function submitWork(
    uint256 jobId,
    bytes32 outputRoot,
    uint16  qualityScore,
    bytes32 modelDigest,
    bytes   calldata attestationSig
) external;
//   • require skill.owner == msg.sender
//   • require status == Open && deadline not passed
//   • require qualityScore >= MIN_OUTPUT_QUALITY_BPS
//   • compute digest = keccak256(jobId, outputRoot, qualityScore, modelDigest)
//   • require ecrecover(digest, sig) == teeSigner
//   • set job state + emit WorkSubmitted

function acceptWork(uint256 jobId, PerDimRating calldata r) external;
//   • require client == msg.sender, status == Submitted
//   • require each r.* in 1..5
//   • _settle + update perDimReputation

function disputeWork(uint256 jobId, string calldata reason) external;
//   • client only, within DISPUTE_WINDOW
//   • v2: full refund (v3 = AI arbitrator per FUTURE.md #6)
//   • emit JobDisputed

function releaseAfterTimeout(uint256 jobId) external;
//   • anyone, after DISPUTE_WINDOW
//   • default rating (4,4,4,4) (median of "good")

function expireJob(uint256 jobId) external;
//   • anyone, after deadline if still Open → refund client

// VIEWS
function getSkill(uint256) external view returns (Skill memory);
function getJob(uint256) external view returns (Job memory);
function avgPerDim(uint256 skillId) external view returns (uint16 voice, uint16 complete, uint16 accuracy, uint16 structure); // bps
function totalSkills() external view returns (uint256);
function totalJobs() external view returns (uint256);
```

### 4.4 Verification helpers (internal)

```solidity
function _verifyCred(Credential calldata c, address wallet) internal view returns (bool) {
    // require c.verifier == verifier
    // require c.accountAgeDays >= 730  (2 years)
    // require c.mergedPRs >= 50
    // require c.codeReviewCount >= 20
    bytes32 d = keccak256(abi.encode(wallet, c.githubHandleHash, c.accountAgeDays,
                                     c.mergedPRs, c.codeReviewCount, c.verifiedAt));
    return _recover(d, c.sig) == verifier;
}

function _verifyFingerprint(SampleFingerprint calldata fp, bytes32[] calldata sampleRoots) internal view returns (bool) {
    bytes32 d = keccak256(abi.encode(sampleRoots, fp.vocabEntropyBps, fp.domainTermBps,
                                     fp.structuralBps, fp.specificityBps, fp.overallBps,
                                     fp.modelDigest));
    return _recover(d, fp.teeSig) == teeSigner;
}
```

### 4.5 Events

```solidity
event SkillMinted(uint256 indexed skillId, address indexed owner, bytes32 indexed githubHandleHash,
                  string language, uint16 fingerprintOverallBps, uint256 pricePerJob);
event SkillUpdated(uint256 indexed skillId, uint256 pricePerJob, bool paused);
event JobPosted(uint256 indexed jobId, uint256 indexed skillId, address indexed client,
                uint256 payment, bytes32 briefRoot, uint8 urgency);
event WorkSubmitted(uint256 indexed jobId, uint256 indexed skillId, bytes32 outputRoot,
                    uint16 qualityScore, bytes32 attestationDigest);
event JobAccepted(uint256 indexed jobId, uint256 indexed skillId, uint8 voice, uint8 complete,
                  uint8 accuracy, uint8 structure, uint256 paid);
event JobDisputed(uint256 indexed jobId, string reason);
event JobExpired(uint256 indexed jobId, uint256 refunded);
event JobReleased(uint256 indexed jobId, uint256 paid);   // releaseAfterTimeout
```

### 4.6 Sybil-resistance: client wallet age tracking

A side mapping `clientFirstSeen[address] = uint64 timestamp` is set on first `postJob` call. The check uses `block.timestamp - clientFirstSeen[msg.sender] >= MIN_CLIENT_WALLET_AGE_S`, but for a *new* client this is zero. So we use the **wallet's first on-chain transaction** as the anchor — which we cannot read from EVM. The workable v2 compromise: maintain a `clientFirstSeen` that is set on **first ever interaction with Kin**, and require a 7-day wait before the *first* job after that. This is a UX hit but prevents zero-cost sybils. v3 = check wallet age via L2 indexer attestation.

Alternative v2: require the client wallet to have ≥ N completed jobs as a *skill owner* OR a credential, OR ≥ a small staking deposit. The cleanest hackathon answer: **soft-gate** via the verifier — verified-GitHub wallets get instant access; un-verified wallets must wait 7 days OR stake 0.05 OG (refundable on first successful acceptance). Implement the staking variant; document the credential-fast-path in FUTURE.md.

---

## 5. Schemas (off-chain, but contract-enforced version)

### 5.1 Structured brief — JSON, encrypted to TEE pubkey, uploaded to 0G Storage

```json
{
  "briefSchemaVersion": 1,
  "repoUrl": "https://github.com/example/proj",        // optional, may be ""
  "commitOrPrUrl": "https://github.com/example/proj/pull/42",
  "language": "typescript",
  "diff": "<unified diff text, max 50KB>",
  "focus": ["correctness", "security", "perf"],         // 1+ from a fixed enum
  "context": "<optional 500-char context, e.g. 'this is the auth module'>",
  "knownConstraints": ["no dependency additions", "must support Node 18"],
  "expectedDeliverable": "inline-comment-style review with summary + 3-10 specific suggestions"
}
```

**Validation inside TEE** (before any compute spend): brief parses, required fields present, diff non-empty + parseable, `focus[]` subset of enum, total size < 60KB. If validation fails → TEE returns `{ "clarification": "<machine-readable description>" }` instead of charging. Client can repost with a fix.

### 5.2 Sample — JSON, encrypted to TEE pubkey, uploaded to 0G Storage

```json
{
  "sampleSchemaVersion": 1,
  "sourceUrl": "https://github.com/example/proj/pull/19#discussion_r123",
  "language": "rust",
  "diffSnippet": "<the lines reviewed>",
  "review": "<the actual review text the expert wrote>",
  "tags": ["correctness", "idiom"]
}
```

### 5.3 Fingerprint payload — produced by TEE evaluator

```json
{
  "sampleRoots": ["0x...","0x...","0x..."],
  "vocabEntropyBps": 7800,
  "domainTermBps": 8500,
  "structuralBps": 7100,
  "specificityBps": 9000,
  "overallBps": 8200,
  "modelDigest": "0x<keccak of evaluator model+version+config>",
  "teeSig": "0x<ecdsa over the above>"
}
```

The evaluator (running inside Sealed Inference) loads each sample, scores it on the four axes against a benchmark corpus baked into the evaluator prompt, weighted-averages with weights `[0.2, 0.4, 0.2, 0.2]`, and signs.

### 5.4 Output payload — produced inside TEE per job

```json
{
  "jobId": 17,
  "review": {
    "summary": "<5-10 sentences>",
    "suggestions": [
      { "loc": "src/auth.ts:42", "severity": "blocker|warn|nit", "issue": "...", "fix": "..." }
    ],
    "approvalRecommendation": "request_changes" // | "approve" | "comment_only"
  },
  "selfEval": {
    "voiceMatchBps": 8400,
    "completenessBps": 9100,
    "accuracyBps": 7800,
    "structureBps": 8800,
    "overallBps": 8525,
    "rationale": "<one-paragraph why these scores>"
  },
  "modelDigest": "0x..."
}
```

Output + selfEval are produced **in a single sealed inference call** so the operator never sees either independently.

### 5.5 Acceptance rubric — on-chain, four uint8 each in 1..5

Maps directly to `PerDimRating` struct. UI shows each as a slider with anchor descriptions.

---

## 6. Privacy model — what's protected, what's honestly not

The spec previously claimed "the operator's machine is essentially a relay … never holds plaintext." That is **not achievable** with 0G Sealed Inference as it actually exists. The 0G TEE runs an LLM and signs over the *response*; it does not run user code or hold per-user decryption keys. So we cannot literally ECDH-encrypt to the TEE and have the enclave decrypt before inference.

The honest v2 privacy model:

| Data | 0G Storage operators + public | Other skill owners | Other buyers | Skill owner (operator) | 0G TEE provider | Chain |
|---|---|---|---|---|---|---|
| Raw sample text | ciphertext only (AES-256-GCM, per-skill key) | ciphertext only | ciphertext only | plaintext (they uploaded it) | plaintext at inference time | only root hashes |
| Sample embeddings | ciphertext only | ciphertext only | ciphertext only | plaintext (own) | plaintext at inference time | only root hashes |
| Brief / diff | ciphertext only (ECDH to skill owner pubkey) | ciphertext only | ciphertext only | plaintext (necessary to run the review) | plaintext at inference time | only the root hash |
| Output review | ciphertext only (ECDH to client pubkey) | ciphertext only | ciphertext only | plaintext (they generated it) | plaintext at inference time | only the root hash + qualityScore + attestationDigest |

**What v2 actually delivers, accurately stated:**

1. **Storage privacy**: 0G Storage operators (and the public) cannot read any sample, embedding, brief, or output. Everything at rest is encrypted.
2. **Buyer-to-buyer isolation**: a client who posted job A cannot read the brief or output of job B (different ECDH key per payload).
3. **Skill-owner-to-skill-owner isolation**: skill owners cannot read each other's samples (per-skill AES keys, held client-side).
4. **Output integrity**: every submitted review carries a TEE attestation (0G's `ZG-Res-Key`) proving the LLM call ran inside an attested enclave, plus an on-chain `teeSigner`-signed digest over `(jobId, outputRoot, qualityScore, modelDigest)`.
5. **Identity verification**: skill owners must hold a verifier-signed `Credential` proving GitHub activity above the contract bar.

**What v2 does *not* deliver, stated honestly:**

- The skill owner (operator) sees the plaintext brief — they're the one running the LLM call. This is unavoidable: somebody has to decrypt the brief, pass it to the model, and read the output to encrypt it back. In v2 that somebody is the skill owner. In v3, when 0G ships a TEE primitive that runs user decryption code, this can move into the enclave.
- The 0G TEE provider sees plaintext at inference time (the LLM input + output). The TEE attestation guarantees the response came from a sealed enclave, not that the provider operating that enclave is blind.

This is **the genuine privacy story TEE+encrypted-storage delivers today**, and it is meaningfully stronger than every alternative AI-review marketplace, because all of them additionally leak to the platform operator. Kin shrinks the trusted surface to (a) the skill owner the buyer chose, and (b) the 0G TEE attestation. Both are auditable.

### 6.1 ECDH details

`teeSigner` in the contract is the address derived from the TEE-attestation relay's secp256k1 public key — it signs fingerprints and attestation digests on the contract's behalf. It is **not** the ECDH recipient for briefs/outputs.

Brief encryption (client → skill owner) and output encryption (skill owner → client) both use **wallet pubkeys** recovered from on-chain transactions (see `lib/pubkey.js`). The flow:

1. Sender extracts recipient's pubkey from one of recipient's prior txs (`pubkeyFromTx`).
2. Sender generates ephemeral keypair `(esk, epk)`.
3. Sender derives `shared = ECDH(esk, recipientPubkey)`.
4. AES-256 key = `HKDF-SHA256(shared, salt=epk, info="kin-v2-ecies", 32 bytes)`.
5. Sender encrypts payload with AES-GCM (12-byte IV, 16-byte tag).
6. Sender uploads `[epk(33) || iv(12) || tag(16) || ciphertext]` to 0G Storage.
7. Recipient downloads, computes `shared = ECDH(recipientPrivkey, epk)`, derives same AES key, decrypts.

Implementation: `lib/ecdh.js`. Pubkey recovery: `lib/pubkey.js`.

**Key rotation**: not needed for this scheme — keys are per-wallet, never rotated. If a wallet is compromised, the owner mints new skills under a new wallet. Stake/credential do not transfer.

---

## 7. Sample retrieval

In v1, all samples are passed as context. v2:

1. At **mint time**, the TEE evaluator produces a sentence-transformer embedding for each sample alongside the fingerprint. Both encrypted, uploaded, root hashes stored on-chain.
2. At **job time**, the TEE:
   - Decrypts brief, samples, and embeddings
   - Embeds the brief
   - Cosine-similarity ranks samples vs brief
   - Selects **top-K = 5** (or all if total ≤ 5)
   - Uses only those K as voice context for the review

Why this matters: junior posts a "review this auth flow" brief, the senior has 18 samples including 4 about auth — those 4 lead, the 14 unrelated ones drop. Output quality climbs sharply.

**Embedding model**: TBD on Day 13 — needs to be one we can run inside Sealed Inference. Default to whatever sentence-transformer is available on the 0G provider; fallback to text-similarity from the inference model itself via a "rank these samples by relevance to this brief" prompt. The latter is fast to build and acceptable for v2.

---

## 8. Quality gates — the GIGO defence at each layer

| Layer | Gate | Enforced by | Failure handling |
|---|---|---|---|
| Expert identity | GitHub OAuth + verifier signs Credential w/ activity bar | Verifier service (off-chain) + `_verifyCred` (on-chain) | Mint reverts |
| Sample quality | TEE fingerprint, overallBps ≥ 6000 | Sealed Inference evaluator + `_verifyFingerprint` (on-chain) | Mint reverts |
| Sample taxonomy | Fixed `language` enum, `description` ≤ 280 chars | Contract validation | Mint reverts |
| Brief validity | JSON schema, required fields, ≤ 60KB | TEE on first inference call | TEE returns `{clarification}`, job stays Open, client can `repostBrief(jobId, newRoot)` (added) within deadline |
| Retrieval | Top-K=5 most similar samples | TEE inference flow | Deterministic; no failure path |
| Output quality | TEE self-eval rubric, overallBps ≥ 7000 | Sealed Inference evaluator | Daemon retries up to 3× with temperature variation; if still failing, daemon logs + lets job expire to refund client |
| Submission attestation | ecrecover over (jobId, outputRoot, qualityScore, modelDigest) == teeSigner | On-chain in `submitWork` | submitWork reverts |
| Acceptance signal | 4-axis 1..5 rubric, all required | Contract validation | acceptWork reverts |
| Sybil | Client wallet 7d age OR 0.05 OG stake OR verified-GitHub fast-path | Contract validation | postJob reverts; UX shows the three options |
| Reputation | Per-axis sums + counts, aggregated as bps | Contract math | None |

That is ten gates. Every one of them is on-chain or TEE-signed. Garbage cannot slip through unattributed.

---

## 9. GitHub verifier service (off-chain)

Implementation: `verifier/server.js`. Two-call OAuth flow, in-memory ticket cache, plus an admin path for seeding demo personas.

**Endpoints:**

- `GET /health` → `{ ok: true }`
- `GET /verifier-pubkey` → `{ address }` so the frontend can sanity-check it matches `Kin.verifier()`
- `POST /verify/start` body `{ code, redirectUri }` → exchanges the OAuth code with GitHub, returns `{ ticket, login, claimMessage }`. `claimMessage` is the exact string the wallet must sign to prove control.
- `POST /verify/finish` body `{ ticket, wallet, walletSig }` → looks up the ticket (single-use, 10-min TTL), verifies `walletSig` recovers to `wallet`, fetches activity via GitHub API, builds + signs a `Credential`, returns `{ credential, activity }`.
- `POST /admin/issue` body `{ adminKey, wallet, login, accountAgeDays, mergedPRs, codeReviewCount }` → admin-gated issuance for demo personas. Bar still enforced.

**GitHub activity bar (v2 starting values, must match contract constants):**
- `accountAgeDays >= 730` (2 years)
- `mergedPRs >= 20`
- `codeReviewCount >= 10` (last 12 months, via `reviewed-by:{login} is:pr is:merged` search)

**Storage**: verifier holds zero PII at rest. Only `githubHandleHash = keccak256(login)` ever lands on-chain. Access tokens are dropped after the activity check. Tickets expire after 10 minutes and are deleted on first use.

**Security**: verifier signing key lives in `verifier/.env` (mode 600, generated by `scripts/setup_verifier.js`). If compromised, attacker can mint fake-credentialed skills — but contract still requires a TEE-signed `SampleFingerprint`, so they'd also need the `teeSigner` key. Two locks. Rotation = `setVerifier(newAddr)` (admin-only on Kin) + redeploy verifier with the new key. Old credentials remain valid (the contract just enforces match against whatever `verifier` is set to *at mint time*).

**Stub mode**: setting `STUB_MODE=1` mocks the GitHub API (returns a fake login + activity stats above the bar). Used in tests and for offline demo rehearsal.

---

## 10. Agent daemon (`scripts/agent.js`)

Runs on the skill owner's machine. Long-lived process. Per skill:

```
loop:
  events = await contract.queryFilter("JobPosted", lastBlock, "latest")
  for ev in events where ev.args.skillId in mySkills:
    job = await contract.getJob(ev.args.jobId)
    if job.status != Open: continue
    if alreadyHandled.has(job.id): continue
    alreadyHandled.add(job.id)
    runJob(job).catch(log)
  lastBlock = currentBlock
  sleep(POLL_INTERVAL)  // default 8s, can switch to websocket later
```

**`runJob(job)`** (the meat):

```
1. Fetch sealed brief, sealed samples (all roots), sealed embeddings.
2. Single sealed inference call:
     - decrypt-and-rank (top-K=5)
     - generate review
     - self-evaluate (rubric)
     - encrypt output review to buyer pubkey (registered on-chain or fetched via API)
   Returns: { encryptedOutput, qualityScore, modelDigest, attestationSig }
3. If qualityScore < MIN_OUTPUT_QUALITY_BPS:
     retry with higher temperature + "your last attempt was rejected" hint
     up to 3 attempts.
4. If still failing: log + skip. Job will expire and refund.
5. If passing:
     upload encryptedOutput → outputRoot
     submitWork(jobId, outputRoot, qualityScore, modelDigest, attestationSig)
6. Log to ./agent.log with structured fields.
```

**Run mode**: `node scripts/agent.js --skill-ids 0,1,3 --poll 8000`. systemd unit on the demo VPS so it survives restarts.

**Single-process safety**: file lock at `./agent.lock` prevents two daemons fighting over the same skill. Acquired on start.

---

## 11. Frontend changes

Existing pages (writing-themed) → repurposed for code review.

| Page | v1 state | v2 changes |
|---|---|---|
| `index.html` | "your AI earns money while you sleep" | copy stays; sub-tagline switches to "senior code review while you sleep"; persona grid shows real verified-GitHub experts |
| `onboard.html` | paste 3 writing samples | replaced flow: "Sign in with GitHub → we verify your review activity → paste your N best code reviews (with diff context) → sign mint tx"; sample upload screen lets user link to public PR review URLs and pulls the review text via verifier proxy |
| `marketplace.html` | one card | live list of all minted skills, sortable by `avgAccuracyBps` / price / `mergedPRs`; each card shows verified-GitHub badge + handle |
| `skill.html` | static | shows per-dimension reputation, fingerprint scores, sample count, recent job log (anonymised) |
| `job.html` | flat brief textarea | structured form matching the brief schema: repo URL, diff (paste or PR URL → fetched + cached), language, focus checkboxes, expected deliverable |
| `wallet.html` | balance | per-skill earnings breakdown, per-dimension reputation, withdraw → external wallet |
| (new) `verify.html` | — | GitHub OAuth redirect target; shows verifier result + "mint" CTA |

UI aesthetic (editorial / serif) stays. No reskin.

---

## 12. Demo populate plan (Day 14)

Goal: a marketplace that looks lived-in for the demo video.

**Personas (3 minimum, 5 ideal):**

| Persona | GitHub angle | Sample source | Language |
|---|---|---|---|
| You (Ridwan) | your real GitHub history | your past PR reviews on public repos | "any" or your strongest language |
| `tier1-rust-reviewer` | real OSS contributor (with consent) or curated demo persona | 8-10 reviews from major Rust OSS PRs | "rust" |
| `tier1-ts-reviewer` | same | 8-10 reviews from React/Vercel/Next.js public PRs | "typescript" |
| `tier1-sol-reviewer` | same | 8-10 reviews from OZ/Aave/Uniswap public PRs | "solidity" |
| `tier1-go-reviewer` | same | optional, 5th if time | "go" |

For demo personas where we don't have real engineers: `AI_USAGE.md` labels them explicitly as curated demo data sourced from public PR comments, attributed to original authors via the `sourceUrl` field in each sample, and clearly marked "demo skill" in the UI badge. We do not claim these are autonomous real engineers — we claim they demonstrate what the marketplace would look like populated.

**Jobs (10+ across the spread):**
- 3 jobs to your skill, 2 different clients, 1 dispute (resolved happy), 1 timeout (auto-release)
- 2 jobs to each Tier-1 skill
- 1 cross-skill: same diff sent to two different reviewers, judge can compare outputs

**Client wallets**: 3 funded `demo-client-{1,2,3}.json`. Each gets the 7-day age via the staking fast-path (deposit 0.05 OG once, refunded on first acceptance). Documented as demo flow.

---

## 13. Test plan (Hardhat / Foundry)

Tests we MUST have by Day 13 end:

**Contract (~40 tests):**
- mintSkill: happy path, missing fields, bad sample count, fingerprint below threshold, bad cred sig, bad fp sig, language out of enum, paused skill not postable, sample/embed length mismatch
- postJob: happy path, wrong price, paused skill, owner = client revert, sybil gate (waited / staked / verified fast-path), brief schema version wrong, deadline computed correctly
- submitWork: happy path with valid teeSig, wrong skill owner, deadline passed, quality below threshold, bad sig, replay rejected
- acceptWork: happy path updates per-dim rep correctly, bad rating range, wrong client, non-Submitted state
- disputeWork: client refund within window, after window reverts, only client can call
- releaseAfterTimeout: any caller, only after window, default rating 4/4/4/4
- expireJob: refunds correctly, only after deadline, only if Open
- views: avgPerDim math, totalSkills, totalJobs
- reentrancy: payment paths use call+success or pull pattern
- gas: each external < some sane bound (sanity, not strict)

**Verifier service (~10 tests):**
- valid GitHub user passes bar → returns credential
- user below bar → rejection with structured reason
- wallet message verification (correct/incorrect signer)
- credential signature matches recovered address
- handle hash matches keccak(login)

**Lib (~10 tests):**
- ECDH encrypt → TEE decrypt round trip
- sample fingerprint reproducibility (same input + same model digest → same scores)
- top-K retrieval deterministic
- output evaluator rubric stays within bounds

Total target: ~60 tests, all green by Day 15.

---

## 14. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 0G Sealed Inference can't run our evaluator prompts reliably | M | H | Day 13 spike: stand up evaluator first, validate fingerprint stability across N runs; if unstable, fall back to inference-model self-eval (single call) instead of a separate evaluator |
| Embedding model not available inside Sealed Inference | M | M | Fallback: rank-by-prompt ("score relevance of these samples to this brief 0-100"), one extra inference call per job |
| GitHub API rate limits during demo populate | L | M | Use authed token (5000/hr), cache results; if hit, pause and resume |
| TEE signing key rotation during hackathon window | L | H | Hard-code current key on Day 12; if 0G rotates, redeploy contract (we are pre-launch, no real users) |
| Verifier centralisation called out by judges | M | L | Already documented; v3 plan = EAS-based multi-verifier; the hackathon judges' rubric prefers shipped+honest over un-shipped+decentralised |
| Time slip on Day 12 contract refactor | M | H | Cut: drop `disputeWork` v2 changes, keep v1 behaviour for that one function only; everything else must ship |
| Time slip on Day 13 retrieval | M | M | Cut: ship without embeddings, use rank-by-prompt only; v3 = real embeddings |
| Time slip on Day 14 daemon | L | H | Cut: keep `scripts/e2e_job.js` as a fallback "manual run" demo path; daemon becomes a v2.1 ship-after-submission |
| Sample provenance for non-you personas raises ethics flags | L | M | Use only PR comments authored by accounts with public profiles, attribute every sample via `sourceUrl`, label personas as "curated demo" in UI |
| 7-day client age gate makes demo unfilmable | H | M | Use the staking fast-path for demo clients (mint a tx, get refunded); document in AI_USAGE |
| GIGO test passes by luck (one good model run) | M | M | Run fingerprint + output evaluator 3× on Day 14 sample set, take the median; document variance in AI_USAGE |

---

## 15. v3 deferred (lives in updated `FUTURE.md`)

- Capability mesh / composite jobs / pipelines
- Multi-vertical expansion (legal, medical, finance, design)
- Federated / pooled skills (multiple sample contributors, prorata payout)
- Real ERC-7857 oracle re-encryption on transfer
- LoRA fine-tuning loaded into Sealed Inference (waits on 0G)
- OpenClaw runtime as the agent
- Decentralised verifier set (EAS schema)
- AI arbitrator for disputes (Verdikt-style)
- Subscription pricing, batch packs
- Mobile UI redesign

---

## 16. Open questions for user before code starts

1. **Vertical confirm**: code review (not legal). Confirm.
2. **Recruit real senior engineers for the 2–4 non-you demo personas, or use curated public PR reviews attributed to original authors and labelled "demo skill"?** Recommendation: curated demo data — recruit-path eats budget we don't have.
3. **Verifier bar tuning starting values**: `accountAgeDays >= 730`, `mergedPRs >= 50`, `codeReviewCount >= 20`. Confirm or override.
4. **Sybil mechanism**: stake 0.05 OG OR verified-GitHub fast-path OR 7-day wait. Recommendation: ship all three, client picks. Confirm.
5. **Top-K retrieval**: K=5 (or all if ≤5). Confirm.
6. **Output quality threshold**: 7000 bps (0.70). Confirm or tune.
7. **Sample minimum**: 3 (v1 also). Confirm.
8. **Sample maximum**: 20 (v1 was 20). Confirm or raise.
9. **Languages enum**: `["any","javascript","typescript","python","rust","go","solidity","java","c","cpp"]`. Add / remove?
10. **Deploy v2 to a fresh contract address?** Recommendation: yes — clean redeploy, breaks v1 jobs (we have one demo job on v1, throwaway). Confirm.

Once 1–10 are locked I move to Day 12 work: contract refactor + verifier service in parallel.
