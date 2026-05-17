// Durable Object: one instance per campaign. The authoritative store for
// editable campaign content (quests, factions, lore, calendar, traits,
// characters). SQLite-backed (see wrangler.toml `new_sqlite_classes`) so it
// stays on the free tier, and it uses the WebSocket Hibernation API to fan
// GM edits out to every connected device live — same pattern as
// CampaignSession, but for content rather than ephemeral session state.
//
// Storage uses the SQLite SQL API (not storage.put) because lore (~140 KB
// combined) and character sheets (30-50 KB each) exceed the 128 KiB
// per-value key-value cap. One row per entity keyed by (collection, id).

const COLLECTIONS = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character'];

export class CampaignContent {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, id)
      );`
    );
  }

  // --- snapshot helpers -----------------------------------------------------

  snapshot() {
    const out = {};
    for (const c of COLLECTIONS) out[c] = [];
    const rows = this.state.storage.sql
      .exec('SELECT collection, data FROM documents ORDER BY collection, id')
      .toArray();
    for (const row of rows) {
      if (!out[row.collection]) out[row.collection] = [];
      try {
        out[row.collection].push(JSON.parse(row.data));
      } catch {
        /* skip a corrupt row rather than fail the whole snapshot */
      }
    }
    return out;
  }

  countIn(collection) {
    const r = this.state.storage.sql
      .exec('SELECT COUNT(*) AS n FROM documents WHERE collection = ?', collection)
      .toArray();
    return r.length ? r[0].n : 0;
  }

  upsert(collection, id, data) {
    this.state.storage.sql.exec(
      `INSERT INTO documents (collection, id, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (collection, id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      collection,
      id,
      JSON.stringify(data),
      Date.now()
    );
  }

  remove(collection, id) {
    this.state.storage.sql.exec(
      'DELETE FROM documents WHERE collection = ? AND id = ?',
      collection,
      id
    );
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const peer of this.state.getWebSockets()) {
      try {
        peer.send(payload);
      } catch {
        /* peer is gone; runtime will clean it up */
      }
    }
  }

  // --- request handling -----------------------------------------------------

  async fetch(request) {
    // Live content channel (mirrors CampaignSession's hibernatable accept).
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'FULL_CONTENT', payload: this.snapshot() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','gm','quest','x']

    // Public read: GET /api/content
    if (request.method === 'GET' && url.pathname === '/api/content') {
      return Response.json({ payload: this.snapshot() });
    }

    // GM seed: POST /api/gm/seed  { force?, collections: { quest: [...] } }
    if (request.method === 'POST' && url.pathname === '/api/gm/seed') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('Bad JSON', { status: 400 });
      }
      const force = !!body.force;
      const collections = body.collections || {};
      const seeded = {};
      for (const [collection, docs] of Object.entries(collections)) {
        if (!COLLECTIONS.includes(collection) || !Array.isArray(docs)) continue;
        if (!force && this.countIn(collection) > 0) {
          seeded[collection] = 'skipped (not empty)';
          continue;
        }
        if (force) this.state.storage.sql.exec('DELETE FROM documents WHERE collection = ?', collection);
        for (const doc of docs) {
          if (doc && doc.id != null) this.upsert(collection, String(doc.id), doc);
        }
        seeded[collection] = `seeded ${docs.length}`;
      }
      this.broadcast({ type: 'FULL_CONTENT', payload: this.snapshot() });
      return Response.json({ ok: true, seeded });
    }

    // GM write: PUT /api/gm/:collection/:id   body = entity JSON
    if (request.method === 'PUT' && parts[0] === 'api' && parts[1] === 'gm' && parts.length === 4) {
      const collection = parts[2];
      const id = decodeURIComponent(parts[3]);
      if (!COLLECTIONS.includes(collection)) {
        return new Response('Unknown collection', { status: 404 });
      }
      let data;
      try {
        data = await request.json();
      } catch {
        return new Response('Bad JSON', { status: 400 });
      }
      const stored = { ...data, id };
      this.upsert(collection, id, stored);
      this.broadcast({ type: 'CONTENT_UPDATE', collection, id, data: stored });
      return Response.json({ ok: true, id });
    }

    // GM delete: DELETE /api/gm/:collection/:id
    if (request.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'gm' && parts.length === 4) {
      const collection = parts[2];
      const id = decodeURIComponent(parts[3]);
      if (!COLLECTIONS.includes(collection)) {
        return new Response('Unknown collection', { status: 404 });
      }
      this.remove(collection, id);
      this.broadcast({ type: 'CONTENT_DELETE', collection, id });
      return Response.json({ ok: true, id });
    }

    return new Response('Not found', { status: 404 });
  }

  // Content flows server -> clients only; ignore inbound socket messages.
  async webSocketMessage() {}

  async webSocketClose(ws) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}
