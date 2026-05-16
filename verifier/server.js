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

import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import { ethers } from "ethers";
import {
  signCredential,
  hashGithubLogin,
  buildWalletClaimMessage,
  recoverWalletClaim,
} from "../lib/credential.js";
import { exchangeCodeForToken, fetchUser, computeActivity } from "./github.js";

const PORT = Number(process.env.VERIFIER_PORT || 3030);
const MAX_BODY_BYTES = Number(process.env.VERIFIER_MAX_BODY_BYTES || 64 * 1024);
const DEFAULT_ALLOWED_ORIGINS = [
  "https://hunt.gudman.xyz",
  "http://localhost:3030",
  "http://127.0.0.1:3030",
];
const ALLOWED_ORIGINS = new Set(
  (process.env.VERIFIER_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// Bar must match Kin.sol constants — see V2_SPEC §16.
const MIN_ACCOUNT_AGE_DAYS = 730;
const MIN_MERGED_PRS = 20;
const MIN_CODE_REVIEW_COUNT = 10;

const VPK = process.env.VERIFIER_PRIVATE_KEY;
if (!VPK) {
  console.error(
    "VERIFIER_PRIVATE_KEY required. Run `node scripts/setup_verifier.js` first.",
  );
  process.exit(1);
}
const verifierWallet = new ethers.Wallet(VPK);
console.log(`[verifier] address: ${verifierWallet.address}`);

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;

// In-memory ticket store. Hackathon-scale single-instance.
// ticket → { login, accessToken, expiresAt }
const tickets = new Map();
const TICKET_TTL_MS = 10 * 60 * 1000;

function newTicket(payload) {
  const id = crypto.randomBytes(24).toString("hex");
  tickets.set(id, { ...payload, expiresAt: Date.now() + TICKET_TTL_MS });
  return id;
}

function consumeTicket(id) {
  const t = tickets.get(id);
  if (!t) return null;
  if (t.expiresAt < Date.now()) {
    tickets.delete(id);
    return null;
  }
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
  if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS)
    reasons.push(`accountAgeDays ${accountAgeDays} < ${MIN_ACCOUNT_AGE_DAYS}`);
  if (mergedPRs < MIN_MERGED_PRS)
    reasons.push(`mergedPRs ${mergedPRs} < ${MIN_MERGED_PRS}`);
  if (codeReviewCount < MIN_CODE_REVIEW_COUNT)
    reasons.push(
      `codeReviewCount ${codeReviewCount} < ${MIN_CODE_REVIEW_COUNT}`,
    );
  return { passed: reasons.length === 0, reasons };
}

export async function buildCredential({
  wallet,
  login,
  accountAgeDays,
  mergedPRs,
  codeReviewCount,
}) {
  const cleanWallet = requireAddress(wallet, "wallet");
  const cleanLogin = requireGithubLogin(login);
  const cleanAccountAgeDays = requireUint32(accountAgeDays, "accountAgeDays");
  const cleanMergedPRs = requireUint32(mergedPRs, "mergedPRs");
  const cleanCodeReviewCount = requireUint32(
    codeReviewCount,
    "codeReviewCount",
  );
  const bar = checkBar({
    accountAgeDays: cleanAccountAgeDays,
    mergedPRs: cleanMergedPRs,
    codeReviewCount: cleanCodeReviewCount,
  });
  if (!bar.passed) throw new BarError(bar.reasons);

  const cred = {
    githubHandleHash: hashGithubLogin(cleanLogin),
    accountAgeDays: cleanAccountAgeDays,
    mergedPRs: cleanMergedPRs,
    codeReviewCount: cleanCodeReviewCount,
    verifiedAt: Math.floor(Date.now() / 1000),
    verifier: verifierWallet.address,
  };
  const signed = await signCredential(verifierWallet, cleanWallet, cred);
  return signed;
}

class BarError extends Error {
  constructor(reasons) {
    super("bar check failed: " + reasons.join(", "));
    this.reasons = reasons;
    this.code = 403;
  }
}
class BadRequest extends Error {
  constructor(msg) {
    super(msg);
    this.code = 400;
  }
}
class Unauthorized extends Error {
  constructor(msg) {
    super(msg);
    this.code = 401;
  }
}

function requireAddress(value, field) {
  if (typeof value !== "string" || !ethers.isAddress(value)) {
    throw new BadRequest(`${field} invalid`);
  }
  return ethers.getAddress(value);
}

function requireGithubLogin(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)
  ) {
    throw new BadRequest("login invalid");
  }
  return value;
}

function requireUint32(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new BadRequest(`${field} invalid`);
  }
  return n;
}

function requireSignature(value, field) {
  if (
    typeof value !== "string" ||
    !ethers.isHexString(value) ||
    ethers.dataLength(value) !== 65
  ) {
    throw new BadRequest(`${field} invalid`);
  }
  return value;
}

function adminKeyMatches(value) {
  if (typeof value !== "string") return false;
  const a = Buffer.from(value);
  const b = Buffer.from(ADMIN_KEY || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

// ─── HTTP server ────────────────────────────────────────────────────────

function send(req, res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(new BadRequest("body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(
          chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
            : {},
        );
      } catch (e) {
        reject(new BadRequest("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    if (!originAllowed(req))
      return send(req, res, 403, { error: "origin not allowed" });
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  if (!originAllowed(req))
    return send(req, res, 403, { error: "origin not allowed" });

  if (req.method === "GET" && path === "/health")
    return send(req, res, 200, { ok: true });
  if (req.method === "GET" && path === "/verifier-pubkey")
    return send(req, res, 200, { address: verifierWallet.address });

  if (req.method === "POST" && path === "/verify/start")
    return startVerify(req, res);
  if (req.method === "POST" && path === "/verify/finish")
    return finishVerify(req, res);
  if (req.method === "POST" && path === "/admin/issue")
    return adminIssue(req, res);

  return send(req, res, 404, { error: "not found" });
}

async function startVerify(req, res) {
  try {
    const body = await readBody(req);
    if (!body.code) throw new BadRequest("code required");
    if (!body.redirectUri) throw new BadRequest("redirectUri required");
    if (!CLIENT_ID || !CLIENT_SECRET)
      throw new BadRequest("verifier missing GITHUB_CLIENT_ID/_SECRET");

    const token = await exchangeCodeForToken({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      code: body.code,
      redirectUri: body.redirectUri,
    });
    const user = await fetchUser(token);
    const ticket = newTicket({
      login: user.login,
      accessToken: token,
      created_at: user.created_at,
    });
    return send(req, res, 200, {
      ticket,
      login: user.login,
      claimMessage: buildWalletClaimMessage(user.login),
    });
  } catch (e) {
    return send(req, res, e.code || 500, { error: e.message });
  }
}

async function finishVerify(req, res) {
  try {
    const body = await readBody(req);
    if (!body.ticket || !body.wallet || !body.walletSig)
      throw new BadRequest("ticket, wallet, walletSig required");
    const wallet = requireAddress(body.wallet, "wallet");
    const walletSig = requireSignature(body.walletSig, "walletSig");
    const t = consumeTicket(body.ticket);
    if (!t) throw new BadRequest("ticket invalid or expired");

    const recovered = recoverWalletClaim(t.login, walletSig);
    if (recovered.toLowerCase() !== wallet.toLowerCase()) {
      throw new BadRequest(
        `walletSig recovered ${recovered}, expected ${wallet}`,
      );
    }

    const activity = await computeActivity(t.login, t.accessToken);
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(t.created_at).getTime()) / 86400000,
    );

    const credential = await buildCredential({
      wallet,
      login: activity.login,
      accountAgeDays,
      mergedPRs: activity.mergedPRs,
      codeReviewCount: activity.codeReviewCount,
    });
    return send(req, res, 200, {
      credential,
      activity: { ...activity, accountAgeDays },
    });
  } catch (e) {
    if (e instanceof BarError)
      return send(req, res, 403, { error: e.message, reasons: e.reasons });
    return send(req, res, e.code || 500, { error: e.message });
  }
}

async function adminIssue(req, res) {
  try {
    if (!ADMIN_KEY)
      throw new BadRequest("admin issuance disabled (no ADMIN_KEY)");
    const body = await readBody(req);
    if (!adminKeyMatches(body.adminKey))
      throw new Unauthorized("bad admin key");
    if (!body.wallet || !body.login)
      throw new BadRequest("wallet, login required");
    const credential = await buildCredential({
      wallet: body.wallet,
      login: body.login,
      accountAgeDays: body.accountAgeDays,
      mergedPRs: body.mergedPRs,
      codeReviewCount: body.codeReviewCount,
    });
    return send(req, res, 200, { credential });
  } catch (e) {
    if (e instanceof BarError)
      return send(req, res, 403, { error: e.message, reasons: e.reasons });
    return send(req, res, e.code || 500, { error: e.message });
  }
}

if (
  import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  http
    .createServer(handle)
    .listen(PORT, () => console.log(`[verifier] listening on :${PORT}`));
}

export { handle, verifierWallet };
