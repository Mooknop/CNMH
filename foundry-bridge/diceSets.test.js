// Dice-set styler unit tests (#1490 S7) — cnmh_dicesets_global →
// diceSoNiceRollStart stamps roll.options.appearance by chat-speaker actor:
// mapped PC → their set, unmapped actor → the enemy set, everything else
// (no speaker, unconfigured PC) keeps DSN defaults.

import {
  initDiceSets, updateDiceSets, handleDiceSoNiceRollStart, ENEMY_SET_KEY,
} from './diceSets.js';
import { updateActorMap } from './encounter.js';

const PELLIAS_SET = {
  background: '#c0440e', foreground: '#ffffff', outline: '#000000',
  edge: '#732908', material: 'metal',
};
const ENEMY_SET = { background: '#7a1f1f', foreground: '#f2e6d8', material: 'stone' };

const MESSAGES = {
  'msg-pc': { speaker: { actor: 'actor-pellias' } },
  'msg-npc': { speaker: { actor: 'actor-goblin' } },
  'msg-noactor': { speaker: {} },
};

function makeContext() {
  return { roll: { options: {} }, user: {}, users: [], blind: false };
}

describe('handleDiceSoNiceRollStart', () => {
  beforeEach(() => {
    global.game.messages = { get: (id) => MESSAGES[id] };
    updateActorMap({ 'actor-pellias': 'Pellias' });
    updateDiceSets({ Pellias: PELLIAS_SET, [ENEMY_SET_KEY]: ENEMY_SET });
  });

  afterEach(() => {
    updateActorMap({});
    updateDiceSets({});
  });

  test('a mapped PC speaker gets their configured appearance', () => {
    const ctx = makeContext();
    handleDiceSoNiceRollStart('msg-pc', ctx);
    expect(ctx.roll.options.appearance).toEqual(PELLIAS_SET);
  });

  test('an unmapped actor (NPC) gets the enemy set', () => {
    const ctx = makeContext();
    handleDiceSoNiceRollStart('msg-npc', ctx);
    expect(ctx.roll.options.appearance).toEqual(ENEMY_SET);
  });

  test('a mapped PC WITHOUT a configured set keeps DSN defaults (never enemy)', () => {
    updateDiceSets({ [ENEMY_SET_KEY]: ENEMY_SET });
    const ctx = makeContext();
    handleDiceSoNiceRollStart('msg-pc', ctx);
    expect(ctx.roll.options.appearance).toBeUndefined();
  });

  test('no messageId / no speaker actor → untouched', () => {
    const ctx1 = makeContext();
    handleDiceSoNiceRollStart(null, ctx1);
    expect(ctx1.roll.options.appearance).toBeUndefined();

    const ctx2 = makeContext();
    handleDiceSoNiceRollStart('msg-noactor', ctx2);
    expect(ctx2.roll.options.appearance).toBeUndefined();
  });

  test('sanitizes: unknown fields dropped, empty strings dropped, all-empty entry never stamps', () => {
    updateDiceSets({
      Pellias: { background: '#112233', bogus: 'x', foreground: '   ', material: '' },
      [ENEMY_SET_KEY]: { background: '' },
    });
    const pc = makeContext();
    handleDiceSoNiceRollStart('msg-pc', pc);
    expect(pc.roll.options.appearance).toEqual({ background: '#112233' });

    const npc = makeContext();
    handleDiceSoNiceRollStart('msg-npc', npc);
    expect(npc.roll.options.appearance).toBeUndefined();
  });

  test('initDiceSets registers on the diceSoNiceRollStart hook', () => {
    initDiceSets();
    const ctx = makeContext();
    global.Hooks.fire('diceSoNiceRollStart', 'msg-pc', ctx);
    expect(ctx.roll.options.appearance).toEqual(PELLIAS_SET);
  });
});
