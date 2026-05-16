import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function artifactAbi() {
  return JSON.parse(fs.readFileSync("artifacts/contracts/Hunt.sol/Hunt.json"))
    .abi;
}

function deploymentAbi() {
  return JSON.parse(fs.readFileSync("deployments/Hunt.json")).abi;
}

function publicAbi() {
  const source = fs.readFileSync("public/contracts.js", "utf8");
  const sandbox = { window: {}, ethers: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.HUNT_ABI;
}

function outputComponent(abi, fnName, componentName) {
  const fn = abi.find(
    (item) => item.type === "function" && item.name === fnName,
  );
  assert.ok(fn, `${fnName} missing`);
  const component = fn.outputs[0].components.find(
    (c) => c.name === componentName,
  );
  assert.ok(component, `${fnName}.${componentName} missing`);
  return component.type;
}

// Deployed bytecode at 0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C stores
// totalEarnedWei as uint64. Source compiles it as uint256 (v1.1 redeploy).
// deployments/Hunt.json + public/contracts.js MUST match deployed storage
// width, not compiled source, so the frontend doesn't misdecode adjacent
// storage. When v1.1 ships, flip these expectations to uint256.
describe("Hunt ABI copies", () => {
  it("deployment + public ABI pin totalEarnedWei to deployed bytecode width", () => {
    for (const abi of [deploymentAbi(), publicAbi()]) {
      assert.equal(
        outputComponent(abi, "getHunter", "totalEarnedWei"),
        "uint64",
      );
      assert.equal(
        outputComponent(abi, "getClassRep", "totalEarnedWei"),
        "uint64",
      );
    }
    // Sanity: compiled source is intentionally ahead (uint256) — see Hunt.sol notice.
    assert.equal(
      outputComponent(artifactAbi(), "getHunter", "totalEarnedWei"),
      "uint256",
    );
  });
});
