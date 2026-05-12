// Populate the Hunt bounty network with 3 demo hunter personas.
//
// Reads demo/hunter-personas.json, for each hunter:
//   1. Re-uses the matching Kin v2 wallet (ts-senior, rust-senior, sol-senior) from
//      demo/.wallets.json, persisted as demo/.hunter-wallets.json with a fresh sampleKey
//   2. Funds it from the operator wallet (PRIVATE_KEY) if needed
//   3. Builds + signs a Credential against the verifier wallet (admin path)
//   4. AES-encrypts + uploads each prior-finding sample to 0G Storage
//   5. Computes + encrypts + uploads each embedding
//   6. Runs the Sealed Inference fingerprinter against the samples (real LLM call)
//   7. Calls mintHunter on Hunt
//
// Idempotent: re-runs detect existing hunters (by wallet address as hunter owner) and skip.
//
// Usage:
//   PRIVATE_KEY=0x...  VERIFIER_PRIVATE_KEY=0x...  TEE_SIGNER_PRIVATE_KEY=0x... \
//     node scripts/populate_hunters.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';

import { uploadRaw, uploadEncryptedRecord, encrypt } from '../lib/storage.js';
import { embed, embedToBuffer } from '../lib/embedding.js';
import { signCredential, hashGithubLogin } from '../lib/credential.js';
import { fingerprintSamples } from '../lib/fingerprint.js';
import { getBroker, sealedQuery } from '../lib/inference.js';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK     = process.env.PRIVATE_KEY;
const VPK    = process.env.VERIFIER_PRIVATE_KEY;
const TEE_PK = process.env.TEE_SIGNER_PRIVATE_KEY || PK;
const FUND_PER_HUNTER_OG = process.env.FUND_PER_HUNTER_OG || '0.3';

// Hunt re-purposes the Kin v2 demo wallets: each hunter persona maps to one Kin wallet.
const KIN_WALLET_MAP = {
  'reentrancy-specialist':     'ts-senior',
  'oracle-specialist':         'rust-senior',
  'access-control-specialist': 'sol-senior',
};

// Realistic-but-demo GitHub credential figures — well above the on-chain bar
// (MIN_ACCOUNT_AGE_DAYS=730, MIN_MERGED_PRS=20, MIN_CODE_REVIEW_COUNT=10).
const CRED_DEFAULTS = { accountAgeDays: 1800, mergedPRs: 60, codeReviewCount: 35 };

if (!PK || !VPK) { console.error('PRIVATE_KEY and VERIFIER_PRIVATE_KEY required'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder   = new ethers.Wallet(PK, provider);
const verifierWallet  = new ethers.Wallet(VPK);
const teeSignerWallet = new ethers.Wallet(TEE_PK);

const artifact = JSON.parse(await fs.readFile('deployments/Hunt.json', 'utf8'));
const hunt = new ethers.Contract(artifact.address, artifact.abi, provider);
const hunters = JSON.parse(await fs.readFile('demo/hunter-personas.json', 'utf8')).hunters;

console.log(`Hunt:      ${artifact.address}`);
console.log(`funder:    ${funder.address}`);
console.log(`verifier:  ${verifierWallet.address}`);
console.log(`teeSigner: ${teeSignerWallet.address}`);
console.log(`hunters:   ${hunters.length}\n`);

// Sanity-check on-chain wiring
const onChainV  = (await hunt.verifier()).toLowerCase();
const onChainTS = (await hunt.teeSigner()).toLowerCase();
if (onChainV  !== verifierWallet.address.toLowerCase())  { console.error(`verifier mismatch — chain ${onChainV} vs env ${verifierWallet.address}`); process.exit(1); }
if (onChainTS !== teeSignerWallet.address.toLowerCase()) { console.error(`teeSigner mismatch`); process.exit(1); }

// Load Kin v2 wallets (source of address/privateKey we re-purpose for Hunt)
let kinWallets = {};
try { kinWallets = JSON.parse(await fs.readFile('demo/.wallets.json', 'utf8')); }
catch { console.error('demo/.wallets.json not found — run setup_demo_wallets.js first'); process.exit(1); }

// Load (or create) hunter wallet records — same address as the Kin wallet, fresh sampleKey
let hunterWallets;
try { hunterWallets = JSON.parse(await fs.readFile('demo/.hunter-wallets.json', 'utf8')); }
catch { hunterWallets = {}; }

// Init 0G inference broker once (reused across hunters)
console.log('initialising inference broker...');
const tmp = await createZGComputeNetworkBroker(funder);
const services = await tmp.inference.listService();
const providerAddr = services[0]?.provider;
if (!providerAddr) { console.error('no inference providers'); process.exit(1); }
const broker = await getBroker(funder, providerAddr);
const invokeLLM = ({ system, user, maxTokens }) =>
  sealedQuery({ broker, providerAddress: providerAddr, system, question: user, contextBlocks: [], maxTokens });

// Iterate hunter personas
for (const h of hunters) {
  console.log(`\n=== hunter ${h.id} — ${h.displayName} ===`);

  // 1. Wallet — re-purpose the Kin v2 wallet, mint fresh sampleKey per hunter
  if (!hunterWallets[h.id]) {
    const kinKey = KIN_WALLET_MAP[h.id];
    const kinW = kinWallets[kinKey];
    if (!kinW) { console.error(`  no Kin wallet for ${kinKey}`); process.exit(1); }
    hunterWallets[h.id] = {
      address: kinW.address,
      privateKey: kinW.privateKey,
      sampleKey: ethers.hexlify(ethers.randomBytes(32)),
    };
    await fs.writeFile('demo/.hunter-wallets.json', JSON.stringify(hunterWallets, null, 2), { mode: 0o600 });
    console.log(`  re-using ${kinKey} wallet ${kinW.address} with fresh sampleKey`);
  }
  const hunterWallet = new ethers.Wallet(hunterWallets[h.id].privateKey, provider);
  const sampleKey = Buffer.from(hunterWallets[h.id].sampleKey.slice(2), 'hex');

  // 2. Fund if needed
  const bal = await provider.getBalance(hunterWallet.address);
  const target = ethers.parseEther(FUND_PER_HUNTER_OG);
  if (bal < target) {
    const need = target - bal;
    console.log(`  funding ${ethers.formatEther(need)} OG...`);
    const tx = await funder.sendTransaction({ to: hunterWallet.address, value: need });
    await tx.wait();
  } else {
    console.log(`  already funded (${ethers.formatEther(bal)} OG)`);
  }

  // 3. Already-minted check
  const total = Number(await hunt.totalHunters());
  let existing = null;
  for (let i = 0; i < total; i++) {
    const ho = await hunt.getHunter(i);
    if (ho.owner.toLowerCase() === hunterWallet.address.toLowerCase()) { existing = { hunterId: i, hunter: ho }; break; }
  }
  if (existing) {
    console.log(`  already minted as hunter #${existing.hunterId} — skipping`);
    if (!hunterWallets[h.id].hunterId) {
      hunterWallets[h.id].hunterId = existing.hunterId;
      await fs.writeFile('demo/.hunter-wallets.json', JSON.stringify(hunterWallets, null, 2), { mode: 0o600 });
    }
    continue;
  }

  // 4. Upload samples
  console.log(`  uploading ${h.samples.length} samples (encrypted) + embeddings...`);
  const sampleRoots = [];
  const embedRoots  = [];
  for (let i = 0; i < h.samples.length; i++) {
    const { rootHash: sRoot } = await uploadEncryptedRecord(h.samples[i], sampleKey, hunterWallet);
    sampleRoots.push(sRoot);
    const blob = encrypt(embedToBuffer(embed(h.samples[i])), sampleKey);
    const { rootHash: eRoot } = await uploadRaw(blob, hunterWallet);
    embedRoots.push(eRoot);
    process.stdout.write(`    [${i + 1}/${h.samples.length}] `);
  }
  process.stdout.write('\n');

  // 5. Fingerprint via Sealed Inference
  console.log(`  fingerprinting samples (Sealed Inference)...`);
  const { fingerprint, attestationId } = await fingerprintSamples({
    invokeLLM, samples: h.samples, sampleRoots, teeSigner: teeSignerWallet,
  });
  console.log(`    overall ${fingerprint.overallBps}bps | attestation ${attestationId || 'n/a'}`);

  // 6. Build + sign Credential
  const credBase = {
    githubHandleHash: hashGithubLogin(h.githubLogin),
    accountAgeDays:   CRED_DEFAULTS.accountAgeDays,
    mergedPRs:        CRED_DEFAULTS.mergedPRs,
    codeReviewCount:  CRED_DEFAULTS.codeReviewCount,
    verifiedAt:       Math.floor(Date.now() / 1000),
    verifier:         verifierWallet.address,
  };
  const cred = await signCredential(verifierWallet, hunterWallet.address, credBase);

  // 7. Mint
  console.log(`  minting on-chain...`);
  const huntAsHunter = hunt.connect(hunterWallet);
  const tx = await huntAsHunter.mintHunter(
    cred, sampleRoots, embedRoots, fingerprint,
    h.specialty, h.description,
  );
  const rcpt = await tx.wait();
  const hunterId = (await hunt.totalHunters()) - 1n;
  console.log(`  ✓ hunter #${hunterId} minted | tx ${tx.hash} | gas ${rcpt.gasUsed}`);

  hunterWallets[h.id].hunterId = Number(hunterId);
  hunterWallets[h.id].mintTxHash = tx.hash;
  await fs.writeFile('demo/.hunter-wallets.json', JSON.stringify(hunterWallets, null, 2), { mode: 0o600 });
}

console.log(`\ndone. ${hunters.length} hunters processed.`);
console.log(`chainscan: https://chainscan.0g.ai/address/${artifact.address}`);
