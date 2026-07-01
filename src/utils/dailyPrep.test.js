import { dailyPrepPlanFor, performDailyPrep } from './dailyPrep';

// Build a getState backed by a plain store, plus a sendUpdate that records
// writes and updates the store (so reads after writes are consistent).
const makeStubs = (initial = {}) => {
  const store = { 'char-1': { ...initial } };
  const updates = [];
  const getState = (id, key) => store[id]?.[key];
  const sendUpdate = (id, key, value) => {
    if (!store[id]) store[id] = {};
    store[id][key] = value;
    updates.push({ id, key, value });
  };
  return { store, updates, getState, sendUpdate };
};

const character = {
  id: 'char-1',
  spellcasting: { eldPowers: [{ source: 'Ley Line' }, { source: 'Astral' }] },
};

beforeEach(() => { localStorage.clear(); });

describe('performDailyPrep — resets', () => {
  it('zeroes spent spell slots', () => {
    const { updates, getState, sendUpdate } = makeStubs({ slots: { 1: 2, 2: 1, cantrips: 0 } });
    const { summary } = performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'slots').value).toEqual({ 1: 0, 2: 0, cantrips: 0 });
    expect(summary).toMatch(/spell slots/);
  });

  it('resets focus, staff, and wand uses', () => {
    const { updates, getState, sendUpdate } = makeStubs({
      focus: 2,
      staff: 3,
      wands: { 'wand-a': 'used', 'wand-b': 'available', 'wand-c': 'overcharged' },
    });
    performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'focus').value).toBe(0);
    expect(updates.find((u) => u.key === 'staff').value).toBe(0);
    expect(updates.find((u) => u.key === 'wands').value).toEqual({
      'wand-a': 'available', 'wand-b': 'available', 'wand-c': 'available',
    });
  });

  it('prunes only per:day frequency records, keeping hour/week', () => {
    const freq = {
      'eld-bolt': [{ per: 'hour', gameSecs: 1 }],
      'murmured-prayer': [{ per: 'day', gameSecs: 1 }],
      'tell-fortune': [{ per: 'week', gameSecs: 1 }],
    };
    const { updates, getState, sendUpdate } = makeStubs({ freq });
    performDailyPrep({ character, getState, sendUpdate });
    const next = updates.find((u) => u.key === 'freq').value;
    expect(next).toEqual({
      'eld-bolt': [{ per: 'hour', gameSecs: 1 }],
      'tell-fortune': [{ per: 'week', gameSecs: 1 }],
    });
  });

  it('clears the Hunt Prey designation', () => {
    const { updates, getState, sendUpdate } = makeStubs({ huntprey: { target: 'Goblin' } });
    performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'huntprey').value).toBeNull();
  });

  it('clears a leftover Harmless Bystander declaration', () => {
    const { updates, getState, sendUpdate } = makeStubs({ bystander: { active: true, mod: 'deception', ts: 1 } });
    performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'bystander').value).toMatchObject({ active: false, mod: null });
  });

  it('drops until-daily-prep effects but keeps the rest', () => {
    const effects = [
      { id: 'a', effectId: 'mystic-armor', expireOnDailyPrep: true },
      { id: 'b', effectId: 'heroism-1' },
    ];
    const { updates, getState, sendUpdate } = makeStubs({ effects });
    performDailyPrep({ character, getState, sendUpdate, nowSecs: 1000 });
    expect(updates.find((u) => u.key === 'effects').value.map((e) => e.id)).toEqual(['b']);
  });

  it('also sweeps already-expired clock immunities', () => {
    const effects = [
      { id: 'imm', effectId: 'ability-immunity', expireAtSecs: 500 },
      { id: 'keep', effectId: 'ability-immunity', expireAtSecs: 2000 },
    ];
    const { updates, getState, sendUpdate } = makeStubs({ effects });
    performDailyPrep({ character, getState, sendUpdate, nowSecs: 1000 });
    expect(updates.find((u) => u.key === 'effects').value.map((e) => e.id)).toEqual(['keep']);
  });

  it('clears a lingering sustained-spell ledger', () => {
    const { updates, getState, sendUpdate } = makeStubs({
      sustains: [{ id: 's1', spellName: 'Bless' }],
    });
    const { summary } = performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'sustains').value).toEqual([]);
    expect(summary).toMatch(/sustained spells/);
  });

  it('clears lingering per-spell counters', () => {
    const { updates, getState, sendUpdate } = makeStubs({
      spellcounters: [{ id: 'mi', spellName: 'Mirror Image', value: 2 }],
    });
    const { summary } = performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'spellcounters').value).toEqual([]);
    expect(summary).toMatch(/tracked spells/);
  });

  it('clears a lingering active stance (#224)', () => {
    const { updates, getState, sendUpdate } = makeStubs({
      stance: { active: true, name: 'Dragon Stance', ts: 1 },
    });
    const { summary } = performDailyPrep({ character, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'stance').value).toMatchObject({ active: false, name: null });
    expect(summary).toMatch(/stance/);
  });

  it('writes nothing for a character with full resources', () => {
    const { updates, getState, sendUpdate } = makeStubs({ slots: { 1: 0 }, focus: 0 });
    const { summary } = performDailyPrep({ character, getState, sendUpdate });
    expect(updates).toHaveLength(0);
    expect(summary).toBe('nothing to restore');
  });
});

describe('performDailyPrep — Eld attunement', () => {
  it('persists a valid Eld choice and notes it in the summary', () => {
    const { updates, getState, sendUpdate } = makeStubs({});
    const { summary } = performDailyPrep({ character, getState, sendUpdate, eldChoice: 'Astral' });
    expect(updates.find((u) => u.key === 'eldattune').value).toBe('Astral');
    expect(summary).toMatch(/attuned to Astral/);
  });

  it('ignores an Eld choice the character does not have', () => {
    const { updates, getState, sendUpdate } = makeStubs({});
    performDailyPrep({ character, getState, sendUpdate, eldChoice: 'Nonsense' });
    expect(updates.find((u) => u.key === 'eldattune')).toBeUndefined();
  });

  it('ignores an Eld choice for a non-Eld character', () => {
    const plain = { id: 'char-1' };
    const { updates, getState, sendUpdate } = makeStubs({});
    performDailyPrep({ character: plain, getState, sendUpdate, eldChoice: 'Astral' });
    expect(updates.find((u) => u.key === 'eldattune')).toBeUndefined();
  });
});

describe('performDailyPrep — staff preparation (#957 S6a)', () => {
  const caster = { id: 'char-1', spellcasting: { spell_slots: { 1: 4, 2: 4, 3: 2 } } };

  it('prepares the chosen staff with charges = highest castable rank, full charges', () => {
    const { updates, getState, sendUpdate } = makeStubs({ staff: 2 });
    const { summary } = performDailyPrep({ character: caster, getState, sendUpdate, staffChoice: 'staff-x' });
    expect(updates.find((u) => u.key === 'staffprep').value).toEqual({ staffId: 'staff-x', charges: 3 });
    expect(updates.find((u) => u.key === 'staff').value).toBe(0);
    expect(summary).toMatch(/prepared a staff \(3 charges\)/);
  });

  it('clears the prepared staff when the choice is empty', () => {
    const { updates, getState, sendUpdate } = makeStubs({ staffprep: { staffId: 'old', charges: 1 } });
    performDailyPrep({ character: caster, getState, sendUpdate, staffChoice: '' });
    expect(updates.find((u) => u.key === 'staffprep').value).toBeNull();
  });

  it('refreshes the previously prepared staff when no choice is passed (GM loop)', () => {
    const { updates, getState, sendUpdate } = makeStubs({ staffprep: { staffId: 'old', charges: 1 } });
    performDailyPrep({ character: caster, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'staffprep').value).toEqual({ staffId: 'old', charges: 3 });
  });

  it('touches no staff state when none is prepared and no choice is passed', () => {
    const { updates, getState, sendUpdate } = makeStubs({});
    performDailyPrep({ character: caster, getState, sendUpdate });
    expect(updates.find((u) => u.key === 'staffprep')).toBeUndefined();
  });

  it('folds expended slots into the charge count and spends them (#957 S6b)', () => {
    const { updates, getState, sendUpdate } = makeStubs({ slots: { 1: 0, 2: 0, 3: 0 } });
    performDailyPrep({
      character: caster, getState, sendUpdate,
      staffChoice: 'staff-x', staffSlots: { 1: 2, 3: 1 },
    });
    // 3 (highest rank) + 2·1 + 1·3 = 8 charges.
    expect(updates.find((u) => u.key === 'staffprep').value).toEqual({ staffId: 'staff-x', charges: 8 });
    // The last slots write reflects the expended allocation.
    const slotWrites = updates.filter((u) => u.key === 'slots');
    expect(slotWrites[slotWrites.length - 1].value).toEqual({ 1: 2, 2: 0, 3: 1 });
  });

  it('clamps a slot allocation to what the caster actually has', () => {
    const { updates, getState, sendUpdate } = makeStubs({});
    performDailyPrep({
      character: caster, getState, sendUpdate,
      staffChoice: 'staff-x', staffSlots: { 3: 9 }, // caster only has 2 rank-3 slots
    });
    expect(updates.find((u) => u.key === 'staffprep').value.charges).toBe(3 + 3 * 2);
    const slotWrites = updates.filter((u) => u.key === 'slots');
    expect(slotWrites[slotWrites.length - 1].value).toEqual({ 1: 0, 2: 0, 3: 2 });
  });
});

describe('dailyPrepPlanFor', () => {
  it('previews dirty resets and Eld options', () => {
    const { getState } = makeStubs({ slots: { 1: 1 }, focus: 0, huntprey: { target: 'X' } });
    const plan = dailyPrepPlanFor(character, getState);
    const labels = plan.resets.map((r) => r.label);
    expect(labels).toContain('spell slots');
    expect(labels).toContain('Hunt Prey');
    expect(labels).not.toContain('focus points'); // focus 0 = not dirty
    expect(plan.hasEld).toBe(true);
    expect(plan.eldSources).toEqual(['Ley Line', 'Astral']);
    expect(plan.currentEldSource).toBe('Ley Line'); // default to first
  });

  it('reflects the stored Eld attunement when set', () => {
    const { getState } = makeStubs({ eldattune: 'Astral' });
    expect(dailyPrepPlanFor(character, getState).currentEldSource).toBe('Astral');
  });

  it('has no Eld picker for a non-Eld character', () => {
    const { getState } = makeStubs({});
    const plan = dailyPrepPlanFor({ id: 'char-1' }, getState);
    expect(plan.hasEld).toBe(false);
    expect(plan.eldSources).toEqual([]);
  });
});
