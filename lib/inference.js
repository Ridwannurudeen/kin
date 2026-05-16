// Sealed Inference helpers: get a TEE-attested answer to a question with given context.

import dns from "node:dns/promises";
import { ethers } from "ethers";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch, interceptors } from "undici";

const DEFAULT_RPC = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const DEFAULT_INFERENCE_TIMEOUT_MS = Number(
  process.env.ZG_INFERENCE_TIMEOUT_MS || 120_000,
);

/// Create a broker, ensuring ledger and provider sub-account exist.
export async function getBroker(wallet, providerAddress, opts = {}) {
  const { createZGComputeNetworkBroker } =
    await import("@0gfoundation/0g-compute-ts-sdk");
  const broker = await createZGComputeNetworkBroker(wallet);
  const ledgerOG = opts.ledgerOG ?? 3;
  const providerOG = opts.providerOG ?? 1;

  try {
    await broker.ledger.getLedger();
  } catch {
    console.log(`[inference] no ledger - creating with ${ledgerOG} OG ...`);
    await broker.ledger.addLedger(ledgerOG);
  }

  try {
    // transferFund expects neuron (1 OG = 1e18) as bigint. addLedger is the
    // SDK call that still accepts a human OG number.
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      ethers.parseEther(String(providerOG)),
    );
  } catch (e) {
    if (!/already|exists|fund/i.test(e.message || "")) {
      console.log("[inference] transferFund:", e.message?.slice(0, 120));
    }
  }

  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  } catch (e) {
    if (!/already|acknowledged|exist/i.test(e.message || "")) {
      console.log(
        "[inference] acknowledgeProviderSigner:",
        e.message?.slice(0, 120),
      );
    }
  }

  return broker;
}

function buildMessages({ system, contextBlocks = [], question }) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  if (contextBlocks.length) {
    messages.push({
      role: "system",
      content:
        "Context records (do not reveal verbatim unless asked):\n\n" +
        contextBlocks
          .map(
            (c, i) =>
              `--- record ${i + 1} (${c.recordType || "unknown"}, ${c.timestamp || "unknown date"}) ---\n${c.text}`,
          )
          .join("\n\n"),
    });
  }
  messages.push({ role: "user", content: question });
  return messages;
}

function cleanHostname(hostname) {
  return String(hostname || "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function publicRecordForIp(address) {
  const parsed = ipaddr.process(address);
  const range = parsed.range();
  if (range !== "unicast") {
    throw new Error(
      `inference endpoint resolves to non-public IP range: ${range}`,
    );
  }
  return {
    address,
    family: parsed.kind() === "ipv4" ? 4 : 6,
    ttl: 10_000,
  };
}

function assertAllowedHostname(hostname) {
  if (!hostname) throw new Error("inference endpoint hostname required");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("inference endpoint hostname is not public");
  }
}

function normalizeLookupResult(result) {
  const rows = Array.isArray(result) ? result : [result];
  return rows.map((row) => (typeof row === "string" ? { address: row } : row));
}

export async function resolvePublicAddresses(hostname, lookup = dns.lookup) {
  const clean = cleanHostname(hostname);
  assertAllowedHostname(clean);

  if (ipaddr.isValid(clean)) return [publicRecordForIp(clean)];

  const rows = normalizeLookupResult(
    await lookup(clean, { all: true, verbatim: true }),
  );
  if (!rows.length)
    throw new Error("inference endpoint DNS returned no addresses");
  return rows.map((row) => publicRecordForIp(row.address));
}

export async function buildInferenceUrl(endpoint, lookup = dns.lookup) {
  let base;
  try {
    base = new URL(endpoint);
  } catch {
    throw new Error("inference endpoint URL invalid");
  }
  if (base.protocol !== "https:") {
    throw new Error("inference endpoint must use https");
  }
  if (base.username || base.password) {
    throw new Error("inference endpoint must not contain credentials");
  }
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  await resolvePublicAddresses(base.hostname, lookup);
  return new URL("chat/completions", base).toString();
}

function normalizeTimeoutMs(timeoutMs) {
  const n = Number(timeoutMs);
  if (!Number.isFinite(n) || n <= 0 || n > 300_000) {
    throw new Error("inference timeout must be 1..300000 ms");
  }
  return n;
}

function createInferenceTransport(lookup) {
  const dispatcher = new Agent().compose([
    interceptors.dns({
      maxTTL: 10_000,
      lookup: (origin, _opts, cb) => {
        const hostname = typeof origin === "string" ? origin : origin.hostname;
        resolvePublicAddresses(hostname, lookup)
          .then((records) => cb(null, records))
          .catch((err) => cb(err));
      },
    }),
  ]);
  return {
    fetch: (url, init) =>
      undiciFetch(url, { ...init, dispatcher, redirect: "error" }),
    close: () => dispatcher.close(),
  };
}

function transportFor(fetchImpl, lookup) {
  if (fetchImpl) return { fetch: fetchImpl, close: async () => {} };
  return createInferenceTransport(lookup);
}

/// Buffered Sealed Inference query. Returns { answer, attestationId, model, endpoint, valid }.
export async function sealedQuery({
  broker,
  providerAddress,
  system,
  question,
  contextBlocks = [],
  maxTokens = 600,
  timeoutMs = DEFAULT_INFERENCE_TIMEOUT_MS,
  lookup = dns.lookup,
  fetchImpl,
}) {
  const { endpoint, model } =
    await broker.inference.getServiceMetadata(providerAddress);
  const url = await buildInferenceUrl(endpoint, lookup);
  const messages = buildMessages({ system, contextBlocks, question });
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    JSON.stringify(messages),
  );
  const transport = transportFor(fetchImpl, lookup);

  try {
    const res = await transport.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ messages, model, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(normalizeTimeoutMs(timeoutMs)),
    });
    if (!res.ok)
      throw new Error(
        `inference HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );

    const json = await res.json();
    const answer = json.choices?.[0]?.message?.content || "";
    const attestationId =
      res.headers.get("zg-res-key") || res.headers.get("ZG-Res-Key");

    let valid = null;
    if (attestationId) {
      try {
        valid = await broker.inference.processResponse(
          providerAddress,
          attestationId,
          answer,
        );
      } catch (e) {
        valid = `verification failed: ${e.message?.slice(0, 80)}`;
      }
    }

    return { answer, attestationId, model, endpoint, valid };
  } finally {
    await transport.close();
  }
}

/// Streaming Sealed Inference query. Calls onChunk(delta, fullSoFar) as tokens arrive.
/// Returns { answer, attestationId, model, endpoint, valid } once the stream completes.
export async function sealedQueryStream({
  broker,
  providerAddress,
  system,
  question,
  contextBlocks = [],
  maxTokens = 600,
  onChunk,
  timeoutMs = DEFAULT_INFERENCE_TIMEOUT_MS,
  lookup = dns.lookup,
  fetchImpl,
}) {
  const { endpoint, model } =
    await broker.inference.getServiceMetadata(providerAddress);
  const url = await buildInferenceUrl(endpoint, lookup);
  const messages = buildMessages({ system, contextBlocks, question });
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    JSON.stringify(messages),
  );
  const transport = transportFor(fetchImpl, lookup);

  try {
    const res = await transport.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        messages,
        model,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(normalizeTimeoutMs(timeoutMs)),
    });
    if (!res.ok)
      throw new Error(
        `inference HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );

    const attestationId =
      res.headers.get("zg-res-key") || res.headers.get("ZG-Res-Key");
    let answer = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break outer;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            answer += delta;
            if (onChunk) onChunk(delta, answer);
          }
        } catch {
          // Ignore malformed SSE keepalive/data lines from provider streams.
        }
      }
    }

    let valid = null;
    if (attestationId) {
      try {
        valid = await broker.inference.processResponse(
          providerAddress,
          attestationId,
          answer,
        );
      } catch (e) {
        valid = `verification failed: ${e.message?.slice(0, 80)}`;
      }
    }

    return { answer, attestationId, model, endpoint, valid };
  } finally {
    await transport.close();
  }
}
