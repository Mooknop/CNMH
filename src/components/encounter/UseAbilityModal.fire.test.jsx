// UseAbilityModal — chambered weapon fire (#676, S4).
// A capacity ranged Strike (Crescent Cross) carrying its inventory uid surfaces a
// chamber selector, charges 1 + the chosen ammo's Activate cost, discharges the
// chamber (empty + pointer advance), decrements special ammo, and applies the
// ammo's on-hit effect to a struck enemy.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const enemyOrder = [
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

// Per-key synced-state setters so the consumed-overlay decrement is observable.
const setters = {};
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, init) => [init, (setters[key] || (setters[key] = vi.fn()))],
}));

// Chamber overlay: bolt in chamber 0, Beacon Shot in chamber 1, empty chamber 2.
const bolt = { name: 'Crescent Cross Bolt', default: true, infinite: true, activate: 0, onHit: false };
const beacon = { name: 'Beacon Shot', item: 'Beacon Shot', default: false, activate: 1, onHit: true, effectId: 'beacon-shot' };
let chamberState = { chambers: [bolt, beacon, null], pointer: 0 };
const fireSpy = vi.fn();
vi.mock('../../hooks/useChambers', () => ({
  useChambers: () => ({ stateFor: () => chamberState, fire: fireSpy }),
}));

const applyConditionSpy = vi.fn();
vi.mock('../../hooks/useEnemyEffects', () => ({
  useEnemyEffects: () => ({ stampImmunity: vi.fn(), effectsFor: () => ({ conditions: [], effects: [] }), applyCondition: applyConditionSpy }),
  offGuardAppliesTo: () => false,
}));

// Resolver stub — getResults returns a hit on the goblin so the on-hit path runs.
vi.mock('./TargetRollResolver', () => {
  const React2 = require('react');
  const Stub = React2.forwardRef((props, ref) => {
    React2.useImperativeHandle(ref, () => ({
      getResults: () => [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 22, degree: 'success' }],
    }));
    return React2.createElement('div', { 'data-testid': 'resolver' });
  });
  return { __esModule: true, default: Stub, DEGREE_LABELS_SAVE: {} };
});

const spendActions = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({ useContent: () => ({ characters: [], effects: [] }) }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
const appendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: { active: true, order: enemyOrder, log: [] }, appendLog, addSaveRequest: vi.fn() }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ turnState: { actionsSpent: 0, attacksMade: 0 }, spendActions, spendReaction: vi.fn(), recordAttack: vi.fn() }),
}));
vi.mock('../../hooks/useEffects', () => ({ useEffects: () => ({ effects: [], removeEffect: vi.fn() }) }));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({ targets: ['e-gob'], selectable: enemyOrder, isTargeted: (id) => id === 'e-gob', toggleTarget: vi.fn() }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({ optionsFor: () => [], spend: () => ({ label: '' }), slots: { remainingFor: () => 0, spend: vi.fn() } }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({ useExploitVulnerability: () => ({ exploitFor: () => null }) }));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => ({ mode: 'actor-roll', bonus: 9, defense: 'ac', dc: null, source: 'ranged-attack' }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const crescentBolt = {
  name: 'Crescent Cross Bolt',
  source: 'Crescent Cross',
  type: 'ranged',
  traits: ['Attack', 'Ranged'],
  targetDefense: 'ac',
  attackMod: 9,
  damage: '1d6',
  capacity: 3,
  weaponUid: 'e-crescent',
  loaded: true,
  chambersLoaded: 2,
};
const character = { id: 'char-a', name: 'Ashka', abilities: { dexterity: 18 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(setters)) delete setters[k];
  chamberState = { chambers: [bolt, beacon, null], pointer: 0 };
});

const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'confirm-cast' }));

describe('UseAbilityModal — chambered fire (#676)', () => {
  it('lists the loaded chambers with the special-ammo Activate hint', () => {
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    expect(screen.getByRole('radio', { name: /Chamber 1: Crescent Cross Bolt/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Chamber 2: Beacon Shot \(\+1 to fire\)/ })).toBeInTheDocument();
  });

  it('shows the plain Strike cost by default and the combined cost for special ammo', () => {
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    expect(screen.getByRole('button', { name: 'confirm-cast' })).toHaveTextContent('Use (1)');
    fireEvent.click(screen.getByRole('radio', { name: /Beacon Shot/ }));
    expect(screen.getByRole('button', { name: 'confirm-cast' })).toHaveTextContent('Use (2)');
  });

  it('firing the plain bolt discharges the chamber, spends 1, and does not consume ammo', () => {
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    confirm();
    expect(fireSpy).toHaveBeenCalledWith('e-crescent', 0, 3);
    expect(spendActions).toHaveBeenCalledWith(1, expect.stringContaining('Crescent Cross Bolt'));
    expect(setters['cnmh_consumed_char-a']).not.toHaveBeenCalled();
    expect(applyConditionSpy).not.toHaveBeenCalled();
  });

  it('firing Beacon Shot spends 1+1, decrements ammo, and applies the on-hit effect to the hit enemy', () => {
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    fireEvent.click(screen.getByRole('radio', { name: /Beacon Shot/ }));
    confirm();
    expect(fireSpy).toHaveBeenCalledWith('e-crescent', 1, 3);
    expect(spendActions).toHaveBeenCalledWith(2, expect.anything());
    expect(setters['cnmh_consumed_char-a']).toHaveBeenCalled();
    expect(applyConditionSpy).toHaveBeenCalledWith('e-gob', expect.objectContaining({ id: 'beacon-shot' }));
  });
});
