import { gearTarget, runeTarget, gearSockets, compatibleRunes, applyRune, projectStagedGear, ringSocketCapacity, inEtchList } from './runeSockets';

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
  it('classifies a shield as target "shield" — even one carrying a bash strikes block', () => {
    expect(gearTarget({ name: 'Steel Shield', shield: { hardness: 5 } })).toBe('shield');
    // A shield-bash weapon block no longer wins: shield is checked before strikes.
    expect(gearTarget({ name: 'Spiked Steel Shield', shield: { hardness: 5 }, strikes: [{}] })).toBe('shield');
    expect(runeTarget(reinfMinor)).toBe('shield');
  });
});

// Reinforcing (shield fundamental) rune docs — S5 authors the real catalog; these
// fixtures mirror their shape: fundamental + explicit target 'shield' + tierKey.
const reinfMinor = { id: 'reinforcing-minor', type: 'fundamental', fundamental: 'reinforcing', target: 'shield', tierKey: 'minor' };
const reinfModerate = { id: 'reinforcing-moderate', type: 'fundamental', fundamental: 'reinforcing', target: 'shield', tierKey: 'moderate' };

describe('shield reinforcing socket (#1165 S2)', () => {
  const shield = (runes) => ({ uid: 's1', name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10 }, runes });

  it('gearSockets: one reinforcing socket (+ the orthogonal accessory socket), no potency/property', () => {
    // A shield is a dual host: reinforcing (its only fundamental) + the accessory
    // socket every shield carries (#1033). No potency or property sockets.
    expect(gearSockets(shield({})).map((s) => s.type)).toEqual(['reinforcing', 'accessory']);
    const filled = gearSockets(shield({ reinforcing: 'lesser' }))[0];
    expect(filled).toMatchObject({ type: 'reinforcing', target: 'shield', filled: true, value: 'lesser' });
  });

  it('compatibleRunes: rank-based upgrade only (higher grade replaces lower)', () => {
    const stock = [reinfMinor, reinfModerate, striking, slick];
    // Empty shield: any reinforcing grade qualifies; weapon/armor runes never do.
    expect(compatibleRunes(shield({}), 'reinforcing', stock)).toEqual([reinfMinor, reinfModerate]);
    // A moderate shield: minor is a downgrade (excluded), moderate is same rank (excluded).
    expect(compatibleRunes(shield({ reinforcing: 'moderate' }), 'reinforcing', stock)).toEqual([]);
    // A minor shield: only the higher grade qualifies.
    expect(compatibleRunes(shield({ reinforcing: 'minor' }), 'reinforcing', stock)).toEqual([reinfModerate]);
  });

  it('applyRune: sets/upgrades reinforcing, rejects non-upgrades and wrong-target runes', () => {
    const applied = applyRune(shield({}), reinfMinor);
    expect(applied.runes).toEqual({ reinforcing: 'minor' });
    expect(applied.uid).not.toBe('s1'); // fresh uid
    // Upgrade minor → moderate.
    expect(applyRune(shield({ reinforcing: 'minor' }), reinfModerate).runes).toEqual({ reinforcing: 'moderate' });
    // Downgrade / same-grade / weapon rune all reject.
    expect(applyRune(shield({ reinforcing: 'moderate' }), reinfMinor)).toBeNull();
    expect(applyRune(shield({ reinforcing: 'moderate' }), reinfModerate)).toBeNull();
    expect(applyRune(shield({}), striking)).toBeNull();
  });

  it('projectStagedGear folds a staged reinforcing rune onto the socket board', () => {
    const projected = projectStagedGear(shield({}), { reinforcing: reinfModerate });
    expect(gearSockets(projected)[0]).toMatchObject({ filled: true, value: 'moderate' });
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

describe('dragonbreath weapon fundamentals (#1210 M4c)', () => {
  const dbWeapon = (tier, property) => ({
    uid: 'db1', name: 'Longsword', strikes: [{}],
    dragonbreath: { tier, dragonType: 'Red' },
    ...(property ? { runes: { property } } : {}),
  });

  it('shows the tier fundamentals as filled + locked, with property slots per tier', () => {
    const sockets = gearSockets(dbWeapon('greater'));
    expect(sockets.map((s) => s.type)).toEqual(['potency', 'striking', 'property', 'property']);
    expect(sockets[0]).toMatchObject({ type: 'potency', filled: true, value: 2, locked: true });
    expect(sockets[1]).toMatchObject({ type: 'striking', filled: true, value: 'greater', locked: true });
    expect(sockets[2]).toMatchObject({ type: 'property', filled: false, index: 0 });
    // base tier → 1 property slot
    expect(gearSockets(dbWeapon('base')).filter((s) => s.type === 'property')).toHaveLength(1);
  });

  it('offers only the tier-upgrade option on potency, nothing on striking, property normally', () => {
    const stock = [wPot1, wPot2, striking, vitalizing];
    // no stock fundamental etch — the only potency option is the synthetic upgrade
    const pot = compatibleRunes(dbWeapon('base'), 'potency', stock);
    expect(pot.map((r) => r.id)).toEqual(['dragonbreath-upgrade-greater']);
    expect(compatibleRunes(dbWeapon('base'), 'striking', stock)).toEqual([]);
    expect(compatibleRunes(dbWeapon('base'), 'property', stock).map((r) => r.id)).toEqual(['vitalizing']);
    // major weapon: top tier, no upgrade offered
    expect(compatibleRunes(dbWeapon('major'), 'potency', stock)).toEqual([]);
  });

  it('applyRune rejects a real fundamental etch, keeping the template locked', () => {
    expect(applyRune(dbWeapon('base'), wPot2)).toBeNull();
    expect(applyRune(dbWeapon('base'), striking)).toBeNull();
  });

  it('applyRune etches a property rune without baking the implied fundamentals in', () => {
    const etched = applyRune(dbWeapon('greater'), vitalizing);
    expect(etched.runes).toEqual({ property: ['vitalizing'] }); // no potency/striking written
    expect(etched.dragonbreath).toEqual({ tier: 'greater', dragonType: 'Red' }); // template preserved
  });

  it('honors the implied property capacity (base tier fills at 1 slot)', () => {
    expect(applyRune(dbWeapon('base', ['keen']), vitalizing)).toBeNull(); // 1 slot, already used
  });
});

describe('dragonbreath tier upgrade via the work-order rail (#1210 M4d)', () => {
  const dbWeapon = (tier, property) => ({
    uid: 'db1', name: 'Longsword', strikes: [{}],
    dragonbreath: { tier, dragonType: 'Red' },
    ...(property ? { runes: { property } } : {}),
  });
  const upgrade = compatibleRunes(dbWeapon('base'), 'potency', [])[0];

  it('the potency socket surfaces a synthetic upgrade rune, priced at the tier delta', () => {
    expect(upgrade).toMatchObject({ id: 'dragonbreath-upgrade-greater', dragonbreathUpgrade: 'greater', price: 2450 });
  });

  it('applyRune bumps the tier, preserving dragon kind + property runes, with a fresh uid', () => {
    const out = applyRune(dbWeapon('base', ['vitalizing']), upgrade);
    expect(out.dragonbreath).toEqual({ tier: 'greater', dragonType: 'Red' });
    expect(out.runes).toEqual({ property: ['vitalizing'] }); // property carried through
    expect(out.uid).not.toBe('db1'); // fresh-uid runed snapshot to credit back
  });

  it('a staged upgrade projects the next tier onto the socket board (#879)', () => {
    // projectStagedGear applies the staged upgrade under the potency socket key,
    // so the board previews greater's fundamentals + its extra property slot.
    const projected = projectStagedGear(dbWeapon('base'), { potency: upgrade });
    const sockets = gearSockets(projected);
    expect(sockets[0]).toMatchObject({ type: 'potency', value: 2, locked: true });
    expect(sockets.filter((s) => s.type === 'property')).toHaveLength(2);
  });

  it('rejects an upgrade that is not a one-step bump from the current tier', () => {
    // a greater-target upgrade rune applied to an already-greater weapon: no-op
    expect(applyRune(dbWeapon('greater'), upgrade)).toBeNull();
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

// ── Accessory runes (#1033 S1) ────────────────────────────────────────────────
// The one-per-item accessory slot is orthogonal to gearTarget: hosts qualify by
// usage tags (accessoryEligible), so target-less gear (a cloak) and armor-runed
// armor (Explorer's Clothing) both take the slot through the same applyRune.
describe('applyRune — accessory slot (#1033)', () => {
  const menacing = {
    id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing',
    price: 50, usage: ['clothing'],
  };
  const cloak = { uid: 'k1', name: 'Cloak', accessoryTags: ['cloak', 'clothing'] };

  it('inscribes an eligible target-less host, minting a fresh uid + dropping loadout fields', () => {
    const out = applyRune({ ...cloak, state: 'worn' }, menacing);
    expect(out.runes).toEqual({ accessory: 'menacing' });
    expect(out.uid).not.toBe('k1');
    expect(out.state).toBeUndefined();
  });

  it('dual-hosts: keeps existing armor runes alongside the accessory slot', () => {
    const explorers = {
      uid: 'e1', name: "Explorer's Clothing", armor: { category: 'unarmored', acBonus: 0 },
      accessoryTags: ['clothing'], runes: { potency: 1, property: ['slick'] },
    };
    const out = applyRune(explorers, menacing);
    expect(out.runes).toEqual({ potency: 1, property: ['slick'], accessory: 'menacing' });
  });

  it('rejects a second accessory rune, a usage mismatch, and an invested host', () => {
    const called = { id: 'called', type: 'property', target: 'accessory', usage: ['light'] };
    expect(applyRune({ ...cloak, runes: { accessory: 'menacing' } }, called)).toBeNull(); // slot taken
    expect(applyRune(cloak, called)).toBeNull(); // usage mismatch (no light tag)
    expect(applyRune({ ...cloak, traits: ['Invested'] }, menacing)).toBeNull(); // invested magic
  });

  it('bakes an etch-time config onto the entry (#1059 — Dragon\'s Breath dragon type)', () => {
    const dbRune = { id: 'dragons-breath-3', type: 'property', target: 'accessory', usage: ['cloak'], etchConfig: { dragonType: 'fire' } };
    const out = applyRune(cloak, dbRune);
    expect(out.runes).toEqual({ accessory: 'dragons-breath-3', accessoryConfig: { dragonType: 'fire' } });
  });

  it('omits accessoryConfig when the staged rune carries no etchConfig', () => {
    const out = applyRune(cloak, menacing);
    expect(out.runes.accessoryConfig).toBeUndefined();
  });

  it('non-accessory gear paths are unchanged: an accessory rune never lands in weapon/armor sockets', () => {
    expect(applyRune(weapon({ potency: 1 }), { ...menacing, usage: ['clothing'] })).toBeNull();
    expect(applyRune(armor({ potency: 1 }), menacing)).toBeNull(); // armor without the clothing tag
  });
});

// The S5 storefront surface (#1033): the accessory socket on the board, its
// usage-tag picker, and the etch-list predicate that keeps trinkets off the
// board until a shop actually stocks something they could take.
describe('accessory socket + etch list (#1033 S5)', () => {
  const menacing = { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', usage: ['clothing'] };
  const catching = { id: 'catching', type: 'property', target: 'accessory', name: 'Catching', usage: ['shield'] };
  const preserving = { id: 'preserving', type: 'property', target: 'accessory', name: 'Preserving', usage: ['container'] };
  const cloak = { uid: 'k1', name: 'Cloak', accessoryTags: ['cloak', 'clothing'], weight: 0.1 };

  it('an accessory-only host carries just the one accessory socket', () => {
    expect(gearSockets(cloak)).toEqual([
      { type: 'accessory', target: 'accessory', filled: false, rune: null },
    ]);
  });

  it('an inscribed host shows its rune in a filled accessory socket', () => {
    const sockets = gearSockets({ ...cloak, runes: { accessory: 'menacing' } });
    expect(sockets).toEqual([
      { type: 'accessory', target: 'accessory', filled: true, rune: 'menacing' },
    ]);
  });

  it('a dual-host lists the accessory socket after its armor sockets', () => {
    const explorers = {
      uid: 'e1', name: "Explorer's Clothing", armor: { category: 'unarmored', acBonus: 0 },
      accessoryTags: ['clothing'], runes: { potency: 1 },
    };
    expect(gearSockets(explorers).map((s) => s.type)).toEqual(['potency', 'resilient', 'property', 'accessory']);
  });

  it('a shield is a dual host: reinforcing socket + the accessory socket; invested/untagged gear gets none', () => {
    // Shield now classifies as gearTarget 'shield' (#1165), so a buckler carries
    // its reinforcing socket AND — as a derived accessory host — the accessory socket.
    expect(gearSockets({ uid: 'b1', name: 'Buckler', shield: { hardness: 3 } }).map((s) => s.type)).toEqual(['reinforcing', 'accessory']);
    expect(gearSockets({ uid: 'x1', name: 'Cloak of Repute', accessoryTags: ['cloak'], traits: ['Invested'] })).toEqual([]);
    expect(gearSockets({ name: 'Rope', weight: 1 })).toEqual([]);
  });

  it('compatibleRunes matches the accessory socket by usage tags and closes once inscribed', () => {
    const stock = [menacing, catching, vitalizing];
    expect(compatibleRunes(cloak, 'accessory', stock)).toEqual([menacing]); // catching needs a shield; vitalizing is a weapon rune
    expect(compatibleRunes({ ...cloak, runes: { accessory: 'menacing' } }, 'accessory', stock)).toEqual([]); // one rune, no upgrade path
  });

  it('inEtchList: target gear always; accessory-only hosts need a compatible rune in stock', () => {
    expect(inEtchList(weapon({}), [])).toBe(true); // weapons list regardless of stock
    expect(inEtchList(cloak, [menacing])).toBe(true);
    expect(inEtchList(cloak, [catching])).toBe(false); // stocked, but nothing a cloak can take
    expect(inEtchList(cloak, [])).toBe(false);
    expect(inEtchList({ ...cloak, runes: { accessory: 'menacing' } }, [menacing])).toBe(false); // inscribed — nothing left to etch
    expect(inEtchList({ uid: 'p1', name: 'Backpack', container: { capacity: 4 } }, [preserving])).toBe(true); // derived container tag
    expect(inEtchList({ name: 'Rope', weight: 1 }, [menacing])).toBe(false);
  });
});

// ── Shield property runes (#1196 G2) ───────────────────────────────────────────
describe('shield property sockets (#1196 G2)', () => {
  // A steel shield with a Bulk of 1 (medium category) unless overridden.
  const shield = (runes, extra = {}) => ({ uid: 's1', name: 'Steel Shield', weight: 1, shield: { hardness: 5, health: 20, breakThreshold: 10 }, runes, ...extra });

  // Shield property runes. energyRes is duplicable (choose a damage type each time);
  // winglet is a normal unique property. darkImbued is gated to light shields.
  const energyRes = { id: 'energy-resistant', type: 'property', target: 'shield', name: 'Energy-Resistant', price: 500, duplicable: true };
  const winglet = { id: 'winglet', type: 'property', target: 'shield', name: 'Winglet', price: 350 };
  const lightOnly = { id: 'dark', type: 'property', target: 'shield', name: 'Darkness', price: 250, usage: 'etched onto a light shield' };
  const armorProp = { id: 'slick', type: 'property', armorRune: true, name: 'Slick' };

  it('gearSockets: reinforcing + N property sockets by grade + the orthogonal accessory socket', () => {
    // No reinforcing → no property sockets (just reinforcing + accessory).
    expect(gearSockets(shield({})).map((s) => s.type)).toEqual(['reinforcing', 'accessory']);
    // Moderate (2 slots): reinforcing + 2 property + accessory.
    const mod = gearSockets(shield({ reinforcing: 'moderate', property: [winglet] }));
    expect(mod.map((s) => s.type)).toEqual(['reinforcing', 'property', 'property', 'accessory']);
    expect(mod[1]).toMatchObject({ type: 'property', target: 'shield', index: 0, filled: true, rune: winglet });
    expect(mod[2]).toMatchObject({ type: 'property', index: 1, filled: false, rune: null });
  });

  it('compatibleRunes: shield property runes fill a property socket; wrong-target excluded', () => {
    const stock = [energyRes, winglet, armorProp];
    expect(compatibleRunes(shield({ reinforcing: 'minor' }), 'property', stock)).toEqual([energyRes, winglet]);
  });

  it('compatibleRunes: category usage gate hides a light-only rune on a medium shield', () => {
    const stock = [lightOnly, winglet];
    // medium shield: lightOnly is gated out.
    expect(compatibleRunes(shield({ reinforcing: 'minor' }), 'property', stock)).toEqual([winglet]);
    // light shield (Bulk L): lightOnly qualifies.
    const lightShield = shield({ reinforcing: 'minor' }, { weight: 0.1 });
    expect(compatibleRunes(lightShield, 'property', stock)).toEqual([lightOnly, winglet]);
  });

  it('compatibleRunes: an applied unique rune drops out; a duplicable one stays', () => {
    const stock = [energyRes, winglet];
    const item = shield({ reinforcing: 'moderate', property: [winglet, energyRes] });
    // winglet already applied (unique) → gone; energyRes duplicable → still offered.
    expect(compatibleRunes(item, 'property', stock)).toEqual([energyRes]);
  });

  it('applyRune: appends a shield property rune id, respecting capacity', () => {
    const applied = applyRune(shield({ reinforcing: 'minor' }), winglet);
    expect(applied.runes).toEqual({ reinforcing: 'minor', property: ['winglet'] });
    expect(applied.uid).not.toBe('s1');
    // Capacity 1 is now full — a second unique rune is rejected.
    expect(applyRune(applied, energyRes)).toBeNull();
  });

  it('applyRune: rejects a category-gated rune on the wrong shield size', () => {
    expect(applyRune(shield({ reinforcing: 'minor' }), lightOnly)).toBeNull(); // medium
    const applied = applyRune(shield({ reinforcing: 'minor' }, { weight: 0.1 }), lightOnly); // light
    expect(applied.runes.property).toEqual(['dark']);
  });

  it('applyRune: a duplicable rune stacks only with a distinct choice', () => {
    const one = applyRune(shield({ reinforcing: 'moderate' }), energyRes, { choice: 'fire' });
    expect(one.runes.property).toEqual([{ id: 'energy-resistant', choice: 'fire' }]);
    // Same rune, different damage type → allowed (fills the 2nd slot).
    const two = applyRune(one, energyRes, { choice: 'cold' });
    expect(two.runes.property).toEqual([{ id: 'energy-resistant', choice: 'fire' }, { id: 'energy-resistant', choice: 'cold' }]);
    // Same rune, same type → exact duplicate, rejected.
    expect(applyRune(one, energyRes, { choice: 'fire' })).toBeNull();
  });

  it('applyRune: a non-duplicable rune never stacks even across slots', () => {
    const one = applyRune(shield({ reinforcing: 'moderate' }), winglet);
    expect(applyRune(one, winglet)).toBeNull();
  });

  it('applyRune: honors a shop-staged rune\'s etchConfig.choice (no opts)', () => {
    // A player-etched Energy-Resistant carries its damage type on etchConfig
    // (the #1059 carrier); fulfillment calls applyRune without opts.
    const staged = { ...energyRes, etchConfig: { choice: 'fire' } };
    const applied = applyRune(shield({ reinforcing: 'moderate' }), staged);
    expect(applied.runes.property).toEqual([{ id: 'energy-resistant', choice: 'fire' }]);
  });

  it('applyRune: explicit opts.choice wins over etchConfig.choice', () => {
    const staged = { ...energyRes, etchConfig: { choice: 'fire' } };
    const applied = applyRune(shield({ reinforcing: 'moderate' }), staged, { choice: 'cold' });
    expect(applied.runes.property).toEqual([{ id: 'energy-resistant', choice: 'cold' }]);
  });

  it('an accessory rune on a shield does not consume a property slot', () => {
    // Minor shield: 1 property slot. Fill the property, then still take an accessory.
    const withProp = applyRune(shield({ reinforcing: 'minor' }), winglet);
    const sockets = gearSockets(withProp);
    // reinforcing + 1 property (filled) + accessory (empty) — property capacity untouched.
    expect(sockets.map((s) => s.type)).toEqual(['reinforcing', 'property', 'accessory']);
    expect(sockets.find((s) => s.type === 'accessory')).toMatchObject({ filled: false });
  });
});
