import { newEntryUid } from './uid';

describe('newEntryUid', () => {
  it('returns a non-empty string with the runtime `e-` prefix', () => {
    const u = newEntryUid();
    expect(typeof u).toBe('string');
    expect(u.length).toBeGreaterThan(2);
    expect(u.startsWith('e-')).toBe(true);
  });

  it('is unique across many rapid calls (no collisions)', () => {
    const set = new Set();
    for (let i = 0; i < 5000; i += 1) set.add(newEntryUid());
    expect(set.size).toBe(5000);
  });

  it('never collides with the deterministic bundled scheme (<charId>-<n>)', () => {
    // Bundled uids look like "Pellias-3"; runtime ones start with "e-".
    expect(/^e-/.test(newEntryUid())).toBe(true);
  });
});
