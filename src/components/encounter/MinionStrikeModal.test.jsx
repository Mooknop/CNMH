import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MinionStrikeModal from './MinionStrikeModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { SessionContext } from '../../contexts/SessionContext';

// Dummy modal — render children inline so queries work without a portal.
vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2>{children}</div>;
  },
}));

vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useTurnState', () => ({ useTurnState: vi.fn() }));
// useTargeting, resolveActionRoll, buildDamageProfile, minionUtils, TargetRollResolver
// all run for real so the test verifies the actual MAP + bonus pipeline.

// Zevira — best mod Dex 16 (+3), Bite trained (rank 1); at owner level 5 the
// proficiency bonus is 2 + 5 = 7, so attackMod = +10.
const zevira = {
  name: 'Zevira',
  abilities: { strength: 14, dexterity: 16, constitution: 13 },
};
const bite = { name: 'Bite', proficiency: 1, type: 'melee', damage: '1d8', traits: ['Attack', 'Finesse'] };
const ashka = { id: 'Ashka', name: 'Ashka', level: 5 };

const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Goblin', defenses: { ac: 18 } },
  { entryId: 'p-1', kind: 'pc', charId: 'jade', name: 'Jade' },
];

let appendLog, recordAttack, spendActions;

const renderModal = (attacksMade = 0, opts = {}) => {
  const { active = false, actionsGranted = 0, actionsSpent = 0 } = opts;
  useEncounter.mockReturnValue({
    encounter: { order, active, phase: active ? 'in-progress' : 'idle' },
    appendLog,
  });
  useTurnState.mockReturnValue({
    turnState: { attacksMade, actionsGranted, actionsSpent },
    recordAttack,
    spendActions,
  });
  return render(
    <MinionStrikeModal
      isOpen
      onClose={() => {}}
      strike={bite}
      companionData={zevira}
      character={ashka}
      role="companion"
    />
  );
};

beforeEach(() => {
  appendLog = vi.fn();
  recordAttack = vi.fn();
  spendActions = vi.fn();
});

describe('MinionStrikeModal', () => {
  it('lists only enemy targets (owner PC excluded)', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jade' })).not.toBeInTheDocument();
  });

  it("keys the MAP turn state on the minion, not the owner", () => {
    renderModal();
    expect(useTurnState).toHaveBeenCalledWith('Ashka-companion');
  });

  it('shows the minion attack bonus with no MAP on the first attack', () => {
    renderModal(0);
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+10');
  });

  it("applies the minion's own MAP (−5) on a second attack", () => {
    renderModal(1); // one attack already made this turn → MAP step 1
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+5');
  });

  it('logs the strike result and advances the minion MAP on confirm', () => {
    renderModal(0);
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } }); // 10 + 10 = 20 vs AC 18 → Hit
    fireEvent.click(screen.getByRole('button', { name: /log strike/i }));

    expect(recordAttack).toHaveBeenCalledTimes(1);
    expect(recordAttack).toHaveBeenCalledWith(1);
    expect(appendLog).toHaveBeenCalledTimes(1);
    expect(appendLog.mock.calls[0][0]).toMatchObject({
      type: 'action',
      charId: 'Ashka',
      text: expect.stringContaining('Zevira Bite vs Goblin (AC 18): 20 → Hit'),
    });
  });

  it('spends 1 granted action on confirm during an encounter (#391)', () => {
    renderModal(0, { active: true, actionsGranted: 2, actionsSpent: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /log strike/i }));
    expect(spendActions).toHaveBeenCalledWith(1, 'Bite');
  });

  it('does not spend an action out of encounter', () => {
    renderModal(0); // inactive encounter
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /log strike/i }));
    expect(spendActions).not.toHaveBeenCalled();
  });

  it('hard-blocks the strike when no granted actions remain (#391)', () => {
    renderModal(0, { active: true, actionsGranted: 0, actionsSpent: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    const confirm = screen.getByRole('button', { name: /no actions left/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(spendActions).not.toHaveBeenCalled();
  });

  // Flanking (#362): the bridge keys the companion's own minion id under a flanked
  // enemy. Render inside a session whose getState returns the flanked map.
  const renderWithFlanked = (flankedMap) => {
    useEncounter.mockReturnValue({ encounter: { order }, appendLog });
    useTurnState.mockReturnValue({ turnState: { attacksMade: 0 }, recordAttack, spendActions });
    const session = {
      connected: true,
      getState: (charId, type) =>
        charId === 'global' && type === 'flanked' ? flankedMap : undefined,
      getAllState: () => ({}),
      sendUpdate: vi.fn(),
      subscribe: () => () => {},
    };
    return render(
      <SessionContext.Provider value={session}>
        <MinionStrikeModal
          isOpen onClose={() => {}} strike={bite}
          companionData={zevira} character={ashka} role="companion"
        />
      </SessionContext.Provider>
    );
  };

  it('shows the off-guard cue when the companion flanks the picked target', () => {
    renderWithFlanked({ 'e-a': { byCharIds: ['Ashka-companion'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    expect(screen.getByLabelText('Goblin is flanked')).toBeInTheDocument();
  });

  it('shows no off-guard cue when the companion is not among the flankers', () => {
    renderWithFlanked({ 'e-a': { byCharIds: ['Ashka'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    expect(screen.queryByLabelText('Goblin is flanked')).not.toBeInTheDocument();
  });

  // Hunt Prey inheritance (#408): a ranged companion Strike reads the owner's prey
  // and the companion's own cell to apply (and waive vs prey) range increments.
  const spit = { name: 'Acid Spit', proficiency: 1, type: 'ranged', range: '30 feet', damage: '1d6', traits: ['Attack'] };
  const orderRanged = [
    { entryId: 'e-zev', kind: 'enemy', name: 'Zevira', foundryActorId: 'fa-zev' },
    { entryId: 'e-a',   kind: 'enemy', name: 'Goblin', defenses: { ac: 18 } },
  ];
  const minionLinks = { 'Ashka-companion': { foundryActorId: 'fa-zev', role: 'companion', ownerCharId: 'Ashka' } };

  const renderRanged = ({ positions, huntprey }) => {
    useEncounter.mockReturnValue({ encounter: { order: orderRanged, active: false, phase: 'idle' }, appendLog });
    useTurnState.mockReturnValue({ turnState: { attacksMade: 0 }, recordAttack, spendActions });
    const session = {
      connected: true,
      getState: (charId, type) => {
        if (charId === 'global' && type === 'positions') return positions;
        if (charId === 'global' && type === 'minionactors') return minionLinks;
        if (charId === 'Ashka' && type === 'huntprey') return huntprey;
        return undefined;
      },
      getAllState: () => ({}),
      sendUpdate: vi.fn(),
      subscribe: () => () => {},
    };
    return render(
      <SessionContext.Provider value={session}>
        <MinionStrikeModal
          isOpen onClose={() => {}} strike={spit}
          companionData={zevira} character={ashka} role="companion"
        />
      </SessionContext.Provider>
    );
  };

  it('hard-blocks a ranged companion Strike against an out-of-range target', () => {
    // Companion at (0,0), goblin 40 squares east = 200 ft; increment 30 → 7× → out of range.
    renderRanged({
      positions: { gridSize: 100, positions: { 'e-zev': { col: 0, row: 0 }, 'e-a': { col: 40, row: 0 } } },
      huntprey: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    const confirm = screen.getByRole('button', { name: /out of range/i });
    expect(confirm).toBeDisabled();
  });

  it('waives the 2nd increment for the companion against the owner’s prey', () => {
    // Goblin 9 squares east = 45 ft; increment 30 → 2nd increment. Prey waives it.
    renderRanged({
      positions: { gridSize: 100, positions: { 'e-zev': { col: 0, row: 0 }, 'e-a': { col: 9, row: 0 } } },
      huntprey: { targetKey: 'e-a', targetName: 'Goblin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '10' } });
    expect(screen.getByText(/Hunt Prey: 2nd increment ignored/)).toBeInTheDocument();
  });

  it('applies the 2nd-increment penalty when the target is not the prey', () => {
    renderRanged({
      positions: { gridSize: 100, positions: { 'e-zev': { col: 0, row: 0 }, 'e-a': { col: 9, row: 0 } } },
      huntprey: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '10' } });
    expect(screen.getByText(/2nd increment -2/)).toBeInTheDocument();
    expect(screen.queryByText(/Hunt Prey/)).not.toBeInTheDocument();
  });
});
