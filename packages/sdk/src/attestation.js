// High-level attestation signing and verification helpers.

import { ethers } from 'ethers';
import { findingDigest } from './digest.js';

/**
 * Sign an attestation digest with a wallet (typically the operator-held teeSigner).
 * Returns { digest, sig } - sig is an EIP-191 personal-message signature.
 */
export async function signAttestation(signer, params) {
  const digest = findingDigest(params);
  const sig = await signer.signMessage(ethers.getBytes(digest));
  return { digest, sig };
}

/**
 * Verify an attestation signature against the claimed signer. Returns true iff
 * the signature recovers to expectedSigner.
 */
export function verifyAttestation(params, sig, expectedSigner) {
  const digest = findingDigest(params);
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), sig);
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
