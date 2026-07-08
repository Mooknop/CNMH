// UseAbilityModal — chambered weapon fire (#676, S4).
// A capacity ranged Strike (Crescent Cross) carrying its inventory uid surfaces a
// chamber selector, charges 1 + the chosen ammo's Activate cost, discharges the
// chamber (empty + pointer advance), decrements special ammo, and applies the
// ammo's on-hit effect to a struck enemy.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const enemyOrder = [
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8, reflex: 7, will: 5 } } },
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

// Resolver stub — getResults returns a mutable result set (default: a hit on the
// goblin) so tests can flip the degree per case.
let resolverResults = [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 22, degree: 'success' }];
vi.mock('./TargetRollResolver', () => {
  const React2 = require('react');
  const Stub = React2.forwardRef((props, ref) => {
    React2.useImperativeHandle(ref, () => ({
      getResults: () => resolverResults,
    }));
    return React2.createElement('div', { 'data-testid': 'resolver' });
  });
  return { __esModule: true, default: Stub, DEGREE_LABELS_SAVE: {} };
});

const spendActions = vi.fn();
const sendUpdateSpy = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: sendUpdateSpy, subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({ useContent: () => ({ characters: [], effects: [] }) }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
const appendLog = vi.fn();
const addSaveRequestSpy = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: { active: true, order: enemyOrder, log: [] }, appendLog, addSaveRequest: addSaveRequestSpy }),
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
  resolverResults = [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 22, degree: 'success' }];
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

// On-hit payload v2 (#1271, AA2): damage and save payloads on the chamber ref.
const stormArrow = {
  name: 'Storm Arrow', item: 'Storm Arrow', default: false, activate: 1, onHit: true, effectId: null,
  damage: { dice: '3d12', type: 'electricity' },
  save: { stat: 'reflex', dc: 25, basic: true, dcBump: { rune: 'shock', dc: 27 } },
};
const sleepArrow = {
  name: 'Sleep Arrow', item: 'Sleep Arrow', default: false, activate: 1, onHit: true, effectId: null,
  save: { stat: 'will', dc: 17, conditions: { failure: [{ id: 'unconscious', note: 'falls unconscious' }] } },
};
const acidBolt = {
  name: 'Acid Bolt', item: 'Acid Bolt', default: false, activate: 0, onHit: true, effectId: null,
  damage: { dice: '2d6', type: 'acid' },
};

const enterAmmoDamage = (value) =>
  fireEvent.change(screen.getByLabelText('ammo damage roll'), { target: { value } });

describe('UseAbilityModal — ammo on-hit payloads (#1271)', () => {
  it('a damage+save payload pushes a save request carrying the entered roll', () => {
    chamberState = { chambers: [stormArrow, null, null], pointer: 0 };
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    enterAmmoDamage('21');
    confirm();
    expect(addSaveRequestSpy).toHaveBeenCalledWith(expect.objectContaining({
      abilityName: 'Storm Arrow',
      save: 'reflex',
      dc: 25,
      basic: true,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 7 }],
      damage: expect.objectContaining({ entered: 21, expression: '3d12', typeLabel: 'electricity' }),
    }));
    expect(sendUpdateSpy).not.toHaveBeenCalledWith('global', 'dmgapply', expect.anything());
  });

  it('honors the dcBump when the firing weapon carries the matching property rune', () => {
    chamberState = { chambers: [stormArrow, null, null], pointer: 0 };
    const shockBolt = { ...crescentBolt, runeBreakdown: { potencyBonus: 1, extraDice: 0, properties: ['Greater Shock'] } };
    render(<UseAbilityModal {...props} ability={shockBolt} cost={1} />);
    enterAmmoDamage('21');
    confirm();
    expect(addSaveRequestSpy).toHaveBeenCalledWith(expect.objectContaining({ dc: 27 }));
  });

  it('a save-only payload rides the per-degree condition ladder, no damage key', () => {
    chamberState = { chambers: [sleepArrow, null, null], pointer: 0 };
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    confirm();
    const req = addSaveRequestSpy.mock.calls[0][0];
    expect(req).toMatchObject({
      abilityName: 'Sleep Arrow',
      save: 'will',
      dc: 17,
      basic: false,
      conditions: { failure: [{ id: 'unconscious', note: 'falls unconscious' }] },
    });
    expect(req.targets).toEqual([{ entryId: 'e-gob', name: 'Goblin', saveMod: 5 }]);
    expect(req.damage).toBeUndefined();
  });

  it('a damage-only payload relays the entered total straight to dmgapply', () => {
    chamberState = { chambers: [acidBolt, null, null], pointer: 0 };
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    enterAmmoDamage('9');
    confirm();
    expect(addSaveRequestSpy).not.toHaveBeenCalled();
    expect(sendUpdateSpy).toHaveBeenCalledWith('global', 'dmgapply', expect.objectContaining({
      sourceName: 'Acid Bolt',
      hits: [expect.objectContaining({ entryId: 'e-gob', amount: 9, type: 'acid' })],
    }));
  });

  it('a damage-only payload with no entered roll logs a manual-apply note instead', () => {
    chamberState = { chambers: [acidBolt, null, null], pointer: 0 };
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    confirm();
    expect(sendUpdateSpy).not.toHaveBeenCalledWith('global', 'dmgapply', expect.anything());
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('roll not entered — apply 2d6 acid'),
    }));
  });

  it('a miss fires the chamber but applies no payload', () => {
    resolverResults = [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 9, degree: 'failure' }];
    chamberState = { chambers: [stormArrow, null, null], pointer: 0 };
    render(<UseAbilityModal {...props} ability={crescentBolt} cost={1} />);
    enterAmmoDamage('21');
    confirm();
    expect(fireSpy).toHaveBeenCalledWith('e-crescent', 0, 3);
    expect(setters['cnmh_consumed_char-a']).toHaveBeenCalled();
    expect(addSaveRequestSpy).not.toHaveBeenCalled();
    expect(sendUpdateSpy).not.toHaveBeenCalledWith('global', 'dmgapply', expect.anything());
  });
});
