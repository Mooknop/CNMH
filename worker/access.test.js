import { verifyAccess } from './access.js';

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
