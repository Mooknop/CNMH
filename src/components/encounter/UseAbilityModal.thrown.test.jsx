// UseAbilityModal — thrown Strike drop (#1230).
// A thrown ranged Strike carrying its inventory uid marks the weapon Dropped in
// the live loadout when the Strike resolves (hit or miss) — unless a
// returning-effect rune (Returning / Throwing) flies it back to hand.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const enemyOrder = [
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

// Per-key synced-state setters so the loadout drop write is observable.
const setters = {};
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, init) => [init, (setters[key] || (setters[key] = vi.fn()))],
}));

vi.mock('../../hooks/useEnemyEffects', () => ({
  useEnemyEffects: () => ({ stampImmunity: vi.fn(), effectsFor: () => ({ conditions: [], effects: [] }), applyCondition: vi.fn() }),
  offGuardAppliesTo: () => false,
}));

// Resolver stub — a miss: the throw drops the weapon hit or miss.
vi.mock('./TargetRollResolver', () => {
  const React2 = require('react');
  const Stub = React2.forwardRef((props, ref) => {
    React2.useImperativeHandle(ref, () => ({
      getResults: () => [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 12, degree: 'failure' }],
    }));
    return React2.createElement('div', { 'data-testid': 'resolver' });
  });
  return { __esModule: true, default: Stub, DEGREE_LABELS_SAVE: {} };
});

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
  useTurnState: () => ({ turnState: { actionsSpent: 0, attacksMade: 0 }, spendActions: vi.fn(), spendReaction: vi.fn(), recordAttack: vi.fn() }),
}));
vi.mock('../../hooks/useEffects', () => ({ useEffects: () => ({ effects: [], removeEffect: vi.fn() }) }));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({ targets: ['e-gob'], selectable: enemyOrder, isTargeted: (id) => id === 'e-gob', toggleTarget: vi.fn() }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({ optionsFor: () => [], spend: () => ({ label: '' }), slots: { remainingFor: () => 0, spend: vi.fn() } }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({ useExploitVulnerability: () => ({ exploitFor: () => null }) }));
const returnBlade = vi.fn();
vi.mock('../../hooks/useBladeByrnie', () => ({
  useBladeByrnie: () => ({ active: false, returnToArmor: returnBlade }),
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => ({ mode: 'actor-roll', bonus: 7, defense: 'ac', dc: null, source: 'ranged-attack' }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const daggerThrow = {
  name: 'Dagger Throw',
  source: 'Dagger',
  type: 'ranged',
  traits: ['Attack', 'Agile', 'Thrown'],
  targetDefense: 'ac',
  attackMod: 7,
  damage: '1d4+2',
  thrown: true,
  weaponUid: 'e-dagger',
  returning: false,
};
const character = { id: 'char-a', name: 'Ashka', abilities: { dexterity: 18 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(setters)) delete setters[k];
});

const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'confirm-cast' }));
const loadoutWrites = () => setters['cnmh_loadout_char-a'];
// The setter spy is created on render (useLoadout always mounts) — "no drop"
// means it was never invoked, not that it doesn't exist.
const loadoutWriteCount = () => loadoutWrites()?.mock.calls.length ?? 0;

describe('UseAbilityModal — thrown Strike drop (#1230)', () => {
  it('a resolved throw (even a miss) marks the weapon Dropped in the loadout', () => {
    render(<UseAbilityModal {...props} ability={daggerThrow} cost={1} />);
    confirm();
    expect(loadoutWrites()).toHaveBeenCalledTimes(1);
    const updater = loadoutWrites().mock.calls[0][0];
    expect(updater({})['e-dagger']).toMatchObject({ state: 'dropped', container: null });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Dagger lands after the throw — Dropped'),
    }));
  });

  it('a returning-effect rune keeps the weapon in hand (no drop, return logged)', () => {
    render(<UseAbilityModal {...props} ability={{ ...daggerThrow, returning: true }} cost={1} />);
    confirm();
    expect(loadoutWriteCount()).toBe(0);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Dagger flies back to hand'),
    }));
  });

  it('the Blade Byrnie dagger keeps its own return path — no loadout write', () => {
    render(<UseAbilityModal {...props} ability={{ ...daggerThrow, bladeByrnie: true }} cost={1} />);
    confirm();
    expect(returnBlade).toHaveBeenCalled();
    expect(loadoutWriteCount()).toBe(0);
  });

  it('a non-thrown Strike never touches the loadout', () => {
    const sword = { name: 'Longsword Strike', source: 'Longsword', type: 'melee', traits: ['Attack'], targetDefense: 'ac', attackMod: 7, damage: '1d8+2' };
    render(<UseAbilityModal {...props} ability={sword} cost={1} />);
    confirm();
    expect(loadoutWriteCount()).toBe(0);
  });
});
