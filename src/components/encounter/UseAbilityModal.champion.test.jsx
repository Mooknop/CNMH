// UseAbilityModal — champion-kit gating (#228): the raised-shield requirement
// (Devoted Guardian), the computed ally-resistance note (Retributive Strike),
// and immunityKey sharing one immunity pool across ability variants
// (Murmured Prayer's +2 Guidance).

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
let mockRaised = false;
let mockAllyEffects = [];

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-ally', kind: 'pc', charId: 'Ashka', name: 'Ashka' },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn((charId, key) => (charId === 'Ashka' && key === 'effects' ? mockAllyEffects : [])),
    sendUpdate: vi.fn(),
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'Pellias', name: 'Pellias' }, { id: 'Ashka', name: 'Ashka' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 1, order, log: [] },
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
    targets: ['e-ally'],
    selectable: order,
    isTargeted: (id) => id === 'e-ally',
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
vi.mock('../../hooks/useShield', () => ({
  useShield: () => ({ raised: mockRaised }),
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) => [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const devotedGuardian = {
  name: 'Devoted Guardian',
  actions: 'One Action',
  traits: ['Champion'],
  requiresShieldRaised: true,
  effects: [{ effectId: 'devoted-guardian-tower', applyTo: 'ally' }],
};

const retributiveStrike = {
  name: 'Retributive Strike',
  actions: 'Reaction',
  traits: ['Champion'],
  allyResistance: { base: 2, addLevel: true },
};

const murmuredPrayer = {
  name: 'Murmured Prayer',
  actions: 'One Action',
  immunityKey: 'guidance',
  immunity: { duration: { value: 1, unit: 'hour' } },
};

const character = { id: 'Pellias', name: 'Pellias', level: 4 };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#0af' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRaised = false;
  mockAllyEffects = [];
});

describe('UseAbilityModal — raised-shield gate', () => {
  it('blocks a requiresShieldRaised ability while the shield is down', () => {
    render(<UseAbilityModal {...props} ability={devotedGuardian} />);
    expect(screen.getByText('Shield')).toBeInTheDocument();
    expect(screen.getByText(/Raise a Shield first/)).toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('override re-enables confirm and tags the log line', () => {
    render(<UseAbilityModal {...props} ability={devotedGuardian} />);
    fireEvent.click(screen.getByLabelText(/Override \(GM ruling\) — use anyway/));
    const confirm = screen.getByLabelText('confirm-cast');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('(override — shield not raised)'))).toBe(true);
  });

  it('no gate while the shield is raised', () => {
    mockRaised = true;
    render(<UseAbilityModal {...props} ability={devotedGuardian} />);
    expect(screen.queryByText('Shield')).not.toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeEnabled();
  });

  it('abilities without the requirement never gate', () => {
    render(<UseAbilityModal {...props} ability={{ name: 'Sneak', actions: 'One Action' }} />);
    expect(screen.queryByText('Shield')).not.toBeInTheDocument();
  });
});

describe('UseAbilityModal — ally resistance note', () => {
  it('shows the computed amount (base + level) and logs it on confirm', () => {
    render(<UseAbilityModal {...props} ability={retributiveStrike} />);
    expect(
      screen.getByText('Ally gains resistance 6 against the triggering damage.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) =>
      t.includes("Pellias's ally gains resistance 6 against the triggering damage (Retributive Strike)")
    )).toBe(true);
  });

  it('addLevel: false keeps the base amount', () => {
    render(
      <UseAbilityModal
        {...props}
        ability={{ ...retributiveStrike, allyResistance: { base: 2 } }}
      />
    );
    expect(
      screen.getByText('Ally gains resistance 2 against the triggering damage.')
    ).toBeInTheDocument();
  });
});

describe('UseAbilityModal — immunityKey sharing', () => {
  it('a variant with immunityKey sees immunity stamped under the shared key', () => {
    mockAllyEffects = [{ id: 'i1', effectId: 'ability-immunity', abilityKey: 'guidance' }];
    render(<UseAbilityModal {...props} ability={murmuredPrayer} />);
    expect(screen.getByText('Immunity')).toBeInTheDocument();
    expect(screen.getByText(/Ashka is immune/)).toBeInTheDocument();
  });

  it('without a matching entry the variant is not blocked', () => {
    mockAllyEffects = [{ id: 'i1', effectId: 'ability-immunity', abilityKey: 'battle-medicine' }];
    render(<UseAbilityModal {...props} ability={murmuredPrayer} />);
    expect(screen.queryByText('Immunity')).not.toBeInTheDocument();
  });
});
