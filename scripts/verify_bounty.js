// scripts/verify_bounty.js — standalone Hunt bounty verifier.
//
// Usage:
//   node scripts/verify_bounty.js <bountyId> [--model-digest 0x...]
//
// Reads deployments/Hunt.json for address + ABI, then for the given bounty:
//   1. Fetches Bounty struct + all findings + teeSigner.
//   2. For each finding, recovers the signer of attestationSig over attestationDigest
//      (EIP-191 prefix per Hunt.sol _recoverEth) and checks against teeSigner.
//   3. Re-derives the attestation digest from on-chain fields, mirroring Hunt.sol L298-302.
//      modelDigest is NOT on-chain (it lives only in the encrypted finding payload), so
//      pass --model-digest 0x... to perform a strict re-derivation; otherwise the script
//      reports the digest assuming a zero modelDigest and surfaces the mismatch clearly.
//   4. Checks teeTimestamp is inside [postedAt, raceDeadline].
//   5. Prints a clear verification report. Exit code 0 = signer + timestamp checks pass;
//      in strict mode, the supplied modelDigest must also re-derive the stored digest.
//
// Depends ONLY on the project's existing `ethers` install + Node built-ins.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const STATUS = { 0: "Open", 1: "Settled", 2: "Expired" };
const SEVERITY = { 1: "low", 2: "medium", 3: "high", 4: "critical" };

function shortAddr(a) {
  const s = String(a || "");
  return s.length < 12 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
}
function tick(b) {
  return b ? "✓" : "✗";
}

function deriveDigest(bountyIdN, codeRoot, hunterIdN, f, modelDigest) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "uint256",
        "bytes32",
        "uint256",
        "bytes32",
        "uint8",
        "bytes32",
        "bytes32",
        "uint64",
        "uint16",
        "uint16",
        "uint16",
        "uint16",
      ],
      [
        bountyIdN,
        codeRoot,
        hunterIdN,
        f.cweClass,
        Number(f.severity),
        f.findingRoot,
        modelDigest,
        f.teeTimestamp,
        Number(f.severityCalibrationBpsSelfEval),
        Number(f.precisionBpsSelfEval),
        Number(f.coverageBpsSelfEval),
        Number(f.exploitabilityBpsSelfEval),
      ],
    ),
  );
}

function recoverSigner(digest, sig) {
  // Hunt.sol _recoverEth: ecrecover( keccak256("\x19Ethereum Signed Message:\n32" || digest), sig )
  // ethers.verifyMessage on the 32 bytes does exactly that.
  try {
    return ethers.verifyMessage(ethers.getBytes(digest), sig);
  } catch {
    return null;
  }
}

export function winningFindingPasses({
  sigOk,
  teeInWindow,
  digestMatch,
  strictMode,
}) {
  return sigOk && teeInWindow && (!strictMode || digestMatch);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { help: true };
  }
  const bountyId = argv[0];
  let modelDigestArg = "0x" + "0".repeat(64);
  const idx = argv.indexOf("--model-digest");
  const strictMode = idx !== -1;
  if (strictMode) {
    modelDigestArg = argv[idx + 1];
    if (!ethers.isHexString(modelDigestArg, 32)) {
      return { error: "--model-digest must be a 32-byte hex string" };
    }
  }
  return { bountyId, modelDigestArg, strictMode };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.error(
      "usage: node scripts/verify_bounty.js <bountyId> [--model-digest 0x...]",
    );
    process.exit(2);
  }
  if (args.error) {
    console.error(args.error);
    console.error(
      "usage: node scripts/verify_bounty.js <bountyId> [--model-digest 0x...]",
    );
    process.exit(2);
  }

  const { bountyId, modelDigestArg, strictMode } = args;
  const artifactPath = path.resolve(process.cwd(), "deployments", "Hunt.json");
  if (!fs.existsSync(artifactPath)) {
    console.error(`deployments/Hunt.json not found at ${artifactPath}`);
    console.error(
      "deploy Hunt first (scripts/deploy_hunt.js) or cd to the kin repo root.",
    );
    process.exit(2);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(
    artifact.rpc || "https://evmrpc.0g.ai",
  );
  const hunt = new ethers.Contract(artifact.address, artifact.abi, provider);

  const [bounty, findings, teeSigner] = await Promise.all([
    hunt.getBounty(bountyId),
    hunt.getFindings(bountyId),
    hunt.teeSigner(),
  ]);

  if (bounty.poster === ethers.ZeroAddress) {
    console.error(`bounty #${bountyId} not found on-chain.`);
    process.exit(1);
  }

  const statusInt = Number(bounty.status);
  const statusStr = STATUS[statusInt] || `status-${statusInt}`;
  const winIdx = statusInt === 1 ? Number(bounty.winningFindingIdx) : -1;

  console.log("────────────────────────────────────────────────────────────");
  console.log(`Hunt verifier  ·  bounty #${bountyId}`);
  console.log("────────────────────────────────────────────────────────────");
  console.log(`contract:      ${artifact.address}`);
  console.log(`teeSigner:     ${teeSigner}`);
  console.log(`status:        ${statusStr}`);
  console.log(`poster:        ${bounty.poster}`);
  console.log(`maxPayout:     ${ethers.formatEther(bounty.maxPayout)} OG`);
  console.log(`codeRoot:      ${bounty.codeRoot}`);
  console.log(
    `postedAt:      ${bounty.postedAt} (${new Date(Number(bounty.postedAt) * 1000).toISOString()})`,
  );
  console.log(
    `raceDeadline:  ${bounty.raceDeadline} (${new Date(Number(bounty.raceDeadline) * 1000).toISOString()})`,
  );
  console.log(`findings:      ${findings.length}`);
  if (statusInt === 1) console.log(`winningIdx:    ${winIdx}`);
  console.log("");

  let allOk = findings.length > 0;
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const isWin = i === winIdx;
    const sev = SEVERITY[Number(f.severity)] || `sev-${f.severity}`;
    const recovered = recoverSigner(f.attestationDigest, f.attestationSig);
    const sigOk =
      !!recovered && recovered.toLowerCase() === teeSigner.toLowerCase();

    const derived = deriveDigest(
      BigInt(bountyId),
      bounty.codeRoot,
      f.hunterId,
      f,
      modelDigestArg,
    );
    const digestMatch =
      derived.toLowerCase() === f.attestationDigest.toLowerCase();

    const teeInWindow =
      f.teeTimestamp >= bounty.postedAt &&
      f.teeTimestamp <= bounty.raceDeadline;

    console.log(`finding[${i}] ${isWin ? "★ WINNING" : ""}`);
    console.log(`  hunter:                #${f.hunterId} (${f.hunter})`);
    console.log(`  cweClass:              ${f.cweClass}`);
    console.log(`  severity:              ${sev} (${f.severity})`);
    console.log(`  findingRoot:           ${f.findingRoot}`);
    console.log(`  teeTimestamp:          ${f.teeTimestamp}`);
    console.log(`  submittedAt:           ${f.submittedAt}`);
    console.log(
      `  self-eval bps:         sevCal=${f.severityCalibrationBpsSelfEval} prec=${f.precisionBpsSelfEval} cov=${f.coverageBpsSelfEval} expl=${f.exploitabilityBpsSelfEval}`,
    );
    console.log(`  attestationDigest:     ${f.attestationDigest}`);
    console.log(`  derived (mD=${shortAddr(modelDigestArg)}): ${derived}`);
    const digestNote = digestMatch
      ? ""
      : strictMode
        ? " (strict modelDigest mismatch)"
        : " (pass --model-digest 0x... for strict check)";
    console.log(`  digest match:          ${tick(digestMatch)}${digestNote}`);
    console.log(`  signer recovered:      ${recovered || "(failed)"}`);
    console.log(`  signer == teeSigner:   ${tick(sigOk)}`);
    console.log(
      `  teeTimestamp window:   ${tick(teeInWindow)} (postedAt=${bounty.postedAt}, raceDeadline=${bounty.raceDeadline})`,
    );
    console.log("");

    if (
      isWin &&
      !winningFindingPasses({ sigOk, teeInWindow, digestMatch, strictMode })
    ) {
      allOk = false;
    }
  }

  if (statusInt === 1) {
    console.log("────────────────────────────────────────────────────────────");
    const okMessage = strictMode
      ? "✓ winning finding verifies against on-chain teeSigner and supplied modelDigest"
      : "✓ winning finding verifies against on-chain teeSigner (modelDigest not checked)";
    console.log(`Result: ${allOk ? okMessage : "✗ verification failed"}`);
    console.log("────────────────────────────────────────────────────────────");
    process.exit(allOk ? 0 : 1);
  } else {
    console.log("────────────────────────────────────────────────────────────");
    console.log(
      `Result: bounty status is ${statusStr}. No winning finding to verify.`,
    );
    if (findings.length > 0)
      console.log("All submitted findings checked above.");
    console.log("────────────────────────────────────────────────────────────");
    process.exit(0);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("verify_bounty error:", e.message);
    process.exit(2);
  });
}
