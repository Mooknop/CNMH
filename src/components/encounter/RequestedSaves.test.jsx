import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RequestedSaves from './RequestedSaves';

const mockAppendLog     = vi.fn();
const mockRemoveSaveReq = vi.fn();

const goblinTarget = { entryId: 'e-goblin', name: 'Goblin',  saveMod: 5  };
const trollTarget  = { entryId: 'e-troll',  name: 'Troll',   saveMod: 8  };
const noModTarget  = { entryId: 'e-zombie', name: 'Zombie',  saveMod: null };

const baseRequest = {
  id:          'savereq-1',
  casterId:    'char-a',
  casterName:  'Pellias',
  abilityName: 'Fireball',
  save:        'reflex',
  dc:          20,
  basic:       false,
  targets:     [goblinTarget],
  status:      'pending',
};

function makeEncounter(saveRequests = []) {
  return {
    active: true,
    phase: 'in-progress',
    round: 1,
    currentTurnIndex: 0,
    order: [],
    log: [],
    saveRequests,
  };
}

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: vi.fn(),
}));

// Re-import after mock so we can .mockReturnValue inside tests.
import { useEncounter } from '../../hooks/useEncounter';

beforeEach(() => {
  vi.clearAllMocks();
  useEncounter.mockReturnValue({
    encounter: makeEncounter([baseRequest]),
    appendLog: mockAppendLog,
    removeSaveRequest: mockRemoveSaveReq,
  });
});

describe('RequestedSaves', () => {
  test('renders nothing when there are no pending save requests', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    const { container } = render(<RequestedSaves />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when encounter is null', () => {
    useEncounter.mockReturnValue({
      encounter: null,
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    const { container } = render(<RequestedSaves />);
    expect(container.firstChild).toBeNull();
  });

  test('shows caster name, ability name, save type, and DC', () => {
    render(<RequestedSaves />);
    expect(screen.getByText(/Pellias/)).toBeInTheDocument();
    expect(screen.getByText(/Fireball/)).toBeInTheDocument();
    expect(screen.getByText(/Reflex DC/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
  });

  test('shows the cast rank when the request carries one (#235)', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, rank: 4 }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.getByText(/\(rank 4\)/)).toBeInTheDocument();
  });

  test('shows no rank label when the request has none', () => {
    render(<RequestedSaves />);
    expect(screen.queryByText(/\(rank/)).not.toBeInTheDocument();
  });

  test('shows "(basic)" label when basic is true', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, basic: true }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.getByText(/basic/i)).toBeInTheDocument();
  });

  test('does not show "(basic)" label when basic is false', () => {
    render(<RequestedSaves />);
    expect(screen.queryByText(/basic/i)).not.toBeInTheDocument();
  });

  test('shows each target name', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, targets: [goblinTarget, trollTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText('Troll')).toBeInTheDocument();
  });

  test('shows save modifier for each target that has one', () => {
    render(<RequestedSaves />);
    expect(screen.getByText(/mod \+5/)).toBeInTheDocument();
  });

  test('does not show modifier label when saveMod is null', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, targets: [noModTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.queryByText(/mod/)).not.toBeInTheDocument();
  });

  test('"Log Results" button is disabled until d20 is entered for all targets', () => {
    render(<RequestedSaves />);
    const btn = screen.getByRole('button', { name: /log results/i });
    expect(btn).toBeDisabled();
  });

  test('"Log Results" button is enabled once all targets have a d20', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    expect(screen.getByRole('button', { name: /log results/i })).not.toBeDisabled();
  });

  test('shows live degree while d20 is entered', () => {
    render(<RequestedSaves />);
    // DC 20, saveMod 5, d20 = 15 → total 20 → Success
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('nat-20 shifts degree up', () => {
    render(<RequestedSaves />);
    // DC 20, saveMod 5, d20 = 15 → total 20 → would be Success, nat-20 → Critical Success
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '20' } });
    // total = 20 + 5 = 25 ≥ DC+10 → Critical Success (and nat-20 also shifts up but already at max)
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });

  test('nat-1 shifts degree down', () => {
    render(<RequestedSaves />);
    // DC 20, saveMod 5, d20 = 1 → total 6 → would be Critical Failure, nat-1 keeps at Critical Failure
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '1' } });
    expect(screen.getByText('Critical Failure')).toBeInTheDocument();
  });

  test('shows computed total = d20 + saveMod', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '12' } });
    // total = 12 + 5 = 17
    expect(screen.getByText('= 17')).toBeInTheDocument();
  });

  test('clicking "Log Results" appends a log line for each target', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Goblin') })
    );
  });

  test('clicking "Log Results" calls removeSaveRequest with the request id', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));
    expect(mockRemoveSaveReq).toHaveBeenCalledWith('savereq-1');
  });

  test('two-target request: button disabled until both filled', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, id: 'req-2', targets: [goblinTarget, trollTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    const btn = screen.getByRole('button', { name: /log results/i });

    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '10' } });
    expect(btn).toBeDisabled(); // Troll not yet filled

    fireEvent.change(screen.getByLabelText(/Troll d20/i), { target: { value: '8' } });
    expect(btn).not.toBeDisabled();
  });

  test('two-target request: logs one line per target and removes the request', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, id: 'req-2', targets: [goblinTarget, trollTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Troll d20/i),  { target: { value: '5'  } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));

    expect(mockAppendLog).toHaveBeenCalledTimes(2);
    expect(mockRemoveSaveReq).toHaveBeenCalledWith('req-2');
  });

  test('target with null saveMod resolves with mod treated as 0', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, targets: [noModTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    // d20 = 20 + null saveMod (→ 0) = total 20 vs DC 20 → Success; nat-20 → Critical Success
    fireEvent.change(screen.getByLabelText(/Zombie d20/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Zombie') })
    );
  });

  test('skips resolved requests (only shows pending)', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([
        { ...baseRequest, id: 'req-done', status: 'resolved' },
        { ...baseRequest, id: 'req-pending', targets: [goblinTarget] },
      ]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    // Only one "Log Results" button (for the pending one)
    expect(screen.getAllByRole('button', { name: /log results/i })).toHaveLength(1);
  });
});
