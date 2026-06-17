import { isSustainedSpell, makeSustainEntry, registerSustain } from './sustain';

describe('isSustainedSpell', () => {
  it('matches "Sustained" durations case-insensitively', () => {
    expect(isSustainedSpell({ duration: 'Sustained' })).toBe(true);
    expect(isSustainedSpell({ duration: 'Sustained up to 1 minute' })).toBe(true);
    expect(isSustainedSpell({ duration: 'sustained up to 4 rounds' })).toBe(true);
  });

  it('is false for non-sustained or missing durations', () => {
    expect(isSustainedSpell({ duration: '1 minute' })).toBe(false);
    expect(isSustainedSpell({ duration: '' })).toBe(false);
    expect(isSustainedSpell({})).toBe(false);
    expect(isSustainedSpell(null)).toBe(false);
    expect(isSustainedSpell({ duration: { until: 'rounds' } })).toBe(false); // not a string
  });
});

describe('makeSustainEntry', () => {
  it('seeds lastSustainedRound to the cast round so it is not asked the same turn', () => {
    const entry = makeSustainEntry({ ability: { name: 'Bless', duration: 'Sustained' }, round: 2 });
    expect(entry).toMatchObject({
      spellName: 'Bless',
      duration: 'Sustained',
      registeredRound: 2,
      lastSustainedRound: 2,
    });
    expect(entry.id).toBeTruthy();
  });

  it('falls back to a generic name and null round', () => {
    const entry = makeSustainEntry({ ability: {}, round: undefined });
    expect(entry.spellName).toBe('Spell');
    expect(entry.registeredRound).toBeNull();
    expect(entry.lastSustainedRound).toBeNull();
  });

  it('carries an optional heal payload (Hymn of Healing #226), omitted otherwise', () => {
    const heal = { targetId: 'Blu', fastHealing: 4, tempHp: 4 };
    const withHeal = makeSustainEntry({ ability: { name: 'Hymn of Healing', duration: 'sustained' }, round: 1, heal });
    expect(withHeal.heal).toEqual(heal);
    const plain = makeSustainEntry({ ability: { name: 'Bless', duration: 'Sustained' }, round: 1 });
    expect(plain).not.toHaveProperty('heal');
  });

  it('carries an optional foundryAura payload (#455), omitted otherwise', () => {
    const foundryAura = { ref: 'slug:courageous-anthem-aura', casterEntryId: 'cbt-izzy' };
    const withAura = makeSustainEntry({ ability: { name: 'Some Aura', duration: 'sustained' }, round: 1, foundryAura });
    expect(withAura.foundryAura).toEqual(foundryAura);
    const plain = makeSustainEntry({ ability: { name: 'Bless', duration: 'Sustained' }, round: 1 });
    expect(plain).not.toHaveProperty('foundryAura');
  });
});

describe('registerSustain', () => {
  const caster = { id: 'Izzy', name: 'Izzy' };
  let store;
  let getState;
  let sendUpdate;
  let appendLog;

  beforeEach(() => {
    store = {};
    getState = (id, key) => store[`${id}:${key}`];
    sendUpdate = vi.fn((id, key, value) => { store[`${id}:${key}`] = value; });
    appendLog = vi.fn();
    window.localStorage.clear();
  });

  it('appends a sustain entry and syncs it', () => {
    registerSustain({
      ability: { name: 'Mirror Image', duration: 'Sustained' },
      caster, round: 1, getState, sendUpdate, appendLog,
    });
    expect(sendUpdate).toHaveBeenCalledWith('Izzy', 'sustains', expect.any(Array));
    const synced = store['Izzy:sustains'];
    expect(synced).toHaveLength(1);
    expect(synced[0].spellName).toBe('Mirror Image');
    expect(JSON.parse(window.localStorage.getItem('cnmh_sustains_Izzy'))).toHaveLength(1);
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Izzy is sustaining Mirror Image' })
    );
  });

  it('preserves existing entries', () => {
    store['Izzy:sustains'] = [{ id: 'x', spellName: 'Bless' }];
    registerSustain({
      ability: { name: 'Summon Undead', duration: 'Sustained up to 1 minute' },
      caster, round: 3, getState, sendUpdate,
    });
    expect(store['Izzy:sustains']).toHaveLength(2);
  });

  it('is a no-op for non-sustained spells', () => {
    registerSustain({
      ability: { name: 'Fireball', duration: 'instantaneous' },
      caster, round: 1, getState, sendUpdate, appendLog,
    });
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('is a no-op without a caster id', () => {
    registerSustain({
      ability: { name: 'Bless', duration: 'Sustained' },
      caster: {}, round: 1, getState, sendUpdate,
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
