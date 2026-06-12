// UseAbilityModal — persistent-damage recording (#272).
// Confirming an AC attack whose damage carries persistent riders writes the
// per-target instances into cnmh_persistent_global; misses record nothing.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();

let mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Ashka' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
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
    addSaveRequest: vi.fn(),
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

// Key-aware synced-state mock: capture the cnmh_persistent_global setter so
// the tests can apply its functional updater and inspect the recorded map.
const syncedMock = vi.hoisted(() => ({ persistentSetter: null }));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (key === 'cnmh_persistent_global') {
      syncedMock.persistentSetter = syncedMock.persistentSetter || vi.fn();
      return [{}, syncedMock.persistentSetter];
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

const shardStrike = {
  name: 'Shard Strike',
  type: 'melee',
  traits: ['Attack', 'Melee'],
  attackMod: 10,
  damage: '2d6+4',
  targetDefense: 'ac',
  riders: [{
    id: 'shard-bleed', label: 'Shard bleed',
    persistent: { dice: '1d6', type: 'bleed' }, defaultOn: true,
  }],
};

const character = { id: 'char-a', name: 'Ashka', abilities: { constitution: 16 } };

const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

const enterD20 = (v) =>
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: String(v) } });
const enterDamage = (v) =>
  fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: String(v) } });
const confirm = () => fireEvent.click(screen.getByLabelText('confirm-cast'));

// The setter receives a functional updater — apply it to the prior map.
const recordedMap = (prior = {}) => {
  const calls = syncedMock.persistentSetter.mock.calls;
  return calls.reduce((map, [updater]) => updater(map), prior);
};

beforeEach(() => {
  vi.clearAllMocks();
  syncedMock.persistentSetter = null;
  mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };
});

describe('UseAbilityModal — persistent-damage recording (#272)', () => {
  it('hit records the per-target instance with dice, type, and source', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterD20(10); // 15 vs AC 15 → Hit
    enterDamage(9);
    confirm();
    const map = recordedMap();
    expect(map['e-gob']).toHaveLength(1);
    expect(map['e-gob'][0]).toMatchObject({
      dice: '1d6',
      type: 'bleed',
      sourceName: 'Shard Strike',
    });
    expect(map['e-gob'][0].id).toMatch(/^pd-/);
  });

  it('crit records the doubled persistent dice', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterD20(20); // nat 20 → Critical Hit
    enterDamage(9);
    confirm();
    const map = recordedMap();
    expect(map['e-gob'][0].dice).toBe('2d6');
  });

  it('miss records nothing', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterD20(5); // 10 < AC 15 → Miss
    confirm();
    expect(syncedMock.persistentSetter).not.toHaveBeenCalled();
  });

  it('accumulates onto existing instances for the same target', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterD20(10);
    enterDamage(9);
    confirm();
    const prior = { 'e-gob': [{ id: 'pd-old', dice: '1d4', type: 'fire', sourceName: 'Earlier' }] };
    const map = recordedMap(prior);
    expect(map['e-gob']).toHaveLength(2);
    expect(map['e-gob'][0].id).toBe('pd-old');
  });
});
