// Group imported adventure-room docs into sites for the World → Rooms browser
// and the dashboard room picker (#1077). A site bundles its optional "Features"
// doc with its rooms, ordered by book order (`sort`). Sites themselves are
// ordered by the earliest sort they contain, so the list reads front-to-back
// through the adventure.
export const groupRoomsBySite = (docs) => {
  const map = new Map();
  for (const doc of docs || []) {
    const key = doc.site || doc.chapter || 'Other';
    if (!map.has(key)) map.set(key, { site: key, features: null, rooms: [], minSort: Infinity });
    const g = map.get(key);
    if (doc.isFeatures) g.features = doc;
    else g.rooms.push(doc);
    g.minSort = Math.min(g.minSort, doc.sort || 0);
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.rooms.sort((a, b) => (a.sort || 0) - (b.sort || 0)));
  groups.sort((a, b) => a.minSort - b.minSort);
  return groups;
};

// Case-insensitive match of a room doc against a search term (code or name).
export const roomMatches = (doc, term) => {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    (doc.code || '').toLowerCase().includes(t) ||
    (doc.name || '').toLowerCase().includes(t)
  );
};
