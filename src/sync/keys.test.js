import { GLOBAL_ID, RELAY, APP, syncKey, globalKey } from './keys';

// useSyncedState parses keys with this exact regex — the <type> segment must
// never contain an underscore or the parse silently mis-splits.
const KEY_SHAPE = /^cnmh_([^_]+)_(.+)$/;

describe('sync-key registry', () => {
  it('every type token (relay + app) is a single lowercase token with no underscores', () => {
    for (const [name, type] of Object.entries({ ...RELAY, ...APP })) {
      expect(type, name).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('type tokens are unique across the RELAY and APP groups combined', () => {
    const values = [...Object.values(RELAY), ...Object.values(APP)];
    expect(new Set(values).size).toBe(values.length);
  });

  it('syncKey composes keys that useSyncedState can parse back', () => {
    const key = syncKey(RELAY.HP, 'char-1');
    expect(key).toBe('cnmh_hp_char-1');
    const match = key.match(KEY_SHAPE);
    expect(match[1]).toBe(RELAY.HP);
    expect(match[2]).toBe('char-1');
  });

  it('globalKey uses the shared global id', () => {
    expect(globalKey(RELAY.ENCOUNTER)).toBe(`cnmh_encounter_${GLOBAL_ID}`);
    expect(globalKey(APP.PLAYMODE)).toBe('cnmh_playmode_global');
    expect(GLOBAL_ID).toBe('global');
  });

  it('parses round-trip for every type against the global id', () => {
    for (const type of [...Object.values(RELAY), ...Object.values(APP)]) {
      const match = globalKey(type).match(KEY_SHAPE);
      expect(match, type).not.toBeNull();
      expect(match[1]).toBe(type);
      expect(match[2]).toBe(GLOBAL_ID);
    }
  });
});
