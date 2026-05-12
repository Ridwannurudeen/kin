// Quick 0G Sealed Inference smoke test. Sends a tiny audit prompt to the default provider
// and reports whether the response is empty, malformed, or parseable.
//
// Usage: node scripts/smoke_0g.js

import 'dotenv/config';
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { getBroker, sealedQuery } from '../lib/inference.js';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error('PRIVATE_KEY required'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PK, provider);

console.log(`[smoke] funder: ${wallet.address}`);
console.log('[smoke] initialising broker...');
const tmp = await createZGComputeNetworkBroker(wallet);
const services = await tmp.inference.listService();
console.log(`[smoke] services: ${services.length}`);
const providerAddr = services[0]?.provider;
if (!providerAddr) { console.error('no providers'); process.exit(1); }
const broker = await getBroker(wallet, providerAddr);

const PROMPTS = [
  'Reply with the literal string: pong',
  'Return ONLY a JSON object {"ok": true}. No prose.',
  'You are a Solidity auditor. The contract has reentrancy. Return JSON {"findings":[{"cweClass":"swc-107-reentrancy","severity":"high","loc":"X.sol:1","issue":"x","exploitabilityPath":"x","fix":"x","gasImpact":"neutral"}],"selfEval":{"severityCalibrationBps":8000,"precisionBps":8000,"coverageBps":8000,"exploitabilityBps":8000,"rationale":"smoke"}}',
];

for (let i = 0; i < PROMPTS.length; i++) {
  console.log(`\n[smoke] === probe ${i + 1}/${PROMPTS.length} ===`);
  try {
    const r = await sealedQuery({
      broker, providerAddress: providerAddr,
      system: 'You respond exactly as requested.',
      question: PROMPTS[i], maxTokens: 600,
    });
    const len = r.answer?.length ?? 0;
    console.log(`  model:     ${r.model}`);
    console.log(`  attestation: ${r.attestationId} (valid=${r.valid})`);
    console.log(`  ans len:   ${len}`);
    console.log(`  ans head:  ${r.answer?.slice(0, 200) || '(empty)'}`);
    if (len > 0) {
      const idx1 = r.answer.indexOf('{');
      const idx2 = r.answer.lastIndexOf('}');
      if (idx1 >= 0 && idx2 > idx1) {
        try { JSON.parse(r.answer.slice(idx1, idx2 + 1)); console.log('  JSON parse: ok'); }
        catch (e) { console.log(`  JSON parse: FAIL — ${e.message.slice(0, 80)}`); }
      } else {
        console.log('  JSON parse: no braces found');
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message.slice(0, 200)}`);
  }
}

console.log('\n[smoke] done');
