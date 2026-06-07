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
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    advanceHours: mockAdvanceHours,
    advanceDays: mockAdvanceDays,
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
    getCurrentWeekday: () => 'Moonday',
    gameDate: { day: 5, month: 2, year: 4725 },
  }),
}));

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, vi.fn()]),
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

  describe('Clear selected activities on entering Downtime', () => {
    it('clears selected for all characters when entering Downtime', () => {
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

      expect(mockSendUpdate).toHaveBeenCalledWith('a', 'downtime', {
        selected: [],
        ledger: [{ day: 'Research', night: null }],
      });
      expect(mockSendUpdate).toHaveBeenCalledWith('b', 'downtime', {
        selected: [],
        ledger: [{ day: 'Research', night: null }],
      });
    });

    it('preserves ledger (accumulated progress) when clearing selected', () => {
      const ledger = [
        { day: 'Crafting', night: 'Crafting' },
        { day: 'Crafting', night: null },
      ];
      mockGetState.mockImplementation(() => ({ selected: ['Crafting'], ledger }));
      mockState.gmMode = 'exploration';
      const { rerender } = renderWith([{ id: 'a' }]);

      mockState.gmMode = 'downtime';
      rerender(
        <CharacterContext.Provider value={{ characters: [{ id: 'a' }] }}>
          <PlayModeControl />
        </CharacterContext.Provider>
      );

      expect(mockSendUpdate).toHaveBeenCalledWith('a', 'downtime', { selected: [], ledger });
    });

    it('does not clear selected when already in Downtime on mount', () => {
      mockState.gmMode = 'downtime';
      renderWith([{ id: 'a' }]);
      expect(mockSendUpdate).not.toHaveBeenCalledWith(expect.anything(), 'downtime', expect.anything());
    });
  });
});
