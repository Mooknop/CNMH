import { verifyAccess, requireGm } from './access.js';

// The CI push path (Authorization: Bearer <GM_PUSH_TOKEN>) returns before any
// Cloudflare Access JWT/crypto, so it's testable without mocking WebCrypto. A
// non-matching/absent token falls through to the Access logic, which returns
// null here because the test env has no team domain / AUD configured.
const req = (headers = {}) =>
  new Request('https://x/api/gm/lore/x', { method: 'PUT', headers });

describe('verifyAccess — CI push token (GM_PUSH_TOKEN)', () => {
  it('accepts a matching bearer token as the CI identity', async () => {
    const out = await verifyAccess(req({ Authorization: 'Bearer s3cret-value' }), { GM_PUSH_TOKEN: 's3cret-value' });
    expect(out).toEqual({ email: 'lore-sync@ci' });
  });

  it('rejects a wrong bearer token', async () => {
    expect(await verifyAccess(req({ Authorization: 'Bearer wrong' }), { GM_PUSH_TOKEN: 's3cret-value' })).toBeNull();
  });

  it('rejects a token of a different length (constant-time guard)', async () => {
    expect(await verifyAccess(req({ Authorization: 'Bearer s3cret' }), { GM_PUSH_TOKEN: 's3cret-value' })).toBeNull();
  });

  it('ignores a bearer header when GM_PUSH_TOKEN is unset', async () => {
    expect(await verifyAccess(req({ Authorization: 'Bearer anything' }), {})).toBeNull();
  });

  it('no Authorization header → null', async () => {
    expect(await verifyAccess(req(), { GM_PUSH_TOKEN: 's3cret-value' })).toBeNull();
  });

  it('GM_DEV_BYPASS still short-circuits to the GM email', async () => {
    expect(await verifyAccess(req(), { GM_DEV_BYPASS: 'true', GM_EMAIL: 'gm@x' })).toEqual({ email: 'gm@x' });
  });
});

describe('requireGm — shared GM route guard', () => {
  it('returns the identity when access verifies (dev bypass)', async () => {
    const out = await requireGm(req(), { GM_DEV_BYPASS: 'true', GM_EMAIL: 'gm@x' });
    expect(out).toEqual({ email: 'gm@x' });
    expect(out).not.toBeInstanceOf(Response);
  });

  it('returns the identity when access verifies (CI push token)', async () => {
    const out = await requireGm(
      req({ Authorization: 'Bearer s3cret-value' }),
      { GM_PUSH_TOKEN: 's3cret-value' }
    );
    expect(out).toEqual({ email: 'lore-sync@ci' });
  });

  it('returns a 403 Forbidden Response when access fails', async () => {
    const out = await requireGm(req(), {});
    expect(out).toBeInstanceOf(Response);
    expect(out.status).toBe(403);
    expect(await out.text()).toBe('Forbidden');
  });

  it('never returns 401 — Access at the edge owns the login challenge', async () => {
    const out = await requireGm(req({ Authorization: 'Bearer wrong' }), { GM_PUSH_TOKEN: 's3cret-value' });
    expect(out).toBeInstanceOf(Response);
    expect(out.status).toBe(403);
  });
});
