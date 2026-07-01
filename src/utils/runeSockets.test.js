import { gearTarget, runeTarget, gearSockets, compatibleRunes, applyRune, projectStagedGear, ringSocketCapacity } from './runeSockets';

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

describe('projectStagedGear (#879)', () => {
  it('applies a staged potency rune, opening the property slot it unlocks', () => {
    const projected = projectStagedGear(weapon({}), { potency: wPot1 });
    expect(projected.runes.potency).toBe(1);
    // +0 → no property sockets; +1 projection → one open property socket.
    expect(gearSockets(weapon({})).map((s) => s.type)).toEqual(['potency', 'striking']);
    expect(gearSockets(projected).map((s) => s.type)).toEqual(['potency', 'striking', 'property']);
  });

  it('applies staged striking (weapon) / resilient (armor) fundamentals', () => {
    expect(projectStagedGear(weapon({}), { striking }).runes.striking).toBe('striking');
    expect(projectStagedGear(armor({}), { resilient }).runes.resilient).toBe('resilient');
  });

  it('does NOT fold in staged property runes (kept for index-aligned staged render)', () => {
    const projected = projectStagedGear(weapon({ potency: 1 }), { potency: wPot2, 'property:0': vitalizing });
    expect(projected.runes.potency).toBe(2);
    expect(projected.runes.property || []).toEqual([]); // property untouched
  });

  it('skips a staged rune that will not apply, and is a no-op without staging', () => {
    expect(projectStagedGear(weapon({ potency: 2 }), { potency: wPot1 }).runes.potency).toBe(2); // non-upgrade skipped
    const gear = weapon({ potency: 1 });
    expect(projectStagedGear(gear, {})).toBe(gear);
    expect(projectStagedGear(gear, null)).toBe(gear);
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

describe('power ring sockets (#967 R4)', () => {
  // No fundamentals; imbue capacity is the grade's `ringSockets`, not a potency rune.
  const ring = (grade, runes) => ({ uid: 'r1', name: 'Power Ring', powerRing: true, ringSockets: grade, runes });
  const ringEnergy = { id: 'ring-energy', type: 'property', target: 'ring', name: 'Energy' };
  const ringCalling = { id: 'ring-calling', type: 'property', target: 'ring', name: 'Calling' };

  it('gearTarget detects a power ring by its marker; runeTarget reads a ring rune', () => {
    expect(gearTarget(ring(1, {}))).toBe('ring');
    expect(runeTarget(ringEnergy)).toBe('ring');
  });

  it('ringSocketCapacity is the grade, defaulting to 0', () => {
    expect(ringSocketCapacity(ring(3, {}))).toBe(3);
    expect(ringSocketCapacity({ powerRing: true })).toBe(0);
  });

  it('gearSockets: grade-count property sockets, NO fundamentals', () => {
    expect(gearSockets(ring(1, {})).map((s) => s.type)).toEqual(['property']);
    expect(gearSockets(ring(3, {})).map((s) => s.type)).toEqual(['property', 'property', 'property']);
    const s = gearSockets(ring(2, { property: ['ring-energy'] }));
    expect(s[0]).toMatchObject({ type: 'property', filled: true, rune: 'ring-energy', index: 0 });
    expect(s[1]).toMatchObject({ type: 'property', filled: false, index: 1 });
  });

  it('applyRune imbues a ring rune up to grade capacity, rejecting over-capacity + duplicates', () => {
    expect(applyRune(ring(2, {}), ringEnergy).runes.property).toEqual(['ring-energy']);
    expect(applyRune(ring(1, { property: ['ring-energy'] }), ringCalling)).toBeNull(); // full (grade 1)
    expect(applyRune(ring(2, { property: ['ring-energy'] }), ringEnergy)).toBeNull(); // duplicate
  });

  it('applyRune rejects a non-ring rune in a ring, and a ring rune in other gear', () => {
    expect(applyRune(ring(2, {}), vitalizing)).toBeNull(); // weapon property into a ring
    expect(applyRune(weapon({ potency: 1 }), ringEnergy)).toBeNull(); // ring rune into a weapon
  });

  it('compatibleRunes offers only ring property runes for a ring socket', () => {
    const stock = [vitalizing, slick, ringEnergy, ringCalling, striking];
    expect(compatibleRunes(ring(2, {}), 'property', stock).map((r) => r.id)).toEqual(['ring-energy', 'ring-calling']);
  });
});
