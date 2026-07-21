// Native NPC spellcasting (#1531 S4): entry.cast routing, heighten rank,
// and the ok:false nack paths.

import { initCasts, handleCastRequest } from './casts.js';
import { RELAY } from './syncKeys.js';
import {
  makeActor, makeCombat, makeCombatant, makeSpellcastingEntry, makeSpellItem,
} from './test/foundryMock.js';

const lastAck = (send) => {
  const call = send.mock.calls.filter((c) => c[1] === RELAY.CASTDONE).at(-1);
  return call ? call[2] : null;
};

function castWorld(send) {
  initCasts(send);
  const fear = makeSpellItem({ id: 'sp-fear', name: 'Fear', rank: 1 });
  const entry = makeSpellcastingEntry({ id: 'sce-1', spells: [fear] });
  const goblin = makeActor({ id: 'actor-gob', name: 'Goblin Warrior', spellcasting: [entry] });
  global.game.combat = makeCombat({
    combatants: [makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', actor: goblin })],
  });
  return { entry, fear };
}

describe('cast rail (#1531 S4)', () => {
  test('casts the resolved spell through its entry and acks name/rank', async () => {
    const send = jest.fn();
    const { entry, fear } = castWorld(send);

    await handleCastRequest({ id: 'c1', entryId: 'cbt-gob', entryItemId: 'sce-1', spellId: 'sp-fear', ts: 1 });

    expect(entry.cast).toHaveBeenCalledWith(fear, {});
    expect(lastAck(send)).toEqual(expect.objectContaining({
      id: 'c1', ok: true, name: 'Fear', rank: 1,
    }));
  });

  test('a provided rank heightens the cast', async () => {
    const send = jest.fn();
    const { entry } = castWorld(send);
    await handleCastRequest({ id: 'c2', entryId: 'cbt-gob', entryItemId: 'sce-1', spellId: 'sp-fear', rank: 3, ts: 1 });
    expect(entry.cast).toHaveBeenCalledWith(expect.objectContaining({ id: 'sp-fear' }), { rank: 3 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ ok: true, rank: 3 }));
  });

  test('nacks: unknown combatant, unknown entry, unknown spell, throwing cast', async () => {
    const send = jest.fn();
    const { entry } = castWorld(send);

    await handleCastRequest({ id: 'n1', entryId: 'cbt-ghost', entryItemId: 'sce-1', spellId: 'sp-fear', ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n1', ok: false }));

    await handleCastRequest({ id: 'n2', entryId: 'cbt-gob', entryItemId: 'sce-nope', spellId: 'sp-fear', ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n2', ok: false }));

    await handleCastRequest({ id: 'n3', entryId: 'cbt-gob', entryItemId: 'sce-1', spellId: 'sp-nope', ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n3', ok: false }));

    entry.cast.mockRejectedValueOnce(new Error('boom'));
    await handleCastRequest({ id: 'n4', entryId: 'cbt-gob', entryItemId: 'sce-1', spellId: 'sp-fear', ts: 1 });
    expect(lastAck(send)).toEqual(expect.objectContaining({ id: 'n4', ok: false }));
  });

  test('a request with no id is dropped silently', async () => {
    const send = jest.fn();
    castWorld(send);
    await handleCastRequest({ entryId: 'cbt-gob', entryItemId: 'sce-1', spellId: 'sp-fear', ts: 1 });
    expect(lastAck(send)).toBeNull();
  });
});
