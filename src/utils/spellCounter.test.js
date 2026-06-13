import { hasSpellCounter, makeCounterEntry, registerSpellCounter } from './spellCounter';

describe('hasSpellCounter', () => {
  it('matches a known counter kind', () => {
    expect(hasSpellCounter({ spellState: { kind: 'images', start: 3 } })).toBe(true);
    expect(hasSpellCounter({ spellState: { kind: 'emanation', start: 15 } })).toBe(true);
  });

  it('is false without a (valid) spellState config', () => {
    expect(hasSpellCounter({})).toBe(false);
    expect(hasSpellCounter(null)).toBe(false);
    expect(hasSpellCounter({ spellState: { kind: 'mystery' } })).toBe(false);
    expect(hasSpellCounter({ spellState: 'images' })).toBe(false);
  });
});

describe('makeCounterEntry', () => {
  it('builds a Mirror Image entry that ends at zero', () => {
    const entry = makeCounterEntry({
      ability: { name: 'Mirror Image', spellState: { kind: 'images', start: 3 } },
      round: 2,
    });
    expect(entry).toMatchObject({
      spellName: 'Mirror Image',
      kind: 'images',
      value: 3,
      step: 1,
      unit: 'images',
      min: 0,
      endAtMin: true,
      registeredRound: 2,
    });
    expect(entry.id).toBeTruthy();
  });

  it('builds a Bless emanation entry with grow defaults', () => {
    const entry = makeCounterEntry({
      ability: { name: 'Bless', spellState: { kind: 'emanation', start: 15 } },
    });
    expect(entry).toMatchObject({
      kind: 'emanation', value: 15, step: 10, unit: 'ft', endAtMin: false,
    });
  });

  it('honours explicit step / unit / min overrides', () => {
    const entry = makeCounterEntry({
      ability: { name: 'X', spellState: { kind: 'emanation', start: 20, step: 5, unit: 'm', min: 5 } },
    });
    expect(entry).toMatchObject({ step: 5, unit: 'm', min: 5 });
  });
});

describe('registerSpellCounter', () => {
  const caster = { id: 'Izzy', name: 'Izzy' };
  let store;
  let getState;
  let sendUpdate;

  beforeEach(() => {
    store = {};
    getState = (id, key) => store[`${id}:${key}`];
    sendUpdate = vi.fn((id, key, value) => { store[`${id}:${key}`] = value; });
    window.localStorage.clear();
  });

  it('appends a counter entry and syncs it', () => {
    registerSpellCounter({
      ability: { name: 'Mirror Image', spellState: { kind: 'images', start: 3 } },
      caster, round: 1, getState, sendUpdate,
    });
    expect(sendUpdate).toHaveBeenCalledWith('Izzy', 'spellcounters', expect.any(Array));
    expect(store['Izzy:spellcounters']).toHaveLength(1);
    expect(store['Izzy:spellcounters'][0].value).toBe(3);
    expect(JSON.parse(window.localStorage.getItem('cnmh_spellcounters_Izzy'))).toHaveLength(1);
  });

  it('preserves existing counters', () => {
    store['Izzy:spellcounters'] = [{ id: 'x', spellName: 'Bless' }];
    registerSpellCounter({
      ability: { name: 'Mirror Image', spellState: { kind: 'images', start: 3 } },
      caster, getState, sendUpdate,
    });
    expect(store['Izzy:spellcounters']).toHaveLength(2);
  });

  it('is a no-op for spells without spellState', () => {
    registerSpellCounter({
      ability: { name: 'Fireball' },
      caster, getState, sendUpdate,
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
