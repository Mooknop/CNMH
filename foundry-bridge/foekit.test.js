// Active-enemy foe kit push (#1531 S1): kit on enemy turns, cleared payload on
// PC turns / combat end, live refresh on the foe's own actor/item updates.

import { initFoeKit, pushFoeKit } from './foekit.js';
import { updateActorMap } from './encounter.js';
import { RELAY } from './syncKeys.js';
import {
  makeActor, makeCombat, makeCombatant,
  makeNpcStrike, makeSpellcastingEntry, makeSpellItem, makeAbilityItem,
} from './test/foundryMock.js';

const lastFoekit = (send) => {
  const call = send.mock.calls.filter((c) => c[1] === RELAY.FOEKIT).at(-1);
  return call ? call[2] : null;
};

function makeGoblin() {
  return makeActor({
    id: 'actor-gob',
    name: 'Goblin Warrior',
    level: 1,
    strikes: [makeNpcStrike({ slug: 'dogslicer', label: 'Dogslicer', totalModifier: 8 })],
    spellcasting: [makeSpellcastingEntry({
      castingType: 'innate',
      spells: [makeSpellItem({ name: 'Fear', rank: 1, uses: { value: 1, max: 1 } })],
    })],
    abilities: [makeAbilityItem({ name: 'Goblin Scuttle', actionType: 'reaction' })],
    skills: { acrobatics: { base: 5 }, stealth: { base: 5 } },
    conditions: [{ slug: 'frightened', value: 2 }],
  });
}

// World with an enemy at index 0 and a mapped PC at index 1.
function enemyTurnWorld(send, { activeTurnIndex = 0 } = {}) {
  updateActorMap({ 'actor-pellias': 'Pellias' });
  initFoeKit(send);
  const goblin = makeGoblin();
  const pc = makeActor({ id: 'actor-pellias', name: 'Pellias' });
  const combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', actor: goblin, initiative: 20 }),
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', actor: pc, initiative: 10 }),
    ],
    activeTurnIndex,
  });
  global.game.combat = combat;
  return { goblin, pc, combat };
}

describe('foekit (#1531)', () => {
  test('createCombat with an active enemy pushes its full kit', () => {
    const send = jest.fn();
    const { combat } = enemyTurnWorld(send);
    global.Hooks.fire('createCombat', combat);

    const payload = lastFoekit(send);
    expect(payload.entryId).toBe('cbt-gob');
    expect(payload.foundryActorId).toBe('actor-gob');
    expect(payload.kit.strikes).toEqual([expect.objectContaining({
      index: 0,
      slug: 'dogslicer',
      label: 'Dogslicer',
      attackModifier: 8,
      variantLabels: ['+9', '+4', '-1'],
      damage: [{ formula: '1d8+4', type: 'piercing' }],
    })]);
    expect(payload.kit.spellcasting[0]).toEqual(expect.objectContaining({
      castingType: 'innate',
      dc: 19,
    }));
    expect(payload.kit.spellcasting[0].spells[0]).toEqual(expect.objectContaining({
      name: 'Fear', rank: 1, uses: { value: 1, max: 1 },
    }));
    expect(payload.kit.abilities[0]).toEqual(expect.objectContaining({
      name: 'Goblin Scuttle', actionType: 'reaction',
    }));
    expect(payload.kit.skills).toEqual([
      { slug: 'acrobatics', mod: 5 },
      { slug: 'stealth', mod: 5 },
    ]);
    // The foe's REAL Foundry conditions ride the kit (#1537 S3).
    expect(payload.kit.conditions).toEqual([{ slug: 'frightened', value: 2 }]);
  });

  test('a PC turn pushes the cleared payload', () => {
    const send = jest.fn();
    const { combat } = enemyTurnWorld(send, { activeTurnIndex: 1 });
    global.Hooks.fire('createCombat', combat);

    expect(lastFoekit(send)).toEqual(expect.objectContaining({
      entryId: null, foundryActorId: null, kit: null,
    }));
  });

  test('turn advancement re-pushes; non-turn combat edits do not', () => {
    const send = jest.fn();
    const { combat } = enemyTurnWorld(send);
    global.Hooks.fire('updateCombat', combat, { initiative: 15 });
    expect(lastFoekit(send)).toBeNull();

    global.Hooks.fire('updateCombat', combat, { turn: 1 });
    expect(lastFoekit(send)).not.toBeNull();
  });

  test('an item update on the active foe refreshes the kit; other actors are ignored', () => {
    const send = jest.fn();
    const { goblin, pc } = enemyTurnWorld(send);

    global.Hooks.fire('updateItem', { parent: pc });
    expect(lastFoekit(send)).toBeNull();

    global.Hooks.fire('updateItem', { parent: goblin });
    expect(lastFoekit(send)?.entryId).toBe('cbt-gob');
  });

  test('updateActor on the active foe refreshes the kit', () => {
    const send = jest.fn();
    const { goblin } = enemyTurnWorld(send);
    global.Hooks.fire('updateActor', goblin);
    expect(lastFoekit(send)?.entryId).toBe('cbt-gob');
  });

  test('deleteCombat clears; pushFoeKit with no combat clears (reconnect path)', () => {
    const send = jest.fn();
    enemyTurnWorld(send);
    global.Hooks.fire('deleteCombat');
    expect(lastFoekit(send)).toEqual(expect.objectContaining({ entryId: null, kit: null }));

    send.mockClear();
    global.game.combat = null;
    pushFoeKit();
    expect(lastFoekit(send)).toEqual(expect.objectContaining({ entryId: null, kit: null }));
  });
});
