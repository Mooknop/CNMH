import {
  isWhetstone, whetstoneMeta, whetstoneDuration, whetstoneDurationLabel,
  whetstoneChoice, whetstoneReminder, eligibleWhetstoneWeapons, needsRegripNote,
  activeWhetstoneOn, whetstoneHostUids, buildWhetstoneEffectEntry,
  withWhetstoneApplied, MINUTE_ROUNDS,
} from './whetstone';

const stone = (over = {}) => ({
  uid: 'ws1', id: 'morph-jewel', name: 'Morph Jewel',
  traits: ['Consumable', 'Magical', 'Whetstone'],
  whetstone: { reminder: 'Change the damage type.' },
  ...over,
});
const sword = { uid: 'w1', name: 'Longsword', strikes: [{ damage: '1d8', type: 'melee' }] };
const bow = { uid: 'w2', name: 'Shortbow', strikes: [{ damage: '1d6', type: 'ranged' }] };
const plate = { uid: 'a1', name: 'Full Plate', armor: { ac: 6 } };
const fang = { uid: 't1', name: 'Wolf Fang', traits: ['Talisman'], strikes: undefined };

describe('whetstone model helpers', () => {
  it('detects a whetstone by block or trait', () => {
    expect(isWhetstone(stone())).toBe(true);
    expect(isWhetstone({ name: 'X', traits: ['Whetstone'] })).toBe(true);
    expect(isWhetstone({ name: 'X', whetstone: {} })).toBe(true);
    expect(isWhetstone(sword)).toBe(false);
    expect(isWhetstone(null)).toBe(false);
  });

  it('duration defaults to minute; hour is opt-in', () => {
    expect(whetstoneDuration(stone())).toBe('minute');
    expect(whetstoneDuration(stone({ whetstone: { duration: 'hour' } }))).toBe('hour');
    expect(whetstoneDurationLabel('minute')).toBe('1 minute');
    expect(whetstoneDurationLabel('hour')).toBe('1 hour');
  });

  it('choice requires a non-empty options list', () => {
    expect(whetstoneChoice(stone())).toBeNull();
    expect(whetstoneChoice(stone({ whetstone: { choice: { options: [] } } }))).toBeNull();
    const c = { label: 'Damage type', options: ['bludgeoning'] };
    expect(whetstoneChoice(stone({ whetstone: { choice: c } }))).toEqual(c);
  });

  it('reminder falls back to the item description', () => {
    expect(whetstoneReminder(stone())).toBe('Change the damage type.');
    expect(whetstoneReminder({ whetstone: {}, description: 'Desc.' })).toBe('Desc.');
    expect(whetstoneMeta(sword)).toBeNull();
  });
});

describe('eligibleWhetstoneWeapons', () => {
  it('keeps strikes-bearing items, excluding self and talismans', () => {
    const s = stone();
    expect(eligibleWhetstoneWeapons([s, sword, bow, plate, fang], s)).toEqual([sword, bow]);
  });

  it('filters to weapons with a ranged strike when targets is ranged', () => {
    const s = stone({ whetstone: { targets: 'ranged' } });
    expect(eligibleWhetstoneWeapons([s, sword, bow], s)).toEqual([bow]);
  });

  it('tolerates a non-array input', () => {
    expect(eligibleWhetstoneWeapons(null, stone())).toEqual([]);
  });
});

describe('needsRegripNote', () => {
  it('flags a two-handed grip or 2-hands usage; not a one-hander', () => {
    expect(needsRegripNote({ ...sword, state: 'held2' })).toBe(true);
    expect(needsRegripNote({ ...sword, usage: 'held in 2 hands' })).toBe(true);
    expect(needsRegripNote({ ...sword, state: 'held1' })).toBe(false);
    expect(needsRegripNote(sword)).toBe(false);
  });
});

describe('buildWhetstoneEffectEntry', () => {
  const base = { item: stone(), weapon: sword, charId: 'hero', nowSecs: 1000 };

  it('minute + no encounter → clock expiry at +60s', () => {
    const e = buildWhetstoneEffectEntry(base);
    expect(e.expireAtSecs).toBe(1060);
    expect(e.expireAt).toBeUndefined();
    expect(e.name).toBe('Morph Jewel (Longsword)');
    expect(e.appliedBy).toBe('hero');
    expect(e.source).toBe('Morph Jewel');
    expect(e.whetstone).toMatchObject({
      itemId: 'morph-jewel', itemName: 'Morph Jewel', weaponUid: 'w1',
      weaponName: 'Longsword', duration: 'minute', reminder: 'Change the damage type.',
    });
  });

  it('minute + active encounter → 10-round boundary expiry, no clock expiry', () => {
    const encounter = { active: true, round: 2, order: [{ entryId: 'e9' }] };
    const e = buildWhetstoneEffectEntry({ ...base, encounter, casterEntryId: 'e9' });
    expect(e.expireAt).toEqual({ round: 2 + MINUTE_ROUNDS, entryId: 'e9', boundary: 'turn-end' });
    expect(e.expireAtSecs).toBeUndefined();
  });

  it('hour → always clock expiry (+3600s), even inside an encounter', () => {
    const item = stone({ whetstone: { duration: 'hour' } });
    const encounter = { active: true, round: 2 };
    const e = buildWhetstoneEffectEntry({ ...base, item, encounter, casterEntryId: 'e9' });
    expect(e.expireAtSecs).toBe(4600);
    expect(e.expireAt).toBeUndefined();
  });

  it('carries the apply-time choice and the effect payload when present', () => {
    const item = stone({ whetstone: { choice: { options: ['piercing'] }, effect: { kind: 'damage-type' } } });
    const e = buildWhetstoneEffectEntry({ ...base, item, choice: 'piercing' });
    expect(e.whetstone.choice).toBe('piercing');
    expect(e.whetstone.effect).toEqual({ kind: 'damage-type' });
  });
});

describe('withWhetstoneApplied / lookups', () => {
  const entryFor = (weaponUid, itemName) => ({
    id: `fx-${itemName}`, name: itemName,
    whetstone: { itemName, weaponUid, weaponName: 'W', duration: 'minute' },
  });

  it('replaces the previous whetstone on the same weapon only', () => {
    const other = { id: 'x', effectId: 'heroism' }; // non-whetstone effect untouched
    const before = [other, entryFor('w1', 'Hand of Mercy'), entryFor('w2', 'Toothy Knife')];
    const next = withWhetstoneApplied(before, entryFor('w1', 'Morph Jewel'));
    expect(next.map((e) => e.id)).toEqual(['x', 'fx-Toothy Knife', 'fx-Morph Jewel']);
  });

  it('activeWhetstoneOn finds the bound entry; whetstoneHostUids collects weapon uids', () => {
    const fx = [entryFor('w1', 'Morph Jewel'), { id: 'x' }];
    expect(activeWhetstoneOn(fx, 'w1')?.whetstone.itemName).toBe('Morph Jewel');
    expect(activeWhetstoneOn(fx, 'w2')).toBeNull();
    expect([...whetstoneHostUids(fx)]).toEqual(['w1']);
    expect([...whetstoneHostUids(null)]).toEqual([]);
  });
});
