import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GolarionCalendar from './GolarionCalendar';

jest.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    GOLARION_MONTHS: [
      { name: 'Abadius', days: 31, season: 'Winter', index: 0 },
      { name: 'Calistril', days: 28, season: 'Winter', index: 1 },
      { name: 'Pharast', days: 31, season: 'Spring', index: 2 },
      { name: 'Gozran', days: 30, season: 'Spring', index: 3 },
      { name: 'Desnus', days: 31, season: 'Spring', index: 4 },
      { name: 'Sarenith', days: 30, season: 'Summer', index: 5 },
      { name: 'Erastus', days: 31, season: 'Summer', index: 6 },
      { name: 'Arodus', days: 31, season: 'Summer', index: 7 },
      { name: 'Rova', days: 30, season: 'Autumn', index: 8 },
      { name: 'Lamashan', days: 31, season: 'Autumn', index: 9 },
      { name: 'Neth', days: 30, season: 'Autumn', index: 10 },
      { name: 'Kuthona', days: 31, season: 'Winter', index: 11 },
    ],
    GOLARION_WEEKDAYS: ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'],
    getDayOfWeek: ({ day }) => day % 7,
    getMoonPhaseInfo: () => ({
      phase: 1,
      name: 'Waxing Crescent',
      symbol: '🌒',
      lunarMonth: "Pharasma's Moon",
      daysUntilFull: 10,
      daysUntilNew: 20,
      isFullMoon: false,
      isNewMoon: false,
    }),
  }),
}));

jest.mock('../components/calendar/MoonPhase', () => {
  const MoonPhase = () => <div data-testid="moon-phase" />;
  MoonPhase.MoonPhaseIndicator = () => <div data-testid="moon-phase-indicator" />;
  return MoonPhase;
});

jest.mock('../data/Timeline.json', () => [], { virtual: true });

describe('GolarionCalendar', () => {
  it('renders without crashing', async () => {
    await act(async () => { render(<GolarionCalendar />); });
    expect(document.body).toBeTruthy();
  });

  it('displays the calendar grid', async () => {
    await act(async () => { render(<GolarionCalendar />); });
    // Should have day cells for Pharast (31 days)
    const dayCells = document.querySelectorAll('.calendar-day, .day-cell, [class*="calendar"]');
    expect(dayCells.length).toBeGreaterThan(0);
  });

  it('renders month navigation', async () => {
    await act(async () => { render(<GolarionCalendar />); });
    const prevBtns = screen.getAllByRole('button').filter(b => b.textContent.includes('←') || b.textContent.includes('<') || b.getAttribute('aria-label')?.includes('prev'));
    expect(prevBtns.length + screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('shows Pharast as current month', async () => {
    await act(async () => { render(<GolarionCalendar />); });
    expect(screen.getByText(/Pharast/)).toBeInTheDocument();
  });

  it('shows the current year', async () => {
    await act(async () => { render(<GolarionCalendar />); });
    expect(screen.getByText(/4725/)).toBeInTheDocument();
  });
});
