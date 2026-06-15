// flankingPush tests: payload shape and push-on-hook behaviour.
//
// Now that the geometry is delegated to the PF2e system (TokenPF2e.isFlanking),
// tests control flanking by setting isFlanking return values on mock tokens
// rather than positioning them geometrically.

import { initFlankingPush, pushFlankedState } from './flankingPush.js';
import { updateActorMap } from './encounter.js';
import { makeCombat, makeCombatant, makeToken, makeActor, makeGame } from './test/foundryMock.js';

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

// Minion flanking (#362): a companion participates as a flanker (keyed by its own
// `<owner>-companion` id); a familiar never flanks and is never treated as an enemy.
describe('pushFlankedState — minions', () => {
  const OWNED = { gm: 3, player1: 3 };

  // Ashka (PC), her companion Zevira (player-owned NPC), her familiar Lazarus, and
  // a goblin. Build the full game world so getMinionActorLinks can derive the links.
  function setupMinionCombat({ companionFlanks = true, familiarFlanks = true } = {}) {
    send = jest.fn();
    const ashka = makeActor({
      id: 'actor-ashka', name: 'Ashka', type: 'character',
      hasPlayerOwner: true, ownership: OWNED,
    });
    const zevira = makeActor({
      id: 'actor-zev', name: 'Zevira', type: 'npc',
      hasPlayerOwner: true, ownership: OWNED,
    });
    const lazarus = makeActor({
      id: 'actor-laz', name: 'Lazarus', type: 'familiar',
      hasPlayerOwner: true, ownership: OWNED,
    });
    global.game = makeGame({
      actors: [ashka, zevira, lazarus],
      users: [{ id: 'gm', isGM: true }, { id: 'player1', isGM: false }],
    });

    const tokGoblin = makeToken({ id: 'tok-goblin' });
    const tokAshka  = makeToken({ id: 'tok-ashka',  isFlanking: true });
    const tokZev    = makeToken({ id: 'tok-zev',    isFlanking: companionFlanks });
    const tokLaz    = makeToken({ id: 'tok-laz',    isFlanking: familiarFlanks });

    const combatants = [
      makeCombatant({ id: 'cbt-ashka',  actorId: 'actor-ashka', tokenId: 'tok-ashka' }),
      makeCombatant({ id: 'cbt-zev',    actorId: 'actor-zev',   tokenId: 'tok-zev' }),
      makeCombatant({ id: 'cbt-laz',    actorId: 'actor-laz',   tokenId: 'tok-laz' }),
      makeCombatant({ id: 'cbt-goblin', actorId: null,          tokenId: 'tok-goblin' }),
    ];
    global.canvas.tokens.placeables = [tokGoblin, tokAshka, tokZev, tokLaz];
    global.game.combat = makeCombat({ combatants });
    updateActorMap({ 'actor-ashka': 'Ashka' });
    initFlankingPush(send);
    return { tokGoblin, tokZev, tokLaz };
  }

  it('lists the companion as a flanker under its <owner>-companion id', () => {
    setupMinionCombat({ companionFlanks: true });
    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    expect(payload['cbt-goblin'].byCharIds.sort()).toEqual(['Ashka', 'Ashka-companion']);
  });

  it('never treats the companion/familiar combatants as flankable enemies', () => {
    setupMinionCombat();
    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    // Only the goblin is an enemy; the ally combatants are not keys in the map.
    expect(Object.keys(payload)).toEqual(['cbt-goblin']);
  });

  it('excludes the familiar from flankers even when it is geometrically flanking', () => {
    setupMinionCombat({ companionFlanks: false, familiarFlanks: true });
    pushFlankedState();

    const [[, , payload]] = send.mock.calls;
    // Ashka still flanks; the familiar id is never added despite isFlanking=true.
    expect(payload['cbt-goblin'].byCharIds).toEqual(['Ashka']);
    expect(payload['cbt-goblin'].byCharIds).not.toContain('Ashka-familiar');
  });
});
