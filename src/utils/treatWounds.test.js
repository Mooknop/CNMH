import {
  availableDcs,
  healHint,
  hasImmunityFrom,
  applyTreatWounds,
  IMMUNITY_EFFECT_ID,
} from './treatWounds';

// ── availableDcs ─────────────────────────────────────────────────────────────

describe('availableDcs', () => {
  it('rank 0 (untrained) → no DCs', () => {
    expect(availableDcs(0)).toEqual([]);
  });

  it('rank 1 (trained) → [15]', () => {
    expect(availableDcs(1)).toEqual([15]);
  });

  it('rank 2 (expert) → [15, 20]', () => {
    expect(availableDcs(2)).toEqual([15, 20]);
  });

  it('rank 3 (master) → [15, 20, 30]', () => {
    expect(availableDcs(3)).toEqual([15, 20, 30]);
  });

  it('rank 4 (legendary) → [15, 20, 30, 40]', () => {
    expect(availableDcs(4)).toEqual([15, 20, 30, 40]);
  });
});

// ── healHint ─────────────────────────────────────────────────────────────────

describe('healHint', () => {
  it('DC 15 success → "2d8"', () => {
    expect(healHint(15, 'success')).toBe('2d8');
  });

  it('DC 15 criticalSuccess → "4d8"', () => {
    expect(healHint(15, 'criticalSuccess')).toBe('4d8');
  });

  it('DC 20 success → "2d8 + 10"', () => {
    expect(healHint(20, 'success')).toBe('2d8 + 10');
  });

  it('DC 20 criticalSuccess → "4d8 + 10"', () => {
    expect(healHint(20, 'criticalSuccess')).toBe('4d8 + 10');
  });

  it('DC 30 success → "2d8 + 30"', () => {
    expect(healHint(30, 'success')).toBe('2d8 + 30');
  });

  it('DC 40 criticalSuccess → "4d8 + 50"', () => {
    expect(healHint(40, 'criticalSuccess')).toBe('4d8 + 50');
  });

  it('any DC criticalFailure → "1d8 damage"', () => {
    expect(healHint(15, 'criticalFailure')).toBe('1d8 damage');
    expect(healHint(20, 'criticalFailure')).toBe('1d8 damage');
  });

  it('failure → null', () => {
    expect(healHint(15, 'failure')).toBeNull();
  });
});

// ── hasImmunityFrom ──────────────────────────────────────────────────────────

describe('hasImmunityFrom', () => {
  const healerId = 'healer-1';

  it('returns false when effects is empty', () => {
    expect(hasImmunityFrom([], healerId)).toBe(false);
  });

  it('returns false when null/undefined effects', () => {
    expect(hasImmunityFrom(null, healerId)).toBe(false);
    expect(hasImmunityFrom(undefined, healerId)).toBe(false);
  });

  it('returns true when a matching immunity exists', () => {
    const effects = [{ effectId: IMMUNITY_EFFECT_ID, appliedBy: healerId }];
    expect(hasImmunityFrom(effects, healerId)).toBe(true);
  });

  it('returns false when immunity is from a different healer', () => {
    const effects = [{ effectId: IMMUNITY_EFFECT_ID, appliedBy: 'other-healer' }];
    expect(hasImmunityFrom(effects, healerId)).toBe(false);
  });

  it('returns false when effect has different effectId', () => {
    const effects = [{ effectId: 'heroism-1', appliedBy: healerId }];
    expect(hasImmunityFrom(effects, healerId)).toBe(false);
  });
});

// ── applyTreatWounds ─────────────────────────────────────────────────────────

function makeStubs(initialHp = null, initialEffects = null) {
  const store = {};
  if (initialHp)      store['hp']      = initialHp;
  if (initialEffects) store['effects'] = initialEffects;

  const updates = [];
  const logs    = [];

  const getState   = (_charId, key) => store[key] ?? undefined;
  const sendUpdate = (_charId, key, value) => {
    store[key] = value;
    updates.push({ key, value });
  };
  const appendLog  = (entry) => logs.push(entry);

  return { store, updates, logs, getState, sendUpdate, appendLog };
}

const healer = { id: 'h1', name: 'Pellias' };
const target = { id: 't1', name: 'Brakor', maxHp: 40 };

describe('applyTreatWounds — failure', () => {
  it('logs failure and does not mutate HP or effects', () => {
    const { store, updates, logs, getState, sendUpdate, appendLog } = makeStubs();
    applyTreatWounds({ healer, target, dc: 15, degree: 'failure', amount: 0, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });
    expect(updates).toHaveLength(0);
    expect(store.hp).toBeUndefined();
    expect(logs[0].text).toMatch(/Failure/);
  });
});

describe('applyTreatWounds — success', () => {
  it('heals target and adds immunity effect', () => {
    const hp = { current: 20, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { store, updates, logs, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyTreatWounds({ healer, target, dc: 15, degree: 'success', amount: 12, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(32);

    const effUpdate = updates.find((u) => u.key === 'effects');
    expect(effUpdate.value).toHaveLength(1);
    expect(effUpdate.value[0].effectId).toBe(IMMUNITY_EFFECT_ID);
    expect(effUpdate.value[0].appliedBy).toBe(healer.id);

    expect(logs[0].text).toMatch(/Success/);
    expect(logs[0].text).toMatch(/12/);
  });

  it('caps healing at max HP', () => {
    const hp = { current: 38, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { store, updates, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyTreatWounds({ healer, target, dc: 15, degree: 'success', amount: 10, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(40);
  });

  it('seeds HP from target.maxHp when getState returns undefined (already at full)', () => {
    // No stored HP → character is seeded at full health; healing is capped at max.
    const { updates, getState, sendUpdate, appendLog } = makeStubs();
    applyTreatWounds({ healer, target, dc: 15, degree: 'success', amount: 8, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(target.maxHp); // capped at max
    expect(hpUpdate.value.max).toBe(target.maxHp);
  });
});

describe('applyTreatWounds — criticalSuccess', () => {
  it('heals and marks Critical Success in log', () => {
    const hp = { current: 10, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { updates, logs, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyTreatWounds({ healer, target, dc: 20, degree: 'criticalSuccess', amount: 22, actionName: 'Battle Medicine', getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(32);
    expect(logs[0].text).toMatch(/Critical Success/);
    expect(logs[0].text).toMatch(/22/);
  });

  it('appends immunity to existing effects list', () => {
    const hp = { current: 10, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const existing = [{ id: 'e0', effectId: 'heroism-1', appliedBy: 'someone' }];
    const { updates, getState, sendUpdate, appendLog } = makeStubs(hp, existing);
    applyTreatWounds({ healer, target, dc: 15, degree: 'criticalSuccess', amount: 5, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });

    const effUpdate = updates.find((u) => u.key === 'effects');
    expect(effUpdate.value).toHaveLength(2);
    expect(effUpdate.value[1].effectId).toBe(IMMUNITY_EFFECT_ID);
  });
});

describe('applyTreatWounds — criticalFailure', () => {
  it('deals damage to target and does NOT apply immunity', () => {
    const hp = { current: 30, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { updates, logs, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyTreatWounds({ healer, target, dc: 40, degree: 'criticalFailure', amount: 5, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(25);

    const effUpdate = updates.find((u) => u.key === 'effects');
    expect(effUpdate).toBeUndefined();

    expect(logs[0].text).toMatch(/Critical Failure/);
    expect(logs[0].text).toMatch(/5 damage/);
  });

  it('clamps HP at 0 on critical failure', () => {
    const hp = { current: 3, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { updates, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyTreatWounds({ healer, target, dc: 15, degree: 'criticalFailure', amount: 10, actionName: 'Treat Wounds', getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(0);
  });
});
