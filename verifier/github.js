// GitHub API helpers for the Kin verifier service. All calls require an OAuth access token
// (scopes: read:user, public_repo).

const GH = 'https://api.github.com';
const GH_AUTH = 'https://github.com/login/oauth/access_token';

const STUB = process.env.STUB_MODE === '1';

/// Exchange an OAuth code for an access token.
export async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri }) {
  if (STUB) return 'stub-access-token';
  const res = await fetch(GH_AUTH, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`oauth exchange HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`oauth exchange returned: ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

async function gh(path, token) {
  const res = await fetch(`${GH}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'kin-verifier' },
  });
  if (!res.ok) throw new Error(`github ${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function fetchUser(token) {
  if (STUB) return { login: 'stub-user', created_at: new Date(Date.now() - 1000 * 86400 * 800).toISOString() };
  const u = await gh('/user', token);
  return { login: u.login, created_at: u.created_at };
}

/// total merged PRs authored by the user (no star-floor filter in v2 — search API is too slow
/// to per-repo-check; we accept the bar of >=20 merged PRs as proxy enough for v2).
export async function countMergedPRsAuthored(login, token) {
  if (STUB) return 42;
  const data = await gh(`/search/issues?q=${encodeURIComponent(`author:${login} is:pr is:merged`)}&per_page=1`, token);
  return Number(data.total_count || 0);
}

/// PRs reviewed by the user in the last 12 months.
export async function countReviewedPRs(login, token) {
  if (STUB) return 25;
  const since = new Date(Date.now() - 1000 * 86400 * 365).toISOString().slice(0, 10);
  const q = `reviewed-by:${login} is:pr is:merged merged:>=${since}`;
  const data = await gh(`/search/issues?q=${encodeURIComponent(q)}&per_page=1`, token);
  return Number(data.total_count || 0);
}

/// Compute the full activity profile used for the Credential bar check.
export async function computeActivity(login, token) {
  const user = login === undefined ? await fetchUser(token) : null;
  const effectiveLogin = login ?? user.login;
  const created_at = login === undefined ? user.created_at : null;

  const [merged, reviewed] = await Promise.all([
    countMergedPRsAuthored(effectiveLogin, token),
    countReviewedPRs(effectiveLogin, token),
  ]);

  const accountAgeDays = created_at
    ? Math.floor((Date.now() - new Date(created_at).getTime()) / 86400000)
    : null;

  return {
    login: effectiveLogin,
    accountAgeDays,
    mergedPRs: merged,
    codeReviewCount: reviewed,
  };
}
