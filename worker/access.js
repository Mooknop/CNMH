// Cloudflare Access (Zero Trust) verification — defense-in-depth.
//
// Access is enforced at the edge in front of this Worker for the paths the
// self-hosted Access application covers (/gm*, /api/gm/*). It injects a signed
// JWT in `Cf-Access-Jwt-Assertion`. We re-verify that JWT here so the Worker
// itself never trusts an unauthenticated request and so /whoami can report the
// identity. No external dependency — RS256 is verified with WebCrypto.
//
// For local `wrangler dev` there is no edge Access, so set GM_DEV_BYPASS=true
// in .dev.vars (never in production) to treat the request as the GM.

const b64urlToBytes = (s) => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

// Length-aware constant-time string compare for the CI push token, so a valid
// token can't be discovered by timing the response.
const tokensMatch = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// Module-level JWKS cache (per isolate); short TTL so key rotation is picked up.
let certsCache = { domain: null, keys: null, expires: 0 };

const getKeys = async (teamDomain) => {
  const now = Date.now();
  if (certsCache.keys && certsCache.domain === teamDomain && certsCache.expires > now) {
    return certsCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('JWKS fetch failed');
  const jwks = await res.json();
  certsCache = { domain: teamDomain, keys: jwks.keys || [], expires: now + 60 * 60 * 1000 };
  return certsCache.keys;
};

// Guard for GM-only routes. Returns the verified identity ({ email }) when the
// request is an authenticated GM, else a ready-to-return 403 Response. Callers:
//
//   const gm = await requireGm(request, env);
//   if (gm instanceof Response) return gm;
//
// The denial is always 403 Forbidden, never 401: a 401 promises a
// WWW-Authenticate challenge this Worker never issues — interactive login is
// handled upstream by Cloudflare Access at the edge, and machine peers use a
// bearer/service token. The Worker also can't distinguish "no credentials"
// from "bad credentials" without leaking why verification failed.
export async function requireGm(request, env) {
  const gm = await verifyAccess(request, env);
  return gm || new Response('Forbidden', { status: 403 });
}

// Returns { email } when the request carries a valid GM Access token, else null.
export async function verifyAccess(request, env) {
  if (env.GM_DEV_BYPASS === 'true') {
    return { email: env.GM_EMAIL || 'dev@localhost' };
  }

  // Machine-to-machine auth for the GM write API (the lore-sync vault push). The
  // request carries `Authorization: Bearer <GM_PUSH_TOKEN>` and is verified here
  // directly — this path needs NO Cloudflare Access application in front of
  // /api/gm/* (a service token's CF-Access-Client-* headers only become a JWT
  // when an Access app fronts the path, which ours does not). The token is a
  // per-environment Worker secret. Human logins still use the Access JWT/cookie
  // verified below.
  const bearer = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (bearer && env.GM_PUSH_TOKEN && tokensMatch(bearer[1], env.GM_PUSH_TOKEN)) {
    return { email: 'lore-sync@ci' };
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  const gmEmail = env.GM_EMAIL;
  if (!teamDomain || !aud || !gmEmail) return null;

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;

  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;

  let header;
  let claims;
  try {
    header = b64urlToJson(h);
    claims = b64urlToJson(p);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;
  if (claims.exp && Date.now() >= claims.exp * 1000) return null;
  const audClaim = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audClaim.includes(aud)) return null;
  // Service tokens (e.g. Playwright runner) carry `common_name` instead of
  // `email`. AUD + signature already prove the JWT came from the matching
  // Access app, which only mints tokens for identities its policies allow —
  // so for service tokens, that's sufficient. Human logins still require the
  // GM_EMAIL allowlist match as defense-in-depth.
  const tokenEmail = typeof claims.email === 'string' ? claims.email : null;
  const tokenName = typeof claims.common_name === 'string' ? claims.common_name : null;
  const isServiceToken = tokenName !== null || (tokenEmail !== null && tokenEmail.endsWith('@access'));
  if (!isServiceToken && (!tokenEmail || tokenEmail.toLowerCase() !== gmEmail.toLowerCase())) return null;

  let keys;
  try {
    keys = await getKeys(teamDomain);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`)
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  return { email: tokenEmail || tokenName };
}
