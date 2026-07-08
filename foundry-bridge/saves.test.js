// Save-roll handler unit tests (#1275) — cnmh_saveroll_global → resolve
// entryIds → roll each actor's save statistic (PF2e Statistic#roll, live
// modifiers) → ack d20 + total on cnmh_savedone_global. Degrees are the app's
// concern (computeSaveDegree).

import { initSaves, handleSaveRoll } from './saves.js';
import { makeCombat, makeCombatant, makeToken, makeActor } from './test/foundryMock.js';

// A PF2e save Statistic whose roll resolves to a fixed d20/total.
const makeSaveStatistic = ({ d20, total }) => ({
  roll: jest.fn().mockResolvedValue({ total, dice: [{ total: d20 }] }),
});

function setupCombat({ goblinSaves, trollSaves } = {}) {
  const goblin = makeActor({ id: 'actor-gob', name: 'Goblin Warrior', saves: goblinSaves ?? null });
  const troll  = makeActor({ id: 'actor-troll', name: 'Troll', saves: trollSaves ?? null });
  const tokG   = makeToken({ id: 'tok-gob',   actor: goblin });
  const tokT   = makeToken({ id: 'tok-troll', actor: troll });
  const combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-gob',   actorId: 'actor-gob',   tokenId: 'tok-gob' }),
      makeCombatant({ id: 'cbt-troll', actorId: 'actor-troll', tokenId: 'tok-troll' }),
    ],
  });
  global.game.combat = combat;
  global.canvas.tokens.placeables = [tokG, tokT];
  return { goblin, troll };
}

describe('handleSaveRoll', () => {
  let sendUpdate;

  beforeEach(() => {
    sendUpdate = jest.fn();
    initSaves(sendUpdate);
  });

  test('rolls each target save against the DC and acks d20 + total', async () => {
    const { goblin, troll } = setupCombat({
      goblinSaves: { reflex: makeSaveStatistic({ d20: 14, total: 21 }) },
      trollSaves:  { reflex: makeSaveStatistic({ d20: 3, total: 8 }) },
    });

    await handleSaveRoll({
      id: 'savereq-1',
      save: 'reflex',
      dc: 25,
      targets: [
        { entryId: 'cbt-gob',   name: 'Goblin Warrior' },
        { entryId: 'cbt-troll', name: 'Troll' },
      ],
      ts: 1,
    });

    expect(goblin.saves.reflex.roll).toHaveBeenCalledWith({
      dc: { value: 25 },
      skipDialog: true,
      rollMode: 'gmroll',
    });
    expect(troll.saves.reflex.roll).toHaveBeenCalledTimes(1);
    expect(sendUpdate).toHaveBeenCalledWith('global', 'savedone', expect.objectContaining({
      id: 'savereq-1',
      results: [
        { entryId: 'cbt-gob',   name: 'Goblin Warrior', d20: 14, total: 21 },
        { entryId: 'cbt-troll', name: 'Troll',           d20: 3,  total: 8 },
      ],
      failed: [],
    }));
  });

  test('a non-numeric DC rolls without a dc option', async () => {
    const { goblin } = setupCombat({
      goblinSaves: { will: makeSaveStatistic({ d20: 10, total: 15 }) },
    });

    await handleSaveRoll({
      id: 'savereq-2',
      save: 'will',
      dc: null,
      targets: [{ entryId: 'cbt-gob', name: 'Goblin Warrior' }],
    });

    expect(goblin.saves.will.roll).toHaveBeenCalledWith({
      skipDialog: true,
      rollMode: 'gmroll',
    });
  });

  test('unresolvable entryIds land in failed, others still roll', async () => {
    setupCombat({
      goblinSaves: { fortitude: makeSaveStatistic({ d20: 11, total: 19 }) },
    });

    await handleSaveRoll({
      id: 'savereq-3',
      save: 'fortitude',
      dc: 17,
      targets: [
        { entryId: 'cbt-unknown', name: 'Ghost' },
        { entryId: 'cbt-gob',     name: 'Goblin Warrior' },
      ],
    });

    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.results).toEqual([expect.objectContaining({ entryId: 'cbt-gob' })]);
    expect(ack.failed).toEqual([{ entryId: 'cbt-unknown', name: 'Ghost' }]);
  });

  test('an actor without the save statistic fails without throwing', async () => {
    setupCombat({ goblinSaves: {} }); // no reflex statistic

    await handleSaveRoll({
      id: 'savereq-4',
      save: 'reflex',
      dc: 20,
      targets: [{ entryId: 'cbt-gob', name: 'Goblin Warrior' }],
    });

    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.results).toHaveLength(0);
    expect(ack.failed).toEqual([{ entryId: 'cbt-gob', name: 'Goblin Warrior' }]);
  });

  test('a roll throw is caught, failed, and does not stop later targets', async () => {
    const boom = { roll: jest.fn().mockRejectedValue(new Error('boom')) };
    const { troll } = setupCombat({
      goblinSaves: { will: boom },
      trollSaves:  { will: makeSaveStatistic({ d20: 18, total: 23 }) },
    });

    await handleSaveRoll({
      id: 'savereq-5',
      save: 'will',
      dc: 17,
      targets: [
        { entryId: 'cbt-gob',   name: 'Goblin Warrior' },
        { entryId: 'cbt-troll', name: 'Troll' },
      ],
    });

    expect(troll.saves.will.roll).toHaveBeenCalledTimes(1);
    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.failed).toEqual([{ entryId: 'cbt-gob', name: 'Goblin Warrior' }]);
    expect(ack.results).toEqual([expect.objectContaining({ entryId: 'cbt-troll' })]);
  });

  test('does nothing (no ack) for empty targets or an unknown save stat', async () => {
    setupCombat();
    await handleSaveRoll({ id: 'savereq-6', save: 'reflex', dc: 20, targets: [] });
    await handleSaveRoll({ id: 'savereq-7', save: 'charisma', dc: 20, targets: [{ entryId: 'cbt-gob' }] });
    await handleSaveRoll(null);
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  test('no active combat — every target fails, ack still sent', async () => {
    global.game.combat = null;

    await handleSaveRoll({
      id: 'savereq-8',
      save: 'reflex',
      dc: 20,
      targets: [{ entryId: 'cbt-gob', name: 'Goblin Warrior' }],
    });

    const ack = sendUpdate.mock.calls[0][2];
    expect(ack.results).toHaveLength(0);
    expect(ack.failed).toEqual([{ entryId: 'cbt-gob', name: 'Goblin Warrior' }]);
  });
});
