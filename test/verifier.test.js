import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ethers } from 'ethers';

// Env BEFORE importing server.js (server reads VERIFIER_PRIVATE_KEY at module load).
const VERIFIER = ethers.Wallet.createRandom();
process.env.VERIFIER_PRIVATE_KEY = VERIFIER.privateKey;
process.env.ADMIN_KEY = 'test-admin-key';
process.env.STUB_MODE = '1';
process.env.GITHUB_CLIENT_ID = 'stub-client-id';
process.env.GITHUB_CLIENT_SECRET = 'stub-client-secret';

const { handle, verifierWallet, checkBar, buildCredential } = await import('../verifier/server.js');
const { credentialDigest, recoverWalletClaim, buildWalletClaimMessage } = await import('../lib/credential.js');

// Spin up a real HTTP server bound to a random port so we can make fetch calls.
let server, baseUrl;
before(async () => {
  server = http.createServer(handle);
  await new Promise(r => server.listen(0, r));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});
after(async () => { server.close(); });

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// ─── Setup sanity ──────────────────────────────────────────────────────

describe('verifier — setup', () => {
  it('verifier wallet matches VERIFIER_PRIVATE_KEY', () => {
    assert.equal(verifierWallet.address, VERIFIER.address);
  });

  it('GET /health → ok', async () => {
    const { status, json } = await get('/health');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
  });

  it('GET /verifier-pubkey returns verifier address', async () => {
    const { status, json } = await get('/verifier-pubkey');
    assert.equal(status, 200);
    assert.equal(json.address, VERIFIER.address);
  });
});

// ─── Pure logic ────────────────────────────────────────────────────────

describe('verifier — checkBar', () => {
  it('passes when all axes meet bar', () => {
    const r = checkBar({ accountAgeDays: 800, mergedPRs: 50, codeReviewCount: 30 });
    assert.equal(r.passed, true);
    assert.equal(r.reasons.length, 0);
  });

  it('fails when accountAgeDays below', () => {
    const r = checkBar({ accountAgeDays: 100, mergedPRs: 50, codeReviewCount: 30 });
    assert.equal(r.passed, false);
    assert.ok(r.reasons.some(s => s.includes('accountAgeDays')));
  });

  it('fails when mergedPRs below', () => {
    const r = checkBar({ accountAgeDays: 800, mergedPRs: 5, codeReviewCount: 30 });
    assert.equal(r.passed, false);
    assert.ok(r.reasons.some(s => s.includes('mergedPRs')));
  });

  it('fails when codeReviewCount below', () => {
    const r = checkBar({ accountAgeDays: 800, mergedPRs: 50, codeReviewCount: 5 });
    assert.equal(r.passed, false);
    assert.ok(r.reasons.some(s => s.includes('codeReviewCount')));
  });

  it('reports all failing axes at once', () => {
    const r = checkBar({ accountAgeDays: 100, mergedPRs: 5, codeReviewCount: 5 });
    assert.equal(r.passed, false);
    assert.equal(r.reasons.length, 3);
  });
});

describe('verifier — buildCredential', () => {
  it('signs a credential whose sig recovers to verifier', async () => {
    const wallet = ethers.Wallet.createRandom().address;
    const cred = await buildCredential({
      wallet, login: 'alice', accountAgeDays: 800, mergedPRs: 50, codeReviewCount: 30,
    });
    const digest = credentialDigest(wallet, cred);
    const recovered = ethers.verifyMessage(ethers.getBytes(digest), cred.sig);
    assert.equal(recovered, VERIFIER.address);
    assert.equal(cred.verifier, VERIFIER.address);
    assert.equal(cred.accountAgeDays, 800);
    assert.equal(cred.mergedPRs, 50);
    assert.equal(cred.codeReviewCount, 30);
  });

  it('rejects below bar', async () => {
    await assert.rejects(
      buildCredential({ wallet: ethers.Wallet.createRandom().address, login: 'x',
                        accountAgeDays: 100, mergedPRs: 50, codeReviewCount: 30 }),
      /bar check failed/,
    );
  });
});

// ─── /verify flow (stub mode) ───────────────────────────────────────────

describe('verifier — /verify/start + /verify/finish (STUB_MODE)', () => {
  it('start returns ticket + login + claimMessage', async () => {
    const { status, json } = await post('/verify/start', { code: 'fake', redirectUri: 'http://localhost/cb' });
    assert.equal(status, 200);
    assert.equal(typeof json.ticket, 'string');
    assert.equal(json.login, 'stub-user');
    assert.equal(json.claimMessage, buildWalletClaimMessage('stub-user'));
  });

  it('finish returns credential after wallet sig over claim', async () => {
    const { json: started } = await post('/verify/start', { code: 'fake', redirectUri: 'http://localhost/cb' });
    const userWallet = ethers.Wallet.createRandom();
    const walletSig = await userWallet.signMessage(started.claimMessage);
    const { status, json } = await post('/verify/finish', {
      ticket: started.ticket, wallet: userWallet.address, walletSig,
    });
    assert.equal(status, 200);
    assert.ok(json.credential);
    // Stub returns accountAgeDays ≈ 800, mergedPRs=42, codeReviewCount=25 → all pass bar.
    assert.equal(json.credential.mergedPRs, 42);
    assert.equal(json.credential.codeReviewCount, 25);
    const recovered = recoverWalletClaim(started.login, walletSig);
    assert.equal(recovered, userWallet.address);
  });

  it('finish rejects bad walletSig (wrong signer)', async () => {
    const { json: started } = await post('/verify/start', { code: 'fake', redirectUri: 'http://localhost/cb' });
    const userWallet = ethers.Wallet.createRandom();
    const imposter = ethers.Wallet.createRandom();
    const walletSig = await imposter.signMessage(started.claimMessage);
    const { status, json } = await post('/verify/finish', {
      ticket: started.ticket, wallet: userWallet.address, walletSig,
    });
    assert.equal(status, 400);
    assert.match(json.error, /walletSig recovered/);
  });

  it('finish rejects unknown ticket', async () => {
    const userWallet = ethers.Wallet.createRandom();
    const walletSig = await userWallet.signMessage('whatever');
    const { status } = await post('/verify/finish', {
      ticket: 'no-such-ticket', wallet: userWallet.address, walletSig,
    });
    assert.equal(status, 400);
  });

  it('tickets are single-use (second consume fails)', async () => {
    const { json: started } = await post('/verify/start', { code: 'fake', redirectUri: 'http://localhost/cb' });
    const userWallet = ethers.Wallet.createRandom();
    const walletSig = await userWallet.signMessage(started.claimMessage);
    const first = await post('/verify/finish', { ticket: started.ticket, wallet: userWallet.address, walletSig });
    assert.equal(first.status, 200);
    const second = await post('/verify/finish', { ticket: started.ticket, wallet: userWallet.address, walletSig });
    assert.equal(second.status, 400);
    assert.match(second.json.error, /ticket invalid/);
  });

  it('start requires code + redirectUri', async () => {
    const r1 = await post('/verify/start', {});
    assert.equal(r1.status, 400);
    const r2 = await post('/verify/start', { code: 'x' });
    assert.equal(r2.status, 400);
  });
});

// ─── /admin/issue ───────────────────────────────────────────────────────

describe('verifier — /admin/issue', () => {
  it('issues credential with valid admin key + above bar', async () => {
    const wallet = ethers.Wallet.createRandom().address;
    const { status, json } = await post('/admin/issue', {
      adminKey: 'test-admin-key', wallet, login: 'curated-rust-reviewer',
      accountAgeDays: 1500, mergedPRs: 80, codeReviewCount: 40,
    });
    assert.equal(status, 200);
    assert.ok(json.credential);
    const recovered = ethers.verifyMessage(ethers.getBytes(credentialDigest(wallet, json.credential)), json.credential.sig);
    assert.equal(recovered, VERIFIER.address);
  });

  it('rejects bad admin key', async () => {
    const wallet = ethers.Wallet.createRandom().address;
    const { status, json } = await post('/admin/issue', {
      adminKey: 'wrong', wallet, login: 'x', accountAgeDays: 1500, mergedPRs: 80, codeReviewCount: 40,
    });
    assert.equal(status, 401);
    assert.match(json.error, /admin/);
  });

  it('rejects below bar even with valid admin key', async () => {
    const wallet = ethers.Wallet.createRandom().address;
    const { status, json } = await post('/admin/issue', {
      adminKey: 'test-admin-key', wallet, login: 'x', accountAgeDays: 100, mergedPRs: 80, codeReviewCount: 40,
    });
    assert.equal(status, 403);
    assert.ok(json.reasons.some(s => s.includes('accountAgeDays')));
  });

  it('rejects missing wallet or login', async () => {
    const r1 = await post('/admin/issue', { adminKey: 'test-admin-key', login: 'x', accountAgeDays: 1500, mergedPRs: 80, codeReviewCount: 40 });
    assert.equal(r1.status, 400);
    const r2 = await post('/admin/issue', { adminKey: 'test-admin-key', wallet: '0xabc', accountAgeDays: 1500, mergedPRs: 80, codeReviewCount: 40 });
    assert.equal(r2.status, 400);
  });
});

// ─── 404 ────────────────────────────────────────────────────────────────

describe('verifier — unknown route', () => {
  it('returns 404', async () => {
    const r = await get('/nope');
    assert.equal(r.status, 404);
  });
});
