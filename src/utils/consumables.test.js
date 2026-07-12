import {
  consumableMeta,
  consumableSave,
  consumableVerb,
  hasGodlessHealing,
  applyHealing,
  applyHealingConsumable,
  applyEffectConsumable,
} from './consumables';

// ── consumableMeta ───────────────────────────────────────────────────────────

describe('consumableMeta', () => {
  it('returns the block for valid kinds', () => {
    const meta = { kind: 'healing', note: '1d8 HP' };
    expect(consumableMeta({ consumable: meta })).toBe(meta);
    expect(consumableMeta({ consumable: { kind: 'effect', effectId: 'x' } })).not.toBeNull();
  });

  it('returns null for missing or malformed metadata', () => {
    expect(consumableMeta({})).toBeNull();
    expect(consumableMeta(null)).toBeNull();
    expect(consumableMeta({ consumable: { kind: 'banana' } })).toBeNull();
    expect(consumableMeta({ scroll: { name: 'Heal' } })).toBeNull(); // scrolls cast via spell flow
  });

  it('recognizes the save kind (#1085)', () => {
    const save = { defense: 'fortitude', dc: 23 };
    expect(consumableMeta({ consumable: { kind: 'save', save } })).not.toBeNull();
  });
});

// ── consumableSave ───────────────────────────────────────────────────────────

describe('consumableSave', () => {
  it('returns the save block only for a save-kind consumable', () => {
    const save = { defense: 'fortitude', dc: 23 };
    expect(consumableSave({ consumable: { kind: 'save', save } })).toBe(save);
    expect(consumableSave({ consumable: { kind: 'healing' } })).toBeNull();
    expect(consumableSave({ consumable: { kind: 'effect', effectId: 'x' } })).toBeNull();
    expect(consumableSave(null)).toBeNull();
  });
});

// ── consumableVerb ───────────────────────────────────────────────────────────

describe('consumableVerb', () => {
  it('Drink for potions, elixirs, and mutagens (case-insensitive)', () => {
    expect(consumableVerb({ traits: ['Consumable', 'Potion'] })).toBe('Drink');
    expect(consumableVerb({ traits: ['elixir'] })).toBe('Drink');
    expect(consumableVerb({ traits: ['Alchemical', 'Mutagen'] })).toBe('Drink');
  });

  it('Apply for oils', () => {
    expect(consumableVerb({ traits: ['Oil', 'Magical'] })).toBe('Apply');
  });

  it('Use otherwise (talismans, no traits)', () => {
    expect(consumableVerb({ traits: ['Talisman'] })).toBe('Use');
    expect(consumableVerb({})).toBe('Use');
  });
});

// ── hasGodlessHealing ────────────────────────────────────────────────────────

describe('hasGodlessHealing', () => {
  it('detects the feat by name', () => {
    expect(hasGodlessHealing({ feats: [{ name: 'Godless Healing' }] })).toBe(true);
  });

  it('false without it', () => {
    expect(hasGodlessHealing({ feats: [{ name: 'Toughness' }] })).toBe(false);
    expect(hasGodlessHealing({})).toBe(false);
    expect(hasGodlessHealing(null)).toBe(false);
  });
});

// ── apply functions ──────────────────────────────────────────────────────────

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

const user = { id: 'c1', name: 'Blu', maxHp: 30 };

describe('applyHealingConsumable', () => {
  it('heals, clamps to max, and logs', () => {
    const hp = { current: 10, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { updates, logs, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyHealingConsumable({ user, itemName: 'Minor Healing Potion', amount: 7, getState, sendUpdate, appendLog });

    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.current).toBe(17);
    expect(logs[0]).toMatchObject({ type: 'action', charId: 'c1' });
    expect(logs[0].text).toMatch(/Minor Healing Potion/);
    expect(logs[0].text).toMatch(/7/);
  });

  it('caps healing at max HP', () => {
    const hp = { current: 28, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 };
    const { updates, getState, sendUpdate, appendLog } = makeStubs(hp);
    applyHealingConsumable({ user, itemName: 'Elixir of Life', amount: 10, getState, sendUpdate, appendLog });
    expect(updates.find((u) => u.key === 'hp').value.current).toBe(30);
  });

  it('seeds HP from user.maxHp when nothing is stored', () => {
    const { updates, getState, sendUpdate, appendLog } = makeStubs();
    applyHealingConsumable({ user, itemName: 'Elixir of Life', amount: 5, getState, sendUpdate, appendLog });
    const hpUpdate = updates.find((u) => u.key === 'hp');
    expect(hpUpdate.value.max).toBe(30);
    expect(hpUpdate.value.current).toBe(30); // seeded full, capped
  });
});

describe('applyEffectConsumable', () => {
  const meta = { kind: 'effect', effectId: 'drakeheart-mutagen', durationMinutes: 10 };

  it('appends the catalog effect with a clock expiry and logs', () => {
    const NOW = 500_000;
    const existing = [{ id: 'e0', effectId: 'heroism' }];
    const { updates, logs, getState, sendUpdate, appendLog } = makeStubs(null, existing);
    applyEffectConsumable({ user, itemName: 'Drakeheart Mutagen', meta, nowSecs: NOW, getState, sendUpdate, appendLog });

    const effUpdate = updates.find((u) => u.key === 'effects');
    expect(effUpdate.value).toHaveLength(2);
    const entry = effUpdate.value[1];
    expect(entry.effectId).toBe('drakeheart-mutagen');
    expect(entry.appliedBy).toBe('c1');
    expect(entry.source).toBe('Drakeheart Mutagen');
    expect(entry.expireAtSecs).toBe(NOW + 600);
    expect(logs[0].text).toMatch(/Drakeheart Mutagen/);
    expect(logs[0].text).toMatch(/10 min/);
  });

  it('omits expireAtSecs without a duration (until removed)', () => {
    const { updates, getState, sendUpdate, appendLog } = makeStubs();
    applyEffectConsumable({
      user, itemName: 'Oil of Potency', meta: { kind: 'effect', effectId: 'oil-of-potency' },
      nowSecs: 500, getState, sendUpdate, appendLog,
    });
    expect(updates.find((u) => u.key === 'effects').value[0]).not.toHaveProperty('expireAtSecs');
  });

  it('omits expireAtSecs when nowSecs is not supplied', () => {
    const { updates, getState, sendUpdate, appendLog } = makeStubs();
    applyEffectConsumable({ user, itemName: 'Drakeheart Mutagen', meta, getState, sendUpdate, appendLog });
    expect(updates.find((u) => u.key === 'effects').value[0]).not.toHaveProperty('expireAtSecs');
  });
});

describe('applyHealing (generic, #227)', () => {
  const getState = vi.fn(() => ({ current: 12, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 }));
  const sendUpdate = vi.fn();
  const appendLog = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('heals clamped to max with a custom log line', () => {
    applyHealing({
      target: { id: 'JadeInferno', name: 'Jade', maxHp: 30 },
      amount: 25,
      getState, sendUpdate, appendLog,
      logText: 'Jade healed 25 HP (Harrow Casting — Shields)',
    });
    expect(sendUpdate).toHaveBeenCalledWith('JadeInferno', 'hp', expect.objectContaining({ current: 30 }));
    expect(appendLog).toHaveBeenCalledWith({
      type: 'action', charId: 'JadeInferno',
      text: 'Jade healed 25 HP (Harrow Casting — Shields)',
    });
  });

  it('defaults the log line when none is given', () => {
    applyHealing({
      target: { id: 'JadeInferno', name: 'Jade', maxHp: 30 },
      amount: 5,
      getState, sendUpdate, appendLog,
    });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: 'Jade healed 5 HP' }));
  });
});
