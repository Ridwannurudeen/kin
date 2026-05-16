// Static frontend smoke test for the Hunt judge-facing pages.
// Boots bin/serve.js on a throwaway port, fetches key pages/artifacts, and
// asserts the live deployment addresses are visible where judges need them.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = String(3900 + Math.floor(Math.random() * 500));
const BASE = `http://127.0.0.1:${PORT}`;

const EXPECTED = {
  hunt: "0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C",
  notary: "0x968d5E070152A90Ae7a3c5251222FC163b72C7E2",
  oracle: "0xdf2f9587D5746cd1358d40804bE7885BDaaE45d2",
};

function startServer(rpcUrl) {
  const child = spawn(process.execPath, ["bin/serve.js"], {
    env: {
      ...process.env,
      PORT,
      ZG_RPC_URL: rpcUrl,
      HUNT_RPC_TIMEOUT_MS: "250",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (buf) => process.stdout.write(buf));
  child.stderr.on("data", (buf) => process.stderr.write(buf));
  return child;
}

function startSlowRpc() {
  const server = http.createServer(() => {});
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`server did not start on ${BASE}`);
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  assert.equal(r.status, 200, `${path} should return 200`);
  return await r.text();
}

async function getJson(path) {
  const r = await fetch(`${BASE}${path}`);
  assert.equal(r.status, 200, `${path} should return 200`);
  return await r.json();
}

async function main() {
  const rpc = await startSlowRpc();
  const rpcUrl = `http://127.0.0.1:${rpc.address().port}`;
  const server = startServer(rpcUrl);
  try {
    await waitForServer();

    const pages = [
      ["/", "Sealed audits"],
      ["/hunters.html", "Minted"],
      ["/bounties.html", "Open"],
      ["/verticals.html", "Infrastructure layer"],
      ["/notary.html", "Verify by attestId"],
      ["/status.html", "Hunt is live"],
      ["/proof.html?bounty=3", "Verify the"],
    ];
    for (const [path, marker] of pages) {
      const body = await get(path);
      assert.match(body, /\/vendor\/ethers-6\.13\.1\.umd\.min\.js|verticals/i);
      assert.ok(body.includes(marker), `${path} should include ${marker}`);
      assert.ok(body.includes("/status.html"), `${path} should link status`);
    }

    const hunt = await getJson("/deployments/Hunt.json");
    const notary = await getJson("/deployments/Notary.json");
    const oracle = await getJson("/deployments/HuntReputationOracle.json");
    assert.equal(hunt.address, EXPECTED.hunt);
    assert.equal(notary.address, EXPECTED.notary);
    assert.equal(oracle.address, EXPECTED.oracle);
    assert.equal(oracle.registeredDomains.length, 4);

    const vendor = await get("/vendor/ethers-6.13.1.umd.min.js");
    assert.ok(vendor.includes("ethers"), "local ethers bundle should serve");

    const traversal = await fetch(`${BASE}/deployments/../package.json`);
    assert.notEqual(
      traversal.status,
      200,
      "deployment traversal should not serve package.json",
    );

    const malformed = await fetch(`${BASE}/%E0%A4%A`);
    assert.equal(malformed.status, 400, "malformed URL escape returns 400");

    const badLimit = await fetch(`${BASE}/api/bounties?limit=abc`);
    assert.equal(badLimit.status, 400, "invalid API limit returns 400");

    const t0 = Date.now();
    const health = await fetch(`${BASE}/api/health`);
    const healthJson = await health.json();
    assert.equal(health.status, 503, "stuck RPC should return degraded health");
    assert.equal(healthJson.rpcOk, false);
    assert.ok(Date.now() - t0 < 3_000, "health should not hang on stuck RPC");

    const statsFail = await fetch(`${BASE}/api/stats`);
    assert.equal(
      statsFail.status,
      500,
      "RPC stats failures return JSON errors",
    );

    const apiAfterFailure = await fetch(`${BASE}/api`);
    assert.equal(
      apiAfterFailure.status,
      200,
      "API server should survive async handler failures",
    );

    console.log("static smoke: ok");
  } finally {
    server.kill();
    rpc.close();
  }
}

await main();
