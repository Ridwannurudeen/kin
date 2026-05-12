// Generate a fresh verifier wallet and print env-block instructions.
// Run once per environment. Saves to .verifier-key (mode 600) for local dev convenience.

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { ethers } from 'ethers';

const wallet = ethers.Wallet.createRandom();
const adminKey = crypto.randomBytes(24).toString('hex');

const block = `# Kin verifier service env — paste into verifier/.env or systemd unit
VERIFIER_PRIVATE_KEY=${wallet.privateKey}
ADMIN_KEY=${adminKey}
# GITHUB_CLIENT_ID=<set after registering OAuth app at https://github.com/settings/applications/new>
# GITHUB_CLIENT_SECRET=<set after registering OAuth app>
# VERIFIER_PORT=3030
# STUB_MODE=0
`;

await fs.mkdir('verifier', { recursive: true });
await fs.writeFile('verifier/.env', block, { mode: 0o600 });

console.log('verifier address:', wallet.address);
console.log('wrote verifier/.env (mode 600) — VERIFIER_PRIVATE_KEY + ADMIN_KEY stay on disk, not displayed');
console.log();
console.log('Next: deploy Kin v2 with this verifier address:');
console.log(`  TEE_SIGNER=<tee_addr> VERIFIER=${wallet.address} node scripts/deploy.js`);
