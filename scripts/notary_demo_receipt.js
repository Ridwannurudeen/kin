// Create one public demo receipt on HuntNotary.
// Reads PRIVATE_KEY from .env and writes deployments/NotaryDemoReceipt.json.

import "dotenv/config";
import fs from "node:fs/promises";
import { ethers } from "ethers";

const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const PK = process.env.PRIVATE_KEY;
if (!PK) {
  console.error("PRIVATE_KEY missing");
  process.exit(1);
}

const notaryArtifact = JSON.parse(
  await fs.readFile("deployments/Notary.json", "utf8"),
);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PK, provider);
const notary = new ethers.Contract(
  notaryArtifact.address,
  notaryArtifact.abi,
  wallet,
);

const transcript = [
  "Hunt demo receipt for 0G APAC judges.",
  "Claim: Hunt is a reusable AI accountability layer on 0G.",
  "Artifacts: SDK, Notary, Reputation Oracle, and per-domain proof pages.",
].join("\n");
const model = "zai-org/GLM-5-FP8|notary-v1";
const domain = "general";
const contentHash = ethers.keccak256(ethers.toUtf8Bytes(transcript));
const modelDigest = ethers.keccak256(ethers.toUtf8Bytes(model));
const domainHash = ethers.keccak256(ethers.toUtf8Bytes(domain));
const sealedInputRoot = ethers.ZeroHash;

console.log(`notary: ${notaryArtifact.address}`);
console.log(`sender: ${wallet.address}`);
console.log(`contentHash: ${contentHash}`);

const tx = await notary.attest(
  contentHash,
  modelDigest,
  domainHash,
  sealedInputRoot,
);
console.log(`tx: ${tx.hash}`);
const receipt = await tx.wait();
const parsed = receipt.logs
  .map((log) => {
    try {
      return notary.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((log) => log?.name === "AttestationRecorded");

if (!parsed) {
  throw new Error("AttestationRecorded event not found");
}

const attestId = parsed.args.attestId;
const onChain = await notary.getAttestation(attestId);
const artifact = {
  name: "HuntNotaryDemoReceipt",
  notaryAddress: notaryArtifact.address,
  txHash: tx.hash,
  blockNumber: Number(receipt.blockNumber),
  chainId: 16661,
  attestId: attestId.toString(),
  user: onChain.user,
  contentHash: onChain.contentHash,
  modelDigest: onChain.modelDigest,
  domainHash: onChain.domain,
  sealedInputRoot: onChain.sealedInputRoot,
  attestedAt: onChain.attestedAt.toString(),
  model,
  domain,
  transcriptPreview: "Hunt demo receipt for 0G APAC judges.",
};

await fs.writeFile(
  "deployments/NotaryDemoReceipt.json",
  `${JSON.stringify(artifact, null, 2)}\n`,
);
console.log(`attestId: ${artifact.attestId}`);
console.log(`artifact: deployments/NotaryDemoReceipt.json`);
