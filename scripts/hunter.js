// Hunt autonomous hunter daemon.
//
// Long-lived process run by a hunter operator. Watches `BountyPosted` events on Hunt,
// then for each new bounty (where this operator owns at least one minted Hunter):
//   1. recovers the poster's pubkey from the BountyPosted tx (kept for v2 — see below)
//   2. downloads + symmetric-decrypts the encrypted code blob using the shared hunter-
//      network key
//   3. downloads + AES-decrypts the hunter's samples + per-sample embeddings
//   4. runs top-K retrieval over the samples vs the brief
//   5. builds a briefSchemaVersion-2 audit brief from on-chain bounty fields + decrypted
//      code, then calls Sealed Inference (review + self-eval in one shot)
//   6. retries on LLM throw OR self-eval miss, MAX_RETRIES with MIN_OUTPUT_QUALITY_BPS
//   7. picks the best in-scope finding (highest severity, then array order)
//   8. encrypts the finding to the bounty poster's pubkey, uploads to 0G Storage
//   9. signs the finding attestation (lib/credential.signFindingAttestation)
//  10. calls submitFinding on Hunt — race-deadline-aware (skips if race over)
//
// ── Encryption model (v1) ───────────────────────────────────────────────────
// The bounty's encrypted code blob is sealed with a *shared symmetric key* known to all
// registered hunters in the network. The key lives in env `HUNTER_NETWORK_KEY` (hex) or
// on disk at `.hunter-network-key.bin` (32 raw bytes). The poster also holds this key
// and encrypts before uploading.
//   v1: one symmetric key for the whole hunter network. Simple, gets the race off the
//       ground, but any hunter leaks → poster's code is exposed to the world.
//   v2: per-hunter ECDH envelope — the Bounty struct grows a `keyEnvelopes` mapping that
//       wraps the per-bounty content key to each subscribed hunter's pubkey. Then code
//       leakage is bounded to one hunter at a time and revocable via re-mint.
// ────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import fs from "node:fs/promises";
import { ethers } from "ethers";

import {
  uploadRaw,
  downloadRaw,
  downloadEncryptedRecord,
  decrypt,
} from "../lib/storage.js";
import { encryptToPubkey } from "../lib/ecdh.js";
import { pubkeyFromTx } from "../lib/pubkey.js";
import { bufferToEmbed } from "../lib/embedding.js";
import { topK } from "../lib/retrieval.js";
import { generateReview } from "../lib/review.js";
import { signFindingAttestation } from "../lib/credential.js";
import {
  CANONICAL_CWES,
  cweToBytes32,
  bytes32ToCwe,
  severityToUint,
} from "../lib/cwe.js";
import { localAuditFallback } from "../lib/audit-fallback.js";

// MIN_OUTPUT_QUALITY_BPS mirrors Hunt.sol's MIN_FINDING_QUALITY_BPS (6000). Verified by
// reading contracts/Hunt.sol — if that constant changes, change this too or the daemon
// will keep submitting findings the contract rejects.
const MIN_OUTPUT_QUALITY_BPS = 6000;
// 0G's inference endpoint has bursty transport flakiness ("fetch failed"); a
// thin retry budget forces too many races onto the heuristic fallback.
const MAX_RETRIES = 6;
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

// ─── Helpers ───────────────────────────────────────────────────────────────

/// Decode on-chain inScopeCwes (bytes32[]) back to canonical kebab-case strings using
/// CANONICAL_CWES. Unknown hashes pass through as the raw hex (so the brief still tells
/// the model the poster cares about *something*, even if the registry is out of date).
function decodeInScopeCwes(inScopeBytes32) {
  if (!inScopeBytes32 || inScopeBytes32.length === 0) return [];
  return inScopeBytes32.map((h) => bytes32ToCwe(h) || h);
}

/// Best-effort split of the decrypted code blob into { path: source } entries. The blob
/// may be JSON ({ files: { "Vault.sol": "..." } }) or just a raw .sol string. v2 of the
/// poster CLI will standardise on the JSON shape; this handles both.
function extractContractsInScope(codeBuffer) {
  const text = codeBuffer.toString("utf8");
  try {
    const obj = JSON.parse(text);
    if (obj && obj.files && typeof obj.files === "object")
      return Object.keys(obj.files);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      // {"<path>": "<source>", ...} shape
      const keys = Object.keys(obj).filter((k) => /\.sol$/i.test(k));
      if (keys.length > 0) return keys;
    }
  } catch {}
  return ["Code.sol"];
}

/// Pick the highest-severity in-scope finding. Ties broken by array index (stable).
/// Returns { finding, index } or null if no finding survives the scope filter.
export function pickBestFinding(findings, inScopeCweStrings) {
  if (!findings || findings.length === 0) return null;
  const scope = new Set(inScopeCweStrings);
  const eligible = findings
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => scope.size === 0 || scope.has(f.cweClass));
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const sa = SEVERITY_RANK[a.f.severity] || 0;
    const sb = SEVERITY_RANK[b.f.severity] || 0;
    if (sa !== sb) return sb - sa;
    return a.i - b.i;
  });
  return { finding: eligible[0].f, index: eligible[0].i };
}

/// Load the shared hunter-network symmetric key from env or disk. Returns null if absent
/// (caller should warn + skip; we do not crash the whole daemon over one bounty).
async function loadHunterNetworkKey({ envHex, filePath }) {
  if (envHex) {
    const hex = envHex.startsWith("0x") ? envHex.slice(2) : envHex;
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== 32)
      throw new Error(
        `HUNTER_NETWORK_KEY wrong length: ${buf.length} (want 32)`,
      );
    return buf;
  }
  try {
    const buf = await fs.readFile(filePath);
    if (buf.length !== 32)
      throw new Error(`${filePath} wrong length: ${buf.length} (want 32)`);
    return buf;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

// ─── Pure-ish bounty handler (injected deps → unit testable) ───────────────

/// Process a single BountyPosted event. All external dependencies are injected so this
/// can run in tests with mocked storage + mock LLM, or in production against 0G mainnet.
///
/// Args:
///   hunt             — ethers.Contract bound to the operator wallet
///   provider         — ethers.Provider for tx lookup
///   operator         — ethers.Wallet of the hunter owner (signs txs)
///   teeSigner        — ethers.Wallet whose address matches Hunt.teeSigner()
///   sampleKey        — Buffer, 32-byte AES key for THIS hunter's samples/embeddings
///   networkKey       — Buffer, 32-byte shared symmetric key for bounty-code decryption
///   storage          — { downloadRaw, downloadEncryptedRecord, uploadRaw }
///   invokeLLM        — async ({ system, user, maxTokens }) → { answer, model, attestationId, valid }
///   hunter           — the Hunter struct (from Hunt.getHunter)
///   hunterId         — bigint
///   bounty           — the Bounty struct (from Hunt.getBounty)
///   bountyId         — bigint
///   evtTxHash        — txHash of the BountyPosted event (used to recover poster pubkey)
///   logger           — function(string), defaults to console.log
///
/// Returns { ok: true, txHash, findingRoot, cweClass, severity, attempts } on success,
///         { ok: false, reason, ... } on quality-gate / scope / race / LLM failure.
export async function processBounty({
  hunt,
  provider,
  operator,
  teeSigner,
  sampleKey,
  networkKey,
  storage,
  invokeLLM,
  hunter,
  hunterId,
  bounty,
  bountyId,
  evtTxHash,
  logger = console.log,
  // Optional: kebab-case CWE strings the hunter operator claims as their specialty.
  // When set, narrows brief.focus and the submit-side scope filter to
  // bounty.inScopeCwes ∩ hunterSpecialtyCwes — the protocol's design intent: specialists
  // hunt within their class. Omit to preserve legacy "submit any in-scope finding" behaviour.
  hunterSpecialtyCwes = null,
}) {
  logger(`[bounty ${bountyId}] start`);

  // Race-deadline early-out: don't bother downloading anything if we're already late.
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec > bounty.raceDeadline) {
    logger(`[bounty ${bountyId}] race over, skipping`);
    return { ok: false, reason: "race-over" };
  }

  // 1. Poster pubkey from the BountyPosted tx (needed for finding-payload encryption).
  const posterPubkey = await pubkeyFromTx(provider, evtTxHash);

  // 2. Download + symmetric-decrypt the bounty code blob (shared hunter-network key).
  const codeBlob = await storage.downloadRaw(bounty.codeRoot);
  const codeBuf = decrypt(codeBlob, networkKey);
  logger(`[bounty ${bountyId}] decrypted code (${codeBuf.length} bytes)`);

  // 3. Download + AES-decrypt this hunter's samples + embeddings (in parallel).
  const sampleRoots = hunter.sampleRoots;
  const embedRoots = hunter.embedRoots;
  const [samples, embeddings] = await Promise.all([
    Promise.all(
      sampleRoots.map((r) =>
        storage
          .downloadEncryptedRecord(r, sampleKey)
          .then((b) => b.toString("utf8")),
      ),
    ),
    Promise.all(
      embedRoots.map((r) =>
        storage
          .downloadEncryptedRecord(r, sampleKey)
          .then((b) => bufferToEmbed(b)),
      ),
    ),
  ]);

  // 4. Top-K against the decrypted code text.
  const candidates = samples.map((text, i) => ({
    text,
    embedding: embeddings[i],
  }));
  const codeText = codeBuf.toString("utf8");
  const top = topK(candidates, codeText, 5);
  const sampleTexts = top.map((t) => t.sample.text);
  logger(
    `[bounty ${bountyId}] top-${top.length} retrieved (scores: ${top.map((t) => t.score.toFixed(2)).join(",")})`,
  );

  // 5. Build the audit brief from on-chain fields + decrypted code.
  const inScopeCweStrings = decodeInScopeCwes(bounty.inScopeCwes);
  // effectiveScope = bounty.inScopeCwes ∩ hunter specialty. Specialists only hunt within
  // their class — both for the LLM brief (so it focuses) and for the submit-side filter
  // (so off-class findings are never submitted even if the LLM volunteers them).
  let effectiveScope = inScopeCweStrings;
  if (hunterSpecialtyCwes && hunterSpecialtyCwes.length) {
    effectiveScope = inScopeCweStrings.filter((c) =>
      hunterSpecialtyCwes.includes(c),
    );
    if (!effectiveScope.length) {
      logger(
        `[bounty ${bountyId}] hunter specialty ${hunterSpecialtyCwes.join(",")} has no overlap with bounty scope ${inScopeCweStrings.join(",")}; skipping`,
      );
      return { ok: false, reason: "specialty-out-of-scope" };
    }
  }
  const brief = {
    briefSchemaVersion: 2,
    chain: "0g-aristotle",
    language: "solidity",
    contractsInScope: extractContractsInScope(codeBuf),
    focus: effectiveScope.length ? effectiveScope : CANONICAL_CWES.slice(),
    diff: codeText,
    context: `Hunt bounty #${bountyId} posted by ${bounty.poster}. raceDeadline=${bounty.raceDeadline}.`,
  };

  // 6. Generate review, retry on quality gate failure OR LLM parse/transport error.
  // 0G Sealed Inference occasionally returns empty bodies; treat that the same as a
  // quality miss — retry up to MAX_RETRIES before giving up.
  let reviewResult;
  let attempts = 0;
  let lastError = null;
  for (attempts = 1; attempts <= MAX_RETRIES; attempts++) {
    // Linear backoff before retries to space out bursty "fetch failed"
    // transport errors from 0G's inference endpoint.
    if (attempts > 1)
      await new Promise((r) => setTimeout(r, 1500 * (attempts - 1)));
    try {
      reviewResult = await generateReview({
        invokeLLM,
        samples: sampleTexts,
        brief,
      });
    } catch (e) {
      lastError = e;
      logger(
        `[bounty ${bountyId}] attempt ${attempts} LLM error: ${e.message?.slice(0, 120)}, retrying`,
      );
      continue;
    }
    if (reviewResult.selfEval.overallBps >= MIN_OUTPUT_QUALITY_BPS) break;
    logger(
      `[bounty ${bountyId}] attempt ${attempts} qualityScore ${reviewResult.selfEval.overallBps} below ${MIN_OUTPUT_QUALITY_BPS}, retrying`,
    );
  }
  if (!reviewResult) {
    logger(
      `[bounty ${bountyId}] LLM failed ${MAX_RETRIES}x — falling back to local audit heuristic (lib/audit-fallback.js); last LLM error: ${lastError?.message?.slice(0, 120)}`,
    );
    // Parse the decrypted code blob into {path: source} the same way extractContractsInScope does
    let codeFiles;
    try {
      const obj = JSON.parse(codeBuf.toString("utf8"));
      if (obj && obj.files) codeFiles = obj.files;
      else if (obj && typeof obj === "object" && !Array.isArray(obj))
        codeFiles = obj;
      else codeFiles = { "Code.sol": codeBuf.toString("utf8") };
    } catch {
      codeFiles = { "Code.sol": codeBuf.toString("utf8") };
    }
    reviewResult = localAuditFallback({
      codeFiles,
      specialty: hunter.specialty,
      inScopeCweStrings,
    });
    logger(
      `[bounty ${bountyId}] local fallback: ${reviewResult.findings.length} findings, overall ${reviewResult.selfEval.overallBps}bps, model=${reviewResult.modelName}`,
    );
  }
  if (reviewResult.selfEval.overallBps < MIN_OUTPUT_QUALITY_BPS) {
    logger(
      `[bounty ${bountyId}] gave up after ${MAX_RETRIES} attempts; letting bounty race elapse`,
    );
    return { ok: false, reason: "quality-gate", attempts };
  }
  logger(
    `[bounty ${bountyId}] passed quality gate at attempt ${attempts}, overall ${reviewResult.selfEval.overallBps}bps; generated ${reviewResult.findings.length} findings`,
  );

  // 7. Pick the best in-scope finding to submit (effectiveScope = bounty.inScopeCwes ∩
  // hunterSpecialtyCwes when the hunter is a specialist; bounty.inScopeCwes otherwise).
  const best = pickBestFinding(reviewResult.findings, effectiveScope);
  if (!best) {
    logger(
      `[bounty ${bountyId}] no in-scope findings (had ${reviewResult.findings.length}); skipping`,
    );
    return { ok: false, reason: "no-in-scope-finding", attempts };
  }
  logger(
    `[bounty ${bountyId}] generated ${reviewResult.findings.length} findings; best = ${best.finding.cweClass}/${best.finding.severity}`,
  );

  // cweToBytes32 throws on unknown classes — surface that explicitly rather than
  // submitting a bytes32 the contract will reject.
  let cweClassBytes32;
  try {
    cweClassBytes32 = cweToBytes32(best.finding.cweClass);
  } catch (e) {
    logger(
      `[bounty ${bountyId}] unknown CWE class from model: ${best.finding.cweClass}; skipping`,
    );
    return { ok: false, reason: "unknown-cwe", attempts };
  }
  const severityUint = severityToUint(best.finding.severity);

  // 8. Encrypt the chosen finding to the poster's pubkey + upload to 0G Storage.
  const findingJson = JSON.stringify({
    bountyId: bountyId.toString(),
    hunterId: hunterId.toString(),
    finding: best.finding,
    selfEval: reviewResult.selfEval,
    modelName: reviewResult.modelName,
    modelDigest: reviewResult.modelDigest,
    attestationId: reviewResult.attestationId,
  });
  const encryptedFinding = encryptToPubkey(findingJson, posterPubkey);
  const { rootHash: findingRoot } = await storage.uploadRaw(
    encryptedFinding,
    operator,
  );
  logger(`[bounty ${bountyId}] finding uploaded: ${findingRoot.slice(0, 18)}…`);

  // 9. Sign the attestation. v1 uses the latest block timestamp as teeTimestamp — must be
  // inside [postedAt, raceDeadline] per the contract. v2 = the real ZG-Res-Key timestamp
  // surfaced by 0G's Sealed Inference response once they expose it.
  const latestBlock = await provider.getBlock("latest");
  const teeTimestamp = BigInt(latestBlock.timestamp);
  if (teeTimestamp < bounty.postedAt || teeTimestamp > bounty.raceDeadline) {
    logger(
      `[bounty ${bountyId}] teeTimestamp ${teeTimestamp} outside [${bounty.postedAt},${bounty.raceDeadline}]; skipping`,
    );
    return { ok: false, reason: "tee-timestamp-window", attempts };
  }

  const attestParams = {
    bountyId,
    codeRoot: bounty.codeRoot,
    hunterId,
    cweClass: cweClassBytes32,
    severity: severityUint,
    findingRoot,
    modelDigest: reviewResult.modelDigest,
    teeTimestamp,
    severityCalibrationBps: reviewResult.selfEval.severityCalibrationBps,
    precisionBps: reviewResult.selfEval.precisionBps,
    coverageBps: reviewResult.selfEval.coverageBps,
    exploitabilityBps: reviewResult.selfEval.exploitabilityBps,
  };
  const { sig: attestationSig } = await signFindingAttestation(
    teeSigner,
    attestParams,
  );

  // Final race check — guard against losing the race while the LLM was working.
  const nowSec2 = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec2 > bounty.raceDeadline) {
    logger(`[bounty ${bountyId}] race over, skipping`);
    return { ok: false, reason: "race-over", attempts };
  }

  // 10. submitFinding — pack into the FindingInput calldata struct.
  const findingInput = {
    cweClass: cweClassBytes32,
    severity: severityUint,
    findingRoot,
    severityCalibrationBps: reviewResult.selfEval.severityCalibrationBps,
    precisionBps: reviewResult.selfEval.precisionBps,
    coverageBps: reviewResult.selfEval.coverageBps,
    exploitabilityBps: reviewResult.selfEval.exploitabilityBps,
    modelDigest: reviewResult.modelDigest,
    teeTimestamp,
    attestationSig,
  };
  const tx = await hunt.submitFinding(bountyId, hunterId, findingInput);
  const rcpt = await tx.wait();
  logger(
    `[bounty ${bountyId}] submitted finding idx ${best.index} tx ${tx.hash} block ${rcpt.blockNumber}`,
  );

  return {
    ok: true,
    txHash: tx.hash,
    findingRoot,
    cweClass: best.finding.cweClass,
    severity: best.finding.severity,
    attempts,
  };
}

// ─── Watch loop ─────────────────────────────────────────────────────────────

async function main() {
  const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
  const PK = process.env.PRIVATE_KEY;
  const TEE_SIGNER_PK = process.env.TEE_SIGNER_PRIVATE_KEY;
  const HUNTER_IDS = (process.env.HUNTER_IDS || "")
    .split(",")
    .filter(Boolean)
    .map((s) => BigInt(s.trim()));
  const POLL_MS = Number(process.env.POLL_MS || 8000);
  const SAMPLE_KEY_PATH = process.env.SAMPLE_KEY_PATH || ".user-key.bin";
  const NETWORK_KEY_PATH =
    process.env.HUNTER_NETWORK_KEY_PATH || ".hunter-network-key.bin";

  if (!PK) {
    console.error("PRIVATE_KEY required");
    process.exit(1);
  }
  if (!TEE_SIGNER_PK) {
    console.error("TEE_SIGNER_PRIVATE_KEY required");
    process.exit(1);
  }
  if (HUNTER_IDS.length === 0) {
    console.error("HUNTER_IDS required (comma-separated)");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const operator = new ethers.Wallet(PK, provider);
  const teeSigner = new ethers.Wallet(TEE_SIGNER_PK);
  const sampleKey = await fs.readFile(SAMPLE_KEY_PATH);
  const networkKey = await loadHunterNetworkKey({
    envHex: process.env.HUNTER_NETWORK_KEY,
    filePath: NETWORK_KEY_PATH,
  });
  if (!networkKey) {
    console.warn(
      `[hunter] no HUNTER_NETWORK_KEY env or ${NETWORK_KEY_PATH} file; bounties will be skipped`,
    );
  }

  const artifact = JSON.parse(
    await fs.readFile("deployments/Hunt.json", "utf8"),
  );
  const hunt = new ethers.Contract(artifact.address, artifact.abi, operator);

  console.log(`[hunter] operator     ${operator.address}`);
  console.log(`[hunter] teeSigner    ${teeSigner.address}`);
  console.log(`[hunter] hunt         ${artifact.address}`);
  console.log(`[hunter] hunter ids   ${HUNTER_IDS.join(",")}`);
  console.log(`[hunter] poll every   ${POLL_MS}ms`);

  // Verify ownership + cache hunter metadata.
  const huntersCache = new Map();
  for (const id of HUNTER_IDS) {
    const h = await hunt.getHunter(id);
    if (h.owner.toLowerCase() !== operator.address.toLowerCase()) {
      console.error(
        `[hunter] hunter ${id} owned by ${h.owner}, not us — skipping`,
      );
      continue;
    }
    if (
      (await hunt.teeSigner()).toLowerCase() !== teeSigner.address.toLowerCase()
    ) {
      console.error(
        `[hunter] TEE_SIGNER_PRIVATE_KEY address ${teeSigner.address} != on-chain ${await hunt.teeSigner()}`,
      );
      process.exit(1);
    }
    huntersCache.set(id, h);
    console.log(`[hunter] tracking hunter #${id} | specialty "${h.specialty}"`);
  }
  if (huntersCache.size === 0) {
    console.error("[hunter] no owned hunters, exiting");
    process.exit(1);
  }

  // Lazy-load inference SDK (its broken ESM re-exports trip test-loaders, runtime is fine)
  const { getBroker, sealedQuery } = await import("../lib/inference.js");
  const { createZGComputeNetworkBroker } =
    await import("@0gfoundation/0g-compute-ts-sdk");
  const tmp = await createZGComputeNetworkBroker(operator);
  const services = await tmp.inference.listService();
  const providerAddr = services[0]?.provider;
  if (!providerAddr) {
    console.error("[hunter] no inference providers found");
    process.exit(1);
  }
  const broker = await getBroker(operator, providerAddr);
  const invokeLLM = ({ system, user, maxTokens }) =>
    sealedQuery({
      broker,
      providerAddress: providerAddr,
      system,
      question: user,
      contextBlocks: [],
      maxTokens,
    });

  const storage = { downloadRaw, downloadEncryptedRecord, uploadRaw };

  // Acquire a simple file lock so two daemons can't fight over the same hunters.
  const lockPath = "./hunter.lock";
  try {
    await fs.writeFile(lockPath, String(process.pid), { flag: "wx" });
  } catch {
    console.error(
      `[hunter] another daemon already running (lockfile ${lockPath} exists). exit.`,
    );
    process.exit(1);
  }
  process.on("exit", () => {
    try {
      fs.unlink(lockPath);
    } catch {}
  });
  process.on("SIGINT", () => {
    try {
      fs.unlink(lockPath);
    } catch {}
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    try {
      fs.unlink(lockPath);
    } catch {}
    process.exit(0);
  });

  // Pick the first cached hunter as the active racer. v2 = race all owned hunters in
  // parallel (one per specialty) — for now, single-hunter-per-daemon keeps the lock
  // semantics simple.
  const activeHunterId = HUNTER_IDS.find((id) => huntersCache.has(id));
  const activeHunter = huntersCache.get(activeHunterId);

  // Drain-at-startup: replay any BountyPosted events from recent history that we missed
  // while the daemon was down. Same pattern as the Kin v2 agent, but with a window so we
  // don't iterate the entire chain.
  const startBlock = await provider.getBlockNumber();
  const DRAIN_LOOKBACK = Number(process.env.DRAIN_LOOKBACK || 5000);
  let lastBlock = Math.max(0, startBlock - DRAIN_LOOKBACK);
  console.log(`[hunter] draining from block ${lastBlock} to ${startBlock}`);
  const handled = new Set();

  while (true) {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock > lastBlock) {
        const filter = hunt.filters.BountyPosted();
        const events = await hunt.queryFilter(
          filter,
          lastBlock + 1,
          currentBlock,
        );
        for (const evt of events) {
          const bountyId = evt.args.bountyId;
          if (handled.has(bountyId.toString())) continue;
          handled.add(bountyId.toString());

          if (!networkKey) {
            console.warn(
              `[bounty ${bountyId}] no network key loaded; skipping`,
            );
            continue;
          }

          processBounty({
            hunt,
            provider,
            operator,
            teeSigner,
            sampleKey,
            networkKey,
            storage,
            invokeLLM,
            hunter: activeHunter,
            hunterId: activeHunterId,
            bounty: await hunt.getBounty(bountyId),
            bountyId,
            evtTxHash: evt.transactionHash,
          }).catch((e) =>
            console.error(`[bounty ${bountyId}] failed:`, e.message),
          );
        }
        lastBlock = currentBlock;
      }
    } catch (e) {
      console.error("[hunter] poll error:", e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (
  import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
