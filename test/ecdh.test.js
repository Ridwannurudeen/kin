import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { encryptToPubkey, decryptWithPrivkey, pubkeyFromEthersWallet } from '../lib/ecdh.js';

describe('lib/ecdh — round trip', () => {
  it('encrypts and decrypts a short string', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const blob = encryptToPubkey('hello kin', pub);
    const pt = decryptWithPrivkey(blob, recipient.privateKey);
    assert.equal(pt.toString('utf8'), 'hello kin');
  });

  it('encrypts and decrypts a 50KB payload', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const big = Buffer.alloc(50_000, 'x');
    const blob = encryptToPubkey(big, pub);
    const pt = decryptWithPrivkey(blob, recipient.privateKey);
    assert.equal(pt.length, big.length);
    assert.equal(pt[0], 'x'.charCodeAt(0));
    assert.equal(pt[49_999], 'x'.charCodeAt(0));
  });

  it('round-trips Buffer plaintext', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const buf = Buffer.from([1, 2, 3, 4, 0, 255]);
    const blob = encryptToPubkey(buf, pub);
    const pt = decryptWithPrivkey(blob, recipient.privateKey);
    assert.deepEqual(Array.from(pt), [1, 2, 3, 4, 0, 255]);
  });

  it('accepts uncompressed pubkey too', () => {
    const recipient = ethers.Wallet.createRandom();
    const uncompressed = recipient.signingKey.publicKey;
    const blob = encryptToPubkey('uncompressed path', uncompressed);
    const pt = decryptWithPrivkey(blob, recipient.privateKey);
    assert.equal(pt.toString('utf8'), 'uncompressed path');
  });
});

describe('lib/ecdh — properties', () => {
  it('ciphertext differs across calls (random ephemeral)', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const a = encryptToPubkey('same plaintext', pub);
    const b = encryptToPubkey('same plaintext', pub);
    assert.notEqual(a.toString('hex'), b.toString('hex'));
  });

  it('output starts with 33-byte compressed ephemeral pubkey (prefix 02 or 03)', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const blob = encryptToPubkey('x', pub);
    assert.ok(blob[0] === 0x02 || blob[0] === 0x03);
  });

  it('overhead is exactly 61 bytes (33 ephPk + 12 IV + 16 tag)', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const plaintext = 'twenty bytes precis.';  // 20 bytes
    assert.equal(plaintext.length, 20);
    const blob = encryptToPubkey(plaintext, pub);
    assert.equal(blob.length, 20 + 61);
  });
});

describe('lib/ecdh — failure modes', () => {
  it('wrong private key fails GCM auth tag', () => {
    const recipient = ethers.Wallet.createRandom();
    const imposter = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const blob = encryptToPubkey('secret', pub);
    assert.throws(() => decryptWithPrivkey(blob, imposter.privateKey));
  });

  it('tampered ciphertext fails auth tag', () => {
    const recipient = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(recipient);
    const blob = encryptToPubkey('untampered', pub);
    blob[blob.length - 1] ^= 0xff;
    assert.throws(() => decryptWithPrivkey(blob, recipient.privateKey));
  });

  it('rejects too-short blob', () => {
    const recipient = ethers.Wallet.createRandom();
    assert.throws(() => decryptWithPrivkey(Buffer.alloc(20), recipient.privateKey), /too short/);
  });

  it('rejects wrong-length pubkey', () => {
    assert.throws(() => encryptToPubkey('x', Buffer.alloc(20)), /bad pubkey length/);
  });
});

describe('lib/ecdh — pubkeyFromEthersWallet', () => {
  it('returns 33-byte compressed pubkey with valid prefix', () => {
    const w = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(w);
    assert.equal(pub.length, 33);
    assert.ok(pub[0] === 0x02 || pub[0] === 0x03);
  });

  it('round-trips: pubkey derived from wallet can decrypt with same wallet privkey', () => {
    const w = ethers.Wallet.createRandom();
    const pub = pubkeyFromEthersWallet(w);
    const blob = encryptToPubkey('integration', pub);
    const pt = decryptWithPrivkey(blob, w.privateKey);
    assert.equal(pt.toString('utf8'), 'integration');
  });
});
