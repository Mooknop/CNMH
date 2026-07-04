import {
  roomLabel,
  cacheHasUnmatched,
  roomDistributable,
  buildLootDrop,
  lootItemCount,
  lootDropSummary,
} from './lootDrop';

const room = (over = {}) => ({
  id: 'sd4s-a3',
  code: 'A3',
  name: 'Shrine to Kabriri',
  treasureCache: { gold: 25, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 2 }] },
  ...over,
});

describe('roomLabel', () => {
  it('prefixes the code when present', () => {
    expect(roomLabel(room())).toBe('A3. Shrine to Kabriri');
  });
  it('omits the code when absent', () => {
    expect(roomLabel({ name: 'Cave' })).toBe('Cave');
  });
  it('is empty for no room', () => {
    expect(roomLabel(null)).toBe('');
  });
});

describe('cacheHasUnmatched', () => {
  it('is true when any line lacks a ref', () => {
    expect(cacheHasUnmatched(room({
      treasureCache: { gold: 0, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }, { name: 'Gold Idol', qty: 1 }] },
    }))).toBe(true);
  });
  it('is false when every line has a ref', () => {
    expect(cacheHasUnmatched(room())).toBe(false);
  });
  it('is false when there is no cache', () => {
    expect(cacheHasUnmatched(room({ treasureCache: null }))).toBe(false);
  });
});

describe('roomDistributable', () => {
  it('is true for a bound cache with content and no stamp', () => {
    expect(roomDistributable(room())).toBe(true);
  });
  it('is false when an unmatched line is present', () => {
    expect(roomDistributable(room({
      treasureCache: { gold: 25, items: [{ name: 'Gold Idol', qty: 1 }] },
    }))).toBe(false);
  });
  it('is false once distributedAt is stamped', () => {
    expect(roomDistributable(room({ distributedAt: 123 }))).toBe(false);
  });
  it('is false for an empty cache', () => {
    expect(roomDistributable(room({ treasureCache: { gold: 0, items: [] } }))).toBe(false);
  });
});

describe('buildLootDrop', () => {
  it('produces the drop shape from a room cache', () => {
    const drop = buildLootDrop(room());
    expect(drop).toMatchObject({
      roomId: 'sd4s-a3',
      roomName: 'A3. Shrine to Kabriri',
      gold: 25,
      goldSplit: null,
      status: 'open',
    });
    expect(drop.id).toEqual(expect.any(String));
    expect(drop.ts).toEqual(expect.any(Number));
    expect(drop.items).toEqual([
      { lineId: expect.any(String), ref: 'acid-flask', name: 'Acid Flask', qty: 2, claimedBy: null },
    ]);
  });

  it('carries variant and value through, and mints unique line ids', () => {
    const drop = buildLootDrop(room({
      treasureCache: {
        gold: 0,
        items: [
          { ref: 'elixir-of-life', name: 'Elixir of Life', qty: 1, variant: 'Moderate' },
          { ref: 'treasure-item', name: 'Garnet Beads', qty: 1, value: 5 },
        ],
      },
    }));
    expect(drop.items[0]).toMatchObject({ ref: 'elixir-of-life', variant: 'Moderate' });
    expect(drop.items[1]).toMatchObject({ ref: 'treasure-item', value: 5 });
    expect(drop.items[0].lineId).not.toBe(drop.items[1].lineId);
  });

  it('drops unmatched placeholder lines (only ref-bound items land)', () => {
    const drop = buildLootDrop(room({
      treasureCache: {
        gold: 10,
        items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }, { name: 'Story Key', qty: 1 }],
      },
    }));
    expect(drop.items).toHaveLength(1);
    expect(drop.items[0].ref).toBe('acid-flask');
  });

  it('returns null when there is nothing distributable', () => {
    expect(buildLootDrop(room({ treasureCache: null }))).toBeNull();
    expect(buildLootDrop(room({ treasureCache: { gold: 0, items: [{ name: 'Key', qty: 1 }] } }))).toBeNull();
  });
});

describe('lootItemCount / lootDropSummary', () => {
  it('sums item quantities', () => {
    const drop = buildLootDrop(room());
    expect(lootItemCount(drop)).toBe(2);
  });
  it('summarises gold + items', () => {
    expect(lootDropSummary(buildLootDrop(room()))).toBe('25 gp + 2 items');
  });
  it('singularises a lone item and omits zero gold', () => {
    const drop = buildLootDrop(room({
      treasureCache: { gold: 0, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }] },
    }));
    expect(lootDropSummary(drop)).toBe('1 item');
  });
  it('shows gold only when there are no items', () => {
    const drop = buildLootDrop(room({ treasureCache: { gold: 40, items: [] } }));
    expect(lootDropSummary(drop)).toBe('40 gp');
  });
  it('is empty-safe', () => {
    expect(lootDropSummary(null)).toBe('');
    expect(lootItemCount(null)).toBe(0);
  });
});
