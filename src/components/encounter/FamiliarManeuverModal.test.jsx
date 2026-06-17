import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FamiliarManeuverModal from './FamiliarManeuverModal';
import { useEncounter } from '../../hooks/useEncounter';

// Dummy modal — render children inline so queries work without a portal.
vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2>{children}</div>;
  },
}));

vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ turnState: { actionsGranted: 0, actionsSpent: 0 }, spendActions: mockSpendActions }),
}));
// useTargeting, TargetRollResolver, minionUtils all run for real so the test
// exercises the actual bonus + Reflex-DC pipeline.

// Lazarus — Squox trained in Acrobatics; at owner level 4 that's +7.
const lazarus = { name: 'Lazarus', skills: ['Acrobatics', 'Stealth', 'Perception'] };
const ashka = { id: 'Ashka', name: 'Ashka', level: 4 };

const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Goblin', defenses: { saves: { reflex: 4 } } }, // Reflex DC 14
  { entryId: 'p-1', kind: 'pc', charId: 'jade', name: 'Jade' },
];

let appendLog;

const renderModal = (maneuver = { id: 'trip', name: 'Trip' }, { active = false } = {}) => {
  useEncounter.mockReturnValue({
    encounter: { order, active, phase: active ? 'in-progress' : 'idle' },
    appendLog,
  });
  return render(
    <FamiliarManeuverModal
      isOpen
      onClose={() => {}}
      maneuver={maneuver}
      familiarData={lazarus}
      character={ashka}
    />
  );
};

beforeEach(() => { appendLog = vi.fn(); mockSpendActions.mockClear(); });

describe('FamiliarManeuverModal', () => {
  it('lists only enemy targets (owner PC excluded)', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jade' })).not.toBeInTheDocument();
  });

  it('seeds the Acrobatics modifier from the familiar-skill convention (+7 at level 4)', () => {
    renderModal();
    expect(screen.getByLabelText('Acrobatics modifier')).toHaveValue(7);
  });

  it('rolls at the Acrobatics modifier, and +2 more when the target is off-guard', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+7');
    fireEvent.click(screen.getByRole('button', { name: 'Target off-guard +2' }));
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+9');
  });

  it('logs the maneuver result vs the Reflex DC on confirm', () => {
    renderModal({ id: 'trip', name: 'Trip' });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    // d20 10 + 7 = 17 vs Reflex DC 14 → Success
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /log trip/i }));
    expect(appendLog).toHaveBeenCalledTimes(1);
    expect(appendLog.mock.calls[0][0]).toMatchObject({
      type: 'action',
      charId: 'Ashka',
      text: expect.stringContaining('Lazarus Trip vs Goblin (Reflex DC 14): 17 → Success — Goblin knocked prone'),
    });
  });

  it('spends 1 granted action on confirm during an encounter (#391)', () => {
    renderModal({ id: 'trip', name: 'Trip' }, { active: true });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /log trip/i }));
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Trip');
  });

  it('does not spend an action out of encounter', () => {
    renderModal({ id: 'trip', name: 'Trip' });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /log trip/i }));
    expect(mockSpendActions).not.toHaveBeenCalled();
  });

  it('notes the off-guard bonus in the log when toggled', () => {
    renderModal({ id: 'disarm', name: 'Disarm' });
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Target off-guard +2' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } }); // 10 + 9 = 19 → Success
    fireEvent.click(screen.getByRole('button', { name: /log disarm/i }));
    expect(appendLog.mock.calls[0][0].text).toContain('disarmed');
    expect(appendLog.mock.calls[0][0].text).toContain('[off-guard +2]');
  });
});
