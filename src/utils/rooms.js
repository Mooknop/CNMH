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

// A room's structured treasure cache (#1085), normalized, or null when there's
// nothing to show. Both the browser rail indicator and RoomDetail treat a
// `treasureCache` with no gold and no items as "no cache" — an empty object
// (e.g. a GM who cleared a room) shouldn't light up the sweep indicator.
export const roomTreasureCache = (room) => {
  const c = room && room.treasureCache;
  if (!c) return null;
  const items = Array.isArray(c.items) ? c.items : [];
  const gold = Number(c.gold) || 0;
  if (!gold && items.length === 0) return null;
  return { gold, items };
};

// Case-insensitive match of a room doc against a search term. Covers code and
// name plus the things a GM actually searches for mid-session — a check label
// or skill ("stealth"), a creature/hazard name, GM notes, and the body prose
// ("that room with the secret door"). Body HTML is flattened to text first.
export const roomMatches = (doc, term) => {
  if (!term) return true;
  const t = term.toLowerCase();
  const hit = (s) => (s || '').toLowerCase().includes(t);
  if (hit(doc.code) || hit(doc.name) || hit(doc.notes)) return true;
  if ((doc.creatures || []).some(hit)) return true;
  if ((doc.hazards || []).some((h) => hit(h.name))) return true;
  if ((doc.checks || []).some((c) => hit(c.label) || hit(c.statistic))) return true;
  return hit((doc.body || '').replace(/<[^>]+>/g, ' '));
};
