import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterContext } from '../../contexts/CharacterContext';
import PlayModeControl from './PlayModeControl';

const mockState = {
  mode: 'exploration',
  gmMode: 'exploration',
  moveEnabled: false,
  setGmMode: vi.fn(),
  setMoveEnabled: vi.fn(),
  setMoveOverride: vi.fn(),
};

vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => mockState,
}));

let mockAllChosen = true;
vi.mock('../../hooks/useExplorationReady', () => ({
  useExplorationReady: () => ({ allChosen: mockAllChosen }),
}));

const mockSendUpdate = vi.fn();
const mockGetState = vi.fn(() => null);
vi.mock('../../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => ({ sendUpdate: mockSendUpdate, getState: mockGetState, subscribe: vi.fn(() => () => {}) }),
}));

vi.mock('./ExplorationTimeControl', () => ({ default: () => <div data-testid="exploration-time-control" /> }));

const mockAdvanceHours = vi.fn();
const mockAdvanceDays = vi.fn();
const mockAdvanceMinutes = vi.fn();
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    advanceHours: mockAdvanceHours,
    advanceDays: mockAdvanceDays,
    advanceMinutes: mockAdvanceMinutes,
    setSpecificDate: vi.fn(),
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
    getCurrentWeekday: () => 'Moonday',
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
    GOLARION_MONTHS: [
      { name: 'Abadius', days: 31, index: 0 },
      { name: 'Calistril', days: 28, index: 1 },
      { name: 'Pharast', days: 31, index: 2 },
      { name: 'Gozran', days: 30, index: 3 },
      { name: 'Desnus', days: 31, index: 4 },
      { name: 'Sarenith', days: 30, index: 5 },
      { name: 'Erastus', days: 31, index: 6 },
      { name: 'Arodus', days: 31, index: 7 },
      { name: 'Rova', days: 30, index: 8 },
      { name: 'Lamashan', days: 31, index: 9 },
      { name: 'Neth', days: 30, index: 10 },
      { name: 'Kuthona', days: 31, index: 11 },
    ],
  }),
}));

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, vi.fn()]),
}));

const mockClearTake10 = vi.fn();
let mockTake10 = { allReady: false, minutes: 10, openedAt: 0, clear: mockClearTake10 };
vi.mock('../../hooks/useTake10', () => ({
  __esModule: true,
  useTake10: () => mockTake10,
}));

import { useSyncedState } from '../../hooks/useSyncedState';

const mockOpenLore = vi.fn();
vi.mock('../../contexts/LoreContext', () => ({
  useLore: () => ({ openLore: mockOpenLore }),
}));

const renderWith = (characters = []) =>
  render(
    <CharacterContext.Provider value={{ characters }}>
      <PlayModeControl />
    </CharacterContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockState.mode = 'exploration';
  mockState.gmMode = 'exploration';
  mockState.moveEnabled = false;
  mockAllChosen = true;
  mockTake10 = { allReady: false, minutes: 10, openedAt: 0, clear: mockClearTake10 };
});

const renderDowntime = () => {
  mockState.gmMode = 'downtime';
  return render(
    <CharacterContext.Provider value={{ characters: [] }}>
      <PlayModeControl />
    </CharacterContext.Provider>
  );
};

describe('PlayModeControl', () => {
  it('on all-ready: resolves allocations, advances the clock, and closes the beat', () => {
    mockTake10 = { allReady: true, minutes: 20, openedAt: 500, clear: mockClearTake10 };
    mockGetState.mockImplementation((id, key) => {
      if (id === 'a' && key === 'take10alloc') {
        return { beatAt: 500, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] };
      }
      if (id === 'a' && key === 'focus') return 2;
      return null;
    });
    renderWith([{ id: 'a', name: 'Ari' }]);
    expect(mockSendUpdate).toHaveBeenCalledWith('a', 'focus', 0);
    expect(mockAdvanceMinutes).toHaveBeenCalledWith(20);
    expect(mockClearTake10).toHaveBeenCalled();
  });

  it('does not advance the clock while the party is not all-ready', () => {
    renderWith([{ id: 'a', name: 'Ari' }]);
    expect(mockAdvanceMinutes).not.toHaveBeenCalled();
  });

  it('always shows all three mode pills; only Encounter is non-interactive', () => {
    renderWith();
    expect(screen.getByRole('button', { name: 'Exploration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Downtime' })).toBeInTheDocument();
    // Encounter is a status pill (span), never a button.
    expect(screen.getByText('Encounter')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encounter' })).not.toBeInTheDocument();
  });

  it('disables Exploration/Downtime and marks Encounter active during an encounter', () => {
    mockState.mode = 'encounter';
    renderWith();
    expect(screen.getByText('Encounter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exploration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Downtime' })).toBeDisabled();
  });

  it('calls setGmMode with downtime when Downtime button clicked', () => {
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: 'Downtime' }));
    expect(mockState.setGmMode).toHaveBeenCalledWith('downtime');
  });

  it('calls setGmMode with exploration when Exploration button clicked', () => {
    mockState.gmMode = 'downtime';
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: 'Exploration' }));
    expect(mockState.setGmMode).toHaveBeenCalledWith('exploration');
  });

  it('shows movement toggle in exploration mode', () => {
    renderWith();
    expect(screen.getByLabelText('Allow token movement')).toBeInTheDocument();
  });

  it('hides movement toggle in downtime mode', () => {
    mockState.gmMode = 'downtime';
    renderWith();
    expect(screen.queryByLabelText('Allow token movement')).not.toBeInTheDocument();
  });

  it('hides movement toggle during encounter', () => {
    mockState.mode = 'encounter';
    renderWith();
    expect(screen.queryByLabelText('Allow token movement')).not.toBeInTheDocument();
  });

  it('toggles movement off→on when toggle clicked', () => {
    renderWith();
    fireEvent.click(screen.getByLabelText('Allow token movement'));
    expect(mockState.setMoveEnabled).toHaveBeenCalledWith(true);
  });

  it('toggles movement on→off when toggle clicked', () => {
    mockState.moveEnabled = true;
    renderWith();
    fireEvent.click(screen.getByLabelText('Allow token movement'));
    expect(mockState.setMoveEnabled).toHaveBeenCalledWith(false);
  });

  it('reflects moveEnabled state on the switch', () => {
    mockState.moveEnabled = true;
    const { rerender } = renderWith();
    const onSwitch = screen.getByLabelText('Allow token movement');
    expect(onSwitch).toHaveClass('pmc-switch--on');
    expect(onSwitch).toHaveAttribute('aria-checked', 'true');

    mockState.moveEnabled = false;
    rerender(
      <CharacterContext.Provider value={{ characters: [] }}>
        <PlayModeControl />
      </CharacterContext.Provider>
    );
    const offSwitch = screen.getByLabelText('Allow token movement');
    expect(offSwitch).not.toHaveClass('pmc-switch--on');
    expect(offSwitch).toHaveAttribute('aria-checked', 'false');
  });

  describe('Start movement override', () => {
    it('shows the override button when not all PCs have chosen', () => {
      mockAllChosen = false;
      renderWith();
      expect(screen.getByRole('button', { name: 'Start movement' })).toBeInTheDocument();
      expect(screen.getByText(/waiting for the party/i)).toBeInTheDocument();
    });

    it('hides the override button once all PCs have chosen', () => {
      mockAllChosen = true;
      renderWith();
      expect(screen.queryByRole('button', { name: 'Start movement' })).not.toBeInTheDocument();
    });

    it('hides the override button in downtime', () => {
      mockAllChosen = false;
      mockState.gmMode = 'downtime';
      renderWith();
      expect(screen.queryByRole('button', { name: 'Start movement' })).not.toBeInTheDocument();
    });

    it('hides the override button during encounter', () => {
      mockAllChosen = false;
      mockState.mode = 'encounter';
      renderWith();
      expect(screen.queryByRole('button', { name: 'Start movement' })).not.toBeInTheDocument();
    });

    it('calls setMoveOverride(true) when clicked', () => {
      mockAllChosen = false;
      renderWith();
      fireEvent.click(screen.getByRole('button', { name: 'Start movement' }));
      expect(mockState.setMoveOverride).toHaveBeenCalledWith(true);
    });
  });

  describe('Downtime time-advance controls', () => {
    it('shows downtime controls when gmMode is downtime', () => {
      renderDowntime();
      expect(screen.getByRole('button', { name: '+1 hr' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+8 hr' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+1 day' })).toBeInTheDocument();
    });

    it('does not show downtime controls in exploration mode', () => {
      renderWith();
      expect(screen.queryByRole('button', { name: '+1 hr' })).not.toBeInTheDocument();
    });

    it('does not show downtime controls during encounter', () => {
      mockState.mode = 'encounter';
      mockState.gmMode = 'downtime';
      renderWith();
      expect(screen.queryByRole('button', { name: '+1 hr' })).not.toBeInTheDocument();
    });

    it('+1 hr calls advanceHours(1)', () => {
      renderDowntime();
      fireEvent.click(screen.getByRole('button', { name: '+1 hr' }));
      expect(mockAdvanceHours).toHaveBeenCalledWith(1);
    });

    it('+8 hr calls advanceHours(8)', () => {
      renderDowntime();
      fireEvent.click(screen.getByRole('button', { name: '+8 hr' }));
      expect(mockAdvanceHours).toHaveBeenCalledWith(8);
    });

    it('+1 day calls advanceDays(1)', () => {
      renderDowntime();
      fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
      expect(mockAdvanceDays).toHaveBeenCalledWith(1);
    });
  });

  describe('Authoritative reset on entering exploration', () => {
    it('clears every party pick and drops the override on downtime→exploration', () => {
      mockState.mode = 'downtime';
      const characters = [{ id: 'a' }, { id: 'b' }];
      const { rerender } = renderWith(characters);
      expect(mockSendUpdate).not.toHaveBeenCalled();

      mockState.mode = 'exploration';
      rerender(
        <CharacterContext.Provider value={{ characters }}>
          <PlayModeControl />
        </CharacterContext.Provider>
      );

      expect(mockState.setMoveOverride).toHaveBeenCalledWith(false);
      expect(mockSendUpdate).toHaveBeenCalledWith('a', 'exploration', null);
      expect(mockSendUpdate).toHaveBeenCalledWith('b', 'exploration', null);
    });

    it('does not clear when already in exploration on mount', () => {
      renderWith([{ id: 'a' }]);
      expect(mockSendUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Location lore link', () => {
    it('shows a lore-link button when locationLoreId is set', () => {
      useSyncedState.mockReturnValue([
        { location: 'Sandpoint', locationLoreId: 'sandpoint' },
        vi.fn(),
      ]);
      renderWith();
      expect(screen.getByRole('button', { name: 'View location lore' })).toBeInTheDocument();
    });

    it('calls openLore with the locationLoreId when the button is clicked', () => {
      useSyncedState.mockReturnValue([
        { location: 'Sandpoint', locationLoreId: 'sandpoint' },
        vi.fn(),
      ]);
      renderWith();
      fireEvent.click(screen.getByRole('button', { name: 'View location lore' }));
      expect(mockOpenLore).toHaveBeenCalledWith('sandpoint');
    });

    it('does not show the lore-link button when locationLoreId is empty', () => {
      useSyncedState.mockReturnValue([
        { location: 'Somewhere', locationLoreId: '' },
        vi.fn(),
      ]);
      renderWith();
      expect(screen.queryByRole('button', { name: 'View location lore' })).not.toBeInTheDocument();
    });
  });

  describe('Treasure stat', () => {
    it('renders the summed party gold read-only (no editable input)', () => {
      mockGetState.mockImplementation((id, type) =>
        type === 'gold' ? ({ a: 30, b: 12 }[id] ?? 0) : null
      );
      renderWith([{ id: 'a' }, { id: 'b' }]);
      expect(screen.getByText('Treasure')).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) => el?.classList?.contains('pmc-meta-gold') && el.textContent === '42gp'
        )
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Party treasure in gold')).not.toBeInTheDocument();
    });
  });

  describe('Entering Downtime', () => {
    // Per-period reset is now declarative (periodStartedAt + periodState in
    // downtimeUtils), so entering Downtime no longer fans out a clear write.
    it('does not write any downtime state when entering Downtime', () => {
      mockGetState.mockImplementation((charId, type) =>
        type === 'downtime'
          ? { selected: ['Research'], ledger: [{ day: 'Research', night: null }] }
          : null
      );
      mockState.gmMode = 'exploration';
      const characters = [{ id: 'a' }, { id: 'b' }];
      const { rerender } = renderWith(characters);

      mockState.gmMode = 'downtime';
      rerender(
        <CharacterContext.Provider value={{ characters }}>
          <PlayModeControl />
        </CharacterContext.Provider>
      );

      expect(mockSendUpdate).not.toHaveBeenCalledWith(
        expect.anything(), 'downtime', expect.anything()
      );
    });
  });
});
