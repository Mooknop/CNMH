// Guards the shipped registry from the bridge's own suite so a bad edit is
// caught even when only test:bridge runs (the file ships inside the Foundry
// module, so the bridge suite must stand alone).
import { GLOBAL_ID, RELAY, syncKey, globalKey } from './syncKeys.js';

const KEY_SHAPE = /^cnmh_([^_]+)_(.+)$/;

describe('syncKeys registry', () => {
  test('every relay type is a single lowercase token with no underscores', () => {
    for (const type of Object.values(RELAY)) {
      expect(type).toMatch(/^[a-z0-9]+$/);
    }
  });

  test('relay type values are unique', () => {
    const values = Object.values(RELAY);
    expect(new Set(values).size).toBe(values.length);
  });

  test('syncKey/globalKey compose parseable keys', () => {
    expect(syncKey(RELAY.MOVEOPTS, 'char-1')).toBe('cnmh_moveopts_char-1');
    const match = globalKey(RELAY.ROSTER).match(KEY_SHAPE);
    expect(match[1]).toBe(RELAY.ROSTER);
    expect(match[2]).toBe(GLOBAL_ID);
  });
});
