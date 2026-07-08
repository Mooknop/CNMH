import { areaKey, groupRoomsByArea, cacheValueGp, claimedValueGp, areaLootSummary } from './lootAreas';

const catalog = new Map([['acid-flask', { id: 'acid-flask', price: 10 }]]);

describe('areaKey', () => {
  it('extracts the letter prefix', () => {
    expect(areaKey({ code: 'A1' })).toBe('A');
    expect(areaKey({ code: 'B12' })).toBe('B');
    expect(areaKey({ code: 'AB3' })).toBe('AB');
  });
  it('is null for codeless docs (site Features pages)', () => {
    expect(areaKey({ isFeatures: true })).toBeNull();
    expect(areaKey({ code: null })).toBeNull();
    expect(areaKey({})).toBeNull();
  });
});

describe('groupRoomsByArea', () => {
  it('groups by letter, ordered, carrying the site name', () => {
    const rooms = [
      { code: 'B1', site: 'Ghoul Warren' },
      { code: 'A2', site: 'The Vaults' },
      { code: 'A1', site: 'The Vaults' },
      { isFeatures: true, site: 'The Vaults' },
    ];
    const groups = groupRoomsByArea(rooms);
    expect(groups.map((g) => g.key)).toEqual(['A', 'B']);
    expect(groups[0].site).toBe('The Vaults');
    expect(groups[0].rooms).toHaveLength(2);
    expect(groups[1].rooms).toHaveLength(1);
  });
});

describe('cacheValueGp / claimedValueGp', () => {
  it('values gold + priced lines + inline-value lines', () => {
    const room = {
      treasureCache: {
        gold: 25,
        items: [
          { ref: 'acid-flask', name: 'Acid Flask', qty: 2 },
          { name: 'Garnet Bead', qty: 3, value: 5 },
        ],
      },
    };
    expect(cacheValueGp(room, catalog)).toBe(25 + 20 + 15);
  });
  it('is 0 for an empty or missing cache', () => {
    expect(cacheValueGp({}, catalog)).toBe(0);
    expect(cacheValueGp({ treasureCache: { gold: 0, items: [] } }, catalog)).toBe(0);
  });
  it('reads the claimed accumulator', () => {
    expect(claimedValueGp({ claimed: { gold: 25, itemsValue: 10 } })).toBe(35);
    expect(claimedValueGp({})).toBe(0);
  });
});

describe('areaLootSummary', () => {
  it('totals remaining + claimed and counts loot/distributed rooms', () => {
    const rooms = [
      // Fully distributed: empty cache, claimed 35, stamped.
      { code: 'A1', treasureCache: { gold: 0, items: [] }, claimed: { gold: 25, itemsValue: 10 }, distributedAt: 1 },
      // Untouched cache worth 45.
      { code: 'A2', treasureCache: { gold: 25, items: [{ ref: 'acid-flask', qty: 2 }] } },
      // No loot at all — not a loot room.
      { code: 'A3' },
    ];
    expect(areaLootSummary(rooms, catalog)).toEqual({
      total: 80,
      remaining: 45,
      claimed: 35,
      lootRooms: 2,
      distributedRooms: 1,
    });
  });

  it('keeps the area total stable across a partial distribution', () => {
    // Before: 40 gp cache. After: 15 gp remains, 25 gp claimed — same total.
    const before = [{ code: 'A1', treasureCache: { gold: 40, items: [] } }];
    const after = [{ code: 'A1', treasureCache: { gold: 15, items: [] }, claimed: { gold: 25, itemsValue: 0 }, distributedAt: 1 }];
    expect(areaLootSummary(before, catalog).total).toBe(40);
    expect(areaLootSummary(after, catalog).total).toBe(40);
  });
});
