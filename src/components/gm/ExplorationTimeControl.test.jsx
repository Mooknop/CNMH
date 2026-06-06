import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationTimeControl from './ExplorationTimeControl';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAdvanceMinutes = vi.fn();
const mockAdvanceSeconds = vi.fn();
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    advanceMinutes: mockAdvanceMinutes,
    advanceSeconds: mockAdvanceSeconds,
    formatGameDate: () => 'Pharast 5, 4725',
    formatClockTime: () => '08:00',
  }),
}));

let mockExploreDist = 0;
let mockRoster = [];
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (key === 'cnmh_exploredist_global') {
      return [mockExploreDist, vi.fn((updater) => {
        mockExploreDist = typeof updater === 'function' ? updater(mockExploreDist) : updater;
      })];
    }
    if (key === 'cnmh_roster_global') return [mockRoster, vi.fn()];
    return [null, vi.fn()];
  },
}));

// ── helpers ────────────────────────────────────────────────────────────────

function renderControl() {
  return render(<ExplorationTimeControl />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExploreDist = 0;
  mockRoster = [];
});

// ── quick buttons ──────────────────────────────────────────────────────────

describe('quick buttons', () => {
  it('+10 min calls advanceMinutes(10)', () => {
    renderControl();
    fireEvent.click(screen.getByText('+10 min'));
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(10);
  });

  it('+30 min calls advanceMinutes(30)', () => {
    renderControl();
    fireEvent.click(screen.getByText('+30 min'));
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(30);
  });

  it('+1 hr calls advanceMinutes(60)', () => {
    renderControl();
    fireEvent.click(screen.getByText('+1 hr'));
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(60);
  });
});

// ── custom input ───────────────────────────────────────────────────────────

describe('custom input', () => {
  it('Apply is disabled when input is empty', () => {
    renderControl();
    const applyBtns = screen.getAllByText('Apply');
    // Custom apply is the first one (suggestion is hidden when no distance)
    expect(applyBtns[0]).toBeDisabled();
  });

  it('advances by entered minutes on Apply click', () => {
    renderControl();
    fireEvent.change(screen.getByLabelText('Custom time amount'), { target: { value: '45' } });
    fireEvent.click(screen.getAllByText('Apply')[0]);
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(45);
  });

  it('converts hours to minutes when unit is hr', () => {
    renderControl();
    fireEvent.change(screen.getByLabelText('Custom time amount'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Time unit'), { target: { value: 'hours' } });
    fireEvent.click(screen.getAllByText('Apply')[0]);
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(120);
  });

  it('applies on Enter key', () => {
    renderControl();
    fireEvent.change(screen.getByLabelText('Custom time amount'), { target: { value: '15' } });
    fireEvent.keyDown(screen.getByLabelText('Custom time amount'), { key: 'Enter' });
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(15);
  });

  it('clears input after applying', () => {
    renderControl();
    fireEvent.change(screen.getByLabelText('Custom time amount'), { target: { value: '20' } });
    fireEvent.click(screen.getAllByText('Apply')[0]);
    expect(screen.getByLabelText('Custom time amount').value).toBe('');
  });
});

// ── suggestion math ────────────────────────────────────────────────────────

describe('distance suggestion', () => {
  it('is hidden when there is no accumulated distance', () => {
    mockExploreDist = 0;
    mockRoster = [{ actorId: 'a1', speed: 30 }];
    renderControl();
    expect(screen.queryByText(/Party moved/i)).toBeNull();
  });

  it('is hidden when roster is empty', () => {
    mockExploreDist = 300;
    mockRoster = [];
    renderControl();
    expect(screen.queryByText(/Party moved/i)).toBeNull();
  });

  it('computes correct suggestion for a single actor (speed 25, 300 ft)', () => {
    // rawSeconds = 300 * 12 / 25 = 144 s = 2.4 min → rounded to nearest 10 = 10 min
    mockExploreDist = 300;
    mockRoster = [{ actorId: 'a1', name: 'Pellias', speed: 25 }];
    renderControl();
    expect(screen.getByText(/~10 min/i)).toBeInTheDocument();
  });

  it('uses the LOWEST speed among party members', () => {
    // Slow party member (20 ft) determines pace; 300 ft * 12 / 20 = 180 s = 3 min → 10 min
    mockExploreDist = 300;
    mockRoster = [
      { actorId: 'a1', speed: 30 },
      { actorId: 'a2', speed: 20 },
      { actorId: 'a3', speed: 35 },
    ];
    renderControl();
    // With speed 20: 300 * 12 / 20 = 180 s = 3 min → rounds to 10 min
    expect(screen.getByText(/~10 min/i)).toBeInTheDocument();
  });

  it('suggests larger increments for longer distances (speed 30, 3000 ft)', () => {
    // rawSeconds = 3000 * 12 / 30 = 1200 s = 20 min → rounds to 20 min
    mockExploreDist = 3000;
    mockRoster = [{ actorId: 'a1', speed: 30 }];
    renderControl();
    expect(screen.getByText(/~20 min/i)).toBeInTheDocument();
  });

  it('shows accumulated feet in the suggestion label', () => {
    mockExploreDist = 150;
    mockRoster = [{ actorId: 'a1', speed: 30 }];
    renderControl();
    expect(screen.getByText(/150 ft/i)).toBeInTheDocument();
  });

  it('Apply calls advanceSeconds with suggestion and resets exploredist', () => {
    // 300 ft, speed 25 → 10 min → 600 s
    mockExploreDist = 300;
    mockRoster = [{ actorId: 'a1', speed: 25 }];
    renderControl();
    // The suggestion Apply is the last button
    const applyBtns = screen.getAllByText('Apply');
    fireEvent.click(applyBtns[applyBtns.length - 1]);
    expect(mockAdvanceSeconds).toHaveBeenCalledWith(600); // 10 min × 60
    expect(mockExploreDist).toBe(0);
  });
});
