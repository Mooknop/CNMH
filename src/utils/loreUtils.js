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

  const outgoing = (entry.related || [])
    .map(id => byId.get(id))
    .filter(Boolean);

  const incomingIds = backlinkMap.get(entry.id) || [];
  const incoming = incomingIds
    .map(id => byId.get(id))
    .filter(Boolean);

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
