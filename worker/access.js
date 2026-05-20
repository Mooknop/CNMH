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

// Returns { email } when the request carries a valid GM Access token, else null.
export async function verifyAccess(request, env) {
  if (env.GM_DEV_BYPASS === 'true') {
    return { email: env.GM_EMAIL || 'dev@localhost' };
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
  // Service tokens (Playwright runner) have email ending in "@access".
  // AUD + cryptographic signature already scope them to this Access app;
  // the email allowlist check is only relevant for human logins.
  const isServiceToken = typeof claims.email === 'string' && claims.email.endsWith('@access');
  if (!isServiceToken && (!claims.email || claims.email.toLowerCase() !== gmEmail.toLowerCase())) return null;

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

  return { email: claims.email };
}
