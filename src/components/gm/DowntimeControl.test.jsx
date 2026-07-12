import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeControl from './DowntimeControl';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useDowntimePartyReady } from '../../hooks/useDowntimePartyReady';
import { CharacterContext } from '../../contexts/CharacterContext';

// DowntimeControl now pulls setGmMode + character state for the summary
const mockSetGmMode = vi.fn();
vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: vi.fn(() => ({ setGmMode: mockSetGmMode })),
}));

vi.mock('../../contexts/SessionContext', () => ({
  // subscribe is used by PartyTrainingBoard's usePartyActivity (returns an
  // unsubscribe fn); getState → null means nobody is mid-training here.
  useSession: vi.fn(() => ({ getState: vi.fn(() => null), sendUpdate: vi.fn(), subscribe: vi.fn(() => vi.fn()) })),
}));

// DowntimeControl renders DowntimeResultsApproval (uses the encounter log for
// the credit line); stub it so these tests don't need a real encounter.
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: vi.fn(() => ({ appendLog: vi.fn() })),
}));

const mockAdvanceHours = vi.fn();
const mockAdvanceDays = vi.fn();
const mockSetSpecificDate = vi.fn();
const mockGameDate = { day: 5, month: 2, year: 4725 };
const mockTime = { hour: 8, minute: 0, second: 0 };
const mockGolarionMonths = [
  { name: 'Abadius', days: 31, index: 0 },
  { name: 'Calistril', days: 28, index: 1 },
  { name: 'Pharast', days: 31, index: 2 },
];

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    advanceHours: mockAdvanceHours,
    advanceDays: mockAdvanceDays,
    setSpecificDate: mockSetSpecificDate,
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
    gameDate: mockGameDate,
    time: mockTime,
    GOLARION_MONTHS: mockGolarionMonths,
  }),
}));

const mockSetBlock = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, mockSetBlock]),
}));

vi.mock('../../hooks/useDowntimePartyReady', () => ({
  useDowntimePartyReady: vi.fn(() => ({ readyCount: 0, total: 5, allReady: false })),
}));

// Helper: mock both useSyncedState calls (block key + summary key).
const withBlock = (block) =>
  useSyncedState.mockImplementation((key) =>
    key === 'cnmh_downtimeblock_global' ? [block, mockSetBlock] : [null, vi.fn()]
  );

beforeEach(() => {
  vi.clearAllMocks();
  withBlock(null);
  useDowntimePartyReady.mockReturnValue({ readyCount: 0, total: 5, allReady: false });
});

describe('DowntimeControl', () => {
  it('renders the five quick-advance buttons and set clock button', () => {
    render(<DowntimeControl />);
    expect(screen.getByRole('button', { name: '-1 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '-1 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+8 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set date and time' })).toBeInTheDocument();
  });

  it('-1 hr calls advanceHours(-1)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '-1 hr' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(-1);
  });

  it('-1 day calls advanceDays(-1)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '-1 day' }));
    expect(mockAdvanceDays).toHaveBeenCalledWith(-1);
  });

  it('+1 hr calls advanceHours(1)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '+1 hr' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(1);
  });

  it('+8 hr calls advanceHours(8)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '+8 hr' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(8);
  });

  it('+1 day calls advanceDays(1)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
    expect(mockAdvanceDays).toHaveBeenCalledWith(1);
  });

  it('clicking Set… opens the Set date & time modal', () => {
    render(<DowntimeControl />);
    expect(screen.queryByRole('heading', { name: 'Set date & time' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set date and time' }));
    expect(screen.getByRole('heading', { name: 'Set date & time' })).toBeInTheDocument();
  });

  it('Apply button is disabled when input is empty', () => {
    render(<DowntimeControl />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('custom hours: entering a value and clicking Apply calls advanceHours', () => {
    render(<DowntimeControl />);
    fireEvent.change(screen.getByLabelText('Custom duration'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(3);
  });

  it('custom days: switching unit to days and applying calls advanceDays', () => {
    render(<DowntimeControl />);
    fireEvent.change(screen.getByLabelText('Custom duration'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Duration unit'), { target: { value: 'days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mockAdvanceDays).toHaveBeenCalledWith(5);
  });

  it('pressing Enter in the input applies the custom value', () => {
    render(<DowntimeControl />);
    const input = screen.getByLabelText('Custom duration');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockAdvanceHours).toHaveBeenCalledWith(2);
  });

  it('clears the input after applying', () => {
    render(<DowntimeControl />);
    const input = screen.getByLabelText('Custom duration');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(input.value).toBe('');
  });

  it('shows the current date and time', () => {
    render(<DowntimeControl />);
    expect(screen.getByText(/5 Pharast.*08:00/)).toBeInTheDocument();
  });

  describe('downtime period setter', () => {
    it('Start button is disabled when the period input is empty', () => {
      render(<DowntimeControl />);
      expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    });

    it('Start writes the block with days, active and the current date', () => {
      render(<DowntimeControl />);
      fireEvent.change(screen.getByLabelText('Downtime period in days'), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      expect(mockSetBlock).toHaveBeenCalledWith({ days: 7, active: true, startedAt: mockGameDate });
    });

    it('pressing Enter in the period input starts the block', () => {
      render(<DowntimeControl />);
      const input = screen.getByLabelText('Downtime period in days');
      fireEvent.change(input, { target: { value: '3' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockSetBlock).toHaveBeenCalledWith({ days: 3, active: true, startedAt: mockGameDate });
    });

    it('does not write a block for a non-positive period', () => {
      render(<DowntimeControl />);
      const input = screen.getByLabelText('Downtime period in days');
      fireEvent.change(input, { target: { value: '0' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(mockSetBlock).not.toHaveBeenCalled();
    });

    it('clears the period input after starting', () => {
      render(<DowntimeControl />);
      const input = screen.getByLabelText('Downtime period in days');
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      expect(input.value).toBe('');
    });

    it('shows Update and the granted days when a block is already active', () => {
      withBlock({ days: 4, active: true });
      render(<DowntimeControl />);
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
      expect(screen.getByText('4 days granted')).toBeInTheDocument();
    });
  });

  describe('block actions', () => {
    it('does not show Close block when no block is active', () => {
      render(<DowntimeControl />);
      expect(screen.queryByRole('button', { name: 'Close block' })).not.toBeInTheDocument();
    });

    it('shows Close block (and no manual Advance button) when a block is active', () => {
      withBlock({ days: 7, active: true });
      render(<DowntimeControl />);
      expect(screen.getByRole('button', { name: 'Close block' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Advance/ })).not.toBeInTheDocument();
    });

    it('Close block sets the block to inactive', () => {
      const block = { days: 7, active: true, startedAt: mockGameDate };
      withBlock(block);
      render(<DowntimeControl />);
      fireEvent.click(screen.getByRole('button', { name: 'Close block' }));
      expect(mockSetBlock).toHaveBeenCalledWith({ ...block, active: false });
    });

    it('shows party readiness from useDowntimePartyReady', () => {
      useDowntimePartyReady.mockReturnValue({ readyCount: 3, total: 5, allReady: false });
      withBlock({ days: 7, active: true });
      render(<DowntimeControl />);
      expect(screen.getByText('3/5 ready')).toBeInTheDocument();
    });

    it('shows "advancing…" suffix when allReady is true', () => {
      useDowntimePartyReady.mockReturnValue({ readyCount: 5, total: 5, allReady: true });
      withBlock({ days: 7, active: true });
      render(<DowntimeControl />);
      expect(screen.getByText(/5\/5 ready.*advancing/i)).toBeInTheDocument();
    });
  });

  describe('auto-advance', () => {
    it('writes summary, advances clock, closes block, and switches to Exploration', () => {
      const mockSetSummary = vi.fn();
      const activeBlock = { days: 7, active: true, startedAt: mockGameDate };
      useSyncedState.mockImplementation((key) =>
        key === 'cnmh_downtimeblock_global'
          ? [activeBlock, mockSetBlock]
          : [null, mockSetSummary]
      );

      useDowntimePartyReady.mockReturnValue({ readyCount: 0, total: 5, allReady: false });
      const { rerender } = render(<DowntimeControl />);
      expect(mockAdvanceDays).not.toHaveBeenCalled();

      useDowntimePartyReady.mockReturnValue({ readyCount: 5, total: 5, allReady: true });
      rerender(<DowntimeControl />);

      // Summary written (chars is empty — no CharacterContext provider in this test)
      expect(mockSetSummary).toHaveBeenCalledWith(
        expect.objectContaining({ period: { days: 7, startedAt: mockGameDate }, chars: [] })
      );
      // Clock advanced
      expect(mockAdvanceDays).toHaveBeenCalledWith(7);
      // Block closed via functional updater
      expect(mockSetBlock).toHaveBeenCalledWith(expect.any(Function));
      const updater = mockSetBlock.mock.calls[0][0];
      expect(updater({ days: 7, active: true, startedAt: mockGameDate })).toEqual({
        days: 7, active: false, startedAt: mockGameDate,
      });
      // Mode switched to Exploration
      expect(mockSetGmMode).toHaveBeenCalledWith('exploration');
    });

    it('does not auto-advance when allReady is false', () => {
      withBlock({ days: 7, active: true });
      render(<DowntimeControl />);
      expect(mockAdvanceDays).not.toHaveBeenCalled();
    });

    it('does not auto-advance when the block is inactive', () => {
      withBlock({ days: 7, active: false });
      render(<DowntimeControl />);
      expect(mockAdvanceDays).not.toHaveBeenCalled();
    });

    it('does not double-fire if allReady stays true across re-renders', () => {
      withBlock({ days: 7, active: true });
      useDowntimePartyReady.mockReturnValue({ readyCount: 0, total: 5, allReady: false });
      const { rerender } = render(<DowntimeControl />);

      useDowntimePartyReady.mockReturnValue({ readyCount: 5, total: 5, allReady: true });
      rerender(<DowntimeControl />);
      rerender(<DowntimeControl />); // extra render should not re-fire
      expect(mockAdvanceDays).toHaveBeenCalledTimes(1);
    });
  });

  describe('Earn Income task assignment', () => {
    const characters = [{ id: 'c1', name: 'Ashka' }, { id: 'c2', name: 'Izzy' }];
    const mockSetTaskMap = vi.fn();

    const withActiveBlockAndTasks = (taskMap) => {
      useSyncedState.mockImplementation((key) => {
        if (key === 'cnmh_downtimeblock_global') {
          return [{ days: 7, active: true, startedAt: mockGameDate }, mockSetBlock];
        }
        if (key === 'cnmh_earnincometask_global') return [taskMap, mockSetTaskMap];
        return [null, vi.fn()];
      });
    };

    const renderWithChars = () =>
      render(
        <CharacterContext.Provider value={{ characters }}>
          <DowntimeControl />
        </CharacterContext.Provider>
      );

    it('lists each PC with a task-level input while the block is active', () => {
      withActiveBlockAndTasks(null);
      renderWithChars();
      expect(screen.getByLabelText('Ashka Earn Income task level')).toBeInTheDocument();
      expect(screen.getByLabelText('Izzy Earn Income task level')).toBeInTheDocument();
    });

    it('shows the DC for an assigned level and clamps writes to 0–20', () => {
      withActiveBlockAndTasks({ c1: 8 });
      renderWithChars();
      expect(screen.getByText('DC 24')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Izzy Earn Income task level'), { target: { value: '25' } });
      expect(mockSetTaskMap).toHaveBeenCalledWith(expect.any(Function));
      expect(mockSetTaskMap.mock.calls[0][0]({ c1: 8 })).toEqual({ c1: 8, c2: 20 });
    });

    it('removes a PC from the task map when the level is cleared', () => {
      withActiveBlockAndTasks({ c1: 8 });
      renderWithChars();
      fireEvent.change(screen.getByLabelText('Ashka Earn Income task level'), { target: { value: '' } });
      expect(mockSetTaskMap.mock.calls[0][0]({ c1: 8 })).toEqual({});
    });
  });

  describe('Retrain / Research benchmarks', () => {
    const characters = [{ id: 'c1', name: 'Ashka' }];
    const mockSetBench = vi.fn();

    const withActiveBlockAndBench = (benchMap) => {
      useSyncedState.mockImplementation((key) => {
        if (key === 'cnmh_downtimeblock_global') {
          return [{ days: 7, active: true, startedAt: mockGameDate }, mockSetBlock];
        }
        if (key === 'cnmh_downtimebench_global') return [benchMap, mockSetBench];
        return [null, vi.fn()];
      });
    };

    const renderWithChars = () =>
      render(
        <CharacterContext.Provider value={{ characters }}>
          <DowntimeControl />
        </CharacterContext.Provider>
      );

    it('lists per-PC Retrain and Research day inputs', () => {
      withActiveBlockAndBench(null);
      renderWithChars();
      expect(screen.getByLabelText('Ashka Retrain benchmark days')).toBeInTheDocument();
      expect(screen.getByLabelText('Ashka Research benchmark days')).toBeInTheDocument();
    });

    it('writes a clamped per-activity benchmark', () => {
      withActiveBlockAndBench(null);
      renderWithChars();
      fireEvent.change(screen.getByLabelText('Ashka Retrain benchmark days'), { target: { value: '7' } });
      expect(mockSetBench.mock.calls[0][0]({})).toEqual({ c1: { Retrain: 7 } });
    });

    it('clears an activity (and the PC) when emptied', () => {
      withActiveBlockAndBench({ c1: { Retrain: 7 } });
      renderWithChars();
      fireEvent.change(screen.getByLabelText('Ashka Retrain benchmark days'), { target: { value: '' } });
      expect(mockSetBench.mock.calls[0][0]({ c1: { Retrain: 7 } })).toEqual({});
    });
  });
});
