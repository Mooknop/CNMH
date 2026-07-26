// readThrough (#1649, #1671) — the session cache is the authority, localStorage
// is only the fallback for NOOP_SESSION and the offline sandbox.

import { readThrough, readThroughList, readLocal } from './syncedRead';

const absent = () => undefined;

beforeEach(() => localStorage.clear());

describe('readThrough', () => {
  it('prefers the session cache over localStorage', () => {
    localStorage.setItem('cnmh_stance_Pellias', JSON.stringify({ active: false }));
    const getState = () => ({ active: true, name: 'Dragon Stance' });
    expect(readThrough(getState, 'Pellias', 'stance')).toMatchObject({ active: true });
  });

  it('returns a cached value that never reached localStorage — the #1671 case', () => {
    const getState = () => ({ active: true, name: 'Dragon Stance' });
    expect(localStorage.getItem('cnmh_stance_Pellias')).toBeNull();
    expect(readThrough(getState, 'Pellias', 'stance')).toMatchObject({ active: true });
  });

  it('falls back to localStorage when the key is absent from the cache', () => {
    localStorage.setItem('cnmh_stance_Pellias', JSON.stringify({ active: true }));
    expect(readThrough(absent, 'Pellias', 'stance')).toMatchObject({ active: true });
  });

  it('treats a cached null as a real value, not an absence', () => {
    localStorage.setItem('cnmh_lingering_Pellias', JSON.stringify({ spellId: 'stale' }));
    expect(readThrough(() => null, 'Pellias', 'lingering')).toBeNull();
  });

  it('is undefined when neither source has the key', () => {
    expect(readThrough(absent, 'Pellias', 'stance')).toBeUndefined();
  });

  it('throws rather than silently degrading when getState is missing', () => {
    expect(() => readThrough(undefined, 'Pellias', 'stance')).toThrow(TypeError);
  });
});

describe('readThroughList', () => {
  it('returns the cached list', () => {
    expect(readThroughList(() => [{ id: 's1' }], 'Pellias', 'sustains')).toHaveLength(1);
  });

  it('coerces a non-list — cached or stored — to empty', () => {
    expect(readThroughList(() => ({ nope: true }), 'Pellias', 'sustains')).toEqual([]);
    expect(readThroughList(absent, 'Pellias', 'sustains')).toEqual([]);
  });
});

describe('readLocal', () => {
  it('distinguishes an absent key (undefined) from a stored null', () => {
    expect(readLocal('cnmh_lingering_Pellias')).toBeUndefined();
    localStorage.setItem('cnmh_lingering_Pellias', JSON.stringify(null));
    expect(readLocal('cnmh_lingering_Pellias')).toBeNull();
  });

  it('is undefined on unparseable JSON', () => {
    localStorage.setItem('cnmh_stance_Pellias', '{not json');
    expect(readLocal('cnmh_stance_Pellias')).toBeUndefined();
  });
});
