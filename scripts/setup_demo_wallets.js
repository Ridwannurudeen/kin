// Generate two demo persona wallets (User + Client) for the multi-actor demo.
// Saves keys to .demo-wallets.json (gitignored). Funds from main wallet.
//
// Usage: PRIVATE_KEY=0x... node scripts/setup_demo_wallets.js [user_funding_og] [client_funding_og]

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error('PRIVATE_KEY missing'); process.exit(1); }

const userFund = process.argv[2] || '0.5';
const clientFund = process.argv[3] || '1.5';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const main = new ethers.Wallet(PK, provider);
console.log(`funder: ${main.address}`);

let demoWallets;
try {
  demoWallets = JSON.parse(await fs.readFile('.demo-wallets.json', 'utf8'));
  console.log('existing demo wallets found, reusing');
} catch {
  demoWallets = {
    user: ethers.Wallet.createRandom(),
    client: ethers.Wallet.createRandom(),
  };
  await fs.writeFile('.demo-wallets.json', JSON.stringify({
    user: { address: demoWallets.user.address, privateKey: demoWallets.user.privateKey },
    client: { address: demoWallets.client.address, privateKey: demoWallets.client.privateKey },
  }, null, 2), { mode: 0o600 });
  console.log('generated fresh demo wallets, saved to .demo-wallets.json (gitignored)');
}

const userAddr = demoWallets.user.address || demoWallets.user;
const clientAddr = demoWallets.client.address || demoWallets.client;
console.log(`user:   ${userAddr}`);
console.log(`client: ${clientAddr}`);

async function fundIfNeeded(toAddr, amountOg) {
  const target = ethers.parseEther(amountOg);
  const cur = await provider.getBalance(toAddr);
  if (cur >= target) {
    console.log(`  ${toAddr.slice(0,10)}… already has ${ethers.formatEther(cur)} OG (≥ ${amountOg})`);
    return;
  }
  const need = target - cur;
  console.log(`  funding ${toAddr.slice(0,10)}… with ${ethers.formatEther(need)} OG`);
  const tx = await main.sendTransaction({ to: toAddr, value: need });
  await tx.wait();
  console.log(`    tx ${tx.hash}`);
}

await fundIfNeeded(userAddr, userFund);
await fundIfNeeded(clientAddr, clientFund);

console.log(`\ndemo wallets ready.\nadd to .env:`);
console.log(`DEMO_USER_PK=${demoWallets.user.privateKey || '(stored in .demo-wallets.json)'}`);
console.log(`DEMO_CLIENT_PK=${demoWallets.client.privateKey || '(stored in .demo-wallets.json)'}`);
