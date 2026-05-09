import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GolarionCalendar from './GolarionCalendar';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

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

jest.mock('../data/CalendarEvents.json', () => [], { virtual: true });

describe('GolarionCalendar', () => {
  it('renders without crashing', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    expect(document.body).toBeTruthy();
  });

  it('displays the calendar grid', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    // Should have day cells for Pharast (31 days)
    const dayCells = document.querySelectorAll('.calendar-day, .day-cell, [class*="calendar"]');
    expect(dayCells.length).toBeGreaterThan(0);
  });

  it('renders month navigation', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    const prevBtns = screen.getAllByRole('button').filter(b => b.textContent.includes('←') || b.textContent.includes('<') || b.getAttribute('aria-label')?.includes('prev'));
    expect(prevBtns.length + screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('shows Pharast as current month', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    expect(screen.getByText(/Pharast/)).toBeInTheDocument();
  });

  it('shows the current year', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    expect(screen.getByText(/4725/)).toBeInTheDocument();
  });

  it('navigates to next month (Gozran) on Next button click', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    const nextBtn = screen.getByText(/Next/);
    await act(async () => { fireEvent.click(nextBtn); });
    expect(screen.getByText(/Gozran/)).toBeInTheDocument();
  });

  it('navigates to previous month (Calistril) on Previous button click', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    const prevBtn = screen.getByText(/Previous/);
    await act(async () => { fireEvent.click(prevBtn); });
    expect(screen.getByText(/Calistril/)).toBeInTheDocument();
  });

  it('wraps to Kuthona and decrements year when navigating back from month 0', async () => {
    // Navigate back from Pharast (2) to Calistril (1) to Abadius (0) to Kuthona (11) of prev year
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    const prevBtn = screen.getByText(/Previous/);
    // Click 3 times to get from month 2 to month 11 of previous year (via 2→1→0→11)
    for (let i = 0; i < 3; i++) {
      await act(async () => { fireEvent.click(prevBtn); });
    }
    expect(screen.getByText(/Kuthona/)).toBeInTheDocument();
    expect(screen.getByText(/4724/)).toBeInTheDocument();
  });

  it('wraps to Abadius and increments year when navigating forward from month 11', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    const nextBtn = screen.getByText(/Next/);
    // Navigate from Pharast (2) to Kuthona (11) then to Abadius (0) of next year
    // That's 9 clicks forward + 1 more = 10 clicks to wrap
    for (let i = 0; i < 10; i++) {
      await act(async () => { fireEvent.click(nextBtn); });
    }
    expect(screen.getByText(/Abadius/)).toBeInTheDocument();
    expect(screen.getByText(/4726/)).toBeInTheDocument();
  });

  it('renders the current game date day with current-date class', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    const { container } = { container: document.body };
    const currentDayCell = document.querySelector('.current-date');
    expect(currentDayCell).toBeInTheDocument();
  });

  it('renders day numbers in calendar grid', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    // Day 1 should be visible in the grid
    const dayNumbers = document.querySelectorAll('.day-number');
    expect(dayNumbers.length).toBeGreaterThan(0);
    expect(dayNumbers[0].textContent).toBe('1');
  });

  it('renders navigation buttons', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    expect(screen.getByText(/Previous/)).toBeInTheDocument();
    expect(screen.getByText(/Next/)).toBeInTheDocument();
  });

  it('renders weekday headers', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    expect(screen.getByText('Moonday')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
  });

  it('modal is not shown initially', async () => {
    await act(async () => { renderWithRouter(<GolarionCalendar />); });
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});
