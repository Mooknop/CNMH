// UseAbilityModal — whetstone on-hit riders (#1215).
// A strike carrying `whetstoneOnHit` (stamped by the whetstone strike
// alterations) fires its confirm-time automations off successful results:
// Leeching Fangs heals half the damage dealt, Analysis Eye reveals one
// weakness/resistance, Limning Gem applies the limned marker + note.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockAddSaveRequest = vi.fn();

let mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Ashka' },
  {
    entryId: 'e-gob', kind: 'enemy', name: 'Goblin',
    defenses: { ac: 15, saves: { fortitude: 8, reflex: 9, will: 7 }, weaknesses: [{ type: 'fire', value: 5 }] },
  },
];

const session = vi.hoisted(() => ({ sendUpdate: null }));
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn((charId, key) =>
      key === 'hp'
        ? { current: 20, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0 }
        : null),
    sendUpdate: session.sendUpdate,
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Ashka' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: enemyOrder, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
    removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(),
    spendReaction: vi.fn(),
    recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob'],
    selectable: enemyOrder,
    isTargeted: (id) => id === 'e-gob',
    toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({ exploitFor: () => null }),
}));

// Key-aware synced-state mock: capture the enemy-fx and knowledge setters so
// the tests can apply their functional updaters and inspect the writes.
const syncedMock = vi.hoisted(() => ({ enemyFxSetter: null, knowledgeSetter: null }));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (key === 'cnmh_enemyfx_global') {
      syncedMock.enemyFxSetter = syncedMock.enemyFxSetter || vi.fn();
      return [{}, syncedMock.enemyFxSetter];
    }
    if (key === 'cnmh_knowledge_global') {
      syncedMock.knowledgeSetter = syncedMock.knowledgeSetter || vi.fn();
      return [{}, syncedMock.knowledgeSetter];
    }
    return [[], vi.fn()];
  },
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => mockRollProfile,
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const strikeWith = (whetstoneOnHit) => ({
  name: 'Longsword Strike',
  type: 'melee',
  traits: ['Attack', 'Melee'],
  attackMod: 10,
  damage: '2d6+4',
  damageType: 'slashing',
  targetDefense: 'ac',
  whetstoneOnHit,
});

const character = { id: 'char-a', name: 'Ashka', maxHp: 50, abilities: { strength: 16 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

const enterD20 = (v) =>
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: String(v) } });
const enterDamage = (v) =>
  fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: String(v) } });
const confirm = () => fireEvent.click(screen.getByLabelText('confirm-cast'));

const applied = (setter, prior = {}) =>
  (setter?.mock.calls || []).reduce((acc, [updater]) =>
    (typeof updater === 'function' ? updater(acc) : updater), prior);

beforeEach(() => {
  vi.clearAllMocks();
  syncedMock.enemyFxSetter = null;
  syncedMock.knowledgeSetter = null;
  session.sendUpdate = vi.fn();
  mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };
});

describe('UseAbilityModal — whetstone on-hit riders (#1215)', () => {
  it('Leeching Fangs: heals the wielder half the damage dealt on a hit', () => {
    render(<UseAbilityModal {...props} ability={strikeWith({ healHalf: true, itemName: 'Leeching Fangs' })} />);
    enterD20(10); // 15 vs AC 15 → Hit
    enterDamage(9);
    confirm();
    expect(session.sendUpdate).toHaveBeenCalledWith(
      'char-a', 'hp', expect.objectContaining({ current: 24 }) // 20 + floor(9/2)
    );
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Leeching Fangs: Ashka heals 4 HP'),
    }));
  });

  it('Analysis Eye: reveals one weakness on the creature RK record + announces', () => {
    render(<UseAbilityModal {...props} ability={strikeWith({ revealIwr: true, itemName: 'Analysis Eye' })} />);
    enterD20(10);
    enterDamage(9);
    confirm();
    const knowledge = applied(syncedMock.knowledgeSetter);
    expect(knowledge['e-gob'].weaknessesRevealed).toEqual({ fire: true });
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: "Analysis Eye: Goblin's weakness to fire is revealed!",
    }));
  });

  it('Limning Gem: applies the limned marker to the target and logs the note', () => {
    render(<UseAbilityModal {...props} ability={strikeWith({
      condition: 'limned', note: 'Outlined until the end of your next turn.', itemName: 'Limning Gem',
    })} />);
    enterD20(10);
    enterDamage(9);
    confirm();
    const fx = applied(syncedMock.enemyFxSetter);
    expect(fx['e-gob'].conditions[0]).toMatchObject({ id: 'limned', source: 'Limning Gem' });
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Limning Gem: Goblin is limned',
    }));
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Limning Gem: Outlined until the end of your next turn.',
    }));
  });

  it('Chroma Kaleidoscope: a critical Strike pushes a Will save request vs the higher DC with the condition ladder', () => {
    const ladder = {
      success: [{ id: 'dazzled', note: '1 round' }],
      failure: [{ id: 'blinded', note: '1 round, then dazzled 1 round' }],
      criticalFailure: [{ id: 'stunned', value: 1 }],
    };
    const chroma = {
      ...strikeWith(undefined),
      whetstoneOnCrit: { save: 'will', dcFrom: 'classOrSpellDC', conditions: ladder, itemName: 'Chroma Kaleidoscope' },
    };
    // class DC beats spell DC for this fighter: 10 + key mod (str 16 → +3) + prof.
    const fighter = {
      ...character,
      class: 'fighter',
      level: 8,
      fighter: { class_dc: 26 },
    };
    render(<UseAbilityModal {...props} character={fighter} ability={chroma} />);
    enterD20(20); // nat 20 → Critical Hit
    enterDamage(9);
    confirm();
    expect(mockAddSaveRequest).toHaveBeenCalledTimes(1);
    expect(mockAddSaveRequest).toHaveBeenCalledWith(expect.objectContaining({
      abilityName: 'Chroma Kaleidoscope',
      save: 'will',
      dc: 26,
      basic: false,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 7 }],
      conditions: ladder,
    }));
  });

  it('Chroma Kaleidoscope: a plain hit pushes no save request', () => {
    const chroma = {
      ...strikeWith(undefined),
      whetstoneOnCrit: { save: 'will', dc: 20, conditions: {}, itemName: 'Chroma Kaleidoscope' },
    };
    render(<UseAbilityModal {...props} ability={chroma} />);
    enterD20(10); // plain hit
    enterDamage(9);
    confirm();
    expect(mockAddSaveRequest).not.toHaveBeenCalled();
  });

  it('Reactive Flash: a reaction Strike pushes the Reflex save request + resolve-first note', () => {
    const flash = {
      ...strikeWith(undefined),
      actions: 'Reaction',
      whetstoneReactionSave: {
        save: 'reflex', dc: 19, itemName: 'Reactive Flash',
        conditions: { failure: [{ id: 'off-guard', scopedToCaster: true, note: 'vs this attack' }] },
      },
    };
    render(<UseAbilityModal {...props} ability={flash} />);
    enterD20(10);
    enterDamage(9);
    confirm();
    expect(mockAddSaveRequest).toHaveBeenCalledWith(expect.objectContaining({
      abilityName: 'Reactive Flash',
      save: 'reflex',
      dc: 19,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 9 }],
    }));
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('resolve the target\'s reflex save (DC 19) BEFORE applying'),
    }));
  });

  it('Reactive Flash: a normal (non-reaction) Strike pushes no save request', () => {
    const flash = {
      ...strikeWith(undefined),
      whetstoneReactionSave: { save: 'reflex', dc: 19, itemName: 'Reactive Flash' },
    };
    render(<UseAbilityModal {...props} ability={flash} />);
    enterD20(10);
    enterDamage(9);
    confirm();
    expect(mockAddSaveRequest).not.toHaveBeenCalled();
  });

  it('a miss fires nothing', () => {
    render(<UseAbilityModal {...props} ability={strikeWith({
      healHalf: true, revealIwr: true, condition: 'limned', itemName: 'Everything Stone',
    })} />);
    enterD20(5); // 10 < AC 15 → Miss
    confirm();
    expect(session.sendUpdate).not.toHaveBeenCalledWith('char-a', 'hp', expect.anything());
    expect(syncedMock.enemyFxSetter).not.toHaveBeenCalled();
    expect(syncedMock.knowledgeSetter).not.toHaveBeenCalled();
  });
});
