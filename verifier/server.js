// Kin GitHub verifier service.
//
// Flow:
//   1. Frontend completes GitHub OAuth, has `code`.
//   2. POST /verify/start { code, redirectUri } → server exchanges code, returns { ticket, login }.
//   3. Frontend prompts wallet to sign "Kin verify: <login> v=1".
//   4. POST /verify/finish { ticket, wallet, walletSig } → server validates, fetches activity,
//      signs Credential, returns { credential }.
//
// Admin path (for seeding demo personas):
//   POST /admin/issue { adminKey, wallet, login, accountAgeDays, mergedPRs, codeReviewCount }
//     → { credential }   (bar still enforced)
//
// Env:
//   VERIFIER_PRIVATE_KEY     required, 0x-prefixed hex
//   GITHUB_CLIENT_ID         required for real OAuth flow
//   GITHUB_CLIENT_SECRET     required for real OAuth flow
//   ADMIN_KEY                required for /admin/issue
//   VERIFIER_PORT            default 3030
//   STUB_MODE                "1" = mock GitHub API (for local testing)

import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import {
  signCredential,
  hashGithubLogin,
  buildWalletClaimMessage,
  recoverWalletClaim,
} from '../lib/credential.js';
import {
  exchangeCodeForToken,
  fetchUser,
  computeActivity,
} from './github.js';

const PORT = Number(process.env.VERIFIER_PORT || 3030);

// Bar must match Kin.sol constants — see V2_SPEC §16.
const MIN_ACCOUNT_AGE_DAYS  = 730;
const MIN_MERGED_PRS        = 20;
const MIN_CODE_REVIEW_COUNT = 10;

const VPK = process.env.VERIFIER_PRIVATE_KEY;
if (!VPK) {
  console.error('VERIFIER_PRIVATE_KEY required. Run `node scripts/setup_verifier.js` first.');
  process.exit(1);
}
const verifierWallet = new ethers.Wallet(VPK);
console.log(`[verifier] address: ${verifierWallet.address}`);

const CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ADMIN_KEY     = process.env.ADMIN_KEY;

// In-memory ticket store. Hackathon-scale single-instance.
// ticket → { login, accessToken, expiresAt }
const tickets = new Map();
const TICKET_TTL_MS = 10 * 60 * 1000;

function newTicket(payload) {
  const id = crypto.randomBytes(24).toString('hex');
  tickets.set(id, { ...payload, expiresAt: Date.now() + TICKET_TTL_MS });
  return id;
}

function consumeTicket(id) {
  const t = tickets.get(id);
  if (!t) return null;
  if (t.expiresAt < Date.now()) { tickets.delete(id); return null; }
  tickets.delete(id);
  return t;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, t] of tickets) if (t.expiresAt < now) tickets.delete(id);
}, 60 * 1000).unref();

// ─── Core logic ─────────────────────────────────────────────────────────

export function checkBar({ accountAgeDays, mergedPRs, codeReviewCount }) {
  const reasons = [];
  if (accountAgeDays  < MIN_ACCOUNT_AGE_DAYS)  reasons.push(`accountAgeDays ${accountAgeDays} < ${MIN_ACCOUNT_AGE_DAYS}`);
  if (mergedPRs       < MIN_MERGED_PRS)        reasons.push(`mergedPRs ${mergedPRs} < ${MIN_MERGED_PRS}`);
  if (codeReviewCount < MIN_CODE_REVIEW_COUNT) reasons.push(`codeReviewCount ${codeReviewCount} < ${MIN_CODE_REVIEW_COUNT}`);
  return { passed: reasons.length === 0, reasons };
}

export async function buildCredential({ wallet, login, accountAgeDays, mergedPRs, codeReviewCount }) {
  const bar = checkBar({ accountAgeDays, mergedPRs, codeReviewCount });
  if (!bar.passed) throw new BarError(bar.reasons);

  const cred = {
    githubHandleHash: hashGithubLogin(login),
    accountAgeDays,
    mergedPRs,
    codeReviewCount,
    verifiedAt: Math.floor(Date.now() / 1000),
    verifier: verifierWallet.address,
  };
  const signed = await signCredential(verifierWallet, wallet, cred);
  return signed;
}

class BarError extends Error {
  constructor(reasons) { super('bar check failed: ' + reasons.join(', ')); this.reasons = reasons; this.code = 403; }
}
class BadRequest extends Error { constructor(msg) { super(msg); this.code = 400; } }
class Unauthorized extends Error { constructor(msg) { super(msg); this.code = 401; } }

// ─── HTTP server ────────────────────────────────────────────────────────

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new BadRequest('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && path === '/verifier-pubkey') return send(res, 200, { address: verifierWallet.address });

  if (req.method === 'POST' && path === '/verify/start') return startVerify(req, res);
  if (req.method === 'POST' && path === '/verify/finish') return finishVerify(req, res);
  if (req.method === 'POST' && path === '/admin/issue') return adminIssue(req, res);

  return send(res, 404, { error: 'not found' });
}

async function startVerify(req, res) {
  try {
    const body = await readBody(req);
    if (!body.code) throw new BadRequest('code required');
    if (!body.redirectUri) throw new BadRequest('redirectUri required');
    if (!CLIENT_ID || !CLIENT_SECRET) throw new BadRequest('verifier missing GITHUB_CLIENT_ID/_SECRET');

    const token = await exchangeCodeForToken({
      clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, code: body.code, redirectUri: body.redirectUri,
    });
    const user = await fetchUser(token);
    const ticket = newTicket({ login: user.login, accessToken: token, created_at: user.created_at });
    return send(res, 200, { ticket, login: user.login, claimMessage: buildWalletClaimMessage(user.login) });
  } catch (e) {
    return send(res, e.code || 500, { error: e.message });
  }
}

async function finishVerify(req, res) {
  try {
    const body = await readBody(req);
    if (!body.ticket || !body.wallet || !body.walletSig) throw new BadRequest('ticket, wallet, walletSig required');
    const t = consumeTicket(body.ticket);
    if (!t) throw new BadRequest('ticket invalid or expired');

    const recovered = recoverWalletClaim(t.login, body.walletSig);
    if (recovered.toLowerCase() !== body.wallet.toLowerCase()) {
      throw new BadRequest(`walletSig recovered ${recovered}, expected ${body.wallet}`);
    }

    const activity = await computeActivity(t.login, t.accessToken);
    const accountAgeDays = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);

    const credential = await buildCredential({
      wallet: body.wallet,
      login: activity.login,
      accountAgeDays,
      mergedPRs: activity.mergedPRs,
      codeReviewCount: activity.codeReviewCount,
    });
    return send(res, 200, { credential, activity: { ...activity, accountAgeDays } });
  } catch (e) {
    if (e instanceof BarError) return send(res, 403, { error: e.message, reasons: e.reasons });
    return send(res, e.code || 500, { error: e.message });
  }
}

async function adminIssue(req, res) {
  try {
    if (!ADMIN_KEY) throw new BadRequest('admin issuance disabled (no ADMIN_KEY)');
    const body = await readBody(req);
    if (body.adminKey !== ADMIN_KEY) throw new Unauthorized('bad admin key');
    if (!body.wallet || !body.login) throw new BadRequest('wallet, login required');
    const credential = await buildCredential({
      wallet: body.wallet,
      login: body.login,
      accountAgeDays: Number(body.accountAgeDays),
      mergedPRs: Number(body.mergedPRs),
      codeReviewCount: Number(body.codeReviewCount),
    });
    return send(res, 200, { credential });
  } catch (e) {
    if (e instanceof BarError) return send(res, 403, { error: e.message, reasons: e.reasons });
    return send(res, e.code || 500, { error: e.message });
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
    || import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  http.createServer(handle).listen(PORT, () => console.log(`[verifier] listening on :${PORT}`));
}

export { handle, verifierWallet };
