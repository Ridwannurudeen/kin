// Deploy HuntReputationOracle.sol to 0G Aristotle mainnet.
// Usage:
//   PRIVATE_KEY=0x... node scripts/deploy_reputation_oracle.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';
import solc from 'solc';
import { CANONICAL_CWES } from '../lib/cwe.js';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
const HUNT_ADDRESS = '0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C';

if (!PK) {
  console.error('PRIVATE_KEY missing');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PK, provider);
console.log(`deployer: ${wallet.address}`);
const bal = await provider.getBalance(wallet.address);
console.log(`balance: ${ethers.formatEther(bal)} OG`);

function classToBytes32(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

async function readFrozenClassList(file, constName) {
  const source = await fs.readFile(file, 'utf8');
  const pattern = new RegExp(
    `const\\s+${constName}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`,
  );
  const match = source.match(pattern);
  if (!match) throw new Error(`could not find ${constName} in ${file}`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

const domains = [
  {
    name: 'smart-contract-audit',
    classes: CANONICAL_CWES,
  },
  {
    name: 'insurance-claim-denial-defense',
    classes: await readFrozenClassList(
      'scripts/insurance_specialist_brief.js',
      'INSURANCE_DEFECT_CLASSES',
    ),
  },
  {
    name: 'benefits-defense',
    classes: await readFrozenClassList(
      'scripts/benefits_specialist_brief.js',
      'BENEFITS_DEFECT_CLASSES',
    ),
  },
  {
    name: 'medical-records-reader',
    classes: await readFrozenClassList(
      'scripts/medical_specialist_brief.js',
      'MEDICAL_READING_CLASSES',
    ),
  },
];

const source = await fs.readFile('contracts/HuntReputationOracle.sol', 'utf8');
console.log('compiling HuntReputationOracle.sol ...');

const input = {
  language: 'Solidity',
  sources: { 'HuntReputationOracle.sol': { content: source } },
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] },
    },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.some((e) => e.severity === 'error')) {
  console.error('compile errors:', out.errors);
  process.exit(1);
}

const { abi, evm } =
  out.contracts['HuntReputationOracle.sol'].HuntReputationOracle;
const bytecode = '0x' + evm.bytecode.object;
console.log(
  `deployed bytecode size: ${evm.deployedBytecode.object.length / 2} bytes`,
);
console.log(`deploying with huntAddress=${HUNT_ADDRESS} ...`);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy(HUNT_ADDRESS);
const tx = contract.deploymentTransaction();
console.log(`deploy tx: ${tx.hash}`);
const rcpt = await tx.wait();
const address = await contract.getAddress();
console.log(
  `deployed: ${address} | block ${rcpt.blockNumber} | gas ${rcpt.gasUsed}`,
);
console.log(`explorer: https://chainscan.0g.ai/address/${address}`);

const registeredDomains = [];
for (const domain of domains) {
  const domainId = classToBytes32(domain.name);
  console.log(`register domain: ${domain.name}`);
  const domainTx = await contract.registerDomain(domain.name);
  const domainRcpt = await domainTx.wait();

  const registeredClasses = [];
  for (const className of domain.classes) {
    const classId = classToBytes32(className);
    console.log(`  class: ${className}`);
    const classTx = await contract.registerClass(domain.name, className);
    const classRcpt = await classTx.wait();
    registeredClasses.push({
      name: className,
      id: classId,
      txHash: classTx.hash,
      blockNumber: Number(classRcpt.blockNumber),
    });
  }

  registeredDomains.push({
    name: domain.name,
    id: domainId,
    txHash: domainTx.hash,
    blockNumber: Number(domainRcpt.blockNumber),
    classes: registeredClasses,
  });
}

const net = await provider.getNetwork();
const artifact = {
  name: 'HuntReputationOracle',
  address,
  txHash: tx.hash,
  blockNumber: Number(rcpt.blockNumber),
  chainId: Number(net.chainId),
  abi,
  huntAddress: HUNT_ADDRESS,
  registeredDomains,
  deployer: wallet.address,
  deployedAt: new Date().toISOString(),
};
await fs.mkdir('deployments', { recursive: true });
await fs.writeFile(
  'deployments/HuntReputationOracle.json',
  JSON.stringify(artifact, null, 2),
);
console.log('artifact: deployments/HuntReputationOracle.json');

const finalBal = await provider.getBalance(wallet.address);
console.log(
  `spent: ${ethers.formatEther(bal - finalBal)} OG | remaining: ${ethers.formatEther(finalBal)} OG`,
);
