import { gearTarget, runeTarget, gearSockets, compatibleRunes, applyRune } from './runeSockets';

// Fixtures — minimal gear + rune docs.
const weapon = (runes) => ({ uid: 'w1', name: 'Longsword', strikes: [{}], runes });
const armor = (runes) => ({ uid: 'a1', name: 'Breastplate', armor: { acBonus: 4 }, runes });

const wPot1 = { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1 };
const wPot2 = { id: 'weapon-potency-2', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 2 };
const striking = { id: 'striking', type: 'fundamental', fundamental: 'striking', target: 'weapon', tierKey: 'striking' };
const aPot1 = { id: 'armor-potency-1', type: 'fundamental', fundamental: 'potency', target: 'armor', tier: 1 };
const resilient = { id: 'resilient', type: 'fundamental', fundamental: 'resilient', target: 'armor', tierKey: 'resilient' };
const vitalizing = { id: 'vitalizing', type: 'property', name: 'Vitalizing' }; // weapon property
const slick = { id: 'slick', type: 'property', armorRune: true, name: 'Slick' }; // armor property

describe('gearTarget / runeTarget', () => {
  it('classifies gear by strikes (weapon) / armor block (armor)', () => {
    expect(gearTarget(weapon({}))).toBe('weapon');
    expect(gearTarget(armor({}))).toBe('armor');
    expect(gearTarget({ name: 'Backpack' })).toBeNull();
  });
  it('classifies runes by fundamental target / property armorRune flag', () => {
    expect(runeTarget(wPot1)).toBe('weapon');
    expect(runeTarget(resilient)).toBe('armor');
    expect(runeTarget(vitalizing)).toBe('weapon');
    expect(runeTarget(slick)).toBe('armor');
  });
});

describe('gearSockets', () => {
  it('weapon: potency + striking + property sockets numbering the potency tier', () => {
    const sockets = gearSockets(weapon({ potency: 2, striking: 'striking', property: ['vitalizing'] }));
    expect(sockets.map((s) => s.type)).toEqual(['potency', 'striking', 'property', 'property']);
    expect(sockets[0]).toMatchObject({ filled: true, value: 2 });
    expect(sockets[1]).toMatchObject({ filled: true, value: 'striking' });
    expect(sockets[2]).toMatchObject({ filled: true, rune: 'vitalizing', index: 0 });
    expect(sockets[3]).toMatchObject({ filled: false, index: 1 }); // open slot
  });

  it('armor: potency + resilient + property sockets', () => {
    const sockets = gearSockets(armor({ potency: 1, resilient: 'resilient' }));
    expect(sockets.map((s) => s.type)).toEqual(['potency', 'resilient', 'property']);
    expect(sockets[2]).toMatchObject({ type: 'property', filled: false, index: 0 });
  });

  it('no potency ⇒ no property sockets (an empty potency socket only)', () => {
    const sockets = gearSockets(weapon({}));
    expect(sockets.map((s) => s.type)).toEqual(['potency', 'striking']);
    expect(sockets[0].filled).toBe(false);
  });

  it('returns [] for non-runesmithable gear', () => {
    expect(gearSockets({ name: 'Rope' })).toEqual([]);
  });
});

describe('compatibleRunes', () => {
  const stock = [wPot1, wPot2, striking, aPot1, resilient, vitalizing, slick];

  it('potency socket offers only same-target potency runes that UPGRADE the tier', () => {
    const out = compatibleRunes(weapon({ potency: 1 }), 'potency', stock);
    expect(out.map((r) => r.id)).toEqual(['weapon-potency-2']); // +1 is not an upgrade, armor potency wrong target
  });

  it('property socket offers same-target property runes only', () => {
    expect(compatibleRunes(weapon({ potency: 1 }), 'property', stock).map((r) => r.id)).toEqual(['vitalizing']);
    expect(compatibleRunes(armor({ potency: 1 }), 'property', stock).map((r) => r.id)).toEqual(['slick']);
  });

  it('striking/resilient socket offers the matching fundamental for the target', () => {
    expect(compatibleRunes(weapon({}), 'striking', stock).map((r) => r.id)).toEqual(['striking']);
    expect(compatibleRunes(armor({}), 'resilient', stock).map((r) => r.id)).toEqual(['resilient']);
  });
});

describe('applyRune', () => {
  it('sets the potency tier and mints a fresh uid, dropping loadout fields', () => {
    const out = applyRune({ ...weapon({}), state: 'wielded', hand: 1 }, wPot1);
    expect(out.runes).toEqual({ potency: 1 });
    expect(out.uid).not.toBe('w1');
    expect(out.state).toBeUndefined();
    expect(out.hand).toBeUndefined();
  });

  it('upgrades potency but rejects a non-upgrade (same/lower tier)', () => {
    expect(applyRune(weapon({ potency: 1 }), wPot2).runes.potency).toBe(2);
    expect(applyRune(weapon({ potency: 2 }), wPot1)).toBeNull();
  });

  it('sets striking on a weapon and resilient on armor', () => {
    expect(applyRune(weapon({}), striking).runes.striking).toBe('striking');
    expect(applyRune(armor({}), resilient).runes.resilient).toBe('resilient');
  });

  it('appends a property rune within capacity, rejecting over-capacity + duplicates', () => {
    expect(applyRune(weapon({ potency: 1 }), vitalizing).runes.property).toEqual(['vitalizing']);
    expect(applyRune(weapon({ potency: 0 }), vitalizing)).toBeNull(); // no slot (potency 0)
    expect(applyRune(weapon({ potency: 1, property: ['vitalizing'] }), vitalizing)).toBeNull(); // duplicate
  });

  it('rejects a rune whose target does not match the gear', () => {
    expect(applyRune(weapon({}), resilient)).toBeNull(); // armor rune on a weapon
    expect(applyRune(armor({}), striking)).toBeNull(); // weapon rune on armor
    expect(applyRune(weapon({ potency: 1 }), slick)).toBeNull(); // armor property on a weapon
  });
});
