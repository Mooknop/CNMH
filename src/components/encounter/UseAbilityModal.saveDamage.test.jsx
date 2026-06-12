// UseAbilityModal — save-based damage entry (#270).
// Basic-save abilities show the damage panel in save mode (total + rider
// toggles, no per-target results — degrees don't exist yet); on confirm the
// entered total and serialized rider snapshot travel with the save request
// for GM-side per-degree resolution in RequestedSaves.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockAddSaveRequest = vi.fn();

// Per-test roll profile and exploit — reassigned before render.
let mockRollProfile = { mode: 'target-save', defense: 'reflex', dc: 22 };
let mockExploit = null;

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Brimstone' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'goblin-warrior', defenses: { ac: 15, saves: { reflex: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Brimstone' }] }),
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
// Per-test cast options (the cantrip-rank test sets an auto-heightened option).
let mockCastOptions = [];
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => mockCastOptions,
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({ exploitFor: () => mockExploit }),
}));
// Aura key reads active so the Impulse-trait fixture (Shard Strike) passes the
// kinetic aura gate (#228); every other key echoes an empty list.
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) =>
    String(key).startsWith('cnmh_aura_')
      ? [{ active: true, ts: 1 }, vi.fn()]
      : [[], vi.fn()],
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => mockRollProfile,
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const shardStrike = {
  name: 'Shard Strike',
  actions: 'Two Actions',
  traits: ['Impulse', 'Kineticist', 'Metal'],
  targetDefense: 'reflex',
  basic: true,
  damageData: {
    base: '1d6',
    type: 'slashing or piercing',
    riders: [{
      id: 'shard-bleed', label: 'Shards: persistent bleed',
      persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
      note: 'Shards form only — untick for Spines',
    }],
  },
};

const character = { id: 'char-a', name: 'Brimstone', abilities: { constitution: 16 } };

const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

const enterDamage = (v) =>
  fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: String(v) } });
const confirm = () => fireEvent.click(screen.getByLabelText('confirm-cast'));
const requestArg = () => mockAddSaveRequest.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  mockRollProfile = { mode: 'target-save', defense: 'reflex', dc: 22 };
  mockExploit = null;
  mockCastOptions = [];
});

describe('UseAbilityModal — save-based damage (#270)', () => {
  it('renders the damage panel in save mode: dice hint + total input, no crit toggle', () => {
    const { container } = render(<UseAbilityModal {...props} ability={shardStrike} />);
    expect(container.querySelector('.dmg-panel')).not.toBeNull();
    expect(screen.getByText('1d6 slashing or piercing')).toBeInTheDocument();
    expect(screen.getByLabelText(/rolled damage total/i)).toBeInTheDocument();
    expect(screen.queryByText('Crit ×2')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Shards: persistent bleed/i })).toBeChecked();
  });

  it('confirm carries the entered total and rider snapshot in the save request', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterDamage(11);
    confirm();
    expect(requestArg()).toMatchObject({
      abilityName: 'Shard Strike',
      save: 'reflex',
      dc: 22,
      basic: true,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 8 }],
      damage: {
        entered: 11,
        expression: '1d6',
        typeLabel: 'slashing or piercing',
        riders: [{
          id: 'shard-bleed', label: 'Shards: persistent bleed',
          persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
        }],
      },
    });
    // The payload crosses the WebSocket — it must round-trip as plain JSON.
    const { damage } = requestArg();
    expect(JSON.parse(JSON.stringify(damage))).toEqual(damage);
  });

  it('an unticked rider is omitted from the snapshot', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterDamage(11);
    fireEvent.click(screen.getByRole('checkbox', { name: /Shards: persistent bleed/i }));
    confirm();
    expect(requestArg().damage.riders).toEqual([]);
  });

  it('no damageData → no panel and no damage key (legacy requests unchanged)', () => {
    const plainSave = {
      name: 'Addling Blast', actions: 'Two Actions',
      traits: ['Mental'], targetDefense: 'will', basic: true,
    };
    const { container } = render(<UseAbilityModal {...props} ability={plainSave} />);
    expect(container.querySelector('.dmg-panel')).toBeNull();
    confirm();
    expect(mockAddSaveRequest).toHaveBeenCalled();
    expect(requestArg().damage).toBeUndefined();
  });

  it('persistent-only profiles hide the total input and send entered: null (Polarize)', () => {
    const polarize = {
      name: 'Polarize', actions: 'Two Actions',
      traits: ['Electricity'], targetDefense: 'fortitude', basic: true,
      damageData: {
        riders: [{
          id: 'polarize-persistent', label: 'Persistent electricity',
          persistent: { dice: '2d4', type: 'electricity' },
          on: ['success', 'failure', 'criticalFailure'],
        }],
      },
    };
    const { container } = render(<UseAbilityModal {...props} ability={polarize} />);
    expect(container.querySelector('.dmg-panel')).not.toBeNull();
    expect(screen.queryByLabelText(/rolled damage total/i)).toBeNull();
    confirm();
    expect(requestArg().damage).toMatchObject({
      entered: null,
      riders: [{ id: 'polarize-persistent', persistent: { dice: '2d4', type: 'electricity' } }],
    });
  });

  it("the actor's exploit weakness is serialized with the save target's entryId", () => {
    mockExploit = { targetEntryId: 'e-gob', targetName: 'Goblin', type: 'antithesis', value: 4 };
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterDamage(11);
    confirm();
    expect(requestArg().damage.riders).toContainEqual(
      expect.objectContaining({
        id: 'exploit-weakness', weakness: 4, appliesToEntryIds: ['e-gob'],
      })
    );
  });

  it('cantrip save spells carry the auto-heightened rank and scale the hint (#271)', () => {
    mockCastOptions = [{ type: 'cantrip', label: 'Cantrip — no cost', enabled: true, rank: 2 }];
    const daze = {
      name: 'Daze', level: 0, actions: 'Two Actions',
      traits: ['Cantrip', 'Mental'], targetDefense: 'will', basic: true,
      damageData: { base: '1d6', type: 'mental', heightened: { '+1': { base: '1d6' } } },
    };
    render(<UseAbilityModal {...props} ability={daze} verb="Cast" />);
    // Native rank 1, cast at rank 2 → one '+1' step.
    expect(screen.getByText('2d6 mental')).toBeInTheDocument();
    enterDamage(7);
    confirm();
    expect(requestArg().rank).toBe(2);
    expect(requestArg().damage.expression).toBe('2d6');
  });
});
