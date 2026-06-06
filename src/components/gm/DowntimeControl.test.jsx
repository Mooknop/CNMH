import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeControl from './DowntimeControl';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useDowntimePartyReady } from '../../hooks/useDowntimePartyReady';

// DowntimeControl now pulls setGmMode + character state for the summary
const mockSetGmMode = vi.fn();
vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: vi.fn(() => ({ setGmMode: mockSetGmMode })),
}));

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(() => ({ getState: vi.fn(() => null), sendUpdate: vi.fn() })),
}));

const mockAdvanceHours = vi.fn();
const mockAdvanceDays = vi.fn();
const mockGameDate = { day: 5, month: 2, year: 4725 };

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    advanceHours: mockAdvanceHours,
    advanceDays: mockAdvanceDays,
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
    gameDate: mockGameDate,
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
  it('renders the three quick-advance buttons', () => {
    render(<DowntimeControl />);
    expect(screen.getByRole('button', { name: '+1 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+8 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 day' })).toBeInTheDocument();
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
});
