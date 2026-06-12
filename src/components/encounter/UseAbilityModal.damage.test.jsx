// UseAbilityModal — damage step (#222).
// Drives the single-roll AC attack path end to end: dice hint + rolled-total
// entry after a hit, rider toggles, crit doubling, the exploit-weakness
// auto-add, and the per-target damage breakdown in the combat log.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
const mockRecordAttack = vi.fn();

// Per-test roll profile and exploit — reassigned before render.
let mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };
let mockExploit = null;

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Ashka' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'goblin-warrior', defenses: { ac: 15, saves: { fortitude: 8 } } },
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
    spendActions: mockSpendActions,
    spendReaction: vi.fn(),
    recordAttack: mockRecordAttack,
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
  useExploitVulnerability: () => ({ exploitFor: () => mockExploit }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => mockRollProfile,
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const maceStrike = {
  name: 'Mace Strike',
  type: 'melee',
  traits: ['Attack', 'Melee'],
  attackMod: 10,
  damage: '2d6+4',
  targetDefense: 'ac',
};

const character = {
  id: 'char-a',
  name: 'Ashka',
  abilities: { constitution: 16 },
  damageRiders: [{
    id: 'implements-empowerment',
    label: "Implement's Empowerment",
    appliesTo: 'strikes',
    bonus: { perWeaponDie: 2 },
    defaultOn: true,
  }],
};

const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

const enterD20 = (v) =>
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: String(v) } });
const enterDamage = (v) =>
  fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: String(v) } });
const confirm = () => fireEvent.click(screen.getByLabelText('confirm-cast'));
const loggedLines = () => mockAppendLog.mock.calls.map(([entry]) => entry.text);

beforeEach(() => {
  vi.clearAllMocks();
  mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };
  mockExploit = null;
});

describe('UseAbilityModal — damage step (#222)', () => {
  it('hit → damage entry with the dice hint; the total lands in the log with the rider', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    enterD20(10); // 10 + 5 = 15 vs AC 15 → Hit
    expect(screen.getByText('2d6+4')).toBeInTheDocument();
    enterDamage(9);
    confirm();
    // 9 + 4 (Implement's Empowerment, 2 × 2 weapon dice)
    expect(loggedLines()).toContainEqual(
      expect.stringContaining("damage 13 (9 +4 Implement's Empowerment)")
    );
  });

  it('miss → no damage panel and no damage in the log', () => {
    const { container } = render(<UseAbilityModal {...props} ability={maceStrike} />);
    enterD20(5); // 10 < AC 15 → Miss
    expect(container.querySelector('.dmg-panel')).toBeNull();
    confirm();
    expect(loggedLines().join('\n')).not.toContain('damage');
  });

  it('crit doubles base + riders before the log', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    enterD20(20); // nat 20 → Critical Hit
    enterDamage(9);
    confirm();
    // (9 + 4) × 2 = 26
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 26 (9 +4'));
    expect(loggedLines()).toContainEqual(expect.stringContaining('×2'));
  });

  it('unticking the rider drops it from the logged total', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    enterD20(10);
    enterDamage(9);
    fireEvent.click(screen.getByRole('checkbox', { name: /Implement's Empowerment/i }));
    confirm();
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 9'));
  });

  it("the actor's active exploit weakness auto-adds for the matching target", () => {
    mockExploit = {
      targetEntryId: 'e-gob', targetName: 'Goblin',
      type: 'mortal', weaknessType: 'fire', value: 5, magical: true,
    };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    enterD20(10);
    expect(screen.getByRole('checkbox', { name: /weakness \(fire 5\)/i })).toBeChecked();
    enterDamage(9);
    confirm();
    // 9 + 4 rider + 5 weakness = 18
    expect(loggedLines()).toContainEqual(
      expect.stringContaining('damage 18 (9 +4 Implement\'s Empowerment +5 weakness (fire 5))')
    );
  });

  it('an exploit on a different combatant adds no weakness to this hit', () => {
    mockExploit = {
      targetEntryId: 'e-elsewhere', targetName: 'Other',
      type: 'antithesis', value: 4,
    };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    enterD20(10);
    expect(screen.queryByRole('checkbox', { name: /weakness/i })).toBeNull();
    enterDamage(9);
    confirm();
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 13'));
  });

  it('persistent riders show in the log with the flat-check note', () => {
    const shardStrike = {
      ...maceStrike,
      name: 'Shard Strike',
      riders: [{
        id: 'shard-bleed', label: 'Shard bleed',
        persistent: { dice: '1d6', type: 'bleed' }, defaultOn: true,
      }],
    };
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    enterD20(10);
    enterDamage(9);
    confirm();
    expect(loggedLines()).toContainEqual(
      expect.stringContaining('1d6 persistent bleed (DC 15 flat to end)')
    );
  });

  it('degree text from the ability data renders inline with the result', () => {
    const fear = {
      name: 'Fearsome Strike',
      traits: ['Attack'],
      attackMod: 10,
      damage: '1d6',
      targetDefense: 'ac',
      degrees: {
        'Success': 'The target is frightened 1.',
        'Failure': 'The target resists.',
      },
    };
    render(<UseAbilityModal {...props} ability={fear} />);
    enterD20(10);
    expect(screen.getByText('The target is frightened 1.')).toBeInTheDocument();
  });
});
