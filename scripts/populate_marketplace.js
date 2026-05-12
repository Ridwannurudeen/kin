// Populate the marketplace with N demo personas.
//
// Reads demo/personas.json, for each persona:
//   1. Generates (or reuses) a dedicated wallet, persists to demo/.wallets.json
//   2. Funds it from the operator wallet (PRIVATE_KEY) if needed
//   3. Builds + signs a Credential against the verifier wallet (admin path)
//   4. AES-encrypts + uploads each sample to 0G Storage
//   5. Computes + encrypts + uploads each embedding
//   6. Runs the Sealed Inference fingerprinter against the samples (real LLM call)
//   7. Calls mintSkill on Kin
//
// Idempotent: re-runs detect existing personas (by wallet address as skill owner) and skip.
//
// Usage:
//   PRIVATE_KEY=0x...  VERIFIER_PRIVATE_KEY=0x...  TEE_SIGNER_PRIVATE_KEY=0x... \
//     node scripts/populate_marketplace.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';

import { uploadRaw, uploadEncryptedRecord, encrypt, genKey } from '../lib/storage.js';
import { embed, embedToBuffer } from '../lib/embedding.js';
import { signCredential, signFingerprint, hashGithubLogin } from '../lib/credential.js';
import { fingerprintSamples } from '../lib/fingerprint.js';
import { getBroker, sealedQuery } from '../lib/inference.js';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK     = process.env.PRIVATE_KEY;
const VPK    = process.env.VERIFIER_PRIVATE_KEY;
const TEE_PK = process.env.TEE_SIGNER_PRIVATE_KEY || PK;
const FUND_PER_PERSONA_OG = process.env.FUND_PER_PERSONA_OG || '0.2';

if (!PK || !VPK) { console.error('PRIVATE_KEY and VERIFIER_PRIVATE_KEY required'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder   = new ethers.Wallet(PK, provider);
const verifierWallet  = new ethers.Wallet(VPK);
const teeSignerWallet = new ethers.Wallet(TEE_PK);

const artifact = JSON.parse(await fs.readFile('deployments/Kin.json', 'utf8'));
const kin = new ethers.Contract(artifact.address, artifact.abi, provider);
const personas = JSON.parse(await fs.readFile('demo/personas.json', 'utf8')).personas;

console.log(`Kin v2:    ${artifact.address}`);
console.log(`funder:    ${funder.address}`);
console.log(`verifier:  ${verifierWallet.address}`);
console.log(`teeSigner: ${teeSignerWallet.address}`);
console.log(`personas:  ${personas.length}\n`);

// Sanity-check on-chain wiring
const onChainV  = (await kin.verifier()).toLowerCase();
const onChainTS = (await kin.teeSigner()).toLowerCase();
if (onChainV  !== verifierWallet.address.toLowerCase())  { console.error(`verifier mismatch — chain ${onChainV} vs env ${verifierWallet.address}`); process.exit(1); }
if (onChainTS !== teeSignerWallet.address.toLowerCase()) { console.error(`teeSigner mismatch`); process.exit(1); }

// Load (or create) demo wallets
let wallets;
try { wallets = JSON.parse(await fs.readFile('demo/.wallets.json', 'utf8')); }
catch { wallets = {}; }

// Init 0G inference broker once (reused across personas)
console.log('initialising inference broker...');
const tmp = await createZGComputeNetworkBroker(funder);
const services = await tmp.inference.listService();
const providerAddr = services[0]?.provider;
if (!providerAddr) { console.error('no inference providers'); process.exit(1); }
const broker = await getBroker(funder, providerAddr);
const invokeLLM = ({ system, user, maxTokens }) =>
  sealedQuery({ broker, providerAddress: providerAddr, system, question: user, contextBlocks: [], maxTokens });

// Iterate personas
for (const p of personas) {
  console.log(`\n=== persona ${p.id} — ${p.displayName} ===`);

  // 1. Wallet
  if (!wallets[p.id]) {
    const w = ethers.Wallet.createRandom();
    wallets[p.id] = { address: w.address, privateKey: w.privateKey, sampleKey: ethers.hexlify(ethers.randomBytes(32)) };
    await fs.writeFile('demo/.wallets.json', JSON.stringify(wallets, null, 2), { mode: 0o600 });
    console.log(`  generated wallet ${w.address}`);
  }
  const personaWallet = new ethers.Wallet(wallets[p.id].privateKey, provider);
  const sampleKey = Buffer.from(wallets[p.id].sampleKey.slice(2), 'hex');

  // 2. Fund if needed
  const bal = await provider.getBalance(personaWallet.address);
  const target = ethers.parseEther(FUND_PER_PERSONA_OG);
  if (bal < target) {
    const need = target - bal;
    console.log(`  funding ${ethers.formatEther(need)} OG...`);
    const tx = await funder.sendTransaction({ to: personaWallet.address, value: need });
    await tx.wait();
  } else {
    console.log(`  already funded (${ethers.formatEther(bal)} OG)`);
  }

  // 3. Already-minted check
  const total = Number(await kin.totalSkills());
  let existing = null;
  for (let i = 0; i < total; i++) {
    const s = await kin.getSkill(i);
    if (s.owner.toLowerCase() === personaWallet.address.toLowerCase()) { existing = { skillId: i, skill: s }; break; }
  }
  if (existing) {
    console.log(`  already minted as skill #${existing.skillId} — skipping`);
    continue;
  }

  // 4. Upload samples
  console.log(`  uploading ${p.samples.length} samples (encrypted) + embeddings...`);
  const sampleRoots = [];
  const embedRoots  = [];
  for (let i = 0; i < p.samples.length; i++) {
    const { rootHash: sRoot } = await uploadEncryptedRecord(p.samples[i], sampleKey, personaWallet);
    sampleRoots.push(sRoot);
    const blob = encrypt(embedToBuffer(embed(p.samples[i])), sampleKey);
    const { rootHash: eRoot } = await uploadRaw(blob, personaWallet);
    embedRoots.push(eRoot);
    process.stdout.write(`    [${i + 1}/${p.samples.length}] `);
  }
  process.stdout.write('\n');

  // 5. Fingerprint via Sealed Inference
  console.log(`  fingerprinting samples (Sealed Inference)...`);
  const { fingerprint, attestationId } = await fingerprintSamples({
    invokeLLM, samples: p.samples, sampleRoots, teeSigner: teeSignerWallet,
  });
  console.log(`    overall ${fingerprint.overallBps}bps | attestation ${attestationId || 'n/a'}`);

  // 6. Build + sign Credential
  const credBase = {
    githubHandleHash: hashGithubLogin(p.githubLogin),
    accountAgeDays:   p.credential.accountAgeDays,
    mergedPRs:        p.credential.mergedPRs,
    codeReviewCount:  p.credential.codeReviewCount,
    verifiedAt:       Math.floor(Date.now() / 1000),
    verifier:         verifierWallet.address,
  };
  const cred = await signCredential(verifierWallet, personaWallet.address, credBase);

  // 7. Mint
  console.log(`  minting on-chain...`);
  const kinAsPersona = kin.connect(personaWallet);
  const tx = await kinAsPersona.mintSkill(
    cred, sampleRoots, embedRoots, fingerprint,
    p.language, p.description, ethers.parseEther(p.pricePerJobOG),
  );
  const rcpt = await tx.wait();
  const skillId = (await kin.totalSkills()) - 1n;
  console.log(`  ✓ skill #${skillId} minted | tx ${tx.hash} | gas ${rcpt.gasUsed}`);
}

console.log(`\ndone. ${personas.length} personas processed.`);
console.log(`chainscan: https://chainscan.0g.ai/address/${artifact.address}`);
