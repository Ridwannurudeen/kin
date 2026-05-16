// scripts/fire_vertical_bounties.js — one-shot poster for Hunt v2 verticals.
//
// Fires three real on-chain bounties — one each for the insurance, medical,
// and benefits verticals — using the synthetic payloads already in audits/.
//
// Why this script exists: scripts/quickfire_bounties.js rotates through a
// TARGETS list whose first 6 entries are smart-contract bounties; v2 verticals
// don't fire there unless --count is bumped past the rotation. This script is
// the deterministic 3-fire for the v2 verticals specifically, with the
// canonical class strings now accepted by lib/cwe.js as of 2026-05-16.
//
// Cost: 3 × payout OG escrowed (refundable via expireBounty after settle window)
//   + gas (~0.001 OG each)
//   + 0G Storage upload fee (tiny).
//
// Usage:
//   PRIVATE_KEY=0x... node scripts/fire_vertical_bounties.js [--payout 0.01]
//
// Note: specialist hunters for these CWE domains are NOT minted on-chain yet
// (requires VERIFIER_PRIVATE_KEY). The bounties posted here will sit Open
// until expired-and-refunded after the settle window — that's intentional;
// the goal is to prove on-chain that Hunt's CWE registry now spans non-
// Solidity domains, not to race them.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
let payout = "0.01";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--payout") payout = String(argv[++i]);
  else if (argv[i] === "-h" || argv[i] === "--help") {
    console.error(
      "usage: PRIVATE_KEY=0x... node scripts/fire_vertical_bounties.js [--payout 0.01]",
    );
    process.exit(2);
  }
}

if (!process.env.PRIVATE_KEY) {
  console.error("PRIVATE_KEY required in env (the funder/poster wallet)");
  process.exit(1);
}

const V2_TARGETS = [
  {
    domain: "insurance",
    file: "audits/insurance/sample_denial.txt",
    cwes: "erisa-procedural-defect,medical-necessity-misapplication,prior-auth-overreach",
    note: "v2 insurance vertical — synthetic ERISA-governed denial; defect-class registry proof",
  },
  {
    domain: "medical",
    file: "audits/medical/sample_pathology_report.txt",
    cwes: "pathology-borderline-interpretation,oncology-staging-revision",
    note: "v2 medical vertical — synthetic pathology report; records-reader registry proof (NOT a diagnosis)",
  },
  {
    domain: "benefits",
    file: "audits/benefits/sample_denial.txt",
    cwes: "medical-listing-misapplication,residual-functional-capacity-error,treating-physician-opinion-weight",
    note: "v2 benefits vertical — synthetic SSDI denial; defect-class registry proof",
  },
];

console.log("─".repeat(64));
console.log("Hunt — v2 vertical bounty fire");
console.log("─".repeat(64));
console.log(`payout each: ${payout} OG`);
console.log(
  `total escrow: ${(3 * Number(payout)).toFixed(3)} OG (refundable via expire)`,
);
console.log("─".repeat(64));

const posted = [];
for (let i = 0; i < V2_TARGETS.length; i++) {
  const t = V2_TARGETS[i];
  console.log(`\n[${i + 1}/3] ${t.domain} → ${t.file}`);
  console.log(`  ${t.note}`);
  console.log(`  cwes: ${t.cwes}`);

  const result = spawnSync(
    "node",
    [
      "scripts/post_bounty.js",
      "--file",
      t.file,
      "--payout",
      payout,
      "--race-duration",
      "600",
      "--cwes",
      t.cwes,
    ],
    { cwd: REPO_ROOT, stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    console.error(
      `\nFAIL: post_bounty.js exited ${result.status} on ${t.domain}`,
    );
    console.error(`posted so far: ${posted.length}`);
    process.exit(result.status || 1);
  }
  posted.push(t.domain);

  if (i < V2_TARGETS.length - 1) {
    await new Promise((r) => setTimeout(r, 4000));
  }
}

console.log("\n" + "─".repeat(64));
console.log(
  `✓ v2 vertical fire complete — ${posted.length} bounty/bounties posted`,
);
console.log(`  domains: ${posted.join(", ")}`);
console.log("─".repeat(64));
console.log("next:");
console.log(
  "  - bounties sit Open until expired (no specialist hunters for these domains)",
);
console.log(
  "  - run-side check: curl https://hunt.gudman.xyz/api/bounties?limit=5",
);
console.log(
  "  - to refund: expireBounty(<id>) via /expire-bounty.html or scripts",
);
console.log("─".repeat(64));
