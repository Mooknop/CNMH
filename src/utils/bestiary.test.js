import {
  monsterToEnemy,
  capturedMonsters,
  monstersAtLocation,
  monsterLocations,
  formatLastSeen,
} from './bestiary';

const goblin = {
  id: 'goblin-warrior',
  name: 'Goblin Warrior',
  bestiary: { level: -1 },
  defenses: { ac: 16 },
  capturedAt: 100,
  lastSeenAt: 200,
  locations: {
    sandpoint: { name: 'Sandpoint', lastSeenAt: 150 },
    thistletop: { name: 'Thistletop', lastSeenAt: 300 },
  },
};
const overrideOnly = { id: 'legacy', name: 'Legacy', descriptionOverride: 'x' }; // no bestiary

describe('monsterToEnemy', () => {
  test('maps the doc id onto creatureKey so rkKeyFor/override lookups work', () => {
    expect(monsterToEnemy(goblin)).toMatchObject({ creatureKey: 'goblin-warrior', name: 'Goblin Warrior' });
  });
  test('returns null for nullish input', () => {
    expect(monsterToEnemy(null)).toBeNull();
  });
});

describe('capturedMonsters', () => {
  test('keeps only docs with a captured stat block', () => {
    expect(capturedMonsters([goblin, overrideOnly]).map((m) => m.id)).toEqual(['goblin-warrior']);
  });
  test('tolerates nullish list', () => {
    expect(capturedMonsters(null)).toEqual([]);
  });
});

describe('monstersAtLocation', () => {
  test('returns docs fought at the given lore id', () => {
    expect(monstersAtLocation([goblin, overrideOnly], 'sandpoint').map((m) => m.id)).toEqual(['goblin-warrior']);
  });
  test('returns empty for an unknown or empty location', () => {
    expect(monstersAtLocation([goblin], 'nowhere')).toEqual([]);
    expect(monstersAtLocation([goblin], '')).toEqual([]);
  });
});

describe('monsterLocations', () => {
  test('lists locations newest-first', () => {
    expect(monsterLocations(goblin)).toEqual([
      { loreId: 'thistletop', name: 'Thistletop', lastSeenAt: 300 },
      { loreId: 'sandpoint', name: 'Sandpoint', lastSeenAt: 150 },
    ]);
  });
  test('empty when no locations', () => {
    expect(monsterLocations(overrideOnly)).toEqual([]);
  });
});

describe('formatLastSeen', () => {
  test('formats a timestamp', () => {
    expect(typeof formatLastSeen(Date.now())).toBe('string');
  });
  test('returns null for falsy', () => {
    expect(formatLastSeen(0)).toBeNull();
    expect(formatLastSeen(null)).toBeNull();
  });
});
