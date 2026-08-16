// UseAbilityModal — the `&& placement.gateOk` confirmEnabled fold (#1751 OQ-5).
//
// The hard-block itself lives in useTemplatePlacementSection (an out-of-range
// snapped tap refuses to place or ping, with its own hint). This file pins the
// MODAL-level half: while the placement gate reports blocked, the cast's main
// confirm button is disabled too, so a player can never spend the spell while
// its area has nowhere legal to land. Wired as a hand-apply after PRs #1756 and
// #1757 merged (the two touched this file's region in parallel — see #1751).
import React from 'react';
import { render, screen } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

let mockPlacement;

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn(() => []),
    sendUpdate: vi.fn(),
    subscribe: () => () => {},
    foundryConnected: true,
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({ useContent: () => ({ characters: [] }) }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: [], log: [] },
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
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({ optionsFor: () => [], spend: () => ({ label: '' }), slots: { remainingFor: () => 0, spend: vi.fn() } }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({ useExploitVulnerability: () => ({ exploitFor: () => null }) }));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));
// The gate under test — everything else about the section is irrelevant here.
vi.mock('../../hooks/useTemplatePlacementSection', () => ({
  useTemplatePlacementSection: () => mockPlacement,
}));

const fireball = {
  id: 'fireball', name: 'Fireball', traits: ['Evocation', 'Fire'],
  area: '20-foot burst', range: '500 feet', defense: 'reflex', damage: '6d6',
};
const character = { id: 'char-a', name: 'Ashka', abilities: { constitution: 16 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#a0f' };

const confirmButton = () => screen.getByRole('button', { name: 'confirm-cast' });

beforeEach(() => {
  vi.clearAllMocks();
  mockPlacement = { section: null, applyOnConfirm: vi.fn(), hasArea: true, gateOk: true };
});

describe('UseAbilityModal — placement.gateOk fold (#1751 OQ-5)', () => {
  it('disables the cast confirm while the placement gate reports out of range', () => {
    mockPlacement.gateOk = false;
    render(<UseAbilityModal {...props} ability={fireball} />);
    expect(confirmButton()).toBeDisabled();
  });

  it('keeps the cast confirmable when the gate is open', () => {
    render(<UseAbilityModal {...props} ability={fireball} />);
    expect(confirmButton()).not.toBeDisabled();
  });
});
