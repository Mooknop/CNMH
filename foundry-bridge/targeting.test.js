// Targeting handler unit tests — cnmh_action → resolve entryIds → set Foundry
// user targets, but ONLY for the combatant whose turn it is (#1749 OQ-3);
// off-guard annotation for flanking melee strikes.
// Version-independent (all Foundry access goes through the adapter).

import { handleAction, initTargeting, _resetTargeting } from './targeting.js';
import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { updateActorMap } from './encounter.js';
import { makeActor, makeCombat, makeCombatant, makeToken } from './test/foundryMock.js';

const targets = () => global.game.user.updateTokenTargets;

// Active combat with two combatants, each tied to a placed token. `active`
// picks whose turn it is: 'pellias' (the mapped PC) or 'goblin' (an unmapped
// foe, i.e. the GM dock driving an enemy turn).
function setupCombat({ active = 'pellias' } = {}) {
  const actor = makeActor({ id: 'actor-pellias', name: 'Pellias' });
  const tokPellias = makeToken({ id: 'tok-pellias', actor });
  const tokGoblin  = makeToken({ id: 'tok-goblin' });
  const combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-goblin',  actorId: null, tokenId: 'tok-goblin' }),
    ],
    activeTurnIndex: active === 'goblin' ? 1 : 0,
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokPellias, tokGoblin];
  updateActorMap({ 'actor-pellias': 'Pellias' });
  _resetTargeting();
  return { combat };
}

describe('handleAction — targeting (active combatant)', () => {
  test('resolves entryIds to tokens and sets the user target set', () => {
    setupCombat();
    handleAction('Pellias', { kind: 'strike', sourceUid: null, targets: ['cbt-goblin'], ts: 1 });
    expect(targets()).toHaveBeenCalledWith(['tok-goblin']);
  });

  test('resolves multiple targets, preserving order', () => {
    setupCombat();
    handleAction('Pellias', { targets: ['cbt-goblin', 'cbt-pellias'] });
    expect(targets()).toHaveBeenCalledWith(['tok-goblin', 'tok-pellias']);
  });

  test('drops entryIds that resolve to no token', () => {
    setupCombat();
    handleAction('Pellias', { targets: ['cbt-goblin', 'cbt-unknown'] });
    expect(targets()).toHaveBeenCalledWith(['tok-goblin']);
  });

  test('empty / missing targets clears the target set', () => {
    setupCombat();
    handleAction('Pellias', { targets: [] });
    expect(targets()).toHaveBeenCalledWith([]);
    handleAction('Pellias', {});
    expect(targets()).toHaveBeenLastCalledWith([]);
  });

  test('a foe entryId acting on its own turn writes too (GM dock enemy turn)', () => {
    setupCombat({ active: 'goblin' });
    handleAction('cbt-goblin', { kind: 'strike', targets: ['cbt-pellias'] });
    expect(targets()).toHaveBeenCalledWith(['tok-pellias']);
  });
});

describe('handleAction — the active-combatant gate (#1749 OQ-3)', () => {
  test('a NON-active writer never touches the canvas target set', () => {
    setupCombat({ active: 'goblin' });   // the goblin's turn, Pellias is aiming
    handleAction('Pellias', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(targets()).not.toHaveBeenCalled();
  });

  test('a NON-active writer still gets its resolved array back (app-local preview)', () => {
    setupCombat({ active: 'goblin' });
    const result = handleAction('Pellias', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(result).toHaveLength(1);
    expect(result[0].entryId).toBe('cbt-goblin');
    expect(result[0].token?.id).toBe('tok-goblin');
    expect(targets()).not.toHaveBeenCalled();
  });

  test('an unknown charId never writes, even with a live combat', () => {
    setupCombat();
    handleAction('Nobody', { targets: ['cbt-goblin'] });
    expect(targets()).not.toHaveBeenCalled();
  });

  test('no active combat → no write at all (and no throw)', () => {
    global.game.combat = null;
    _resetTargeting();
    expect(() => handleAction('Pellias', { targets: ['cbt-goblin'] })).not.toThrow();
    expect(targets()).not.toHaveBeenCalled();
  });
});

describe('initTargeting — clear on turn change', () => {
  test('a turn change clears the Foundry target set', () => {
    const { combat } = setupCombat();
    initTargeting();
    handleAction('Pellias', { targets: ['cbt-goblin'] });
    targets().mockClear();

    // The goblin is up now.
    combat.combatant = combat.combatants[1];
    global.Hooks.fire('updateCombat', combat, { turn: 1 }, {});

    expect(targets()).toHaveBeenCalledWith([]);
  });

  test('a same-turn re-push does NOT clear (encounter re-pushes are frequent)', () => {
    const { combat } = setupCombat();
    initTargeting();
    handleAction('Pellias', { targets: ['cbt-goblin'] });
    targets().mockClear();

    global.Hooks.fire('updateCombat', combat, { round: 1 }, {});

    expect(targets()).not.toHaveBeenCalled();
  });

  test('combat ending clears the target set', () => {
    setupCombat();
    initTargeting();
    handleAction('Pellias', { targets: ['cbt-goblin'] });
    targets().mockClear();

    global.game.combat = null;
    global.Hooks.fire('deleteCombat');

    expect(targets()).toHaveBeenCalledWith([]);
  });

  test('after a turn change the NEW active combatant can write', () => {
    const { combat } = setupCombat();
    initTargeting();
    combat.combatant = combat.combatants[1];
    global.Hooks.fire('updateCombat', combat, { turn: 1 }, {});
    targets().mockClear();

    handleAction('cbt-goblin', { targets: ['cbt-pellias'] });
    expect(targets()).toHaveBeenCalledWith(['tok-pellias']);
  });
});

describe('handleAction — off-guard annotation', () => {
  beforeEach(() => { global.canvas.tokens.placeables = []; updateActorMap({}); });

  function setupFlankingCombat({ pelliasIsFlanking = false, ashkaIsFlanking = false } = {}) {
    const tokPellias = makeToken({ id: 'tok-pellias', isFlanking: pelliasIsFlanking });
    const tokAshka   = makeToken({ id: 'tok-ashka',   isFlanking: ashkaIsFlanking });
    const tokGoblin  = makeToken({ id: 'tok-goblin' });
    global.canvas.tokens.placeables = [tokPellias, tokAshka, tokGoblin];
    updateActorMap({ 'actor-pellias': 'Pellias', 'actor-ashka': 'Ashka' });
    global.game.combat = makeCombat({ combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-ashka',   actorId: 'actor-ashka',   tokenId: 'tok-ashka' }),
      makeCombatant({ id: 'cbt-goblin',  actorId: null,            tokenId: 'tok-goblin' }),
    ]});
    _resetTargeting();
    initFlankingPush(jest.fn());
    pushFlankedState();
  }

  test('offGuard is true when PF2e says the attacker is flanking the target', () => {
    setupFlankingCombat({ pelliasIsFlanking: true, ashkaIsFlanking: true });
    const result = handleAction('Pellias', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(true);
  });

  test('offGuard is false when PF2e says the attacker is not flanking', () => {
    setupFlankingCombat({ pelliasIsFlanking: false, ashkaIsFlanking: false });
    const result = handleAction('IzzyUncut', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(false);
  });

  test('offGuard is always false for non-melee kinds (ranged/spell)', () => {
    setupCombat();
    const result = handleAction('Pellias', { kind: 'spell', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(false);
  });

  test('the annotation survives the gate — a non-active flanker still reads offGuard', () => {
    setupFlankingCombat({ pelliasIsFlanking: true, ashkaIsFlanking: true });
    // The goblin is up, so Pellias's aim is app-local only.
    global.game.combat.combatant = global.game.combat.combatants[2];
    const result = handleAction('Pellias', { kind: 'strike', targets: ['cbt-goblin'] });
    expect(result[0].offGuard).toBe(true);
    expect(targets()).not.toHaveBeenCalled();
  });
});
