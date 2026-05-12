// Inspect the RAW HTTP response from GLM-5-FP8 for the structured audit prompt.
// lib/inference.js silently drops everything except json.choices[0].message.content;
// before concluding "empty body" we need to see finish_reason, refusal, content_filter, raw json.
// Also tries streaming variant — many models behave differently under stream vs non-stream.

import "dotenv/config";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { getBroker } from "../lib/inference.js";
import { buildReviewPrompt } from "../lib/review.js";

const RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc.0g.ai";
const wallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  new ethers.JsonRpcProvider(RPC_URL),
);

const tmp = await createZGComputeNetworkBroker(wallet);
const services = await tmp.inference.listService();
const GLM = services[0].provider;
console.log(`[probe] provider:    ${GLM}`);
console.log(`[probe] model meta:  ${services[0].model}`);

const broker = await getBroker(wallet, GLM);
const { endpoint, model } = await broker.inference.getServiceMetadata(GLM);
console.log(`[probe] endpoint:    ${endpoint}`);
console.log(`[probe] runtime model: ${model}`);

const messages = buildReviewPrompt({
  samples: [
    "Oracle returning stale price during volatile periods enabled liquidation of healthy positions in Prisma Finance (Code4rena Mar 2024).",
  ],
  brief: {
    chain: "0G Aristotle",
    language: "solidity",
    contractsInScope: ["Vault.sol"],
    focus: ["oracle-manipulation", "access-control", "reentrancy"],
    diff: "pragma solidity ^0.8.20; contract Vault { uint256 public lastPrice; function setPrice() external { lastPrice = 100; } function liquidate() external {} }",
  },
});

async function probe(label, body) {
  console.log(`\n[probe] === ${label} ===`);
  console.log(
    `[probe] body keys: ${Object.keys(body).join(", ")} | max_tokens=${body.max_tokens} | stream=${!!body.stream}`,
  );
  const headers = await broker.inference.getRequestHeaders(
    GLM,
    JSON.stringify(body.messages),
  );
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  console.log(`[probe] http status: ${res.status} ${res.statusText}`);
  console.log(
    `[probe] zg-res-key:  ${res.headers.get("zg-res-key") || res.headers.get("ZG-Res-Key")}`,
  );
  const text = await res.text();
  if (body.stream) {
    console.log(`[probe] raw stream len: ${text.length}`);
    console.log(`[probe] raw stream head (1000 chars):`);
    console.log(text.slice(0, 1000));
    console.log(`[probe] raw stream tail (500 chars):`);
    console.log(text.slice(-500));
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.log(`[probe] non-JSON body (len ${text.length}):`);
    console.log(text.slice(0, 1000));
    return;
  }
  console.log(
    `[probe] raw JSON top-level keys: ${Object.keys(parsed).join(", ")}`,
  );
  console.log(`[probe] usage: ${JSON.stringify(parsed.usage)}`);
  console.log(`[probe] choices: ${parsed.choices?.length ?? 0}`);
  if (parsed.choices?.[0]) {
    const c = parsed.choices[0];
    console.log(`[probe] choice[0] keys: ${Object.keys(c).join(", ")}`);
    console.log(`[probe] finish_reason: ${c.finish_reason}`);
    if (c.message) {
      console.log(`[probe] message keys: ${Object.keys(c.message).join(", ")}`);
      console.log(`[probe] message.role: ${c.message.role}`);
      console.log(
        `[probe] message.content len: ${(c.message.content ?? "").length}`,
      );
      console.log(
        `[probe] message.content head: ${(c.message.content || "").slice(0, 500).replace(/\n/g, " ")}`,
      );
      if (c.message.refusal)
        console.log(`[probe] message.refusal: ${c.message.refusal}`);
      if (c.message.reasoning_content)
        console.log(
          `[probe] message.reasoning_content head: ${String(c.message.reasoning_content).slice(0, 500).replace(/\n/g, " ")}`,
        );
    }
    if (c.delta)
      console.log(
        `[probe] choice.delta keys: ${Object.keys(c.delta).join(", ")}`,
      );
    if (c.content_filter_results)
      console.log(
        `[probe] content_filter_results: ${JSON.stringify(c.content_filter_results).slice(0, 200)}`,
      );
  }
  if (parsed.error)
    console.log(`[probe] error: ${JSON.stringify(parsed.error).slice(0, 500)}`);
}

const baseBody = {
  messages: [
    { role: "system", content: messages[0].content },
    { role: "user", content: messages[1].content },
  ],
  model,
  max_tokens: 1500,
};

// 1: same payload as production lib/inference.js
await probe("non-stream, max_tokens=1500 (production payload)", {
  ...baseBody,
});
// 2: bump max_tokens — model might be reasoning silently and hitting limit
await probe("non-stream, max_tokens=4000", { ...baseBody, max_tokens: 4000 });
// 3: stream — surfaces reasoning_content + delta events many models emit before final content
await probe("stream=true, max_tokens=2000", {
  ...baseBody,
  max_tokens: 2000,
  stream: true,
});
