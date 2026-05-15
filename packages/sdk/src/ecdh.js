/**
 * secp256k1 ECIES helpers using only Node's built-in crypto stack.
 */
import crypto from "node:crypto";

const HKDF_INFO = Buffer.from("hunt-verifiable-ai-ecies", "utf8");

function normalizeBytes(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    return Buffer.from(value.startsWith("0x") ? value.slice(2) : value, "hex");
  }
  throw new Error(`expected ${label}`);
}

function normalizePublicKey(value) {
  const pubkey = normalizeBytes(value, "hex string or bytes");
  if (pubkey.length !== 33 && pubkey.length !== 65) {
    throw new Error(`bad pubkey length ${pubkey.length} (want 33 or 65)`);
  }
  return pubkey;
}

function normalizePrivateKey(value) {
  const privkey = normalizeBytes(value, "hex string or bytes");
  if (privkey.length !== 32) {
    throw new Error(`bad privkey length ${privkey.length}`);
  }
  return privkey;
}

function normalizePlaintext(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(value);
}

function deriveAesKey(sharedSecret, ephPubkey) {
  return Buffer.from(
    crypto.hkdfSync("sha256", sharedSecret, ephPubkey, HKDF_INFO, 32),
  );
}

export function encryptToPubkey(plaintextBytes, recipientPubkeyHex) {
  const recipientPubkey = normalizePublicKey(recipientPubkeyHex);
  const ephemeral = crypto.createECDH("secp256k1");
  ephemeral.generateKeys();

  const ephPubkey = Buffer.from(
    ephemeral.getPublicKey(undefined, "compressed"),
  );
  const sharedSecret = Buffer.from(ephemeral.computeSecret(recipientPubkey));
  const aesKey = deriveAesKey(sharedSecret, ephPubkey);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const plaintext = normalizePlaintext(plaintextBytes);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ephPubkey, iv, tag, ciphertext]);
}

export function decryptFromPrivkey(encryptedBytes, recipientPrivkeyHex) {
  const blob = normalizeBytes(encryptedBytes, "encrypted bytes");
  if (blob.length < 33 + 12 + 16) throw new Error("blob too short");

  const recipientPrivkey = normalizePrivateKey(recipientPrivkeyHex);
  const ephPubkey = blob.subarray(0, 33);
  const iv = blob.subarray(33, 45);
  const tag = blob.subarray(45, 61);
  const ciphertext = blob.subarray(61);

  const recipient = crypto.createECDH("secp256k1");
  recipient.setPrivateKey(recipientPrivkey);
  const sharedSecret = Buffer.from(recipient.computeSecret(ephPubkey));
  const aesKey = deriveAesKey(sharedSecret, ephPubkey);

  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
