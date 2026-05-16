import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInferenceUrl,
  resolvePublicAddresses,
  sealedQuery,
  sealedQueryStream,
} from "../lib/inference.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("inference endpoint hardening", () => {
  it("builds the completions URL under an HTTPS public endpoint path", async () => {
    const url = await buildInferenceUrl(
      "https://provider.example/v1",
      publicLookup,
    );
    assert.equal(url, "https://provider.example/v1/chat/completions");
  });

  it("rejects non-HTTPS endpoints", async () => {
    await assert.rejects(
      buildInferenceUrl("http://provider.example", publicLookup),
      /https/,
    );
  });

  it("rejects localhost endpoints before fetch", async () => {
    await assert.rejects(
      buildInferenceUrl("https://localhost:9443", publicLookup),
      /not public/,
    );
  });

  it("rejects private IP literals before fetch", async () => {
    await assert.rejects(
      buildInferenceUrl("https://10.0.0.2", publicLookup),
      /non-public IP range/,
    );
  });

  it("rejects DNS answers that resolve to private IPs", async () => {
    await assert.rejects(
      resolvePublicAddresses("provider.example", async () => [
        { address: "192.168.1.5", family: 4 },
      ]),
      /non-public IP range/,
    );
  });
});

describe("sealed inference requests", () => {
  function brokerFor(endpoint) {
    return {
      inference: {
        getServiceMetadata: async () => ({ endpoint, model: "model-a" }),
        getRequestHeaders: async () => ({ Authorization: "Bearer sealed" }),
        processResponse: async (_provider, attestationId, answer) =>
          attestationId === "att-1" && answer === "answer",
      },
    };
  }

  it("posts buffered queries to the validated completions URL", async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return {
        ok: true,
        headers: new Headers({ "zg-res-key": "att-1" }),
        json: async () => ({ choices: [{ message: { content: "answer" } }] }),
      };
    };

    const result = await sealedQuery({
      broker: brokerFor("https://provider.example/api"),
      providerAddress: "0xprovider",
      question: "find bugs",
      lookup: publicLookup,
      fetchImpl,
      timeoutMs: 1000,
    });

    assert.equal(seen.url, "https://provider.example/api/chat/completions");
    assert.equal(seen.init.method, "POST");
    assert.equal(seen.init.headers.Authorization, "Bearer sealed");
    assert.equal(result.answer, "answer");
    assert.equal(result.attestationId, "att-1");
    assert.equal(result.valid, true);
  });

  it("streams chunks and verifies the final answer", async () => {
    const chunks = [];
    const body = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(
          enc.encode('data: {"choices":[{"delta":{"content":"ans"}}]}\n\n'),
        );
        controller.enqueue(
          enc.encode('data: {"choices":[{"delta":{"content":"wer"}}]}\n\n'),
        );
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchImpl = async () => ({
      ok: true,
      headers: new Headers({ "zg-res-key": "att-1" }),
      body,
    });

    const result = await sealedQueryStream({
      broker: brokerFor("https://provider.example"),
      providerAddress: "0xprovider",
      question: "stream",
      lookup: publicLookup,
      fetchImpl,
      timeoutMs: 1000,
      onChunk: (delta) => chunks.push(delta),
    });

    assert.deepEqual(chunks, ["ans", "wer"]);
    assert.equal(result.answer, "answer");
    assert.equal(result.valid, true);
  });
});
