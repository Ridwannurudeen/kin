// ECIES-style encryption to a secp256k1 wallet pubkey.
//
// Format (single binary blob):
//   [33 bytes ephemeral compressed pubkey] [12 bytes IV] [16 bytes GCM tag] [ciphertext]

import crypto from 'node:crypto';

const HKDF_INFO = Buffer.from('kin-v2-ecies');

function normalizeHex(s) {
  if (s instanceof Uint8Array) return Buffer.from(s);
  if (typeof s !== 'string') throw new Error('expected hex string or bytes');
  return Buffer.from(s.startsWith('0x') ? s.slice(2) : s, 'hex');
}

function deriveAesKey(sharedSecret, ephPub) {
  return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, ephPub, HKDF_INFO, 32));
}

/**
 * Encrypt `plaintext` (Buffer or string) to a recipient's compressed (33-byte)
 * or uncompressed (65-byte) secp256k1 public key.
 */
export function encryptToPubkey(plaintextBytes, recipientPubkeyHex) {
  const pubBytes = normalizeHex(recipientPubkeyHex);
  if (pubBytes.length !== 33 && pubBytes.length !== 65) {
    throw new Error(`bad pubkey length ${pubBytes.length} (want 33 or 65)`);
  }

  const eph = crypto.createECDH('secp256k1');
  eph.generateKeys();
  const ephPub = eph.getPublicKey(null, 'compressed');
  const shared = eph.computeSecret(pubBytes);
  const aesKey = deriveAesKey(shared, ephPub);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const pt = Buffer.isBuffer(plaintextBytes) ? plaintextBytes : Buffer.from(plaintextBytes);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ephPub, iv, tag, ct]);
}

/**
 * Decrypt a blob produced by encryptToPubkey using the recipient's private key.
 */
export function decryptFromPrivkey(encryptedBytes, recipientPrivkeyHex) {
  const blob = Buffer.from(encryptedBytes);
  if (blob.length < 33 + 12 + 16) throw new Error('blob too short');
  const skBytes = normalizeHex(recipientPrivkeyHex);
  if (skBytes.length !== 32) throw new Error(`bad privkey length ${skBytes.length}`);

  const ephPub = blob.subarray(0, 33);
  const iv = blob.subarray(33, 45);
  const tag = blob.subarray(45, 61);
  const ct = blob.subarray(61);

  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(skBytes);
  const shared = ecdh.computeSecret(ephPub);
  const aesKey = deriveAesKey(shared, ephPub);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
