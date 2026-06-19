// UseAbilityModal — off-guard attack toggle (#348).
// An AC-attack target that is off-guard to the acting attacker (scoped via
// Feint) or off-guard generally surfaces an opt-in "Off-guard target +2" toggle
// in the resolver; a target off-guard only to a *different* attacker does not.

import React from 'react';
import { render, screen } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

// Per-test enemy effect record for the goblin target — reassigned before render.
let mockGoblinRecord = { conditions: [], effects: [] };

const enemyOrder = [
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({ useContent: () => ({ characters: [] }) }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: enemyOrder, log: [] },
    appendLog: vi.fn(), addSaveRequest: vi.fn(), removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(), spendReaction: vi.fn(), recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({ useEffects: () => ({ effects: [], removeEffect: vi.fn() }) }));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob'], selectable: enemyOrder, isTargeted: (id) => id === 'e-gob', toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({ optionsFor: () => [], spend: () => ({ label: '' }), slots: { remainingFor: () => 0, spend: vi.fn() } }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({ useExploitVulnerability: () => ({ exploitFor: () => null }) }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: () => [[], vi.fn()] }));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => ({ mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));
// The real offGuardAppliesTo runs; only effectsFor is faked per-test.
vi.mock('../../hooks/useEnemyEffects', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useEnemyEffects: () => ({ stampImmunity: vi.fn(), effectsFor: () => mockGoblinRecord }) };
});

const maceStrike = { name: 'Mace Strike', type: 'melee', traits: ['Attack', 'Melee'], attackMod: 10, damage: '2d6+4', targetDefense: 'ac' };
const character = { id: 'char-a', name: 'Ashka', abilities: { constitution: 16 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

beforeEach(() => { vi.clearAllMocks(); mockGoblinRecord = { conditions: [], effects: [] }; });

const toggle = () => screen.queryByRole('button', { name: /Off-guard target/i });

describe('UseAbilityModal — off-guard attack toggle (#348)', () => {
  it('offers the toggle when the target is off-guard to this attacker', () => {
    mockGoblinRecord = { conditions: [{ id: 'off-guard', scopedTo: 'char-a', scopedToName: 'Ashka' }], effects: [] };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    expect(toggle()).toBeInTheDocument();
  });

  it('offers the toggle for a generic (unscoped) off-guard', () => {
    mockGoblinRecord = { conditions: [{ id: 'off-guard', scopedTo: null }], effects: [] };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    expect(toggle()).toBeInTheDocument();
  });

  it('hides the toggle when off-guard is scoped to a different attacker', () => {
    mockGoblinRecord = { conditions: [{ id: 'off-guard', scopedTo: 'someone-else', scopedToName: 'Blu' }], effects: [] };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    expect(toggle()).not.toBeInTheDocument();
  });

  it('hides the toggle when the target carries no off-guard', () => {
    mockGoblinRecord = { conditions: [{ id: 'frightened', value: 1 }], effects: [] };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    expect(toggle()).not.toBeInTheDocument();
  });
});
