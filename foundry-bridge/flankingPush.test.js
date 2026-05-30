// flankingPush tests: payload shape and push-on-hook behaviour.
// The geometry itself is fully covered in flanking.test.js.

import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { updateActorMap } from './encounter.js';
import { makeCombat, makeCombatant, makeToken } from './test/foundryMock.js';

const G = 100;
function tok(id, col, row) {
  return makeToken({ id, x: col * G, y: row * G });
}

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
    updateActorMap({});
    global.game.combat = null;
    initFlankingPush(send);
    pushFlankedState();
    expect(send).toHaveBeenCalledWith('global', 'flanked', {});
  });

  it('pushes empty map when no PCs in the combat', () => {
    const eToken = tok('tok-goblin', 5, 5);
    setup({ enemyTokens: [{ entryId: 'cbt-goblin', token: eToken }] });
    pushFlankedState();
    expect(send).toHaveBeenCalledWith('global', 'flanked', {});
  });

  it('pushes byCharIds for flanked enemies, keyed by combatantId (entryId)', () => {
    // Pellias left, Ashka right, goblin in the middle.
    const pA = { charId: 'Pellias', token: tok('tok-pellias', 4, 5) };
    const pB = { charId: 'Ashka',   token: tok('tok-ashka',   6, 5) };
    const enemy = { entryId: 'cbt-goblin', token: tok('tok-goblin', 5, 5) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    expect(payload['cbt-goblin'].byCharIds.sort()).toEqual(['Ashka', 'Pellias']);
  });

  it('does not list the enemy under an entryId that is not flanked', () => {
    // Both PCs on the same side.
    const pA = { charId: 'Pellias', token: tok('tok-pellias', 4, 5) };
    const pB = { charId: 'Ashka',   token: tok('tok-ashka',   4, 6) };
    const enemy = { entryId: 'cbt-goblin', token: tok('tok-goblin', 5, 5) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    expect(payload).toEqual({});
  });

  it('re-evaluates when createCombat Foundry hook fires', () => {
    const pA = { charId: 'Pellias', token: tok('tok-pellias', 4, 5) };
    const pB = { charId: 'Ashka',   token: tok('tok-ashka',   6, 5) };
    const enemy = { entryId: 'cbt-goblin', token: tok('tok-goblin', 5, 5) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    global.Hooks.fire('createCombat');

    expect(send).toHaveBeenCalledWith('global', 'flanked', expect.objectContaining({
      'cbt-goblin': expect.any(Object),
    }));
  });

  it('re-evaluates when updateToken Foundry hook fires', () => {
    const pA = { charId: 'Pellias', token: tok('tok-pellias', 4, 5) };
    const pB = { charId: 'Ashka',   token: tok('tok-ashka',   6, 5) };
    const enemy = { entryId: 'cbt-goblin', token: tok('tok-goblin', 5, 5) };
    setup({ pcTokens: [pA, pB], enemyTokens: [enemy] });

    // Simulate Foundry token update hook.
    global.Hooks.fire('updateToken');

    expect(send).toHaveBeenCalledWith('global', 'flanked', expect.objectContaining({
      'cbt-goblin': expect.any(Object),
    }));
  });
});
