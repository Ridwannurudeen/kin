import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { winningFindingPasses } from "../scripts/verify_bounty.js";

describe("verify_bounty strict result gating", () => {
  it("fails strict mode when the supplied modelDigest does not re-derive the finding digest", () => {
    assert.equal(
      winningFindingPasses({
        sigOk: true,
        teeInWindow: true,
        digestMatch: false,
        strictMode: true,
      }),
      false,
    );
  });

  it("allows non-strict receipt checks to pass on signer and timestamp alone", () => {
    assert.equal(
      winningFindingPasses({
        sigOk: true,
        teeInWindow: true,
        digestMatch: false,
        strictMode: false,
      }),
      true,
    );
  });

  it("fails when signer or race-window checks fail", () => {
    assert.equal(
      winningFindingPasses({
        sigOk: false,
        teeInWindow: true,
        digestMatch: true,
        strictMode: true,
      }),
      false,
    );
    assert.equal(
      winningFindingPasses({
        sigOk: true,
        teeInWindow: false,
        digestMatch: true,
        strictMode: true,
      }),
      false,
    );
  });
});
