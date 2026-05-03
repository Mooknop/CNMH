import React from 'react';
import { render, screen } from '@testing-library/react';
import MoonPhase, { MoonPhaseIndicator } from './MoonPhase';

const mockGameDate = (overrides = {}) => ({
  getCurrentSeason: () => 'Spring',
  formatGameDate: () => '5 Pharast, 4725 AR',
  getMoonPhaseInfo: () => ({
    phase: 1,
    name: 'Waxing Crescent',
    symbol: '🌒',
    lunarMonth: "Pharasma's Moon",
    daysUntilFull: 10,
    daysUntilNew: 22,
    isFullMoon: false,
    isNewMoon: false,
  }),
  MOON_PHASES: { NEW_MOON: 0, WAXING_CRESCENT: 1, FIRST_QUARTER: 2, WAXING_GIBBOUS: 3, FULL_MOON: 4, WANING_GIBBOUS: 5, LAST_QUARTER: 6, WANING_CRESCENT: 7 },
  ...overrides,
});

jest.mock('../../contexts/GameDateContext', () => ({
  useGameDate: jest.fn(),
}));

const { useGameDate } = require('../../contexts/GameDateContext');

describe('MoonPhase', () => {
  beforeEach(() => {
    useGameDate.mockReturnValue(mockGameDate());
  });

  it('renders the moon phase name', () => {
    render(<MoonPhase />);
    expect(screen.getByText('Waxing Crescent')).toBeInTheDocument();
  });

  it('renders the formatted date', () => {
    render(<MoonPhase />);
    expect(screen.getByText(/5 Pharast, 4725 AR/)).toBeInTheDocument();
  });

  it('renders the season', () => {
    render(<MoonPhase />);
    expect(screen.getByText(/Spring/)).toBeInTheDocument();
  });

  it('shows "Next Full Moon" countdown when closer to full moon', () => {
    // daysUntilFull (10) < daysUntilNew (22)
    render(<MoonPhase />);
    expect(screen.getByText('Next Full Moon:')).toBeInTheDocument();
    expect(screen.getByText('10 days')).toBeInTheDocument();
  });

  it('shows "Tomorrow" when full moon is 1 day away', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 3, name: 'Waxing Gibbous', symbol: '🌔',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 1, daysUntilNew: 30,
        isFullMoon: false, isNewMoon: false,
      }),
    }));
    render(<MoonPhase />);
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('shows "Next New Moon" countdown when closer to new moon', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 5, name: 'Waning Gibbous', symbol: '🌖',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 20, daysUntilNew: 5,
        isFullMoon: false, isNewMoon: false,
      }),
    }));
    render(<MoonPhase />);
    expect(screen.getByText('Next New Moon:')).toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
  });

  it('shows full moon notice on full moon', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 4, name: 'Full Moon', symbol: '🌕',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 0, daysUntilNew: 16,
        isFullMoon: true, isNewMoon: false,
      }),
    }));
    render(<MoonPhase />);
    expect(screen.getByText(/Lycanthropes beware/)).toBeInTheDocument();
  });

  it('shows new moon notice on new moon', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 0, name: 'New Moon', symbol: '🌑',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 16, daysUntilNew: 0,
        isFullMoon: false, isNewMoon: true,
      }),
    }));
    render(<MoonPhase />);
    expect(screen.getByText(/shadow magic/)).toBeInTheDocument();
  });

  it('renders compact mode', () => {
    render(<MoonPhase compact />);
    expect(screen.getByText('Waxing Crescent')).toBeInTheDocument();
    const container = document.querySelector('.moon-phase-compact');
    expect(container).toBeInTheDocument();
  });
});

describe('MoonPhaseIndicator', () => {
  it('renders nothing for non-key phases', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 1, // Waxing Crescent — not a key phase
        name: 'Waxing Crescent', symbol: '🌒',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 10, daysUntilNew: 22,
        isFullMoon: false, isNewMoon: false,
      }),
    }));
    const { container } = render(<MoonPhaseIndicator date={{ day: 5, month: 2, year: 4725 }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders for full moon', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 4, name: 'Full Moon', symbol: '🌕',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 0, daysUntilNew: 16,
        isFullMoon: true, isNewMoon: false,
      }),
    }));
    const { container } = render(<MoonPhaseIndicator date={{ day: 16, month: 2, year: 4725 }} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders for new moon', () => {
    useGameDate.mockReturnValue(mockGameDate({
      getMoonPhaseInfo: () => ({
        phase: 0, name: 'New Moon', symbol: '🌑',
        lunarMonth: "Pharasma's Moon",
        daysUntilFull: 16, daysUntilNew: 0,
        isFullMoon: false, isNewMoon: true,
      }),
    }));
    const { container } = render(<MoonPhaseIndicator date={{ day: 1, month: 2, year: 4725 }} />);
    expect(container.firstChild).not.toBeNull();
  });
});
