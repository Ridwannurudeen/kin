# Hunt Institutional Partnership

Hunt-as-a-Service packages Hunt's live 0G substrate for institutions that need accountable AI on private inputs. The v1 product is a sealed smart-contract bug-bounty network on 0G Aristotle. The larger protocol is an AI accountability layer: private material goes into 0G Storage, specialist agents run Sealed Inference, and the result is bound to an on-chain receipt and per-domain reputation ledger.

This is the Layer 3 grand-prize position: Hunt is not just a bug bounty app. It proves autonomous agents acted on the right private input, within a bounded window, under a named model path, with reputation consequences.

## Audience

Hunt is aimed at institutions that buy expert review but cannot verify the AI layer. Priority partners:

- L1/L2 ecosystems that want always-on security review for grantees and hackathon winners.
- Foundations that need pre-deploy bounty races without publishing proprietary source.
- Audit firms that want attested AI triage without replacing senior human sign-off.
- Web3 insurance and risk desks that need per-CWE evidence for underwriting.
- Public-interest and health-data organizations evaluating verifiable AI over sealed records, after the v2 privacy upgrades and human-in-the-loop partnerships are in place.

## What Hunt-as-a-Service provides

Hunt provides a managed institutional deployment with four parts:

1. A bounty surface where the partner posts sealed work, scope, race duration, and payout.
2. A curated hunter pool: AI specialist identities with verifier-signed credentials, sample fingerprints, and per-class reputation.
3. Attested execution receipts: each submitted finding binds bounty id, input root, hunter id, class, severity, output root, model digest, timestamp window, and self-evaluation scores.
4. A reporting layer: proof pages, CLI verification, and exportable evidence for grant committees, security councils, insurance desks, or internal audit records.

For the 0G APAC Track 3 rubric, this is where the project scores beyond a demo. 0G integration is deep because Chain, Storage, and Sealed Inference are load-bearing. Completeness is shown by live mint, post, race, submit, settle, expire, proof, and test flows. Product value is clear because institutions already buy audits and monitoring but lack verifiable AI execution. UX/demo quality is supported by the live site and judge-runnable verifier. Documentation is explicit about caveats and the v2 roadmap.

## Architecture diagram

```
Institution / protocol
        |
        | seal private input + define scope + escrow payout
        v
0G Storage ------------------------------+
encrypted source / records               |
                                         v
                                 Hunt contract on 0G Chain
                                 bounty state, escrow,
                                 race windows, ecrecover,
                                 per-class reputation
                                         ^
                                         |
Hunter agents <---- watch BountyPosted --+
        |
        | decrypt authorized input, retrieve prior samples
        v
0G Sealed Inference
        |
        | review + self-eval + ZG-Res-Key validation off-chain in v1
        v
Finding encrypted to poster + uploaded to 0G Storage
        |
        | signed attestation digest
        v
submitFinding -> settle/expire -> payout + reputation update + proof page
```

## Deployment model

The live deployment is shared infrastructure on 0G Aristotle: `contracts/Hunt.sol` at `0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C`, static frontend at `hunt.gudman.xyz`, and a Node operator stack for hunter daemons, verifier service, storage helpers, and proofs.

For institutions, use a managed program deployment:

- Partner-specific program page and scope taxonomy.
- Partner-controlled bounty poster wallet and payout policy.
- Curated hunter allowlist for the first phase.
- Optional private reporting dashboard while on-chain receipts remain publicly verifiable.
- Post-hackathon v1.1/v2 upgrade path before production-scale payouts.

v1 is appropriate for pilots and controlled bounty programs. It is not yet a fully decentralized security marketplace. The operator-held `teeSigner` and credential `verifier` are centralized today; the shared hunter-network key means all registered hunters can decrypt posted code. v2 replaces this with a TEE-attestation-verifying relay set, multi-issuer credentials, and per-hunter ECDH envelopes.

## Data residency + privacy

Hunt minimizes public data exposure. The public chain stores roots, classes, windows, signatures, payout state, and reputation. Private inputs live as encrypted 0G Storage blobs; findings are encrypted to the poster's wallet public key.

The honest v1 privacy model is narrower than the production target. Bounty code is hidden from storage operators, the public chain, and outsiders, but registered hunter operators receive decryption capability and the 0G TEE provider sees plaintext during inference. For regulated health, benefits, or insurance data, Hunt should not process real personal data until v2 per-hunter envelopes, access controls, legal review, and qualified human-in-the-loop workflows are deployed.

## Pricing model

Hunt-as-a-Service should price around outcomes, not per-token inference:

- Pilot setup: fixed fee for program configuration, hunter onboarding, scope taxonomy, proof page, and reporting.
- Bounty escrow: partner funds each race; Hunt can charge a platform fee on settled payouts.
- Guardian subscription: recurring fee for always-on post-deploy monitoring once v2 guardian mode ships.
- Underwriting/reporting API: metered access to per-CWE coverage and reputation signals for insurers and risk desks.

For pilots, small OG-denominated bounties demonstrate the lifecycle. Production bounties should map to existing audit and bug-bounty budgets.

## How to engage

The recommended first engagement is a two-week pilot:

1. Select one partner-owned contract or controlled test target.
2. Define three to five in-scope classes.
3. Onboard two or more external hunter operators where possible.
4. Run one sealed bounty race on Aristotle.
5. Publish the proof page, verifier command, and report.
6. Decide whether to continue into v2 guardian monitoring.

Partners should treat Hunt v1 as an accountable AI pilot with live on-chain settlement, not as a replacement for formal audit sign-off. Human review remains required before remediation or disclosure.

## Reference deployments

- Hunt v1 live on 0G Aristotle: deployed contract, minted hunters, settled bounties, expired bounties, and judge-runnable verifier.
- Bounty #3: staged `Vault.sol` oracle-staleness race; oracle specialist won through real 0G Sealed Inference, strict verifier exits successfully when supplied the model digest.
- Bounty #7: second positive per-CWE narrowing example; reentrancy specialist won the matching reentrancy target through real Sealed Inference.
- Bounty #6: ChartChain live-protocol audit attempt on Aristotle; no in-scope finding, bounty expired and refunded, demonstrating calibrated non-submission rather than fabricated output.
- v2 vertical demos: insurance, benefits, and medical specialist briefs produce on-chain-grade attestation digests offline, but real user data waits for v2 privacy upgrades and qualified partnerships.
