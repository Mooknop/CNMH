import {
  roomLabel,
  cacheHasUnmatched,
  roomDistributable,
  buildLootDrop,
  lootItemCount,
  lootDropSummary,
  lineClaimedQty,
  lineRemaining,
  charClaimQty,
  applyClaim,
  goldShares,
  charClaimedLines,
  acquiredEntry,
  unclaimedCache,
  receiptText,
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
      { lineId: expect.any(String), ref: 'acid-flask', name: 'Acid Flask', qty: 2, claims: [] },
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

// ── T5 claim helpers ─────────────────────────────────────────────────────────
const line = (over = {}) => ({ lineId: 'l1', ref: 'acid-flask', name: 'Acid Flask', qty: 3, claims: [], ...over });

describe('line claim accounting', () => {
  it('sums claimed and computes remaining', () => {
    const l = line({ claims: [{ charId: 'a', qty: 1 }, { charId: 'b', qty: 1 }] });
    expect(lineClaimedQty(l)).toBe(2);
    expect(lineRemaining(l)).toBe(1);
    expect(charClaimQty(l, 'a')).toBe(1);
    expect(charClaimQty(l, 'c')).toBe(0);
  });
  it('is safe on a claim-less line', () => {
    expect(lineClaimedQty(line())).toBe(0);
    expect(lineRemaining(line())).toBe(3);
  });
});

describe('applyClaim', () => {
  const drop = { items: [line(), { lineId: 'l2', ref: 'rope', name: 'Rope', qty: 1, claims: [] }] };

  it('claims and releases a single-qty line', () => {
    const claimed = applyClaim(drop, 'l2', 'a', 1);
    expect(claimed.items[1].claims).toEqual([{ charId: 'a', qty: 1 }]);
    const released = applyClaim(claimed, 'l2', 'a', 0);
    expect(released.items[1].claims).toEqual([]);
  });

  it('splits a stack and clamps to what other claimants leave', () => {
    let d = applyClaim(drop, 'l1', 'a', 2);
    d = applyClaim(d, 'l1', 'b', 5); // only 1 left → clamps to 1
    expect(charClaimQty(d.items[0], 'a')).toBe(2);
    expect(charClaimQty(d.items[0], 'b')).toBe(1);
    expect(lineRemaining(d.items[0])).toBe(0);
  });

  it('replaces a character\'s own prior claim rather than stacking it', () => {
    let d = applyClaim(drop, 'l1', 'a', 1);
    d = applyClaim(d, 'l1', 'a', 3);
    expect(d.items[0].claims).toEqual([{ charId: 'a', qty: 3 }]);
  });

  it('leaves other lines untouched and is null-safe', () => {
    const d = applyClaim(drop, 'l1', 'a', 1);
    expect(d.items[1]).toBe(drop.items[1]);
    expect(applyClaim(null, 'l1', 'a', 1)).toBeNull();
  });
});

describe('goldShares', () => {
  it('splits evenly with the remainder to the first', () => {
    expect(goldShares(25, ['a', 'b', 'c'])).toEqual({ a: 9, b: 8, c: 8 });
  });
  it('zeroes everyone when there is no gold', () => {
    expect(goldShares(0, ['a', 'b'])).toEqual({ a: 0, b: 0 });
  });
  it('honours a GM override map verbatim (clamped ≥ 0)', () => {
    expect(goldShares(25, ['a', 'b', 'c'], { a: 25, b: 0, c: -4 })).toEqual({ a: 25, b: 0, c: 0 });
  });
  it('is empty-party safe', () => {
    expect(goldShares(25, [])).toEqual({});
  });
});

describe('charClaimedLines / receiptText', () => {
  const drop = {
    items: [
      line({ claims: [{ charId: 'a', qty: 2 }] }),
      { lineId: 'l2', ref: 'elixir', name: 'Elixir', qty: 1, variant: 'Moderate', claims: [{ charId: 'a', qty: 1 }] },
      { lineId: 'l3', ref: 'rope', name: 'Rope', qty: 1, claims: [{ charId: 'b', qty: 1 }] },
    ],
  };
  it('condenses one character\'s claims', () => {
    expect(charClaimedLines(drop, 'a')).toEqual([
      { name: 'Acid Flask', variant: undefined, qty: 2 },
      { name: 'Elixir', variant: 'Moderate', qty: 1 },
    ]);
  });
  it('formats a receipt with qty, variant, and gold', () => {
    expect(receiptText(charClaimedLines(drop, 'a'), 6)).toBe('Acid Flask ×2, Elixir (Moderate), +6 gp');
  });
  it('omits gold when zero and items when none', () => {
    expect(receiptText([{ name: 'Rope', qty: 1 }], 0)).toBe('Rope');
    expect(receiptText([], 5)).toBe('+5 gp');
  });
});

describe('acquiredEntry', () => {
  it('builds a re-resolvable ref entry with a fresh uid', () => {
    const e = acquiredEntry(line());
    expect(e).toMatchObject({ ref: 'acid-flask' });
    expect(e.uid).toEqual(expect.any(String));
  });
  it('carries a variant label', () => {
    expect(acquiredEntry({ ref: 'elixir', name: 'Elixir', variant: 'Moderate' })).toMatchObject({ ref: 'elixir', variant: 'Moderate' });
  });
  it('keeps the generic Treasure Item\'s name + worth', () => {
    const e = acquiredEntry({ ref: 'treasure-item', name: 'Garnet Beads', value: 5 });
    expect(e).toMatchObject({ ref: 'treasure-item', name: 'Garnet Beads', value: 5 });
  });
});

describe('unclaimedCache', () => {
  it('returns the unclaimed item remainder and undistributed gold', () => {
    const drop = {
      gold: 25,
      items: [
        line({ claims: [{ charId: 'a', qty: 2 }] }), // 1 of 3 left
        { lineId: 'l2', ref: 'rope', name: 'Rope', qty: 1, claims: [{ charId: 'b', qty: 1 }] }, // fully claimed
      ],
    };
    expect(unclaimedCache(drop, 20)).toEqual({
      gold: 5,
      items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }],
    });
  });
  it('is empty when everything was claimed and all gold distributed', () => {
    const drop = { gold: 10, items: [{ lineId: 'l1', ref: 'rope', name: 'Rope', qty: 1, claims: [{ charId: 'a', qty: 1 }] }] };
    expect(unclaimedCache(drop, 10)).toEqual({ gold: 0, items: [] });
  });
});
