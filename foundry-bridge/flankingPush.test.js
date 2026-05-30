// flankingPush tests: payload shape and push-on-hook behaviour.
//
// Now that the geometry is delegated to the PF2e system (TokenPF2e.isFlanking),
// tests control flanking by setting isFlanking return values on mock tokens
// rather than positioning them geometrically.

import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { updateActorMap } from './encounter.js';
import { makeCombat, makeCombatant, makeToken } from './test/foundryMock.js';

let send;

// Reset canvas placeables before each test (after setup.js installs fresh globals).
beforeEach(() => {
  global.canvas.tokens.placeables = [];
  updateActorMap({});
});

function setup({ pcTokens = [], enemyTokens = [] } = {}) {
  send = jest.fn();

  const map = {};
  const combatants = [];
  for (const { charId, token } of pcTokens) {
    const actorId = `actor-${charId}`;
    map[actorId] = charId;
    combatants.push(makeCombatant({ id: `cbt-${charId}`, actorId, tokenId: token.id }));
    global.canvas.tokens.placeables.push(token);
  }
  for (const { entryId, token } of enemyTokens) {
    combatants.push(makeCombatant({ id: entryId, actorId: null, tokenId: token.id }));
    global.canvas.tokens.placeables.push(token);
  }
  updateActorMap(map);
  global.game.combat = makeCombat({ combatants });
  initFlankingPush(send);
}

describe('pushFlankedState', () => {
  it('pushes empty map when no combat', () => {
    send = jest.fn();
    global.game.combat = null;
    initFlankingPush(send);
    pushFlankedState();
    expect(send).toHaveBeenCalledWith('global', 'flanked', {});
  });

  it('pushes empty map when no PCs in the combat', () => {
    const eToken = makeToken({ id: 'tok-goblin' });
    setup({ enemyTokens: [{ entryId: 'cbt-goblin', token: eToken }] });
    pushFlankedState();
    expect(send).toHaveBeenCalledWith('global', 'flanked', {});
  });

  it('includes an enemy when the PF2e system says a PC is flanking it', () => {
    const pA = { charId: 'Pellias', token: makeToken({ id: 'tok-pellias', isFlanking: true }) };
    const pB = { charId: 'Ashka',   token: makeToken({ id: 'tok-ashka',   isFlanking: true }) };
    const enemy = { entryId: 'cbt-goblin', token: makeToken({ id: 'tok-goblin' }) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    expect(payload['cbt-goblin'].byCharIds.sort()).toEqual(['Ashka', 'Pellias']);
  });

  it('excludes an enemy when isFlanking returns false for all PCs', () => {
    const pA = { charId: 'Pellias', token: makeToken({ id: 'tok-pellias', isFlanking: false }) };
    const pB = { charId: 'Ashka',   token: makeToken({ id: 'tok-ashka',   isFlanking: false }) };
    const enemy = { entryId: 'cbt-goblin', token: makeToken({ id: 'tok-goblin' }) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    expect(payload).toEqual({});
  });

  it('only lists PCs for which isFlanking returns true', () => {
    // Only Pellias is flanking; Ashka is not.
    const tokGoblin  = makeToken({ id: 'tok-goblin' });
    const tokPellias = makeToken({ id: 'tok-pellias', isFlanking: (t) => t === tokGoblin });
    const tokAshka   = makeToken({ id: 'tok-ashka',   isFlanking: false });
    setup({
      pcTokens:    [{ charId: 'Pellias', token: tokPellias }, { charId: 'Ashka', token: tokAshka }],
      enemyTokens: [{ entryId: 'cbt-goblin', token: tokGoblin }],
    });

    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    expect(payload['cbt-goblin'].byCharIds).toEqual(['Pellias']);
  });

  it('delegates to PF2e: calls isFlanking with the enemy token as argument', () => {
    const tokGoblin  = makeToken({ id: 'tok-goblin' });
    const tokPellias = makeToken({ id: 'tok-pellias', isFlanking: true });
    setup({
      pcTokens:    [{ charId: 'Pellias', token: tokPellias }],
      enemyTokens: [{ entryId: 'cbt-goblin', token: tokGoblin }],
    });

    pushFlankedState();

    expect(tokPellias.isFlanking).toHaveBeenCalledWith(tokGoblin);
  });

  it('re-evaluates when createCombat hook fires', () => {
    const pA = { charId: 'Pellias', token: makeToken({ id: 'tok-pellias', isFlanking: true }) };
    const pB = { charId: 'Ashka',   token: makeToken({ id: 'tok-ashka',   isFlanking: true }) };
    const enemy = { entryId: 'cbt-goblin', token: makeToken({ id: 'tok-goblin' }) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    global.Hooks.fire('createCombat');

    expect(send).toHaveBeenCalledWith('global', 'flanked', expect.objectContaining({
      'cbt-goblin': expect.any(Object),
    }));
  });

  it('re-evaluates when updateToken hook fires', () => {
    const pA = { charId: 'Pellias', token: makeToken({ id: 'tok-pellias', isFlanking: true }) };
    const pB = { charId: 'Ashka',   token: makeToken({ id: 'tok-ashka',   isFlanking: true }) };
    const enemy = { entryId: 'cbt-goblin', token: makeToken({ id: 'tok-goblin' }) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    global.Hooks.fire('updateToken');

    expect(send).toHaveBeenCalledWith('global', 'flanked', expect.objectContaining({
      'cbt-goblin': expect.any(Object),
    }));
  });
});
