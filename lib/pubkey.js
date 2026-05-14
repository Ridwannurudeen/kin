// Recover a wallet's secp256k1 public key from any transaction they signed.
//
// Used because Kin v2 and Hunt do not store wallet pubkeys on-chain (they're implicit in every
// tx the wallet has signed). The agent daemon recovers the client's pubkey from the
// JobPosted tx; the client recovers the skill owner's pubkey from the SkillMinted tx.
//
// Returns 65-byte uncompressed pubkey (0x04 || X || Y) as a hex string, matching
// ethers.SigningKey.publicKey format. Compress with pubkeyFromEthersWallet-style helper
// or pass uncompressed directly to lib/ecdh.encryptToPubkey.

import { ethers } from "ethers";

/// Recover the signer's pubkey from a confirmed transaction.
export async function pubkeyFromTx(provider, txHash) {
  const tx = await provider.getTransaction(txHash);
  if (!tx) throw new Error(`tx not found: ${txHash}`);

  // ethers v6 TransactionResponse → reconstruct an unsigned Transaction with the same fields
  // to derive the unsignedHash. This handles type-0 (legacy), type-1 (2930), type-2 (1559)
  // automatically via the Transaction class.
  const unsigned = ethers.Transaction.from({
    type: tx.type,
    chainId: tx.chainId,
    nonce: tx.nonce,
    gasLimit: tx.gasLimit,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    gasPrice: tx.gasPrice,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    accessList: tx.accessList,
  });

  const digest = unsigned.unsignedHash;
  const pubkey = ethers.SigningKey.recoverPublicKey(digest, tx.signature);

  // Sanity check: pubkey → address must match tx.from
  const recoveredAddr = ethers.computeAddress(pubkey);
  if (recoveredAddr.toLowerCase() !== tx.from.toLowerCase()) {
    throw new Error(
      `pubkey recovery mismatch: got ${recoveredAddr}, expected ${tx.from}`,
    );
  }
  return pubkey;
}

/// Recover the signer's pubkey from an arbitrary signed message (EIP-191).
/// Useful when a user is online and can sign a one-off "kin-pubkey-extract" message.
export function pubkeyFromMessage(message, sig) {
  const digest = ethers.hashMessage(message);
  return ethers.SigningKey.recoverPublicKey(digest, sig);
}
