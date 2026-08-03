import {
  moveRuneDc,
  moveRuneCost,
  moveRuneOutcome,
  removeRuneFromWeapon,
  runestoneEntryFor,
  weaponMovableRunes,
  fundamentalRunestoneEntryFor,
  removeFundamentalFromWeapon,
  weaponMovableFundamentals,
  MOVE_RUNE_HOURS,
} from './moveRune';

let uidSeq = 0;
vi.mock('./uid', () => ({ newEntryUid: () => `u-${++uidSeq}` }));

beforeEach(() => { uidSeq = 0; });

describe('moveRuneDc', () => {
  it('uses the rune level-based DC', () => {
    expect(moveRuneDc(5)).toBe(20);
    expect(moveRuneDc(1)).toBe(15);
  });
  it('floors an unleveled rune at the level-1 DC', () => {
    expect(moveRuneDc(0)).toBe(15);
    expect(moveRuneDc(undefined)).toBe(15);
  });
});

describe('moveRuneCost', () => {
  it('is 10% of the rune value, rounded', () => {
    expect(moveRuneCost(500)).toBe(50);
    expect(moveRuneCost(55)).toBe(6); // 5.5 → 6
    expect(moveRuneCost(0)).toBe(0);
    expect(moveRuneCost(undefined)).toBe(0);
  });
});

describe('moveRuneOutcome', () => {
  it('critical success moves for free', () => {
    expect(moveRuneOutcome('criticalSuccess', 500)).toEqual({ moved: true, destroyed: false, costGp: 0 });
  });
  it('success moves but expends 10% of the value', () => {
    expect(moveRuneOutcome('success', 500)).toEqual({ moved: true, destroyed: false, costGp: 50 });
  });
  it('failure is a no-op', () => {
    expect(moveRuneOutcome('failure', 500)).toEqual({ moved: false, destroyed: false, costGp: 0 });
  });
  it('critical failure destroys the rune', () => {
    expect(moveRuneOutcome('criticalFailure', 500)).toEqual({ moved: false, destroyed: true, costGp: 0 });
  });
});

describe('removeRuneFromWeapon', () => {
  const weapon = {
    uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' }, state: 'held', hand: 'main',
    runes: { potency: 1, property: ['flaming', 'frost'] },
  };

  it('drops the named property rune and re-uids the entry', () => {
    const out = removeRuneFromWeapon(weapon, 'flaming');
    expect(out.runes.property).toEqual(['frost']);
    expect(out.runes.potency).toBe(1); // other runes untouched
    expect(out.uid).toBe('u-1');
    expect(out.name).toBe('Longsword');
  });

  it('drops transient loadout fields', () => {
    const out = removeRuneFromWeapon(weapon, 'flaming');
    expect(out.state).toBeUndefined();
    expect(out.hand).toBeUndefined();
  });

  it('tolerates resolved rune-doc entries (not just id strings)', () => {
    const w = { uid: 'w2', runes: { property: [{ id: 'flaming', name: 'Flaming' }] } };
    expect(removeRuneFromWeapon(w, 'flaming').runes.property).toEqual([]);
  });

  it('is safe on a runeless weapon', () => {
    const out = removeRuneFromWeapon({ uid: 'w3', name: 'Club' }, 'flaming');
    expect(out.runes.property).toEqual([]);
  });
});

describe('runestoneEntryFor', () => {
  it('builds a fresh runestone ref entry', () => {
    expect(runestoneEntryFor('flaming')).toEqual({
      ref: 'runestone', runeRef: 'flaming', uid: 'u-1', quantity: 1,
    });
  });
});

describe('weaponMovableRunes', () => {
  it('lists resolved property runes with the fields the panel needs', () => {
    const w = { runes: { property: [{ id: 'flaming', name: 'Flaming', level: 8, price: 500 }] } };
    expect(weaponMovableRunes(w)).toEqual([{ id: 'flaming', name: 'Flaming', level: 8, price: 500 }]);
  });
  it('tolerates raw id strings', () => {
    expect(weaponMovableRunes({ runes: { property: ['frost'] } })).toEqual([
      { id: 'frost', name: 'frost', level: undefined, price: undefined },
    ]);
  });
  it('is empty for a weapon without property runes', () => {
    expect(weaponMovableRunes({ runes: { potency: 1 } })).toEqual([]);
    expect(weaponMovableRunes({})).toEqual([]);
  });
});

describe('fundamental moves (#832)', () => {
  describe('fundamentalRunestoneEntryFor', () => {
    it('mints a potency descriptor entry (tier form)', () => {
      expect(fundamentalRunestoneEntryFor({ fundamental: 'potency', tier: 2 })).toEqual({
        ref: 'runestone', fundamental: 'potency', tier: 2, uid: 'u-1', quantity: 1,
      });
    });
    it('mints a striking descriptor entry from a doc (tierKey) or entry (key) form', () => {
      expect(fundamentalRunestoneEntryFor({ fundamental: 'striking', tierKey: 'greater' })).toEqual({
        ref: 'runestone', fundamental: 'striking', key: 'greater', uid: 'u-1', quantity: 1,
      });
      expect(fundamentalRunestoneEntryFor({ fundamental: 'striking', key: 'major' }).key).toBe('major');
    });
  });

  describe('removeFundamentalFromWeapon', () => {
    it('strips striking, keeping the rest of the rune block (fresh uid)', () => {
      const w = { uid: 'w1', name: 'Longsword', state: 'held', hand: 'main', runes: { potency: 1, striking: 'greater', property: ['flaming'] } };
      const out = removeFundamentalFromWeapon(w, 'striking');
      expect(out.runes).toEqual({ potency: 1, property: ['flaming'] });
      expect(out.uid).toBe('u-1');
      expect(out.state).toBeUndefined();
      expect(out.hand).toBeUndefined();
    });

    it('strips potency when no property runes ride its slots', () => {
      const out = removeFundamentalFromWeapon({ uid: 'w1', runes: { potency: 2, striking: 'striking' } }, 'potency');
      expect(out.runes).toEqual({ striking: 'striking' });
    });

    it('BLOCKS a potency removal while etched property runes exceed the resulting capacity', () => {
      const w = { uid: 'w1', runes: { potency: 1, property: ['flaming'] } };
      expect(removeFundamentalFromWeapon(w, 'potency')).toBeNull();
    });

    it('is null when the weapon lacks that fundamental (or for an unknown one)', () => {
      expect(removeFundamentalFromWeapon({ uid: 'w1', runes: { potency: 1 } }, 'striking')).toBeNull();
      expect(removeFundamentalFromWeapon({ uid: 'w1' }, 'potency')).toBeNull();
      expect(removeFundamentalFromWeapon({ uid: 'w1', runes: { potency: 1 } }, 'resilient')).toBeNull();
    });
  });

  describe('weaponMovableFundamentals', () => {
    it('lists the etched fundamentals as rune docs (id/name/level/price)', () => {
      const out = weaponMovableFundamentals({ runes: { potency: 2, striking: 'striking' } });
      expect(out).toEqual([
        expect.objectContaining({ id: 'weapon-potency-2', fundamental: 'potency', tier: 2, level: 10, price: 935 }),
        expect.objectContaining({ id: 'striking', fundamental: 'striking', tierKey: 'striking', level: 4, price: 65 }),
      ]);
    });

    it('excludes potency while property runes are etched (its removal is blocked)', () => {
      const out = weaponMovableFundamentals({ runes: { potency: 1, striking: 'greater', property: ['flaming'] } });
      expect(out).toEqual([expect.objectContaining({ fundamental: 'striking', tierKey: 'greater' })]);
    });

    it('is empty for a bare weapon', () => {
      expect(weaponMovableFundamentals({ runes: { property: [] } })).toEqual([]);
      expect(weaponMovableFundamentals({})).toEqual([]);
    });
  });
});

it('declares the 1-hour activity cost', () => {
  expect(MOVE_RUNE_HOURS).toBe(1);
});
