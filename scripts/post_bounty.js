// scripts/post_bounty.js — protocol-side CLI to post a sealed bounty to Hunt.
//
// Wraps a single .sol file as JSON {files: {"<basename>": "<source>"}}, encrypts
// it with the shared hunter-network symmetric key (loaded from / generated at
// .hunter-network-key.bin), uploads to 0G Storage, then calls postBounty on the
// Hunt contract escrowing the payout.
//
// Usage:
//   PRIVATE_KEY=0x... node scripts/post_bounty.js \
//     [--file audits/chartchain/MedicalRecordsVault.sol] \
//     [--payout 0.05] \
//     [--race-duration 600] \
//     [--cwes swc-107-reentrancy,oracle-manipulation,access-control]
//
// Default target is ChartChain's live mainnet contract source (cross-pollination
// audit against another 0G project). Pass --file demo/staged-bounty/Vault.sol to
// re-run the staged oracle-staleness demo instead.
//
// Env:
//   PRIVATE_KEY  — protocol poster wallet (same funder is fine for the demo)
//   ZG_RPC_URL   — optional, defaults to https://evmrpc.0g.ai
//
// The script DOES NOT mint hunters, settle bounties, or call any other Hunt
// method. It just escrows the payout and surfaces the bountyId.

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ethers } from "ethers";

import { uploadRaw, encrypt } from "../lib/storage.js";
import { cweToBytes32 } from "../lib/cwe.js";

const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("PRIVATE_KEY missing");
  process.exit(1);
}

// ─── Arg parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    file: "audits/chartchain/MedicalRecordsVault.sol",
    payout: "0.05",
    raceDuration: 600,
    cwes: "swc-107-reentrancy,oracle-manipulation,access-control,swc-101-int-overflow,storage-collision",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--payout") out.payout = argv[++i];
    else if (a === "--race-duration") out.raceDuration = Number(argv[++i]);
    else if (a === "--cwes") out.cwes = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.error(
        "usage: node scripts/post_bounty.js [--file path.sol] [--payout 0.05] [--race-duration 600] [--cwes a,b,c]",
      );
      process.exit(2);
    } else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// ─── Network key (shared hunter-network symmetric key) ──────────────────

const NETWORK_KEY_PATH =
  process.env.HUNTER_NETWORK_KEY_PATH || ".hunter-network-key.bin";

async function loadOrGenerateNetworkKey(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    if (buf.length !== 32)
      throw new Error(`${filePath} wrong length: ${buf.length} (want 32)`);
    console.error(`[post_bounty] using existing network key at ${filePath}`);
    return buf;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const buf = crypto.randomBytes(32);
    await fs.writeFile(filePath, buf, { mode: 0o600 });
    console.error(
      `[post_bounty] generated new network key at ${filePath} (mode 0o600).`,
    );
    console.error(
      "[post_bounty] SHARE THIS FILE with every hunter daemon — they cannot",
    );
    console.error(
      "[post_bounty] decrypt the bounty code without it. Out-of-band channel only.",
    );
    return buf;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(RPC_URL);
const poster = new ethers.Wallet(PK, provider);

const artifact = JSON.parse(await fs.readFile("deployments/Hunt.json", "utf8"));
const hunt = new ethers.Contract(artifact.address, artifact.abi, poster);

console.log(`Hunt:      ${artifact.address}`);
console.log(`poster:    ${poster.address}`);
console.log(`rpc:       ${RPC_URL}`);
console.log(`file:      ${args.file}`);
console.log(`payout:    ${args.payout} OG`);
console.log(
  `race:      ${args.raceDuration}s (${(args.raceDuration / 60).toFixed(1)}m)`,
);
console.log(`cwes:      ${args.cwes}`);

// Validate race-duration against on-chain bounds before doing any storage work.
const [minRace, maxRace] = await Promise.all([
  hunt.MIN_RACE_DURATION(),
  hunt.MAX_RACE_DURATION(),
]);
if (
  BigInt(args.raceDuration) < minRace ||
  BigInt(args.raceDuration) > maxRace
) {
  console.error(
    `race duration ${args.raceDuration}s outside [${minRace},${maxRace}]`,
  );
  process.exit(1);
}

// Balance gate: payout + 0.02 OG buffer for gas + upload escrow.
const payoutWei = ethers.parseEther(args.payout);
const bufferWei = ethers.parseEther("0.02");
const bal = await provider.getBalance(poster.address);
console.log(`balance:   ${ethers.formatEther(bal)} OG`);
if (bal < payoutWei + bufferWei) {
  console.error(
    `balance ${ethers.formatEther(bal)} OG < payout ${args.payout} + 0.02 buffer; refusing to post`,
  );
  process.exit(1);
}

// Map CWE strings → bytes32 (throws on unknown).
const cweStrings = args.cwes
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (cweStrings.length === 0) {
  console.error("no CWE classes provided");
  process.exit(1);
}
let cweBytes32;
try {
  cweBytes32 = cweStrings.map(cweToBytes32);
} catch (e) {
  console.error(`bad CWE class: ${e.message}`);
  process.exit(1);
}

// Read .sol, wrap as {files: {"<basename>": "<source>"}} (the schema scripts/hunter.js expects).
const sourcePath = path.resolve(process.cwd(), args.file);
const sourceText = await fs.readFile(sourcePath, "utf8");
const basename = path.basename(sourcePath);
const blob = JSON.stringify({ files: { [basename]: sourceText } });
console.log(
  `source:    ${sourcePath} (${sourceText.length} bytes, wrapped to ${blob.length} bytes)`,
);

// Load or generate the hunter-network symmetric key, then encrypt.
const networkKey = await loadOrGenerateNetworkKey(NETWORK_KEY_PATH);
const encrypted = encrypt(blob, networkKey);
console.log(
  `encrypted: ${encrypted.length} bytes (AES-256-GCM, IV+tag prefixed)`,
);

// Upload to 0G Storage.
console.log("uploading to 0G Storage...");
const { rootHash: codeRoot, txHash: uploadTxHash } = await uploadRaw(
  encrypted,
  poster,
);
console.log(`codeRoot:  ${codeRoot}`);
console.log(`uploadTx:  ${uploadTxHash}`);

// Post the bounty.
console.log("posting bounty on-chain...");
const tx = await hunt.postBounty(codeRoot, cweBytes32, args.raceDuration, {
  value: payoutWei,
});
const rcpt = await tx.wait();

// Pull bountyId from the BountyPosted event.
let bountyId;
for (const log of rcpt.logs) {
  try {
    const parsed = hunt.interface.parseLog(log);
    if (parsed?.name === "BountyPosted") {
      bountyId = parsed.args.bountyId;
      break;
    }
  } catch {}
}
if (bountyId === undefined) {
  console.error("BountyPosted event not found in receipt — bountyId unknown");
  process.exit(1);
}

const nowSec = Math.floor(Date.now() / 1000);
const raceDeadline = nowSec + args.raceDuration;
const settleDeadline = raceDeadline + 24 * 60 * 60;

console.log("");
console.log("────────────────────────────────────────────────────────────");
console.log(`bountyId:        ${bountyId}`);
console.log(`poster:          ${poster.address}`);
console.log(`maxPayout:       ${args.payout} OG (escrowed)`);
console.log(`codeRoot:        ${codeRoot}`);
console.log(`inScopeCwes:     [${cweStrings.join(", ")}]`);
console.log(
  `raceDeadline:    ${new Date(raceDeadline * 1000).toISOString()} (${args.raceDuration / 60}m from now)`,
);
console.log(
  `settleDeadline:  ${new Date(settleDeadline * 1000).toISOString()} (raceDeadline + 24h)`,
);
console.log(`postTx:          ${tx.hash}`);
console.log(`chainscan:       https://chainscan.0g.ai/tx/${tx.hash}`);
console.log("────────────────────────────────────────────────────────────");
