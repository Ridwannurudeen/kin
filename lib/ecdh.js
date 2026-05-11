// ECIES-style encryption to a secp256k1 wallet pubkey.
//
// Format (single binary blob):
//   [33 bytes ephemeral compressed pubkey] [12 bytes IV] [16 bytes GCM tag] [ciphertext]
//
// Used to encrypt:
//   - structured briefs to the skill-owner's pubkey
//   - output reviews to the client's pubkey
//
// Anyone with the recipient's secp256k1 private key can decrypt. The ephemeral pubkey
// rotates per payload, so multiple payloads to the same recipient are independent.

import crypto from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

const HKDF_INFO = new TextEncoder().encode('kin-v2-ecies');

function normalizeHex(s) {
  if (s instanceof Uint8Array) return s;
  if (typeof s !== 'string') throw new Error('expected hex string or bytes');
  return Buffer.from(s.startsWith('0x') ? s.slice(2) : s, 'hex');
}

/// Derive a 32-byte AES key from a secp256k1 shared secret + ephemeral pubkey salt.
function deriveAesKey(sharedSecret, ephPub) {
  return Buffer.from(hkdf(sha256, sharedSecret, ephPub, HKDF_INFO, 32));
}

/// Encrypt `plaintext` (Buffer or string) to a recipient's compressed (33-byte) or
/// uncompressed (65-byte) secp256k1 public key. Returns a Buffer in the format above.
export function encryptToPubkey(plaintext, recipientPubkey) {
  const pubBytes = normalizeHex(recipientPubkey);
  if (pubBytes.length !== 33 && pubBytes.length !== 65) {
    throw new Error(`bad pubkey length ${pubBytes.length} (want 33 or 65)`);
  }

  const ephSk = secp256k1.utils.randomSecretKey();
  const ephPub = secp256k1.getPublicKey(ephSk, true); // compressed 33

  // Shared secret = ECDH(ephSk, recipientPub). Drop the leading 0x04/0x02/0x03 byte
  // and use only the X coordinate (32 bytes), standard ECIES practice.
  const shared = secp256k1.getSharedSecret(ephSk, pubBytes, true).slice(1);
  const aesKey = deriveAesKey(shared, ephPub);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(ephPub), iv, tag, ct]);
}

/// Decrypt a blob produced by encryptToPubkey using the recipient's private key.
export function decryptWithPrivkey(blob, recipientPrivkey) {
  if (!Buffer.isBuffer(blob)) throw new Error('blob must be Buffer');
  if (blob.length < 33 + 12 + 16) throw new Error('blob too short');
  const skBytes = normalizeHex(recipientPrivkey);
  if (skBytes.length !== 32) throw new Error(`bad privkey length ${skBytes.length}`);

  const ephPub = blob.subarray(0, 33);
  const iv = blob.subarray(33, 45);
  const tag = blob.subarray(45, 61);
  const ct = blob.subarray(61);

  const shared = secp256k1.getSharedSecret(skBytes, ephPub, true).slice(1);
  const aesKey = deriveAesKey(shared, ephPub);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/// Convenience: extract a wallet's compressed pubkey from an ethers Wallet instance.
export function pubkeyFromEthersWallet(wallet) {
  // ethers Wallet exposes `signingKey.publicKey` as 65-byte uncompressed hex (0x04...).
  const uncompressed = wallet.signingKey.publicKey;
  const bytes = normalizeHex(uncompressed);
  if (bytes.length !== 65 || bytes[0] !== 0x04) throw new Error('unexpected pubkey format');
  // Compress: prefix 0x02 (even y) or 0x03 (odd y) + x-coord.
  const x = bytes.subarray(1, 33);
  const y = bytes.subarray(33, 65);
  const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]);
}
