import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CampaignContent } from './CampaignContent.js';

// The DO is a plain class; we drive it with a mock `state` whose `storage.sql`
// is a tiny in-memory emulator of just the queries CampaignContent runs (one
// `documents` table + one `document_history` table). It's deliberately scoped
// to those statements — enough to exercise real seed/archive behavior without a
// SQLite runtime.

function makeSqlStorage() {
  const documents = []; // { collection, id, data, updated_at }
  const history = [];    // { collection, id, data, archived_at, rowid }
  let rowid = 0;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  const result = (rows = [], rowsWritten = 0) => ({
    toArray: () => rows,
    rowsWritten,
  });

  const sql = {
    documents,
    history,
    exec(rawSql, ...params) {
      const q = norm(rawSql);

      if (q.startsWith('CREATE TABLE')) return result();

      // --- documents reads ---
      if (q.startsWith('SELECT collection, data FROM documents')) {
        const rows = [...documents]
          .sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id))
          .map((d) => ({ collection: d.collection, data: d.data }));
        return result(rows);
      }
      if (q.startsWith('SELECT COUNT(*) AS n FROM documents WHERE collection = ?')) {
        const [collection] = params;
        return result([{ n: documents.filter((d) => d.collection === collection).length }]);
      }
      if (q.startsWith('SELECT id, data FROM documents WHERE collection = ?')) {
        const [collection] = params;
        return result(
          documents.filter((d) => d.collection === collection).map((d) => ({ id: d.id, data: d.data })),
        );
      }
      if (q.startsWith('SELECT id FROM documents WHERE collection = ?')) {
        const [collection] = params;
        return result(documents.filter((d) => d.collection === collection).map((d) => ({ id: d.id })));
      }
      if (q.startsWith('SELECT data FROM documents WHERE collection = ? AND id = ?')) {
        const [collection, id] = params;
        const row = documents.find((d) => d.collection === collection && d.id === id);
        return result(row ? [{ data: row.data }] : []);
      }

      // --- history reads ---
      if (q.startsWith('SELECT data FROM document_history')) {
        const [collection, id, archived_at] = params;
        const rows = history.filter(
          (h) => h.collection === collection && h.id === id && h.archived_at === archived_at,
        );
        return result(rows.map((h) => ({ data: h.data })));
      }
      if (q.startsWith('SELECT archived_at, data FROM document_history')) {
        const [collection, id] = params;
        const rows = history
          .filter((h) => h.collection === collection && h.id === id)
          .sort((a, b) => b.archived_at - a.archived_at || b.rowid - a.rowid);
        return result(rows.map((h) => ({ archived_at: h.archived_at, data: h.data })));
      }

      // --- writes ---
      if (q.startsWith('INSERT INTO documents')) {
        const [collection, id, data, updated_at] = params;
        const existing = documents.find((d) => d.collection === collection && d.id === id);
        if (existing) {
          existing.data = data;
          existing.updated_at = updated_at;
        } else {
          documents.push({ collection, id, data, updated_at });
        }
        return result([], 1);
      }
      if (q.startsWith('INSERT INTO document_history')) {
        const [collection, id, data, archived_at] = params;
        history.push({ collection, id, data, archived_at, rowid: ++rowid });
        return result([], 1);
      }
      if (q.startsWith('DELETE FROM document_history')) {
        // Prune to newest 5 per (collection, id) — mirrors HISTORY_KEEP.
        const [collection, id] = params;
        const group = history
          .filter((h) => h.collection === collection && h.id === id)
          .sort((a, b) => b.archived_at - a.archived_at || b.rowid - a.rowid);
        const keep = new Set(group.slice(0, 5).map((h) => h.rowid));
        let removed = 0;
        for (let i = history.length - 1; i >= 0; i -= 1) {
          const h = history[i];
          if (h.collection === collection && h.id === id && !keep.has(h.rowid)) {
            history.splice(i, 1);
            removed += 1;
          }
        }
        return result([], removed);
      }
      if (q.startsWith('DELETE FROM documents WHERE collection = ? AND id = ?')) {
        const [collection, id] = params;
        const i = documents.findIndex((d) => d.collection === collection && d.id === id);
        if (i >= 0) { documents.splice(i, 1); return result([], 1); }
        return result([], 0);
      }
      if (q.startsWith('DELETE FROM documents WHERE collection = ?')) {
        const [collection] = params;
        const before = documents.length;
        for (let i = documents.length - 1; i >= 0; i -= 1) {
          if (documents[i].collection === collection) documents.splice(i, 1);
        }
        return result([], before - documents.length);
      }

      throw new Error(`Unhandled SQL in fake: ${q}`);
    },
  };

  return { sql };
}

function makeState() {
  const sockets = [];
  return {
    storage: makeSqlStorage(),
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets; },
  };
}

function makeReq(method, path, body) {
  return {
    method,
    url: `https://example.test${path}`,
    headers: { get: () => null },
    json: async () => body,
  };
}

let savedResponse;
beforeEach(() => {
  savedResponse = globalThis.Response;
  globalThis.Response = class ResponseMock {
    constructor(body, init) { this.body = body; this.init = init; }
    static json(obj) { const r = new ResponseMock(); r.payload = obj; return r; }
  };
});
afterEach(() => { globalThis.Response = savedResponse; });

const seed = (content, collections, opts = {}) =>
  content.fetch(makeReq('POST', '/api/gm/seed', { ...opts, collections }));

const historyIds = (state, collection) =>
  state.storage.sql.history.filter((h) => h.collection === collection).map((h) => h.id);

describe('CampaignContent force reseed archiving', () => {
  test('bootstrap of an empty collection does NOT archive', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    const res = await seed(content, { quest: [{ id: 'q1', title: 'A' }] }, { force: true });

    expect(res.payload.seeded.quest).toBe('seeded 1');
    expect(historyIds(state, 'quest')).toEqual([]); // nothing to archive
  });

  test('force-overwriting a POPULATED collection archives every prior doc first', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    // Seed once (bootstrap), including a doc the next seed will drop.
    await seed(content, { quest: [{ id: 'q1', title: 'A' }, { id: 'gone', title: 'X' }] }, { force: true });
    expect(historyIds(state, 'quest')).toEqual([]);

    // Force reseed with a different set — q1 changes, 'gone' is dropped, q2 is new.
    const res = await seed(content, { quest: [{ id: 'q1', title: 'A2' }, { id: 'q2', title: 'B' }] }, { force: true });

    expect(res.payload.seeded.quest).toBe('seeded 2 (archived 2)');
    // BOTH prior docs (the changed one AND the dropped one) are restorable.
    expect(historyIds(state, 'quest').sort()).toEqual(['gone', 'q1']);

    // The dropped doc's prior version is recoverable from history.
    const hist = await content.fetch(makeReq('GET', '/api/gm/history/quest/gone'));
    expect(hist.payload.history).toHaveLength(1);
    expect(hist.payload.history[0].data).toEqual({ id: 'gone', title: 'X' });
  });

  test('the live store reflects the new seed after a force overwrite', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    await seed(content, { quest: [{ id: 'q1', title: 'A' }] }, { force: true });
    await seed(content, { quest: [{ id: 'q2', title: 'B' }] }, { force: true });

    const snap = await content.fetch(makeReq('GET', '/api/content'));
    const ids = snap.payload.payload.quest.map((d) => d.id);
    expect(ids).toEqual(['q2']); // q1 gone from live, but archived
    expect(historyIds(state, 'quest')).toEqual(['q1']);
  });
});

describe('CampaignContent capture-only collections (#760)', () => {
  // The persistent bestiary (`monster`) is written at runtime, never bundled.
  // A force reseed must leave it fully intact — the seed ships `monster: []`,
  // and without the guard the destructive force path would wipe every creature.
  const putMonster = (content, id, data) =>
    content.fetch(makeReq('PUT', `/api/gm/monster/${id}`, { id, ...data }));

  test('force reseed does not touch a runtime-captured monster collection', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    // Capture a creature the way useBestiaryCapture does (single-doc PUT).
    await putMonster(content, 'goblin-warrior', { name: 'Goblin Warrior', bestiary: { level: -1 } });

    // A force reseed that ships an empty monster array (as the client would).
    const res = await seed(content, { quest: [{ id: 'q1', title: 'A' }], monster: [] }, { force: true });
    expect(res.payload.seeded.monster).toBe('skipped (capture-only, never seeded)');

    const snap = await content.fetch(makeReq('GET', '/api/content'));
    const ids = snap.payload.payload.monster.map((d) => d.id);
    expect(ids).toEqual(['goblin-warrior']); // survived the reseed
  });

  // The chapter-event tracker (#1112) is capture-only like room/monster: Paizo
  // text, public repo, so the seed must refuse it and the import route owns it.
  test('force reseed refuses the capture-only event collection; import populates it', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});

    const seeded = await seed(content, { event: [{ id: 'seeded', name: 'Nope' }] }, { force: true });
    expect(seeded.payload.seeded.event).toBe('skipped (capture-only, never seeded)');
    let snap = await content.fetch(makeReq('GET', '/api/content'));
    expect(snap.payload.payload.event).toEqual([]);

    await content.fetch(makeReq('POST', '/api/gm/import/event', { docs: [{ id: 'sd4s-event-town-rumors', name: 'Town Rumors' }] }));
    snap = await content.fetch(makeReq('GET', '/api/content'));
    expect(snap.payload.payload.event.map((d) => d.id)).toEqual(['sd4s-event-town-rumors']);
  });
});

describe('CampaignContent bulk import (#1075)', () => {
  const importDocs = (content, collection, docs) =>
    content.fetch(makeReq('POST', `/api/gm/import/${collection}`, { docs }));

  test('creates new docs and reports the counts', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    const res = await importDocs(content, 'room', [
      { id: 'sd4s-a1', name: 'Entrance' },
      { id: 'sd4s-a2', name: 'Dining Hall' },
    ]);

    expect(res.payload).toMatchObject({ ok: true, created: 2, updated: 0, unchanged: 0, skipped: 0 });
    const snap = await content.fetch(makeReq('GET', '/api/content'));
    expect(snap.payload.payload.room.map((d) => d.id).sort()).toEqual(['sd4s-a1', 'sd4s-a2']);
  });

  test('is the write path for capture-only room (seed refuses it, import does not)', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});

    // The seed route must skip `room` (public repo — never bundled).
    const seeded = await seed(content, { room: [{ id: 'seeded', name: 'Nope' }] }, { force: true });
    expect(seeded.payload.seeded.room).toBe('skipped (capture-only, never seeded)');
    let snap = await content.fetch(makeReq('GET', '/api/content'));
    expect(snap.payload.payload.room).toEqual([]);

    // The import route is how the same collection actually gets populated.
    await importDocs(content, 'room', [{ id: 'a3', name: 'Shrine to Kabriri' }]);
    snap = await content.fetch(makeReq('GET', '/api/content'));
    expect(snap.payload.payload.room.map((d) => d.id)).toEqual(['a3']);
  });

  test('re-running an unchanged import writes nothing and churns no history', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    await importDocs(content, 'room', [{ id: 'a3', name: 'Shrine', dc: 19 }]);

    const res = await importDocs(content, 'room', [{ id: 'a3', name: 'Shrine', dc: 19 }]);
    expect(res.payload).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(historyIds(state, 'room')).toEqual([]); // no-op left no archived version
  });

  test('a changed doc is archived then overwritten (restorable)', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    await importDocs(content, 'room', [{ id: 'a3', name: 'Shrine', dc: 19 }]);

    const res = await importDocs(content, 'room', [{ id: 'a3', name: 'Shrine', dc: 21 }]);
    expect(res.payload).toMatchObject({ created: 0, updated: 1, unchanged: 0 });

    const snap = await content.fetch(makeReq('GET', '/api/content'));
    expect(snap.payload.payload.room[0].dc).toBe(21); // live reflects the update

    const hist = await content.fetch(makeReq('GET', '/api/gm/history/room/a3'));
    expect(hist.payload.history[0].data).toEqual({ id: 'a3', name: 'Shrine', dc: 19 }); // prior restorable
  });

  test('docs without an id are skipped, not written', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});
    const res = await importDocs(content, 'room', [{ name: 'no id here' }, { id: 'ok', name: 'fine' }]);
    expect(res.payload).toMatchObject({ created: 1, skipped: 1 });
  });

  test('rejects an unknown collection and a malformed body', async () => {
    const state = makeState();
    const content = new CampaignContent(state, {});

    const bad = await importDocs(content, 'nonsense', [{ id: 'x' }]);
    expect(bad.init.status).toBe(404);

    const noDocs = await content.fetch(makeReq('POST', '/api/gm/import/room', { nope: true }));
    expect(noDocs.init.status).toBe(400);
  });
});
