import React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
  GameDateProvider,
  useGameDate,
  GOLARION_MONTHS,
  GOLARION_WEEKDAYS,
  MOON_PHASES,
  MOON_PHASE_NAMES,
} from './GameDateContext';

const TestConsumer = ({ fn, testId }) => {
  const ctx = useGameDate();
  return <span data-testid={testId || 'result'}>{fn(ctx)}</span>;
};

const renderWithProvider = (fn, testId) =>
  render(
    <GameDateProvider>
      <TestConsumer fn={fn} testId={testId} />
    </GameDateProvider>
  );

describe('GameDateContext', () => {
  it('provides gameDate default values', () => {
    renderWithProvider(ctx => `${ctx.gameDate.day}/${ctx.gameDate.month}/${ctx.gameDate.year}`);
    expect(screen.getByTestId('result').textContent).toBe('5/2/4725');
  });

  it('formatGameDate returns formatted string', () => {
    renderWithProvider(ctx => ctx.formatGameDate());
    expect(screen.getByTestId('result').textContent).toBe('5 Pharast, 4725 AR');
  });

  it('getCurrentMonth returns Pharast (index 2)', () => {
    renderWithProvider(ctx => ctx.getCurrentMonth().name);
    expect(screen.getByTestId('result').textContent).toBe('Pharast');
  });

  it('getCurrentYear returns 4725', () => {
    renderWithProvider(ctx => String(ctx.getCurrentYear()));
    expect(screen.getByTestId('result').textContent).toBe('4725');
  });

  it('getCurrentSeason returns Spring', () => {
    renderWithProvider(ctx => ctx.getCurrentSeason());
    expect(screen.getByTestId('result').textContent).toBe('Spring');
  });

  it('getCurrentWeekday returns a valid weekday', () => {
    renderWithProvider(ctx => ctx.getCurrentWeekday());
    const text = screen.getByTestId('result').textContent;
    expect(GOLARION_WEEKDAYS).toContain(text);
  });

  it('getMoonPhase returns a valid phase index', () => {
    renderWithProvider(ctx => String(ctx.getMoonPhase()));
    const phase = Number(screen.getByTestId('result').textContent);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThanOrEqual(7);
  });

  it('getMoonPhaseInfo returns an object with expected keys', () => {
    renderWithProvider(ctx => {
      const info = ctx.getMoonPhaseInfo();
      return Object.keys(info).join(',');
    });
    const keys = screen.getByTestId('result').textContent.split(',');
    expect(keys).toContain('phase');
    expect(keys).toContain('name');
    expect(keys).toContain('symbol');
    expect(keys).toContain('lunarMonth');
    expect(keys).toContain('daysUntilFull');
    expect(keys).toContain('daysUntilNew');
    expect(keys).toContain('isFullMoon');
    expect(keys).toContain('isNewMoon');
  });

  it('getLunarMonthName returns correct name for month 2', () => {
    renderWithProvider(ctx => ctx.getLunarMonthName());
    // Month 2 = Pharast = "Pharasma's Moon"
    expect(screen.getByTestId('result').textContent).toContain("Pharasma");
  });

  it('getDaysUntilFullMoon returns a non-negative number', () => {
    renderWithProvider(ctx => String(ctx.getDaysUntilFullMoon()));
    expect(Number(screen.getByTestId('result').textContent)).toBeGreaterThanOrEqual(0);
  });

  it('getDaysUntilNewMoon returns a non-negative number', () => {
    renderWithProvider(ctx => String(ctx.getDaysUntilNewMoon()));
    expect(Number(screen.getByTestId('result').textContent)).toBeGreaterThanOrEqual(0);
  });

  it('getDayOfWeek returns a number 0-6', () => {
    renderWithProvider(ctx => String(ctx.getDayOfWeek()));
    const dow = Number(screen.getByTestId('result').textContent);
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThanOrEqual(6);
  });

  it('getDetailedDate includes all expected fields', () => {
    renderWithProvider(ctx => {
      const d = ctx.getDetailedDate();
      return Object.keys(d).join(',');
    });
    const keys = screen.getByTestId('result').textContent.split(',');
    expect(keys).toContain('monthName');
    expect(keys).toContain('season');
    expect(keys).toContain('weekday');
    expect(keys).toContain('formatted');
    expect(keys).toContain('moon');
  });

  it('advanceDays updates the game date', () => {
    const AdvanceTest = () => {
      const { gameDate, advanceDays } = useGameDate();
      return (
        <div>
          <span data-testid="day">{gameDate.day}</span>
          <button onClick={() => advanceDays(3)}>Advance</button>
        </div>
      );
    };
    render(<GameDateProvider><AdvanceTest /></GameDateProvider>);
    expect(screen.getByTestId('day').textContent).toBe('5');
    act(() => { screen.getByText('Advance').click(); });
    expect(screen.getByTestId('day').textContent).toBe('8');
  });

  it('advanceDays handles month transitions', () => {
    const MonthTest = () => {
      const { gameDate, advanceDays } = useGameDate();
      return (
        <div>
          <span data-testid="month">{gameDate.month}</span>
          <span data-testid="day">{gameDate.day}</span>
          <button onClick={() => advanceDays(27)}>Advance</button>
        </div>
      );
    };
    render(<GameDateProvider><MonthTest /></GameDateProvider>);
    // Start: day 5, month 2 (Pharast, 31 days). After 27 days = day 32 of Pharast -> day 1 of Gozran (month 3)
    act(() => { screen.getByText('Advance').click(); });
    expect(screen.getByTestId('month').textContent).toBe('3');
    expect(screen.getByTestId('day').textContent).toBe('1');
  });

  it('setSpecificDate sets a valid date', () => {
    const SetDateTest = () => {
      const { gameDate, setSpecificDate } = useGameDate();
      return (
        <div>
          <span data-testid="day">{gameDate.day}</span>
          <span data-testid="month">{gameDate.month}</span>
          <button onClick={() => setSpecificDate(15, 5, 4726)}>Set</button>
        </div>
      );
    };
    render(<GameDateProvider><SetDateTest /></GameDateProvider>);
    act(() => { screen.getByText('Set').click(); });
    expect(screen.getByTestId('day').textContent).toBe('15');
    expect(screen.getByTestId('month').textContent).toBe('5');
  });

  it('setSpecificDate ignores invalid month', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const SetDateTest = () => {
      const { gameDate, setSpecificDate } = useGameDate();
      return (
        <div>
          <span data-testid="day">{gameDate.day}</span>
          <button onClick={() => setSpecificDate(1, 15, 4726)}>Set Bad</button>
        </div>
      );
    };
    render(<GameDateProvider><SetDateTest /></GameDateProvider>);
    act(() => { screen.getByText('Set Bad').click(); });
    // Day should remain 5 (unchanged) since invalid month
    expect(screen.getByTestId('day').textContent).toBe('5');
    consoleSpy.mockRestore();
  });

  it('setSpecificDate ignores invalid day', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const SetDateTest = () => {
      const { gameDate, setSpecificDate } = useGameDate();
      return (
        <div>
          <span data-testid="day">{gameDate.day}</span>
          <button onClick={() => setSpecificDate(99, 2, 4726)}>Set Bad Day</button>
        </div>
      );
    };
    render(<GameDateProvider><SetDateTest /></GameDateProvider>);
    act(() => { screen.getByText('Set Bad Day').click(); });
    expect(screen.getByTestId('day').textContent).toBe('5');
    consoleSpy.mockRestore();
  });

  it('useGameDate throws when used outside provider', () => {
    const BrokenConsumer = () => {
      useGameDate();
      return null;
    };
    expect(() => render(<BrokenConsumer />)).toThrow('useGameDate must be used within a GameDateProvider');
  });

  it('exports GOLARION_MONTHS with 12 months', () => {
    expect(GOLARION_MONTHS).toHaveLength(12);
    expect(GOLARION_MONTHS[0].name).toBe('Abadius');
  });

  it('exports MOON_PHASES constants', () => {
    expect(MOON_PHASES.NEW_MOON).toBe(0);
    expect(MOON_PHASES.FULL_MOON).toBe(4);
  });

  it('exports MOON_PHASE_NAMES with 8 entries', () => {
    expect(MOON_PHASE_NAMES).toHaveLength(8);
    expect(MOON_PHASE_NAMES[0]).toBe('New Moon');
    expect(MOON_PHASE_NAMES[4]).toBe('Full Moon');
  });

  it('isFullMoon and isNewMoon return booleans', () => {
    renderWithProvider(ctx => {
      const full = ctx.isFullMoon();
      const newMoon = ctx.isNewMoon();
      return `${typeof full},${typeof newMoon}`;
    });
    expect(screen.getByTestId('result').textContent).toBe('boolean,boolean');
  });
});
