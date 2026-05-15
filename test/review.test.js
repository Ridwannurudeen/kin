import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hasValidSealedAttestation } from "../lib/review.js";

describe("review attestation validation", () => {
  it("accepts only a present ZG-Res-Key with processResponse === true", () => {
    assert.equal(
      hasValidSealedAttestation({
        attestationId: "zg-res-key",
        attestationValid: true,
      }),
      true,
    );

    assert.equal(
      hasValidSealedAttestation({
        attestationId: "zg-res-key",
        attestationValid: "verification failed",
      }),
      false,
    );

    assert.equal(
      hasValidSealedAttestation({
        attestationId: null,
        attestationValid: true,
      }),
      false,
    );
  });
});
