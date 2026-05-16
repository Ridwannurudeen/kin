// scripts/quickfire_bounties.js — user-run mainnet activity booster.
//
// Fires N additional bounties against pre-curated audit targets to push
// Hunt's mainnet-activity axis ahead of the 0G APAC submission deadline.
// Each bounty:
//   1. uses the same scripts/post_bounty.js logic (so codeRoots seal cleanly
//      against the shared hunter-network key)
//   2. picks a distinct real audited contract from audits/ so the on-chain
//      record shows Hunt auditing more than just the staged Vault.sol
//   3. uses a short 600s race duration so the daemon can race + settle in
//      one demo window
//
// You run this LOCALLY with the funder's PRIVATE_KEY in env; the AI agent
// does not have your key.
//
// Usage:
//   PRIVATE_KEY=0x... node scripts/quickfire_bounties.js [--count 3] [--payout 0.05]
//
// Env (same as scripts/post_bounty.js):
//   PRIVATE_KEY            — funder wallet (the posting wallet)
//   ZG_RPC_URL             — optional, defaults to https://evmrpc.0g.ai
//   HUNTER_NETWORK_KEY_PATH — optional, defaults to .hunter-network-key.bin
//
// What this script does NOT do:
//   - run scripts/run_race.js (you do that next, with a hunter PK)
//   - settle the resulting bounties (poster picks a winner manually)
//   - expire stale ones (use /expire-bounty.html or scripts/expire_bounty.js)
//
// Cost discipline: 3 bounties × 0.05 OG = 0.15 OG escrowed. The escrow is
// refundable via expireBounty if no winner is picked, so the net cost is
// just the gas (a few hundred wei). Funder must hold ≥(count × payout) + 0.02 OG buffer.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
let count = 3;
let payout = "0.05";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--count") count = Number(argv[++i]);
  else if (argv[i] === "--payout") payout = String(argv[++i]);
  else if (argv[i] === "-h" || argv[i] === "--help") {
    console.error(
      "usage: PRIVATE_KEY=0x... node scripts/quickfire_bounties.js [--count 3] [--payout 0.05]",
    );
    process.exit(2);
  }
}

if (!process.env.PRIVATE_KEY) {
  console.error("PRIVATE_KEY required in env (the funder/poster wallet)");
  console.error(
    "  PRIVATE_KEY=0x... node scripts/quickfire_bounties.js --count 3",
  );
  process.exit(1);
}
if (!Number.isFinite(count) || count < 1 || count > 10) {
  console.error("--count must be 1..10");
  process.exit(2);
}

// Curated targets. Each entry is a (real, audited or staged) Solidity file
// that's already in this repo. We rotate through them so each new bounty
// has a distinct codeRoot on-chain, NOT a re-post of the same one.
//
// Order chosen so the most narratively-load-bearing target fires first.
const TARGETS = [
  {
    file: "audits/chartchain/MedicalRecordsVault.sol",
    cwes: "swc-107-reentrancy,oracle-manipulation,access-control,swc-101-int-overflow,storage-collision",
    note: "ChartChain medical-records vault — cross-pollination audit against another 0G app",
  },
  {
    file: "demo/staged-bounty/Vault.sol",
    cwes: "swc-107-reentrancy,oracle-manipulation,access-control",
    note: "staged Vault.sol with oracle-staleness bug — Hunt's canonical demo target",
  },
  {
    file: "demo/staged-bounty/Reentrancy.sol",
    cwes: "swc-107-reentrancy,access-control,oracle-manipulation",
    note: "staged Reentrancy.sol with CEI violation — second positive per-CWE narrowing data point",
  },
  {
    file: "audits/ussd/StableOracleDAI.sol",
    cwes: "oracle-manipulation,access-control,price-manipulation,signature-replay",
    note: "USSD StableOracleDAI — Sherlock-audited target, blind",
  },
  {
    file: "audits/blueberry/ChainlinkAdapterOracle.sol",
    cwes: "oracle-manipulation,price-manipulation,access-control",
    note: "Blueberry Chainlink adapter — real protocol, blind",
  },
  {
    file: "audits/bullvbear/BvbProtocol.sol",
    cwes: "swc-107-reentrancy,access-control,signature-replay,unsafe-delegatecall",
    note: "BullvBear protocol — comprehensive scope, blind",
  },
  // v2 verticals — non-Solidity domains. The contract treats inScopeCwes
  // as opaque bytes32 so these post fine; the runtime CWE registry
  // (lib/cwe.js) accepts these canonical strings as of 2026-05-16.
  // Specialist hunters for these domains are NOT minted yet (requires
  // VERIFIER_PRIVATE_KEY). Bounties posted here sit Open until expired.
  {
    file: "audits/insurance/sample_denial.txt",
    cwes: "erisa-procedural-defect,medical-necessity-misapplication,prior-auth-overreach",
    note: "insurance v2: synthetic ERISA-governed claim denial — defect-class registry proof",
  },
  {
    file: "audits/medical/sample_pathology_report.txt",
    cwes: "pathology-borderline-interpretation,oncology-staging-revision",
    note: "medical v2: synthetic pathology report — records-reader registry proof (NOT a diagnosis)",
  },
  {
    file: "audits/benefits/sample_denial.txt",
    cwes: "medical-listing-misapplication,residual-functional-capacity-error,treating-physician-opinion-weight",
    note: "benefits v2: synthetic SSDI denial — defect-class registry proof",
  },
];

const REPO_ROOT = path.resolve(
  path
    .dirname(new URL(import.meta.url).pathname)
    .replace(/^\/([A-Za-z]):/, "$1:"),
  "..",
);

console.log("─".repeat(64));
console.log("Hunt — quickfire bounties");
console.log("─".repeat(64));
console.log(`count:   ${count}`);
console.log(
  `payout:  ${payout} OG each (${(count * Number(payout)).toFixed(3)} OG total escrow)`,
);
console.log(`repo:    ${REPO_ROOT}`);
console.log("─".repeat(64));

// Pre-flight: verify every target file actually exists in the repo.
for (let i = 0; i < count; i++) {
  const target = TARGETS[i % TARGETS.length];
  const abs = path.resolve(REPO_ROOT, target.file);
  try {
    await fs.access(abs);
  } catch {
    console.error(`PRE-FLIGHT FAIL: target ${i + 1} not found at ${abs}`);
    console.error("aborting — fix the missing audit target before retrying");
    process.exit(1);
  }
}
console.log(`pre-flight: all ${count} targets found ✓`);
console.log("─".repeat(64));

const posted = [];
for (let i = 0; i < count; i++) {
  const target = TARGETS[i % TARGETS.length];
  console.log(`\n[${i + 1}/${count}] firing bounty against ${target.file}`);
  console.log(`  ${target.note}`);
  console.log(`  cwes: ${target.cwes}`);

  const result = spawnSync(
    "node",
    [
      "scripts/post_bounty.js",
      "--file",
      target.file,
      "--payout",
      payout,
      "--race-duration",
      "600",
      "--cwes",
      target.cwes,
    ],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    console.error(
      `\nFAIL: post_bounty.js exited ${result.status} on target ${i + 1} (${target.file})`,
    );
    console.error(
      `posted so far: ${posted.length} bounty/bounties — they remain escrowed and refundable via expireBounty after the settle window`,
    );
    process.exit(result.status || 1);
  }
  posted.push(target.file);

  // Short pause between fires to let nonces settle on the RPC.
  if (i < count - 1) {
    await new Promise((r) => setTimeout(r, 4000));
  }
}

console.log("\n" + "─".repeat(64));
console.log(`✓ quickfire complete — ${posted.length} bounty/bounties posted`);
console.log("─".repeat(64));
console.log("next steps:");
console.log("  1. (optional) run scripts/run_race.js with hunter PKs to race");
console.log(
  "  2. (optional) settle the winning finding via scripts/settle_bounty.js",
);
console.log(
  "  3. otherwise: bounties expire after the settle window and escrow refunds to the poster",
);
console.log("  4. check live state at https://hunt.gudman.xyz/api/bounties");
console.log("─".repeat(64));
