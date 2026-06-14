// Helpers for the persistent campaign bestiary (#334). Monster docs in the
// `monster` collection carry the captured stat block plus provenance:
//   { id: creatureKey, name, descriptionOverride?, bestiary, defenses,
//     capturedAt, lastSeenAt, locations: { [loreId]: { name, lastSeenAt } } }

// A monster doc shaped like an encounter `order` enemy so the shared
// BestiaryEntry (and rkKeyFor / descriptionOverride lookup) can consume it
// directly. The persisted id IS the creatureKey.
export function monsterToEnemy(doc) {
  if (!doc) return null;
  return { ...doc, creatureKey: doc.id };
}

// Monster docs with an actually-captured stat block (skips legacy override-only
// rows that never saw a Foundry sighting).
export function capturedMonsters(monsters) {
  return (monsters || []).filter((m) => m && m.bestiary);
}

// Monster docs that were fought at the given location lore entry.
export function monstersAtLocation(monsters, loreId) {
  if (!loreId) return [];
  return (monsters || []).filter((m) => m?.locations && m.locations[loreId]);
}

// The location lore entries a creature has been encountered at, newest first.
// Each: { loreId, name, lastSeenAt }.
export function monsterLocations(doc) {
  const locs = doc?.locations || {};
  return Object.entries(locs)
    .map(([loreId, v]) => ({ loreId, name: v?.name || loreId, lastSeenAt: v?.lastSeenAt || 0 }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

// Human-friendly "last seen" date from a wall-clock timestamp (ms).
export function formatLastSeen(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}
