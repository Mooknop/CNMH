// secret.js — the relay secret comes from the per-world module setting and
// nowhere else. These tests pin the "unset means unset" contract that both
// callers (bridge connect, token-image upload) refuse to talk to the Worker on.

import { getBridgeSecret, MODULE_ID, SECRET_SETTING } from './secret.js';

function withSetting(value) {
  global.game.settings.get = jest.fn((_mod, key) => (key === SECRET_SETTING ? value : undefined));
}

test('reads the secret from this module\'s setting', () => {
  withSetting('s3cret');

  expect(getBridgeSecret()).toBe('s3cret');
  expect(global.game.settings.get).toHaveBeenCalledWith(MODULE_ID, SECRET_SETTING);
});

test('trims surrounding whitespace from a pasted value', () => {
  withSetting('  s3cret \n');

  expect(getBridgeSecret()).toBe('s3cret');
});

test.each([
  ['unset', undefined],
  ['empty', ''],
  ['whitespace only', '   '],
  ['non-string', 42],
])('returns an empty string when the setting is %s', (_label, value) => {
  withSetting(value);

  expect(getBridgeSecret()).toBe('');
});

test('returns an empty string when the settings registry is not ready', () => {
  global.game.settings.get = jest.fn(() => { throw new Error('not registered'); });

  expect(getBridgeSecret()).toBe('');
});
