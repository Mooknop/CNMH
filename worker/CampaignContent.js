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

const COLLECTIONS = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character', 'item', 'spell', 'effect', 'rune', 'image', 'theme', 'monster'];

// Versions kept per (collection, id). Deliberately small: character sheets are
// 30-50 KB, so unbounded history would blow the free-tier SQLite budget for a
// 5-player campaign. Only single-entity PUT/DELETE archive (never bulk seed).
const HISTORY_KEEP = 5;

export class CampaignContent {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.writesSinceRestart = 0;
    this.startedAt = Date.now();
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, id)
      );`
    );
    // Prior versions, captured just before an edit/delete overwrites a row.
    // No explicit PK — the implicit rowid orders versions and survives
    // same-millisecond writes that a (collection,id,archived_at) key wouldn't.
    this.state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS document_history (
        collection  TEXT NOT NULL,
        id          TEXT NOT NULL,
        data        TEXT NOT NULL,
        archived_at INTEGER NOT NULL
      );`
    );
  }

  bumpUsage(rowsWritten) {
    this.writesSinceRestart += rowsWritten ?? 0;
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

  idsIn(collection) {
    return new Set(
      this.state.storage.sql
        .exec('SELECT id FROM documents WHERE collection = ?', collection)
        .toArray()
        .map((r) => r.id)
    );
  }

  // Snapshot the current row (if any) into document_history, then prune to
  // the newest HISTORY_KEEP versions. No-op when there's nothing to archive.
  archive(collection, id) {
    const rows = this.state.storage.sql
      .exec('SELECT data FROM documents WHERE collection = ? AND id = ?', collection, id)
      .toArray();
    if (!rows.length) return;
    this.bumpUsage(this.state.storage.sql.exec(
      'INSERT INTO document_history (collection, id, data, archived_at) VALUES (?, ?, ?, ?)',
      collection,
      id,
      rows[0].data,
      Date.now()
    ).rowsWritten);
    this.bumpUsage(this.state.storage.sql.exec(
      `DELETE FROM document_history
       WHERE collection = ? AND id = ? AND rowid NOT IN (
         SELECT rowid FROM document_history
         WHERE collection = ? AND id = ?
         ORDER BY archived_at DESC, rowid DESC
         LIMIT ?
       )`,
      collection,
      id,
      collection,
      id,
      HISTORY_KEEP
    ).rowsWritten);
  }

  historyFor(collection, id) {
    return this.state.storage.sql
      .exec(
        'SELECT archived_at, data FROM document_history WHERE collection = ? AND id = ? ORDER BY archived_at DESC, rowid DESC',
        collection,
        id
      )
      .toArray()
      .map((r) => {
        let data = null;
        try {
          data = JSON.parse(r.data);
        } catch {
          /* leave null so one corrupt version doesn't break the list */
        }
        return { archived_at: r.archived_at, data };
      });
  }

  // `archive` is true only for single-entity GM writes (PUT/restore); the bulk
  // seed loop passes false so a reseed never floods history.
  upsert(collection, id, data, archive = false) {
    if (archive) this.archive(collection, id);
    this.bumpUsage(this.state.storage.sql.exec(
      `INSERT INTO documents (collection, id, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (collection, id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      collection,
      id,
      JSON.stringify(data),
      Date.now()
    ).rowsWritten);
  }

  // Only ever called from the single-entity DELETE route, so always archive —
  // a deleted entity stays restorable from history.
  remove(collection, id) {
    this.archive(collection, id);
    this.bumpUsage(this.state.storage.sql.exec(
      'DELETE FROM documents WHERE collection = ? AND id = ?',
      collection,
      id
    ).rowsWritten);
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

    // Internal reset — only invoked by Worker's /api/gm/_test/reset handler.
    // Not reachable externally: the Worker intercepts that path before proxying.
    if (request.method === 'POST' && url.pathname === '/_internal/reset') {
      if (!url.searchParams.has('keep_content')) {
        this.bumpUsage(this.state.storage.sql.exec('DELETE FROM document_history').rowsWritten);
        this.bumpUsage(this.state.storage.sql.exec('DELETE FROM documents').rowsWritten);
      }
      this.broadcast({ type: 'FULL_CONTENT', payload: this.snapshot() });
      return Response.json({ ok: true });
    }

    // In-memory write counter — zero overhead (no DB writes).
    // Resets when the DO hibernates/migrates (CF behavior); label says "since restart".
    if (request.method === 'GET' && url.pathname === '/_internal/usage') {
      return Response.json({
        writesSinceRestart: this.writesSinceRestart,
        startedAt: this.startedAt,
        limit: 100000,
      });
    }

    // Public read: GET /api/content
    if (request.method === 'GET' && url.pathname === '/api/content') {
      return Response.json({ payload: this.snapshot() });
    }

    // GM seed: POST /api/gm/seed  { force?, mode?, collections: { quest: [...] } }
    //   mode:'fill-missing' — add only docs whose id is absent; never overwrites.
    //   force:true          — delete-then-replace each collection (destructive);
    //                         archives prior versions first when overwriting a
    //                         populated collection, so the reseed is restorable.
    //   default             — skip non-empty collections (idempotent safe seed).
    if (request.method === 'POST' && url.pathname === '/api/gm/seed') {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('Bad JSON', { status: 400 });
      }
      const force = !!body.force;
      const fillMissing = body.mode === 'fill-missing';
      const collections = body.collections || {};
      const seeded = {};
      for (const [collection, docs] of Object.entries(collections)) {
        if (!COLLECTIONS.includes(collection) || !Array.isArray(docs)) continue;
        if (fillMissing) {
          const existing = this.idsIn(collection);
          let added = 0;
          for (const doc of docs) {
            if (doc && doc.id != null && !existing.has(String(doc.id))) {
              this.upsert(collection, String(doc.id), doc);
              added++;
            }
          }
          seeded[collection] = `added ${added} (skipped ${docs.length - added} existing)`;
          continue;
        }
        if (!force && this.countIn(collection) > 0) {
          seeded[collection] = 'skipped (not empty)';
          continue;
        }
        let archived = 0;
        if (force) {
          // Overwriting a POPULATED collection: archive every current doc into
          // history first, so a force reseed is restorable (including docs the
          // new seed drops). Bootstrapping an EMPTY collection skips this —
          // nothing to archive, keeping the first seed cheap. This is the only
          // write path where the bulk seed touches history at all.
          const existing = this.idsIn(collection);
          for (const id of existing) {
            this.archive(collection, id);
            archived += 1;
          }
          this.bumpUsage(this.state.storage.sql.exec('DELETE FROM documents WHERE collection = ?', collection).rowsWritten);
        }
        for (const doc of docs) {
          if (doc && doc.id != null) this.upsert(collection, String(doc.id), doc);
        }
        seeded[collection] = archived
          ? `seeded ${docs.length} (archived ${archived})`
          : `seeded ${docs.length}`;
      }
      this.broadcast({ type: 'FULL_CONTENT', payload: this.snapshot() });
      return Response.json({ ok: true, seeded });
    }

    // GM history: GET /api/gm/history/:collection/:id
    if (
      request.method === 'GET' &&
      parts[0] === 'api' && parts[1] === 'gm' && parts[2] === 'history' && parts.length === 5
    ) {
      const collection = parts[3];
      const id = decodeURIComponent(parts[4]);
      if (!COLLECTIONS.includes(collection)) {
        return new Response('Unknown collection', { status: 404 });
      }
      return Response.json({ history: this.historyFor(collection, id) });
    }

    // GM restore: POST /api/gm/restore/:collection/:id   { archived_at }
    if (
      request.method === 'POST' &&
      parts[0] === 'api' && parts[1] === 'gm' && parts[2] === 'restore' && parts.length === 5
    ) {
      const collection = parts[3];
      const id = decodeURIComponent(parts[4]);
      if (!COLLECTIONS.includes(collection)) {
        return new Response('Unknown collection', { status: 404 });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('Bad JSON', { status: 400 });
      }
      const rows = this.state.storage.sql
        .exec(
          'SELECT data FROM document_history WHERE collection = ? AND id = ? AND archived_at = ?',
          collection,
          id,
          body.archived_at
        )
        .toArray();
      if (!rows.length) {
        return new Response('Version not found', { status: 404 });
      }
      let restored;
      try {
        restored = JSON.parse(rows[0].data);
      } catch {
        return new Response('Corrupt version', { status: 500 });
      }
      const stored = { ...restored, id };
      // archive=true: the pre-restore state is itself captured, so a restore
      // is reversible too.
      this.upsert(collection, id, stored, true);
      this.broadcast({ type: 'CONTENT_UPDATE', collection, id, data: stored });
      return Response.json({ ok: true, id });
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
      this.upsert(collection, id, stored, true);
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
