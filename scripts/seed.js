// Seed the Kin marketplace with realistic personas + skills + completed jobs.
// Run on the VPS (where wallets are funded). Uses the operator (.env) wallet to fund persona wallets.
//
// Usage: PRIVATE_KEY=0x... node scripts/seed.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { genKey, uploadEncryptedRecord, downloadEncryptedRecord } from '../lib/storage.js';
import { getBroker, sealedQuery } from '../lib/inference.js';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';
const PK = process.env.PRIVATE_KEY;
if (!PK) { console.error('PRIVATE_KEY missing'); process.exit(1); }

const artifact = JSON.parse(await fs.readFile('deployments/Kin.json', 'utf8'));
const provider = new ethers.JsonRpcProvider(RPC_URL);
const operator = new ethers.Wallet(PK, provider);

console.log(`operator: ${operator.address}`);
const opBal = await provider.getBalance(operator.address);
console.log(`balance: ${ethers.formatEther(opBal)} OG\n`);

// Demo personas — each owns one skill
const PERSONAS = [
  {
    name: 'Maya',
    skillType: 'strategy-memo',
    description: 'Founder/operator memo style — confident, terse, no fluff.',
    pricePerJob: '0.01',
    samples: [
      `Notes from the investor call:\n\nThe pitch landed. They asked twice about unit economics — tighten the gross-margin slide before Friday's followup. Don't lead with the bridge round; lead with customer count, save the ask for the back half.`,
      `Quick take on Acme:\n\nNot the price. The close-by date. They'll move on quality if we hold the line, but they walk on a Q3 timeline. Counter at +15% with Q4 close, give back on payment terms.`,
      `Stop emailing me about the Q3 numbers. I see them. I am thinking about them. Replies will follow when I have a useful one. — M`,
    ],
  },
  {
    name: 'Jordan',
    skillType: 'code-review',
    description: 'Senior backend code review — surfaces real issues, no nits.',
    pricePerJob: '0.015',
    samples: [
      `Re: PR #4421\n\nThe pagination cursor is base64-encoded JSON. That's fine for v0 but you've made it a public contract. Next time you change the cursor format you'll break clients silently. Sign the cursor with HMAC + a version byte, or the next person to touch this hates you.`,
      `Re: that timeout flag\n\nYou added a 30s timeout to fix the symptom. The actual issue is the N+1 query in line 84 — we're hitting Postgres 200x per request. Look at the EXPLAIN. Add the join, drop the timeout.`,
      `The retry logic is exponential backoff *with* jitter, but jitter is 0..backoff which means worst case is 2x backoff. Cap it. Also: the retry-on-500 will retry idempotent failures. Add an idempotency key or stop retrying writes.`,
    ],
  },
  {
    name: 'Aria',
    skillType: 'research-brief',
    description: 'Structured 1-pager research — McKinsey 7S meets fast-twitch.',
    pricePerJob: '0.02',
    samples: [
      `**Question:** Why is GTM stalling in the EMEA segment?\n\n**Findings (4 weeks of interviews + sales data):**\n1. Pricing in USD is the #1 friction — 60% of lost deals cite "feels expensive" but the actual delta to local benchmarks is 8%.\n2. Procurement cycles in DE/FR are 4× longer than US (avg 87 days vs 22 days).\n3. Our case studies are all US logos — zero relatable references.\n\n**Recommendation:** EUR pricing tier + local case studies before further EMEA spend.`,
      `**TL;DR:** The retention dip in March is mostly Tier 2 ICPs we mis-sold in Q4.\n\n- New cohorts converting at 38% (vs target 55%).\n- Drill-down: Tier 2 ICPs converting at 19%, Tier 1 at 64%.\n- Tier 2 was added to ICP list in Oct based on 3 anecdotes from one sales rep.\n\n**Action:** Re-test ICP list with current data. Stop selling Tier 2.`,
      `**Hypothesis tested:** Does 14-day vs 30-day trial change conversion?\n\n**Setup:** A/B over 6 weeks, n=2,400.\n\n**Result:** No significant difference (p=0.42). 14-day trial converts at 31.2%, 30-day at 31.8%.\n\n**Implication:** Trial length is not the lever. Stop discussing this. Move on to onboarding completion (only 41% of trials hit core action).`,
    ],
  },
  {
    name: 'Theo',
    skillType: 'sales-copy',
    description: 'Direct-response copy — every line earns its place or gets cut.',
    pricePerJob: '0.012',
    samples: [
      `**Subject:** You're spending $4,200/mo on a problem that doesn't exist anymore.\n\nYou bought your CRM in 2019. It made sense then. It costs you $4,200/month now and your AEs hate it.\n\nWe replaced this exact stack at 12 companies last year. They saved an average of $38K/yr.\n\n15 minutes. We'll show you the migration plan. If it's not obviously better, we'll stop the call early.\n\n[book 15 min]`,
      `Headline: Stop hiring SDRs. Start hiring closers.\n\nSubhead: AI books your meetings. You close them.\n\n— 23,400 meetings booked last quarter\n— $0 spent on SDR salaries\n— 4-week implementation, full money back if it doesn't 3x your pipeline\n\n[Start free pilot →]`,
      `**Re-engagement email (people who churned):**\n\nHey [name] —\n\nWe noticed you left in March. We didn't reach out then because the product wasn't ready for what you needed.\n\nIt is now. Specifically: [feature they asked about] launched two weeks ago.\n\nNot pitching. Just: if you're still wrestling with [problem], we'd love a 20-min call to walk through it. No demo deck. Just the screen.\n\n[my calendar]`,
    ],
  },
  {
    name: 'Lin',
    skillType: 'ux-critique',
    description: 'Design crit — surfaces invisible friction, not pixel nits.',
    pricePerJob: '0.018',
    samples: [
      `**Onboarding flow review:**\n\nThe whole flow is 11 screens. The user hits a paywall on screen 5 — before they've experienced any value. Reverse this. Let them taste the product, *then* ask for the credit card.\n\nAlso: the "skip" button is light gray on white. You're not actually offering a skip; you're recording the user's frustration.`,
      `**Dashboard rec:**\n\nThree problems:\n1. The "create new project" button is hidden in a kebab menu. Make it primary.\n2. The empty state is a screenshot of someone else's dashboard. Replace with a 3-step setup guide.\n3. The onboarding checklist is in the bottom-right corner where no one looks. Move to top of page; collapse only after 100% complete.`,
      `**Re: the upsell modal:**\n\nIt fires after 2 minutes. Most users haven't done anything by then — they're still figuring out the product. Either fire it on a *successful* action (so it's a reward) or push it to day 3. Right now it interrupts learning, which trains users to dismiss anything that pops up.`,
    ],
  },
];

const SAMPLE_BRIEFS = [
  { skillIndex: 0, brief: `Write a 200-word internal memo announcing a 4-week sprint focused on shipping the API redesign by end of Q3. Confident, slightly impatient, no fluff. Mention 9am daily check-ins (no exceptions) and that anyone slipping a deadline owes the team coffee.` },
  { skillIndex: 0, brief: `Draft a 3-paragraph note to the board explaining why we're pausing the Asia expansion. Founder voice. Decisive but not defensive. Frame as a focus decision, not a retreat.` },
  { skillIndex: 1, brief: `Review this PR description: "Adds a new endpoint /api/users/:id/posts that returns the user's posts. Caches with Redis 5min TTL." What questions would you ask the author?` },
  { skillIndex: 1, brief: `One of our junior engineers wrote a payment webhook handler that catches all errors with try/catch and returns 200 OK regardless. Write the review comment.` },
  { skillIndex: 2, brief: `One-pager: should we accept a strategic investment from a competitor? Pros, cons, decision criteria. The CEO needs this in 4 hours.` },
  { skillIndex: 3, brief: `Write a cold email to a CTO of a 200-person SaaS company, pitching our developer productivity tool. Hook them in line one. Get the meeting in line three.` },
  { skillIndex: 4, brief: `Critique this checkout flow (3 screens, signup → pricing → payment). Top 3 friction points to fix this sprint.` },
];

async function fundIfNeeded(addr, target) {
  const cur = await provider.getBalance(addr);
  const targetWei = ethers.parseEther(target);
  if (cur >= targetWei) return false;
  const need = targetWei - cur;
  const tx = await operator.sendTransaction({ to: addr, value: need });
  await tx.wait();
  console.log(`  funded ${addr.slice(0, 10)}… with ${ethers.formatEther(need)} OG`);
  return true;
}

async function loadOrCreatePersonaWallets() {
  let saved;
  try { saved = JSON.parse(await fs.readFile('.persona-wallets.json', 'utf8')); }
  catch {
    saved = {};
    for (const p of PERSONAS) {
      const w = ethers.Wallet.createRandom();
      saved[p.name] = { address: w.address, privateKey: w.privateKey };
    }
    await fs.writeFile('.persona-wallets.json', JSON.stringify(saved, null, 2), { mode: 0o600 });
    console.log('generated persona wallets, saved to .persona-wallets.json');
  }
  return saved;
}

const personaWallets = await loadOrCreatePersonaWallets();

console.log('=== funding personas ===');
for (const p of PERSONAS) {
  const pw = personaWallets[p.name];
  await fundIfNeeded(pw.address, '0.04');
}

// One client wallet (existing demo client), reused for all jobs
const dw = JSON.parse(await fs.readFile('.demo-wallets.json', 'utf8'));
await fundIfNeeded(dw.client.address, '0.5');

const artifactInst = (signer) => new ethers.Contract(artifact.address, artifact.abi, signer);
const kinOp = artifactInst(operator);

// === Mint skills ===
console.log('\n=== minting skills ===');
const userKey = Buffer.from(await fs.readFile('.user-key.bin').catch(async () => {
  const k = genKey(); await fs.writeFile('.user-key.bin', k, { mode: 0o600 }); return k;
}));

const skillIds = [];
const totalBefore = Number(await kinOp.totalSkills());
console.log(`existing skills on-chain: ${totalBefore}`);

for (let i = 0; i < PERSONAS.length; i++) {
  const p = PERSONAS[i];
  const pw = personaWallets[p.name];
  const personaWallet = new ethers.Wallet(pw.privateKey, provider);
  const kinPersona = artifactInst(personaWallet);

  // Skip if persona already has a skill of this type
  const total = Number(await kinOp.totalSkills());
  let alreadyMinted = -1;
  for (let j = 0; j < total; j++) {
    const s = await kinOp.getSkill(j);
    if (s.owner.toLowerCase() === pw.address.toLowerCase() && s.skillType === p.skillType) {
      alreadyMinted = j; break;
    }
  }
  if (alreadyMinted >= 0) {
    console.log(`  ${p.name} already has skill #${alreadyMinted}`);
    skillIds.push(alreadyMinted);
    continue;
  }

  const sampleRoots = [];
  for (const sample of p.samples) {
    const { rootHash } = await uploadEncryptedRecord(sample, userKey, personaWallet);
    sampleRoots.push(rootHash);
  }
  const sealedKey = '0x' + crypto.randomBytes(32).toString('hex');
  const tx = await kinPersona.mintSkill(
    p.skillType,
    p.description,
    sampleRoots,
    sealedKey,
    ethers.parseEther(p.pricePerJob),
  );
  const rcpt = await tx.wait();
  const skillId = Number((await kinOp.totalSkills()) - 1n);
  console.log(`  ${p.name} minted skill #${skillId} (${p.skillType}) | tx ${tx.hash} | gas ${rcpt.gasUsed}`);
  skillIds.push(skillId);
}

// === Save persona → skill map for UI ===
const personasMap = {};
for (let i = 0; i < PERSONAS.length; i++) {
  personasMap[skillIds[i]] = { name: PERSONAS[i].name, address: personaWallets[PERSONAS[i].name].address };
}
await fs.writeFile('public/personas.json', JSON.stringify(personasMap, null, 2));
console.log(`wrote public/personas.json (${Object.keys(personasMap).length} personas)`);

// === Post + settle jobs ===
console.log('\n=== posting + settling jobs ===');
const client = new ethers.Wallet(dw.client.privateKey, provider);
const kinClient = artifactInst(client);

for (let i = 0; i < SAMPLE_BRIEFS.length; i++) {
  const item = SAMPLE_BRIEFS[i];
  const skillId = skillIds[item.skillIndex];
  const skill = await kinOp.getSkill(skillId);

  // Check if a similar job is already accepted (skip duplicate seeding)
  const totalJobs = Number(await kinOp.totalJobs());
  let already = false;
  for (let j = Math.max(0, totalJobs - 30); j < totalJobs; j++) {
    const job = await kinOp.getJob(j);
    if (Number(job.skillId) === skillId && job.status === 2 /*Accepted*/) { already = true; break; }
  }
  if (already && i < SAMPLE_BRIEFS.length - 2) {
    console.log(`  skill #${skillId} already has accepted jobs; skipping job ${i}`);
    continue;
  }

  // Post job
  const briefKey = genKey();
  const { rootHash: briefRoot } = await uploadEncryptedRecord(item.brief, briefKey, client);
  const postTx = await kinClient.postJob(skillId, briefRoot, { value: skill.pricePerJob });
  await postTx.wait();
  const jobId = Number((await kinOp.totalJobs()) - 1n);
  console.log(`  job #${jobId} posted to skill #${skillId} (${PERSONAS[item.skillIndex].name})`);

  // Run inference + submit
  const personaWallet = new ethers.Wallet(personaWallets[PERSONAS[item.skillIndex].name].privateKey, provider);
  const kinPersona = artifactInst(personaWallet);

  const samples = [];
  for (const root of skill.sampleRoots) {
    try {
      const text = await downloadEncryptedRecord(root, userKey, undefined, { maxAttempts: 8, delayMs: 8000 });
      samples.push({ recordType: 'voice-sample', text: text.toString(), timestamp: '' });
    } catch {}
  }
  if (samples.length === 0) { console.log(`    SKIP — no samples retrievable yet`); continue; }

  const tmp = await createZGComputeNetworkBroker(operator);
  const services = await tmp.inference.listService();
  const providerAddr = services[0]?.provider;
  const broker = await getBroker(operator, providerAddr);
  const result = await sealedQuery({
    broker, providerAddress: providerAddr,
    system: 'You are a freelance ghost-writing AI agent on Kin. Match the writing samples\' voice precisely. Produce ONLY the requested deliverable.',
    question: item.brief,
    contextBlocks: samples,
    maxTokens: 700,
  });

  const { rootHash: outputRoot } = await uploadEncryptedRecord(result.answer, briefKey, personaWallet);
  const attBytes = result.attestationId
    ? ethers.zeroPadValue('0x' + Buffer.from(result.attestationId.replace(/-/g, ''), 'hex').toString('hex'), 32)
    : ethers.ZeroHash;
  const submitTx = await kinPersona.submitWork(jobId, outputRoot, attBytes);
  await submitTx.wait();
  const acceptTx = await kinClient.acceptWork(jobId, 5);
  await acceptTx.wait();
  console.log(`    submitted + settled (5/5) | submit ${submitTx.hash.slice(0,12)} | accept ${acceptTx.hash.slice(0,12)}`);
}

const finalBal = await provider.getBalance(operator.address);
console.log(`\nfinal operator balance: ${ethers.formatEther(finalBal)} OG`);
console.log(`spent: ${ethers.formatEther(opBal - finalBal)} OG`);

const totalSkillsAfter = Number(await kinOp.totalSkills());
const totalJobsAfter = Number(await kinOp.totalJobs());
console.log(`\nmarketplace state: ${totalSkillsAfter} skills, ${totalJobsAfter} jobs`);
