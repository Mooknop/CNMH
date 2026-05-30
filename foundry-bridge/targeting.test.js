// Targeting handler unit tests — cnmh_action → resolve entryIds → set Foundry
// user targets; off-guard annotation for flanking melee strikes.
// Version-independent (all Foundry access goes through the adapter).

import { handleAction } from './targeting.js';
import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { updateActorMap } from './encounter.js';
import { makeCombat, makeCombatant, makeToken } from './test/foundryMock.js';

const G = 100;
function tok(id, col, row) { return makeToken({ id, x: col * G, y: row * G }); }

// Active combat with two combatants, each tied to a placed token.
function setupCombat() {
  const tokPellias = makeToken({ id: 'tok-pellias' });
  const tokGoblin  = makeToken({ id: 'tok-goblin' });
  const combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-goblin',  actorId: null, tokenId: 'tok-goblin' }),
    ],
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokPellias, tokGoblin];
  updateActorMap({ 'actor-pellias': 'Pellias' });
  return { combat };
}

describe('handleAction — targeting', () => {
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

describe('handleAction — off-guard annotation', () => {
  beforeEach(() => { global.canvas.tokens.placeables = []; updateActorMap({}); });

  test('offGuard is true for flanked enemy when attacker is a flanker', () => {
    // Pellias left (4,5), Ashka right (6,5), goblin center (5,5) → flanked.
    const tokPellias = tok('tok-pellias', 4, 5);
    const tokAshka   = tok('tok-ashka',   6, 5);
    const tokGoblin  = tok('tok-goblin',  5, 5);
    global.canvas.tokens.placeables = [tokPellias, tokAshka, tokGoblin];
    updateActorMap({ 'actor-pellias': 'Pellias', 'actor-ashka': 'Ashka' });

    const combat = makeCombat({ combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-ashka',   actorId: 'actor-ashka',   tokenId: 'tok-ashka' }),
      makeCombatant({ id: 'cbt-goblin',  actorId: null,            tokenId: 'tok-goblin' }),
    ]});
    global.game.combat = combat;

    initFlankingPush(jest.fn());
    pushFlankedState();

    const result = handleAction('Pellias', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(true);
  });

  test('offGuard is false when attacker is not a flanker', () => {
    const tokPellias = tok('tok-pellias', 4, 5);
    const tokAshka   = tok('tok-ashka',   6, 5);
    const tokGoblin  = tok('tok-goblin',  5, 5);
    global.canvas.tokens.placeables = [tokPellias, tokAshka, tokGoblin];
    updateActorMap({ 'actor-pellias': 'Pellias', 'actor-ashka': 'Ashka' });

    const combat = makeCombat({ combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-ashka',   actorId: 'actor-ashka',   tokenId: 'tok-ashka' }),
      makeCombatant({ id: 'cbt-goblin',  actorId: null,            tokenId: 'tok-goblin' }),
    ]});
    global.game.combat = combat;

    initFlankingPush(jest.fn());
    pushFlankedState();

    // Izzy is not a flanker (not in the combat).
    const result = handleAction('IzzyUncut', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(false);
  });

  test('offGuard is always false for non-melee kinds (ranged/spell)', () => {
    setupCombat();
    const result = handleAction('Pellias', { kind: 'spell', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(false);
  });
});
