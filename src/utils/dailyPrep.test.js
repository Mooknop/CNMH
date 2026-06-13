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
