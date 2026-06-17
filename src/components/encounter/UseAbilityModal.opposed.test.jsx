// UseAbilityModal — opposed-reaction resolution path (#226-C).
// Reaction-cost abilities flagged `roll.opposed` resolve the actor's own skill
// roll against a GM-called DC (relayed by the player) instead of a target's
// defense. The authored self effect (Upstage) and any per-enemy immunity
// (Disrupting Performance) land only on a success; the path returns early so
// none of the defense/save-request machinery runs.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';
import { applyAbility } from '../../utils/applyAbility';

const mockAppendLog = vi.fn();
const mockSpendReaction = vi.fn();
const mockStampImmunity = vi.fn();

// Actor-roll skill profile — the Performance total lives in `bonus`. Defense is
// null (opposed reactions target no defense); skill drives the display label.
let mockRollProfile = { mode: 'actor-roll', bonus: 10, dc: null, defense: null, skill: 'performance' };

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Izzy' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e-orc', kind: 'enemy', name: 'Orc' },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Izzy' }], effects: [] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
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
    spendReaction: mockSpendReaction,
    recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({ targets: [], selectable: order, isTargeted: () => false, toggleTarget: vi.fn() }),
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
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
vi.mock('../../hooks/useEnemyEffects', () => ({
  useEnemyEffects: () => ({ stampImmunity: mockStampImmunity }),
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => mockRollProfile,
  mapSpellDefense: () => null,
}));
// Keep abilityNeedsPicker / immunityConfigFor real; spy only applyAbility.
vi.mock('../../utils/applyAbility', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, applyAbility: vi.fn() };
});
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const character = { id: 'char-a', name: 'Izzy' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

const upstage = {
  name: 'Upstage',
  actions: 'Reaction',
  roll: {
    type: 'skill', skill: 'performance', opposed: true,
    successNote: 'Applies only if the enemy failed their check.',
  },
  effects: [{ effectId: 'upstage', applyTo: 'self', duration: { until: 'caster-turn-end' } }],
};

const disrupting = {
  name: 'Disrupting Performance',
  actions: 'Reaction',
  roll: { type: 'skill', skill: 'performance', opposed: true },
  immunity: { duration: { value: 1, unit: 'minute' }, scope: 'per-caster' },
};

const setDc    = (v) => fireEvent.change(screen.getByLabelText('opposed dc'), { target: { value: String(v) } });
const setD20   = (v) => fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: String(v) } });
const pickEnemy = (id) => fireEvent.change(screen.getByLabelText('triggering enemy'), { target: { value: id } });
const confirm  = () => fireEvent.click(screen.getByLabelText('confirm-cast'));
const lastLog  = () => mockAppendLog.mock.calls.at(-1)[0].text;

beforeEach(() => {
  vi.clearAllMocks();
  mockRollProfile = { mode: 'actor-roll', bonus: 10, dc: null, defense: null, skill: 'performance' };
});

describe('UseAbilityModal — opposed reactions (#226-C)', () => {
  it('renders the opposed resolver: DC input, enemy picker, d20 entry + bonus badge', () => {
    render(<UseAbilityModal {...props} ability={upstage} />);
    expect(screen.getByLabelText('opposed dc')).toBeInTheDocument();
    expect(screen.getByLabelText('triggering enemy')).toBeInTheDocument();
    expect(screen.getByLabelText('raw d20')).toBeInTheDocument();
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+10');
    // Performance label from the roll config's skill.
    expect(screen.getByText('Performance')).toBeInTheDocument();
  });

  it('success (total ≥ DC) applies the self effect and logs the degree + total', () => {
    render(<UseAbilityModal {...props} ability={upstage} />);
    setDc(15);
    setD20(5); // 5 + 10 = 15 == DC → success
    confirm();
    expect(applyAbility).toHaveBeenCalledTimes(1);
    expect(applyAbility.mock.calls[0][0]).toMatchObject({
      ability: upstage, caster: character, targetCharIds: [],
    });
    expect(lastLog()).toBe("Izzy's Upstage vs DC 15: 15 → Success");
    expect(mockSpendReaction).toHaveBeenCalled();
  });

  it('critical success (total ≥ DC+10) applies the effect', () => {
    render(<UseAbilityModal {...props} ability={upstage} />);
    setDc(15);
    setD20(15); // 15 + 10 = 25 ≥ 25 → crit success (not a nat 20)
    confirm();
    expect(applyAbility).toHaveBeenCalledTimes(1);
    expect(lastLog()).toBe("Izzy's Upstage vs DC 15: 25 → Critical Success");
  });

  it('failure (total < DC) does not apply the effect', () => {
    render(<UseAbilityModal {...props} ability={upstage} />);
    setDc(15);
    setD20(4); // 4 + 10 = 14 < 15 → failure
    confirm();
    expect(applyAbility).not.toHaveBeenCalled();
    expect(lastLog()).toBe("Izzy's Upstage vs DC 15: 14 → Failure");
    expect(mockSpendReaction).toHaveBeenCalled(); // reaction still spent
  });

  it('critical failure (total ≤ DC-11) does not apply the effect', () => {
    render(<UseAbilityModal {...props} ability={upstage} />);
    setDc(30);
    setD20(5); // 5 + 10 = 15 ≤ 19 → crit failure
    confirm();
    expect(applyAbility).not.toHaveBeenCalled();
    expect(lastLog()).toBe("Izzy's Upstage vs DC 30: 15 → Critical Failure");
  });

  it('stamps per-enemy immunity on a success with an enemy picked', () => {
    render(<UseAbilityModal {...props} ability={disrupting} />);
    setDc(18);
    setD20(8); // 8 + 10 = 18 → success
    pickEnemy('e-gob');
    confirm();
    expect(mockStampImmunity).toHaveBeenCalledTimes(1);
    expect(mockStampImmunity.mock.calls[0]).toEqual([
      'e-gob',
      expect.objectContaining({
        abilityName: 'Disrupting Performance',
        casterId: 'char-a',
        durationSecs: 60,
      }),
    ]);
    expect(lastLog()).toContain('(Goblin)');
  });

  it('does not stamp immunity when no enemy is picked (even on success)', () => {
    render(<UseAbilityModal {...props} ability={disrupting} />);
    setDc(18);
    setD20(8); // success
    confirm();
    expect(mockStampImmunity).not.toHaveBeenCalled();
  });

  it('does not stamp immunity on a failed check (enemy picked)', () => {
    render(<UseAbilityModal {...props} ability={disrupting} />);
    setDc(18);
    setD20(2); // 2 + 10 = 12 < 18 → failure
    pickEnemy('e-gob');
    confirm();
    expect(mockStampImmunity).not.toHaveBeenCalled();
  });

  it('shows the success caveat note only once the check succeeds', () => {
    render(<UseAbilityModal {...props} ability={upstage} />);
    setDc(15);
    setD20(4); // failure — note hidden
    expect(screen.queryByText(/only if the enemy failed/i)).toBeNull();
    setD20(5); // success — note shown
    expect(screen.getByText(/only if the enemy failed/i)).toBeInTheDocument();
  });

  it('non-opposed abilities never render the opposed resolver (regression guard)', () => {
    mockRollProfile = { mode: 'none', bonus: null, dc: null, defense: null, skill: null };
    const plain = { name: 'Raise a Shield', actions: 'One Action' };
    render(<UseAbilityModal {...props} ability={plain} />);
    expect(screen.queryByLabelText('opposed dc')).toBeNull();
    expect(screen.queryByLabelText('triggering enemy')).toBeNull();
  });
});
