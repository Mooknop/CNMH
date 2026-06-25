import {
  saveDocument,
  deleteDocument,
  seedDefaults,
  seedFromBackup,
  fetchHistory,
  restoreVersion,
} from './gmApi';

const okJson = (body = { ok: true }) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

afterEach(() => vi.restoreAllMocks());

describe('gmApi', () => {
  it('saveDocument PUTs JSON to the encoded collection/id path', async () => {
    global.fetch = vi.fn(() => okJson({ ok: true, id: 'a b' }));
    const res = await saveDocument('quest', 'a b', { title: 'T' });
    expect(res).toEqual({ ok: true, id: 'a b' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/quest/a%20b');
    expect(opts.method).toBe('PUT');
    expect(opts.credentials).toBe('include');
    expect(JSON.parse(opts.body)).toEqual({ title: 'T' });
  });

  it('deleteDocument issues a DELETE', async () => {
    global.fetch = vi.fn(() => okJson());
    await deleteDocument('quest', 'q1');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/quest/q1');
    expect(opts.method).toBe('DELETE');
  });

  it('seedDefaults POSTs the bundled seed payload', async () => {
    global.fetch = vi.fn(() => okJson({ ok: true, seeded: { quest: 'seeded 5' } }));
    const res = await seedDefaults(true);
    expect(res.seeded.quest).toBe('seeded 5');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/seed');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.force).toBe(true);
    expect(body.collections.quest.length).toBeGreaterThan(0);
  });

  it('seedFromBackup force-seeds the provided collections', async () => {
    global.fetch = vi.fn(() => okJson({ ok: true, seeded: { lore: 'seeded 3' } }));
    const res = await seedFromBackup({ lore: [{ id: 'l' }] });
    expect(res.seeded.lore).toBe('seeded 3');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/seed');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ force: true, collections: { lore: [{ id: 'l' }] } });
  });

  it('fetchHistory GETs the encoded history path', async () => {
    global.fetch = vi.fn(() => okJson({ history: [{ archived_at: 1, data: { id: 'q' } }] }));
    const res = await fetchHistory('quest', 'a b');
    expect(res.history).toHaveLength(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/history/quest/a%20b');
    expect(opts.credentials).toBe('include');
    expect(opts.method).toBeUndefined();
  });

  it('restoreVersion POSTs the archived_at to the restore path', async () => {
    global.fetch = vi.fn(() => okJson({ ok: true, id: 'q1' }));
    await restoreVersion('lore', 'q1', 1717000000000);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/restore/lore/q1');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ archived_at: 1717000000000 });
  });

  it('throws with status text on a non-ok response', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('Forbidden') })
    );
    await expect(saveDocument('quest', 'x', {})).rejects.toThrow('403 Forbidden');
  });

});
