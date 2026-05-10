// Deploy Kin.sol to 0G Aristotle mainnet.
// Usage: PRIVATE_KEY=0x... node scripts/deploy.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'ethers';
import solc from 'solc';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error('PRIVATE_KEY missing'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PK, provider);
console.log(`deployer: ${wallet.address}`);
const bal = await provider.getBalance(wallet.address);
console.log(`balance: ${ethers.formatEther(bal)} OG`);

const source = await fs.readFile('contracts/Kin.sol', 'utf8');
console.log('compiling Kin.sol ...');

const input = {
  language: 'Solidity',
  sources: { 'Kin.sol': { content: source } },
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.some(e => e.severity === 'error')) {
  console.error('compile errors:', out.errors);
  process.exit(1);
}

const { abi, evm } = out.contracts['Kin.sol'].Kin;
const bytecode = '0x' + evm.bytecode.object;
console.log(`deployed bytecode size: ${evm.deployedBytecode.object.length / 2} bytes`);

const teePubkey = process.argv[2] || wallet.address;
console.log(`deploying with teePubkey: ${teePubkey} ...`);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy(teePubkey);
const tx = contract.deploymentTransaction();
console.log(`deploy tx: ${tx.hash}`);
const rcpt = await tx.wait();
const address = await contract.getAddress();
console.log(`deployed: ${address} | block ${rcpt.blockNumber} | gas ${rcpt.gasUsed}`);
console.log(`explorer: https://chainscan.0g.ai/address/${address}`);

const artifact = {
  name: 'Kin',
  address,
  txHash: tx.hash,
  blockNumber: Number(rcpt.blockNumber),
  chainId: 16661,
  rpc: RPC_URL,
  teePubkey,
  deployer: wallet.address,
  abi,
  deployedAt: new Date().toISOString(),
};
await fs.mkdir('deployments', { recursive: true });
await fs.writeFile('deployments/Kin.json', JSON.stringify(artifact, null, 2));
console.log(`artifact: deployments/Kin.json`);

const finalBal = await provider.getBalance(wallet.address);
console.log(`spent: ${ethers.formatEther(bal - finalBal)} OG | remaining: ${ethers.formatEther(finalBal)} OG`);
