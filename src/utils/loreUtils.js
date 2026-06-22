export function getAllCategories(entries) {
  return [...new Set(entries.map(e => e.category))].sort();
}

export function getEntriesByCategory(entries, category) {
  return entries.filter(e => e.category === category);
}

export function groupEntriesByCategory(entries) {
  const categories = getAllCategories(entries);
  return categories.map(category => ({
    category,
    entries: entries.filter(e => e.category === category),
  }));
}

export function buildBacklinkMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    for (const relatedId of (entry.related || [])) {
      if (!map.has(relatedId)) map.set(relatedId, []);
      map.get(relatedId).push(entry.id);
    }
  }
  return map;
}

export function getConnectionData(entry, allEntries, backlinkMap) {
  const byId = new Map(allEntries.map(e => [e.id, e]));

  // Containment edges (the parent and direct children) render in their own
  // breadcrumb / "Contains" sections, so keep them out of the generic relation
  // buckets even if a residual `related` link still names one.
  const excluded = new Set();
  if (entry.parent) excluded.add(entry.parent);
  for (const e of allEntries) if (e.parent === entry.id) excluded.add(e.id);

  const outgoing = (entry.related || [])
    .map(id => byId.get(id))
    .filter(Boolean)
    .filter(e => !excluded.has(e.id));

  const incomingIds = backlinkMap.get(entry.id) || [];
  const incoming = incomingIds
    .map(id => byId.get(id))
    .filter(Boolean)
    .filter(e => !excluded.has(e.id));

  const groupByCategory = (list) => {
    const result = {};
    for (const e of list) {
      if (!result[e.category]) result[e.category] = [];
      result[e.category].push(e);
    }
    return result;
  };

  return {
    outgoing,
    incoming,
    outgoingByCategory: groupByCategory(outgoing),
    incomingByCategory: groupByCategory(incoming),
  };
}

// Containment hierarchy (single directed `parent` edge per entry).

// Map parentId -> child entries (inverse of `parent`), each list title-sorted.
export function buildChildrenMap(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    if (!entry.parent) continue;
    if (!map.has(entry.parent)) map.set(entry.parent, []);
    map.get(entry.parent).push(entry);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }
  return map;
}

// Direct children of an entry, title-sorted (empty array when none / no map).
export function getChildren(entry, childrenMap) {
  if (!entry || !childrenMap) return [];
  return childrenMap.get(entry.id) || [];
}

// Ancestor breadcrumb, root-first, EXCLUDING the entry itself. `allEntries` may
// be an array or a prebuilt id->entry Map. Cycle-guarded so bad data can't loop.
export function getAncestors(entry, allEntries) {
  if (!entry) return [];
  const byId = allEntries instanceof Map
    ? allEntries
    : new Map((allEntries || []).map(e => [e.id, e]));
  const chain = [];
  const seen = new Set([entry.id]);
  let cursor = entry.parent ? byId.get(entry.parent) : null;
  while (cursor && !seen.has(cursor.id)) {
    chain.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parent ? byId.get(cursor.parent) : null;
  }
  return chain;
}

// `[[Target]]` / `[[Target|alias]]` -> resolution target ("Target"). The link
// target is the part before the pipe; the alias is display-only. Mirrors
// scripts/lib/loreVault.js's parseWikilink so drawer links and the pushed
// related[] resolve identically.
export function parseWikiTarget(raw) {
  const m = String(raw || '').match(/^\s*\[\[([^\]]+)\]\]\s*$/);
  const inner = m ? m[1] : String(raw || '');
  return inner.split('|')[0].trim();
}

// Map lowercased title -> id for case-insensitive wikilink resolution.
export function buildTitleToIdMap(entries) {
  const map = new Map();
  for (const e of entries || []) {
    if (e.title && e.id) map.set(String(e.title).toLowerCase(), e.id);
  }
  return map;
}

// Resolve a wikilink (raw `[[...]]` or a bare target) to an entry id, or null.
export function resolveWikilink(raw, titleMap) {
  const target = parseWikiTarget(raw);
  if (!target || !titleMap) return null;
  return titleMap.get(target.toLowerCase()) || null;
}

export function filterBySearchTerm(entries, searchTerm) {
  const term = (searchTerm || '').trim().toLowerCase();
  if (!term) return entries;
  return entries.filter(e =>
    (e.title || '').toLowerCase().includes(term) ||
    (e.summary || '').toLowerCase().includes(term)
  );
}
