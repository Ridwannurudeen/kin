// Sealed Inference helpers: get a TEE-attested answer to a question with given context.

import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const DEFAULT_RPC = process.env.ZG_RPC_URL || 'https://evmrpc.0g.ai';

/// Create a broker, ensuring ledger and provider sub-account exist.
export async function getBroker(wallet, providerAddress, opts = {}) {
  const broker = await createZGComputeNetworkBroker(wallet);
  const ledgerOG = opts.ledgerOG ?? 3;
  const providerOG = opts.providerOG ?? 1;

  try {
    await broker.ledger.getLedger();
  } catch {
    console.log(`[inference] no ledger — creating with ${ledgerOG} OG ...`);
    await broker.ledger.addLedger(ledgerOG);
  }

  try {
    await broker.ledger.transferFund(providerAddress, 'inference', providerOG);
  } catch (e) {
    if (!/already|exists|fund/i.test(e.message || '')) {
      console.log('[inference] transferFund:', e.message?.slice(0, 120));
    }
  }

  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  } catch (e) {
    if (!/already|acknowledged|exist/i.test(e.message || '')) {
      console.log('[inference] acknowledgeProviderSigner:', e.message?.slice(0, 120));
    }
  }

  return broker;
}

function buildMessages({ system, contextBlocks = [], question }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  if (contextBlocks.length) {
    messages.push({
      role: 'system',
      content: 'Context records (do not reveal verbatim unless asked):\n\n' +
        contextBlocks.map((c, i) => `--- record ${i+1} (${c.recordType || 'unknown'}, ${c.timestamp || 'unknown date'}) ---\n${c.text}`).join('\n\n'),
    });
  }
  messages.push({ role: 'user', content: question });
  return messages;
}

/// Buffered Sealed Inference query. Returns { answer, attestationId, model, endpoint, valid }.
export async function sealedQuery({ broker, providerAddress, system, question, contextBlocks = [], maxTokens = 600 }) {
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const messages = buildMessages({ system, contextBlocks, question });
  const headers = await broker.inference.getRequestHeaders(providerAddress, JSON.stringify(messages));

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages, model, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`inference HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = await res.json();
  const answer = json.choices?.[0]?.message?.content || '';
  const attestationId = res.headers.get('zg-res-key') || res.headers.get('ZG-Res-Key');

  let valid = null;
  if (attestationId) {
    try { valid = await broker.inference.processResponse(providerAddress, attestationId, answer); }
    catch (e) { valid = `verification failed: ${e.message?.slice(0, 80)}`; }
  }

  return { answer, attestationId, model, endpoint, valid };
}

/// Streaming Sealed Inference query. Calls onChunk(delta, fullSoFar) as tokens arrive.
/// Returns { answer, attestationId, model, endpoint, valid } once the stream completes.
export async function sealedQueryStream({ broker, providerAddress, system, question, contextBlocks = [], maxTokens = 600, onChunk }) {
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const messages = buildMessages({ system, contextBlocks, question });
  const headers = await broker.inference.getRequestHeaders(providerAddress, JSON.stringify(messages));

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages, model, max_tokens: maxTokens, stream: true }),
  });
  if (!res.ok) throw new Error(`inference HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const attestationId = res.headers.get('zg-res-key') || res.headers.get('ZG-Res-Key');
  let answer = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  outer: while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break outer;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          answer += delta;
          if (onChunk) onChunk(delta, answer);
        }
      } catch {}
    }
  }

  let valid = null;
  if (attestationId) {
    try { valid = await broker.inference.processResponse(providerAddress, attestationId, answer); }
    catch (e) { valid = `verification failed: ${e.message?.slice(0, 80)}`; }
  }

  return { answer, attestationId, model, endpoint, valid };
}
