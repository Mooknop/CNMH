#!/usr/bin/env node
/*
 * Push the committed lore vault (`lore-vault/`) to the live CampaignContent
 * Durable Object (epic #285, slice #287). Makes the vault the *write path*:
 *
 *   edit in Obsidian → commit → npm run lore:push → live app updates instantly
 *
 * Workflow: parse the vault (shared contract in ./lib/loreVault.js), validate it,
 * diff against `GET /api/content`, and PUT/DELETE changed entities through the
 * Access-gated GM API. Per-entity PUTs broadcast CONTENT_UPDATE, so connected
 * clients refresh live — no deploy, no force-reseed.
 *
 * Run:  node scripts/pushLoreVault.js [<base-url>] [--dry-run] [--allow-delete]
 *   or: CNMH_SNAPSHOT_URL=https://... node scripts/pushLoreVault.js --dry-run
 *
 * Default base URL: https://cnmh.mooknop.workers.dev
 * Reads are public; writes need the CI push token (a per-environment Worker
 * secret the Worker verifies directly — see worker/access.js):
 *   GM_PUSH_TOKEN   (sent as `Authorization: Bearer <token>`)
 *
 * reveal state (`visibility`) is NEVER written — it's read from the live doc and
 * preserved on every PUT (new entries default to `gm`). See #285 decision 4.
 */

const fs = require('fs');
const path = require('path');
const { parseFile, extractBodyWikilinks } = require('./lib/loreVault');

const DEFAULT_BASE = 'https://cnmh.mooknop.workers.dev';
const VAULT_DIR = path.join(__dirname, '..', 'lore-vault');

// Fields the vault authors. Everything else on a live doc (visibility, tags,
// createdAt, any future DO field) is DO-managed and preserved verbatim on push.
const AUTHORED_FIELDS = new Set([
  'id',
  'title',
  'category',
  'summary',
  'content',
  'related',
  'parent',
  'image',
  'imagePosition',
  'dateArStart',
  'dateArEnd',
]);

// ---------------------------------------------------------------------------
// Pure logic (no fs, no network) — unit-tested in pushLoreVault.test.js
// ---------------------------------------------------------------------------

// Concatenate title lists, removing case-insensitive duplicates (first wins).
function unionTitles(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const t of list || []) {
      const key = String(t).toLowerCase();
      if (t && !seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
  }
  return out;
}

// Compile raw vault files into lore docs with `related` resolved to ids.
// `files` = [{ category, filenameTitle, markdown }].
// Returns { docs, titleToId, unresolved: [{ id, link }] }.
function compileVault(files) {
  const compiled = (files || []).map(({ category, filenameTitle, markdown }) => {
    const doc = parseFile(markdown, { category, filenameTitle });
    // related[] = frontmatter wikilinks ∪ inline body wikilinks (epic #285).
    const relatedTitles = unionTitles(doc.related, extractBodyWikilinks(doc.content));
    return { doc, relatedTitles };
  });

  // Case-insensitive title -> id lookup across the whole vault.
  const titleToId = new Map();
  for (const { doc } of compiled) {
    if (doc.title && doc.id) titleToId.set(String(doc.title).toLowerCase(), doc.id);
  }

  const unresolved = [];
  const docs = compiled.map(({ doc, relatedTitles }) => {
    const ids = [];
    const seen = new Set();
    for (const title of relatedTitles) {
      const id = titleToId.get(String(title).toLowerCase());
      if (!id) {
        unresolved.push({ id: doc.id, link: title });
        continue;
      }
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    // Single parent edge: resolve title -> id; a dead parent is a broken link.
    let parent;
    if (doc.parent) {
      const parentId = titleToId.get(String(doc.parent).toLowerCase());
      if (parentId) parent = parentId;
      else unresolved.push({ id: doc.id, link: doc.parent });
    }
    const out = { ...doc, related: ids };
    if (parent) out.parent = parent;
    else delete out.parent;
    return out;
  });

  return { docs, titleToId, unresolved };
}

// Validate compiled docs. Returns { errors, warnings } (arrays of strings).
// Any error must abort the push before a single write.
function validateVault(docs, unresolved = []) {
  const errors = [];
  const warnings = [];

  const idCounts = new Map();
  for (const doc of docs) {
    if (!doc.id) {
      errors.push(`Missing id: "${doc.title || doc.category || '?'}" has no frontmatter id.`);
      continue;
    }
    idCounts.set(doc.id, (idCounts.get(doc.id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) errors.push(`Duplicate id "${id}" appears in ${count} files.`);
  }

  for (const doc of docs) {
    const label = doc.id || doc.title || '?';
    if (!doc.title) errors.push(`Missing title: "${label}" has no title.`);
    if (!doc.category) errors.push(`Missing category: "${label}" has no category folder.`);
    if (doc.category === 'History' && doc.dateArStart == null) {
      warnings.push(`History entry "${label}" has no dateArStart — renders as "Unknown Date".`);
    }
  }

  for (const { id, link } of unresolved) {
    errors.push(`Broken link: "${id}" → [[${link}]] resolves to no vault file.`);
  }

  // Hierarchy integrity: `parent` is a resolved id here. No self-parent, and no
  // cycles (walk the ancestor chain; a revisit means a loop).
  const parentById = new Map(docs.filter((d) => d.id).map((d) => [d.id, d.parent]));
  for (const doc of docs) {
    if (!doc.id || !doc.parent) continue;
    if (doc.parent === doc.id) {
      errors.push(`Self-parent: "${doc.id}" lists itself as parent.`);
      continue;
    }
    const seen = new Set([doc.id]);
    let cursor = doc.parent;
    while (cursor) {
      if (seen.has(cursor)) {
        errors.push(`Parent cycle: "${doc.id}" is in a containment loop via "${cursor}".`);
        break;
      }
      seen.add(cursor);
      cursor = parentById.get(cursor);
    }
  }

  return { errors, warnings };
}

// Deep clone with recursively sorted object keys (arrays keep their order).
function sortedClone(value) {
  if (Array.isArray(value)) return value.map(sortedClone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortedClone(value[key]);
    return out;
  }
  return value;
}

function isEmptyValue(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

// Canonical form for both diffing and the PUT body: drop empty/nullish optional
// fields and stable-sort keys. JSON.stringify of the result is order-stable, so
// `JSON.stringify(canonicalizeDoc(a)) === JSON.stringify(canonicalizeDoc(b))`
// is a reliable deep-equality check.
function canonicalizeDoc(doc) {
  const cleaned = {};
  for (const [k, v] of Object.entries(doc || {})) {
    if (!isEmptyValue(v)) cleaned[k] = v;
  }
  return sortedClone(cleaned);
}

// Build the doc to PUT: authored fields from the vault + every DO-managed field
// carried over from the live doc. New docs default to `visibility: 'gm'`.
// Never writes/flips an existing `visibility`.
function mergeDoc(authoredDoc, liveDoc = null) {
  const merged = { ...authoredDoc };
  if (liveDoc) {
    for (const [k, v] of Object.entries(liveDoc)) {
      if (!AUTHORED_FIELDS.has(k)) merged[k] = v;
    }
  }
  if (merged.visibility == null) merged.visibility = 'gm';
  return merged;
}

// Diff compiled vault docs against the live lore collection.
// Returns { creates, updates, unchanged, deletes }; creates/updates carry the
// canonical `doc` to PUT, deletes carry the live `doc`.
function diffDocs(vaultDocs, liveDocs) {
  const liveById = new Map((liveDocs || []).map((d) => [d.id, d]));
  const vaultIds = new Set(vaultDocs.map((d) => d.id));

  const creates = [];
  const updates = [];
  const unchanged = [];

  for (const vaultDoc of vaultDocs) {
    const live = liveById.get(vaultDoc.id) || null;
    const canonical = canonicalizeDoc(mergeDoc(vaultDoc, live));
    if (!live) {
      creates.push({ id: vaultDoc.id, doc: canonical });
    } else if (JSON.stringify(canonical) !== JSON.stringify(canonicalizeDoc(live))) {
      updates.push({ id: vaultDoc.id, doc: canonical });
    } else {
      unchanged.push({ id: vaultDoc.id });
    }
  }

  const deletes = (liveDocs || [])
    .filter((d) => !vaultIds.has(d.id))
    .map((d) => ({ id: d.id, doc: d }));

  return { creates, updates, unchanged, deletes };
}

// ---------------------------------------------------------------------------
// I/O — fs + network (only reached via main())
// ---------------------------------------------------------------------------

// Read `lore-vault/<Category>/*.md` into raw file records. Skips `.obsidian` and
// any top-level files (README.md etc).
function readVaultFiles(vaultDir) {
  const files = [];
  for (const entry of fs.readdirSync(vaultDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.obsidian') continue;
    const category = entry.name;
    const dir = path.join(vaultDir, category);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      files.push({
        category,
        filenameTitle: f.replace(/\.md$/, ''),
        markdown: fs.readFileSync(path.join(dir, f), 'utf8'),
      });
    }
  }
  return files;
}

function resolveBaseUrl(argv) {
  const positional = argv.find((a) => !a.startsWith('--'));
  return (positional || process.env.CNMH_SNAPSHOT_URL || DEFAULT_BASE).replace(/\/$/, '');
}

async function fetchLiveLore(baseUrl) {
  const endpoint = `${baseUrl}/api/content`;
  console.log(`Fetching ${endpoint} ...`);
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${endpoint}`);
  const body = await res.json();
  const snapshot = body && body.payload && typeof body.payload === 'object' ? body.payload : body;
  const lore = Array.isArray(snapshot.lore) ? snapshot.lore : [];
  // Guard: an empty/error response must never be read as "delete everything".
  if (lore.length === 0) {
    throw new Error('Guard failed: live "lore" is missing or empty — aborting.');
  }
  return lore;
}

function authHeaders() {
  const token = process.env.GM_PUSH_TOKEN;
  if (!token) {
    throw new Error(
      'Writes need GM_PUSH_TOKEN — the CI push token (a Worker secret; set it via `wrangler secret put GM_PUSH_TOKEN`). Or pass --dry-run to skip writes.'
    );
  }
  return { Authorization: `Bearer ${token}` };
}

async function putDoc(baseUrl, id, doc, headers) {
  const res = await fetch(`${baseUrl}/api/gm/lore/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`PUT ${id} failed: HTTP ${res.status} ${res.statusText}`);
}

async function deleteDoc(baseUrl, id, headers) {
  const res = await fetch(`${baseUrl}/api/gm/lore/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`DELETE ${id} failed: HTTP ${res.status} ${res.statusText}`);
}

function printReport({ creates, updates, unchanged, deletes }, { allowDelete }) {
  console.log('\nChange report:');
  console.log(`  create    ${creates.length}`);
  console.log(`  update    ${updates.length}`);
  console.log(`  unchanged ${unchanged.length}`);
  console.log(`  delete    ${deletes.length}${allowDelete ? '' : ' (skipped — pass --allow-delete)'}`);
  for (const { id } of creates) console.log(`    + ${id}`);
  for (const { id } of updates) console.log(`    ~ ${id}`);
  for (const { id } of deletes) console.log(`    - ${id}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const allowDelete = argv.includes('--allow-delete');
  const baseUrl = resolveBaseUrl(argv);

  // 1. Read + compile + validate the vault — abort before any write on error.
  const { docs, unresolved } = compileVault(readVaultFiles(VAULT_DIR));
  const { errors, warnings } = validateVault(docs, unresolved);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (errors.length) {
    console.error(`\n✗ ${errors.length} validation error(s):`);
    for (const e of errors) console.error(`    ${e}`);
    process.exit(1);
  }
  console.log(`Parsed ${docs.length} vault entries (${warnings.length} warning(s)).`);

  // 2. Diff against live.
  const live = await fetchLiveLore(baseUrl);
  const diff = diffDocs(docs, live);
  printReport(diff, { allowDelete });

  if (dryRun) {
    console.log('\n(dry run — nothing written)');
    return;
  }

  const writes = [...diff.creates, ...diff.updates];
  const willDelete = allowDelete ? diff.deletes : [];
  if (writes.length === 0 && willDelete.length === 0) {
    console.log('\n✓ Nothing to push — live DO already matches the vault.');
    return;
  }

  // 3. Push: PUT changed/new docs, then DELETE (only with --allow-delete).
  const headers = authHeaders();
  for (const { id, doc } of writes) {
    await putDoc(baseUrl, id, doc, headers);
    console.log(`  ✓ PUT ${id}`);
  }
  for (const { id } of willDelete) {
    await deleteDoc(baseUrl, id, headers);
    console.log(`  ✓ DELETE ${id}`);
  }

  console.log(`\n✓ Pushed ${writes.length} doc(s)${willDelete.length ? `, deleted ${willDelete.length}` : ''}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exit(1);
  });
}

module.exports = { compileVault, validateVault, canonicalizeDoc, mergeDoc, diffDocs };
