// 0G Storage helpers. Two levels:
//
//   Raw primitives:
//     uploadRaw(blob, signer)          → { rootHash, txHash }
//     downloadRaw(rootHash, opts)      → Buffer
//
//   AES-256-GCM convenience wrappers (used for sample blobs encrypted with a shared key):
//     uploadEncryptedRecord(plaintext, key, signer)
//     downloadEncryptedRecord(rootHash, key, opts)
//
// ECDH-encrypted briefs/outputs (from lib/ecdh.js) are already self-contained blobs;
// they use the raw primitives directly.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';

const DEFAULT_INDEXER = process.env.ZG_INDEXER_URL || 'https://indexer-storage-turbo.0g.ai';
const DEFAULT_RPC     = process.env.ZG_RPC_URL     || 'https://evmrpc.0g.ai';

// ─── AES-256-GCM ────────────────────────────────────────────────────────

export function genKey() { return crypto.randomBytes(32); }

/// Format: [12-byte IV | 16-byte tag | ciphertext]
export function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decrypt(blob, key) {
  const iv  = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct  = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ─── Raw 0G Storage primitives ──────────────────────────────────────────

/// Upload an arbitrary binary blob to 0G Storage. Returns { rootHash, txHash }.
export async function uploadRaw(blob, signer, indexerUrl = DEFAULT_INDEXER, rpcUrl = DEFAULT_RPC) {
  if (!Buffer.isBuffer(blob)) blob = Buffer.from(blob);
  const tmpFile = path.join(os.tmpdir(), `kin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`);
  await fs.writeFile(tmpFile, blob);
  try {
    const file = await ZgFile.fromFilePath(tmpFile);
    const indexer = new Indexer(indexerUrl);
    const [tx, err] = await indexer.upload(file, rpcUrl, signer);
    if (err) throw new Error(`upload failed: ${err}`);
    const tree = await file.merkleTree();
    const rootHash = tree[0]?.rootHash() || tree.rootHash?.();
    return { rootHash, txHash: typeof tx === 'string' ? tx : tx?.hash || JSON.stringify(tx) };
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

/// Retry-aware raw download. Returns the raw bytes as a Buffer.
export async function downloadRaw(rootHash, indexerUrl = DEFAULT_INDEXER, opts = {}) {
  const indexer = new Indexer(indexerUrl);
  const maxAttempts = opts.maxAttempts ?? 30;
  const delayMs = opts.delayMs ?? 10000;
  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const [blob, err] = await indexer.downloadToBlob(rootHash, { proof: true });
      if (err) throw new Error(err);
      return Buffer.from(await blob.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (i === maxAttempts) break;
      if (opts.onRetry) opts.onRetry(i, e.message);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error(`download failed after ${maxAttempts} attempts: ${lastErr?.message}`);
}

// ─── AES-encrypted convenience wrappers ─────────────────────────────────

export async function uploadEncryptedRecord(plaintext, key, signer, indexerUrl = DEFAULT_INDEXER, rpcUrl = DEFAULT_RPC) {
  return uploadRaw(encrypt(plaintext, key), signer, indexerUrl, rpcUrl);
}

export async function downloadEncryptedRecord(rootHash, key, indexerUrl = DEFAULT_INDEXER, opts = {}) {
  const ciphertext = await downloadRaw(rootHash, indexerUrl, opts);
  return decrypt(ciphertext, key);
}
