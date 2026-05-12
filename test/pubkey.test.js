import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import { ethers as ethersStandalone } from 'ethers';
import { pubkeyFromTx, pubkeyFromMessage } from '../lib/pubkey.js';
import { encryptToPubkey, decryptWithPrivkey } from '../lib/ecdh.js';

describe('lib/pubkey — pubkeyFromMessage', () => {
  it('recovers pubkey from signed message + verifies address match', async () => {
    const w = ethersStandalone.Wallet.createRandom();
    const msg = 'kin-pubkey-extract';
    const sig = await w.signMessage(msg);
    const pubkey = pubkeyFromMessage(msg, sig);
    const recoveredAddr = ethersStandalone.computeAddress(pubkey);
    assert.equal(recoveredAddr, w.address);
  });

  it('recovered pubkey can decrypt ECDH payload', async () => {
    const w = ethersStandalone.Wallet.createRandom();
    const sig = await w.signMessage('kin-pubkey-extract');
    const pubkey = pubkeyFromMessage('kin-pubkey-extract', sig);
    const blob = encryptToPubkey('round-trip via tx-pubkey', pubkey);
    const pt = decryptWithPrivkey(blob, w.privateKey);
    assert.equal(pt.toString('utf8'), 'round-trip via tx-pubkey');
  });
});

describe('lib/pubkey — pubkeyFromTx', () => {
  it('recovers pubkey from a hardhat transaction', async () => {
    const { ethers } = await network.getOrCreate();
    const [admin] = await ethers.getSigners();
    const recipient = ethersStandalone.Wallet.createRandom();
    // Send a tx from admin to recipient
    const tx = await admin.sendTransaction({ to: recipient.address, value: ethers.parseEther('0.001') });
    await tx.wait();
    const pubkey = await pubkeyFromTx(ethers.provider, tx.hash);
    const recoveredAddr = ethers.computeAddress(pubkey);
    assert.equal(recoveredAddr.toLowerCase(), admin.address.toLowerCase());
  });

  it('throws on missing tx', async () => {
    const { ethers } = await network.getOrCreate();
    await assert.rejects(
      pubkeyFromTx(ethers.provider, '0x' + 'aa'.repeat(32)),
      /tx not found/,
    );
  });

  it('round-trips: encrypt to recovered pubkey, decrypt with sender privkey', async () => {
    const { ethers } = await network.getOrCreate();
    const [admin] = await ethers.getSigners();
    // Create a real wallet so we have its privkey for decryption
    const sender = ethersStandalone.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: sender.address, value: ethers.parseEther('1') });
    // Sender sends a tx (to anywhere)
    const tx = await sender.sendTransaction({ to: ethers.ZeroAddress, value: 1n });
    await tx.wait();
    const pubkey = await pubkeyFromTx(ethers.provider, tx.hash);
    const blob = encryptToPubkey('encrypted to sender', pubkey);
    const pt = decryptWithPrivkey(blob, sender.privateKey);
    assert.equal(pt.toString('utf8'), 'encrypted to sender');
  });
});
