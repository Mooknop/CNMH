// Targeting handler unit tests — cnmh_action → resolve entryIds → set Foundry
// user targets. Version-independent (all Foundry access goes through the adapter).

import { handleAction } from './targeting.js';
import { makeCombat, makeCombatant, makeToken } from './test/foundryMock.js';

// Active combat with two combatants, each tied to a placed token.
function setupCombat() {
  const tokPellias = makeToken({ id: 'tok-pellias' });
  const tokGoblin  = makeToken({ id: 'tok-goblin' });
  const combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-goblin',  tokenId: 'tok-goblin' }),
    ],
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokPellias, tokGoblin];
  return { combat };
}

describe('handleAction', () => {
  test('resolves entryIds to tokens and sets the user target set', () => {
    setupCombat();
    handleAction('Pellias', { kind: 'strike', sourceUid: null, targets: ['cbt-goblin'], ts: 1 });
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith(['tok-goblin']);
  });

  test('resolves multiple targets, preserving order', () => {
    setupCombat();
    handleAction('Pellias', { targets: ['cbt-goblin', 'cbt-pellias'] });
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith(['tok-goblin', 'tok-pellias']);
  });

  test('drops entryIds that resolve to no token', () => {
    setupCombat();
    handleAction('Pellias', { targets: ['cbt-goblin', 'cbt-unknown'] });
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith(['tok-goblin']);
  });

  test('empty / missing targets clears the target set', () => {
    setupCombat();
    handleAction('Pellias', { targets: [] });
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith([]);
    handleAction('Pellias', {});
    expect(global.game.user.updateTokenTargets).toHaveBeenLastCalledWith([]);
  });

  test('no active combat → still calls with an empty set (no throw)', () => {
    global.game.combat = null;
    expect(() => handleAction('Pellias', { targets: ['cbt-goblin'] })).not.toThrow();
    expect(global.game.user.updateTokenTargets).toHaveBeenCalledWith([]);
  });
});
