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

export function filterBySearchTerm(entries, searchTerm) {
  const term = (searchTerm || '').trim().toLowerCase();
  if (!term) return entries;
  return entries.filter(e =>
    (e.title || '').toLowerCase().includes(term) ||
    (e.summary || '').toLowerCase().includes(term)
  );
}
