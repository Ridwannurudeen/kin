# Live Sealed Inference run — insurance vertical (honest capture)

Run timestamp: `2026-05-13T13:15:53.877Z` → `2026-05-13T13:16:44.773Z`

This is the **honest, verbatim** capture of what 0G's Sealed Inference returned when handed the v2 insurance specialist brief (system prompt + structured user prompt built from `audits/insurance/sample_denial.txt`). The protocol's existing README explicitly caveats that the v1 model (`zai-org/GLM-5-FP8`) is tuned for code reasoning and is **unvalidated on legal/clinical text**. This file is the empirical complement to that caveat.

## Setup

| Field | Value |
|---|---|
| Operator wallet | `0xc9c0754fDB2C22Fd19B5B649e1e60eE9d1Ccca3f` |
| Provider address | `0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C` |
| Model (v1) | `zai-org/GLM-5-FP8` (code-reasoning-tuned; **not** legal-policy tuned) |
| Max tokens | 5000 |
| Sample bytes | 3867 |
| System prompt | locked to JSON-only insurance defense schema |
| In-scope defect classes | 6 (medical-necessity / coding / prior-auth / network / ERISA / state-external-review) |

## Raw model output

Model: `zai-org/GLM-5-FP8`
Attestation ID (ZG-Res-Key header): `d86b8797-b757-4b9d-a396-8e8d46c4f994`
broker.inference.processResponse validation: `true`
Endpoint: `https://compute-network-1.integratenetwork.work/v1/proxy`

### Verbatim answer

```
```json
{
  "findings": [
    {
      "defectClass": "medical-necessity-misapplication",
      "severity": "critical",
      "loc": "predictive length-of-stay model...estimates...16.4 days",
      "issue": "The denial substitutes an algorithmic population-level length-of-stay estimate for the individualized clinical review required under 42 C.F.R. § 422.101(b). A 'typical' length of stay derived from a predictive model cannot determine medical necessity for an individual patient; the regulation mandates an individualized assessment of the member's specific clinical circumstances.",
      "remedyPath": "File expedited appeal with the plan within 60 days (or 24 hours for fast-track QIO appeal); request the clinical records and algorithmic output used; demand individualized medical-necessity review by a qualified clinician.",
      "supportingAuthority": "42 C.F.R. § 422.101(b); Medicare Managed Care Manual, Ch. 4, § 10.2 (coverage determinations must be based on individual assessment of medical necessity)"
    },
    {
      "defectClass": "medical-necessity-misapplication",
      "severity": "high",
      "loc": "applies the Medicare benefit policy at LCD L33635",
      "issue": "LCD L33635 is a wound-care local coverage determination and does not establish medical-necessity criteria for SNF coverage continuation. SNF coverage criteria are governed by the Medicare Benefit Policy Manual, Ch. 8—not by wound-care LCDs. Citing an inapplicable LCD misrepresents the governing clinical-policy framework.",
      "remedyPath": "Appeal citing Medicare Benefit Policy Manual Ch. 8 §§ 30–40; request that the plan identify the actual regulatory basis for its medical-necessity determination under CMS rules governing SNF coverage.",
      "supportingAuthority": "Medicare Benefit Policy Manual, Ch. 8, §§ 30.1–30.3 (SNF coverage criteria and the 'plateau' distinction); CMS Internet-Only Manuals, Pub. 100-02"
    },
    {
      "defectClass": "medical-necessity-misapplication",
      "severity": "high",
      "loc": "therapy minutes have declined...functional improvement...has plateaued...over prior 3 days",
      "issue": "The denial treats therapy-minute volume and Section GG functional plateau as dispositive grounds for termination. Under Medicare Benefit Policy Manual Ch. 8 § 30.3, a plateau in improvement does not automatically end SNF coverage; coverage continues if skilled nursing or therapy services are still required to maintain the patient's condition or prevent deterioration. The denial fails to assess whether skilled services remain necessary.",
      "remedyPath": "Appeal with documentation that skilled services remain necessary for safe discharge; request peer-to-peer review with a physiatrist or qualified SNF medical director; cite MBPM Ch. 8 § 30.3.",
      "supportingAuthority": "Medicare Benefit Policy Manual, Ch. 8, § 30.3 (the 'plateau' rule: coverage may continue despite lack of improvement if skilled services are needed to maintain status or prevent regression)"
    },
    {
      "defectClass": "erisa-procedural-defect",
      "severity": "medium",
      "loc": "DETERMINATION section and appeal rights notice",
      "issue": "If this Medicare Advantage coverage is provided through an employer-sponsored plan, the denial letter omits disclosures required by 29 C.F.R. § 2560.503-1(g)(1): it fails to identify the reviewer's qualifications, does not provide the specific clinical rationale beyond conclusory statements, and omits notice of the right to receive all documents relevant to the claim upon request.",
      "remedyPath": "If employer-sponsored: request full claim file, reviewer credentials, and the complete administrative record per ERISA § 502(c); file appeal noting procedural deficiencies.",
      "supportingAuthority": "29 C.F.R. § 2560.503-1(g)(1) (adverse benefit determination must include specific reasons and plan provisions); 29 C.F.R. § 2560.503-1(h)(2)(iii) (right to documents relevant to the claim)"
    }
  ],
  "selfEval": {
    "severityCalibrationBps": 8200,
    "precisionBps": 7500,
    "coverageBps": 8500,
    "exploitabilityBps": 9000,
    "rationale": "The algorithmic substitution defect is critical and directly trackable to the Lokken litigation pattern; I cited 42 C.F.R. § 422.101(b) and the Medicare Managed Care Manual with high confidence. The LCD L33635 citation appears to be an erroneous wound-care reference per the synthetic brief—I acknowledged the brief's representation without independently verifying the LCD number, slightly reducing precision. The 'plateau' finding correctly invokes MBPM Ch. 8 § 30.3. The ERISA defect is medium severity because employer sponsorship is not confirmed; if confirmed, severity would rise to high. All four in-scope defect classes with arguable grounds are surfaced except network adequacy and coding errors, which are not present on these facts."
  }
}
```
```

### Honest commentary

This output is whatever the model returned, unedited. Specific things to look for in the raw text above:

- **Does it return strict JSON** as the system prompt demanded, or does it leak prose / markdown / code fences? Strict-JSON adherence on a domain the model is not tuned for is a positive signal; failure here validates the honest-caveat framing.
- **Are the regulatory cites real?** Compare any cited C.F.R. / SSR / POMS / LCD / NCD against the public registry. Hallucinated cites are the documented v1 failure mode; real cites would be a strong positive signal that the architecture works even without fine-tuning.
- **Self-eval calibration.** The system prompt asks the model to self-rate `severityCalibrationBps`, `precisionBps`, `coverageBps`, `exploitabilityBps`. Whether the model is honest about its own confidence (low `precisionBps` when uncertain) is itself a calibration signal.
- **Did `broker.inference.processResponse` validate the TEE attestation?** The `valid` field above carries that result. `true` confirms 0G's TEE chain-of-custody is intact for this call; non-`true` documents that the off-chain attestation validation failed, which is a known v1 surface (also documented in the main README honesty notes — v1 captures the attestation but does not chain-bind it).

### What this run does NOT claim

- It does **not** claim the model's output should be filed as an SSDI/insurance appeal as-is. The system prompt enforces JSON structure; it does not validate factual accuracy. Any cite in the output must be independently checked against the public regulatory registry.
- It does **not** claim the model has been validated on a representative legal/clinical-policy corpus. That validation work is explicit v2 scope (weeks 8-12 post-hackathon for insurance, paired with fine-tuning).
- It does **not** claim the protocol's reputation primitive accumulates from this run. No on-chain transaction was made; this is a captured off-chain inference call documenting honest model behavior.


## What this empirical capture demonstrates

1. **The architecture call path is real.** The script connects to 0G's Sealed Inference broker, resolves a provider for the running model, packages the v2 insurance specialist brief through the same `sealedQuery` primitive as `scripts/hunter.js`, and either gets a response or honestly captures the failure. Same code path the v1 hunter daemon uses for smart-contract audit; only the prompt content changes.
2. **The TEE attestation surface is exercised against the new domain input.** The response (if successful) carries 0G's `ZG-Res-Key` attestation header, which `broker.inference.processResponse` validates against the model that produced the response. The integration is not theoretical.
3. **The honest-caveat framing in `audits/insurance/README.md` is now empirically backed.** Whatever the output above shows is what `zai-org/GLM-5-FP8` actually does on a structured legal-policy task today, without fine-tuning. The README's "model not yet tuned for legal/clinical text" statement is supported by, not in tension with, this capture.

For the v2 production sequence (fine-tune specialist briefs against a public denial-letter corpus → validate on a 50-letter set against known appeal outcomes → TEE-attestation-verifying signer set replacing the v1 operator-relayed `teeSigner`), see `audits/insurance/README.md`.

Reproducible: `PRIVATE_KEY=0x... node scripts/insurance_live_inference.js` against the public `https://evmrpc.0g.ai` RPC.
