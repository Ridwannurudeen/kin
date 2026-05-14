// Shared signing primitives. Used by Kin v2 (predecessor) + Hunt:
//   - the GitHub verifier service (signs Credentials for skill owners + clients)
//   - the TEE-side evaluator (signs SampleFingerprints + attestations)
//   - the test suite (mocks both)
//   - the agent daemon (verifies attestations before submit)
//
// All sigs are EIP-191-prefixed (ethers `signMessage(getBytes(digest))`). The contract
// recovers with `_recoverEth` which applies the same "\x19Ethereum Signed Message:\n32"
// prefix before ecrecover.

import { ethers, AbiCoder } from "ethers";

const ABI = AbiCoder.defaultAbiCoder();

/// Canonical Credential digest (matches Kin._credDigest).
export function credentialDigest(wallet, cred) {
  return ethers.keccak256(
    ABI.encode(
      ["address", "bytes32", "uint32", "uint32", "uint32", "uint64", "address"],
      [
        wallet,
        cred.githubHandleHash,
        cred.accountAgeDays,
        cred.mergedPRs,
        cred.codeReviewCount,
        cred.verifiedAt,
        cred.verifier,
      ],
    ),
  );
}

export async function signCredential(verifierSigner, wallet, cred) {
  const digest = credentialDigest(wallet, cred);
  const sig = await verifierSigner.signMessage(ethers.getBytes(digest));
  return { ...cred, sig };
}

/// Canonical SampleFingerprint digest (matches Kin._fingerprintDigest).
export function fingerprintDigest(sampleRoots, fp) {
  return ethers.keccak256(
    ABI.encode(
      [
        "bytes32[]",
        "uint16",
        "uint16",
        "uint16",
        "uint16",
        "uint16",
        "bytes32",
      ],
      [
        sampleRoots,
        fp.vocabEntropyBps,
        fp.domainTermBps,
        fp.structuralBps,
        fp.specificityBps,
        fp.overallBps,
        fp.modelDigest,
      ],
    ),
  );
}

export async function signFingerprint(teeSigner, sampleRoots, fp) {
  const digest = fingerprintDigest(sampleRoots, fp);
  const sig = await teeSigner.signMessage(ethers.getBytes(digest));
  return { ...fp, teeSig: sig };
}

/// Attestation digest for submitWork. Matches keccak(abi.encode(uint256, bytes32, uint16, bytes32))
/// inside Kin.submitWork.
export function attestationDigest(
  jobId,
  outputRoot,
  qualityScore,
  modelDigest,
) {
  return ethers.keccak256(
    ABI.encode(
      ["uint256", "bytes32", "uint16", "bytes32"],
      [jobId, outputRoot, qualityScore, modelDigest],
    ),
  );
}

export async function signAttestation(
  teeSigner,
  jobId,
  outputRoot,
  qualityScore,
  modelDigest,
) {
  const digest = attestationDigest(
    jobId,
    outputRoot,
    qualityScore,
    modelDigest,
  );
  const sig = await teeSigner.signMessage(ethers.getBytes(digest));
  return { digest, sig };
}

/// Finding attestation digest for Hunt.submitFinding. Matches the keccak(abi.encode(...))
/// over (bountyId, codeRoot, hunterId, cweClass, severity, findingRoot, modelDigest,
/// teeTimestamp, severityCalibrationBps, precisionBps, coverageBps, exploitabilityBps).
export function findingDigest(params) {
  return ethers.keccak256(
    ABI.encode(
      [
        "uint256",
        "bytes32",
        "uint256",
        "bytes32",
        "uint8",
        "bytes32",
        "bytes32",
        "uint64",
        "uint16",
        "uint16",
        "uint16",
        "uint16",
      ],
      [
        params.bountyId,
        params.codeRoot,
        params.hunterId,
        params.cweClass,
        params.severity,
        params.findingRoot,
        params.modelDigest,
        params.teeTimestamp,
        params.severityCalibrationBps,
        params.precisionBps,
        params.coverageBps,
        params.exploitabilityBps,
      ],
    ),
  );
}

export async function signFindingAttestation(teeSigner, params) {
  const digest = findingDigest(params);
  const sig = await teeSigner.signMessage(ethers.getBytes(digest));
  return { digest, sig };
}

/// Hash a GitHub login to bytes32 (matches `keccak256(bytes(login))` semantics).
export function hashGithubLogin(login) {
  return ethers.keccak256(ethers.toUtf8Bytes(login));
}

/// Verify a wallet-signed claim message produced by an EOA proving GitHub ownership.
/// The wallet signs "Kin verify: <login> v=1" — the verifier reconstructs and recovers.
export function buildWalletClaimMessage(login) {
  return `Kin verify: ${login} v=1`;
}

export function recoverWalletClaim(login, walletSig) {
  return ethers.verifyMessage(buildWalletClaimMessage(login), walletSig);
}
