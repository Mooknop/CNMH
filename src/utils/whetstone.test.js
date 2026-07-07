import {
  isWhetstone, whetstoneMeta, whetstoneDuration, whetstoneDurationLabel,
  whetstoneChoice, whetstoneReminder, eligibleWhetstoneWeapons, needsRegripNote,
  activeWhetstoneOn, whetstoneHostUids, buildWhetstoneEffectEntry,
  withWhetstoneApplied, MINUTE_ROUNDS,
  applyWhetstoneStrikeAlterations, whetstonesByWeaponUid, withWhetstoneArmedVs,
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

describe('applyWhetstoneStrikeAlterations (W2, #1214)', () => {
  const strike = (over = {}) => ({
    name: 'Longsword Melee Strike', type: 'melee', traits: ['Versatile P'],
    attackMod: 7, damage: '2d8+4', damageType: 'slashing', ...over,
  });
  const entry = (effect, over = {}) => ({
    id: 'fx1',
    whetstone: { itemId: 'x', itemName: 'Stone', weaponUid: 'w1', weaponName: 'Longsword', duration: 'minute', effect, ...over },
  });

  it('descriptive whetstone only stamps the marker', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry(undefined));
    expect(out.whetstone).toEqual({ itemName: 'Stone' });
    expect(out.damageType).toBe('slashing');
    expect(out.riders).toBeUndefined();
  });

  it('Morph Jewel: damage type from the apply-time choice', () => {
    const out = applyWhetstoneStrikeAlterations(
      strike(), entry({ damageType: 'from-choice' }, { choice: 'bludgeoning' }));
    expect(out.damageType).toBe('bludgeoning');
    expect(out.whetstone.choice).toBe('bludgeoning');
  });

  it('Hand of Mercy: adds Nonlethal (no dupes) and suppresses persistent riders', () => {
    const s = strike({
      traits: ['Agile'],
      riders: [
        { id: 'r1', label: 'Flaming', dice: '1d6', type: 'fire' },
        { id: 'r2', label: 'Wounding', persistent: { dice: '1d6', type: 'bleed' } },
      ],
    });
    const out = applyWhetstoneStrikeAlterations(s, entry({ addTraits: ['Nonlethal'], suppressPersistent: true }));
    expect(out.traits).toEqual(['Agile', 'Nonlethal']);
    expect(out.riders.map((r) => r.id)).toEqual(['r1']);
    const again = applyWhetstoneStrikeAlterations(out, entry({ addTraits: ['nonlethal'] }));
    expect(again.traits).toEqual(['Agile', 'Nonlethal']);
  });

  it('Transmuting Ingot: counts-as material surfaces as material + iwrTags', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry({ material: 'silver' }));
    expect(out.material).toBe('silver');
    expect(out.iwrTags).toEqual(['silver']);
  });

  it('Mighty Counterweight: per-die flat bludgeoning bonus rider', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry({ perDieFlat: { amount: 1, type: 'bludgeoning' } }));
    expect(out.riders).toHaveLength(1);
    expect(out.riders[0]).toMatchObject({ label: 'Stone', bonus: { perWeaponDie: 1 }, type: 'bludgeoning' });
  });

  it('Ethereal Crescent: granted rune riders translate; ghost touch tag matches weaknesses', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry({
      grantRunes: [{ id: 'astral', name: 'Astral', rider: { dice: '1d6', damageType: 'spirit' } }],
      iwrTags: ['ghost touch'],
    }));
    expect(out.riders).toHaveLength(1);
    expect(out.riders[0]).toMatchObject({ dice: '1d6', type: 'spirit' });
    expect(out.iwrTags).toEqual(['ghost touch']);
  });

  it('Featherlight Fletching: doubles the range increment on ranged strikes only', () => {
    const ranged = strike({ type: 'ranged', range: '60 ft' });
    expect(applyWhetstoneStrikeAlterations(ranged, entry({ rangeMultiplier: 2 })).range).toBe('120 ft');
    expect(applyWhetstoneStrikeAlterations(strike({ range: 60, type: 'ranged' }), entry({ rangeMultiplier: 2 })).range).toBe(120);
    expect(applyWhetstoneStrikeAlterations(strike(), entry({ rangeMultiplier: 2 })).range).toBeUndefined();
  });

  it('whetstonesByWeaponUid keys active entries by weapon uid', () => {
    const e1 = entry({});
    const e2 = { id: 'fx2', whetstone: { itemName: 'Other', weaponUid: 'w2' } };
    expect(whetstonesByWeaponUid([e1, e2, { id: 'x' }])).toEqual({ w1: e1, w2: e2 });
    expect(whetstonesByWeaponUid(null)).toEqual({});
  });
});

describe('W3 payloads (#1215)', () => {
  const strike = (over = {}) => ({
    name: 'Longsword Melee Strike', type: 'melee', traits: [],
    attackMod: 7, damage: '2d8+4', damageType: 'slashing', ...over,
  });
  const entry = (effect, over = {}) => ({
    id: 'fx1',
    whetstone: { itemId: 'slayers-stone', itemName: "Slayer's Stone", weaponUid: 'w1', weaponName: 'Longsword', duration: 'minute', effect, ...over },
  });

  it("Slayer's Stone: addRiders resolves appliesVsTrait from the choice", () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry(
      { addRiders: [{ dice: '1d6', type: 'precision', appliesVsTrait: 'from-choice' }] },
      { choice: 'dragon' }
    ));
    expect(out.riders).toHaveLength(1);
    expect(out.riders[0]).toMatchObject({
      dice: '1d6', type: 'precision', appliesVsTrait: 'dragon',
      label: "Slayer's Stone (vs dragon)",
    });
  });

  it('a compound "fungus and plant" choice gates on either trait', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry(
      { addRiders: [{ dice: '1d6', type: 'precision', appliesVsTrait: 'from-choice' }] },
      { choice: 'fungus and plant' }
    ));
    expect(out.riders[0].appliesVsTrait).toEqual(['fungus', 'plant']);
  });

  it('Toothy Knife: bleedDc stamps recovery DCs onto persistent bleed riders only', () => {
    const s = strike({
      riders: [
        { id: 'r1', label: 'Wounding', persistent: { dice: '1d6', type: 'bleed' } },
        { id: 'r2', label: 'Flaming crit', persistent: { dice: '1d10', type: 'fire' } },
      ],
    });
    const out = applyWhetstoneStrikeAlterations(s, entry({ bleedDc: { base: 17, assisted: 12 } }));
    expect(out.riders[0].persistent.recoveryDc).toEqual({ base: 17, assisted: 12 });
    expect(out.riders[1].persistent.recoveryDc).toBeUndefined();
    expect(out.bleedDc).toEqual({ base: 17, assisted: 12 });
  });

  it('onHit payloads are carried on the strike with the item name', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry({ onHit: { healHalf: true } }));
    expect(out.whetstoneOnHit).toEqual({ healHalf: true, itemName: "Slayer's Stone" });
  });
});

describe('W4 payloads (#1216)', () => {
  const strike = (over = {}) => ({
    name: 'Longsword Melee Strike', type: 'melee', traits: [],
    attackMod: 7, damage: '2d8+4', damageType: 'slashing', ...over,
  });
  const entry = (effect, over = {}) => ({
    id: 'fx1',
    whetstone: { itemId: 'x', itemName: 'Stone', weaponUid: 'w1', weaponName: 'Longsword', duration: 'minute', effect, ...over },
  });

  it('reactionSave and onCrit are stamped on the strike with the item name', () => {
    const out = applyWhetstoneStrikeAlterations(strike(), entry({
      reactionSave: { save: 'reflex', dc: 19, conditions: { failure: [{ id: 'off-guard', scopedToCaster: true }] } },
      onCrit: { save: 'will', dcFrom: 'classOrSpellDC', conditions: { failure: [{ id: 'blinded', note: '1 round' }] } },
    }));
    expect(out.whetstoneReactionSave).toMatchObject({ save: 'reflex', dc: 19, itemName: 'Stone' });
    expect(out.whetstoneOnCrit).toMatchObject({ save: 'will', dcFrom: 'classOrSpellDC', itemName: 'Stone' });
  });

  it('armedBonus adds the per-target damage rider + toggle stamp only once armed', () => {
    const unarmed = applyWhetstoneStrikeAlterations(strike(), entry({ armedBonus: { bonus: 1 } }));
    expect(unarmed.riders).toBeUndefined();
    expect(unarmed.whetstoneArmedVs).toBeUndefined();

    const armed = applyWhetstoneStrikeAlterations(strike(), entry(
      { armedBonus: { bonus: 1 } },
      { armedVs: { entryId: 'e-ogre', name: 'Ogre' } }
    ));
    expect(armed.riders).toHaveLength(1);
    expect(armed.riders[0]).toMatchObject({
      bonus: { flat: 1 }, appliesToEntryIds: ['e-ogre'], label: 'Stone (vs Ogre)',
    });
    expect(armed.whetstoneArmedVs).toEqual({ entryId: 'e-ogre', name: 'Ogre', bonus: 1, itemName: 'Stone' });
  });

  it('withWhetstoneArmedVs arms and disarms the entry', () => {
    const fx = [entry({ armedBonus: { bonus: 1 } }), { id: 'other' }];
    const armed = withWhetstoneArmedVs(fx, 'fx1', { entryId: 'e-ogre', name: 'Ogre' });
    expect(armed[0].whetstone.armedVs).toEqual({ entryId: 'e-ogre', name: 'Ogre' });
    expect(armed[1]).toEqual({ id: 'other' });
    const disarmed = withWhetstoneArmedVs(armed, 'fx1', null);
    expect(disarmed[0].whetstone.armedVs).toBeUndefined();
  });

  it('maxWeaponLevel gates the apply picker (Blade Phantom weapon-level cap)', () => {
    const guide = {
      uid: 'ws2', name: "Blade Phantom's Guide", traits: ['Whetstone'],
      whetstone: { maxWeaponLevel: 11 },
    };
    const low = { uid: 'w1', name: 'Longsword', level: 3, strikes: [{ type: 'melee' }] };
    const high = { uid: 'w2', name: 'Holy Avenger', level: 15, strikes: [{ type: 'melee' }] };
    const unleveled = { uid: 'w3', name: 'Club', strikes: [{ type: 'melee' }] };
    expect(eligibleWhetstoneWeapons([guide, low, high, unleveled], guide)).toEqual([low, unleveled]);
  });
});
