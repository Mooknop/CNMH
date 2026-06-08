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
  // The clock is now synced (cnmh_clock_global) and falls back to localStorage
  // when no SessionProvider is present — clear it so tests stay isolated.
  beforeEach(() => {
    localStorage.clear();
  });

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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('identifies full moon and new moon correctly using known dates', () => {
    const MoonTest = () => {
      const { gameDate, setSpecificDate, getMoonPhaseInfo, getDaysUntilFullMoon, getDaysUntilNewMoon, isFullMoon, isNewMoon } = useGameDate();
      const info = getMoonPhaseInfo();
      const flags = `${isFullMoon()},${isNewMoon()}`;
      return (
        <div>
          <span data-testid="phase">{info.phase}</span>
          <span data-testid="isFull">{info.isFullMoon.toString()}</span>
          <span data-testid="isNew">{info.isNewMoon.toString()}</span>
          <span data-testid="daysUntilFull">{getDaysUntilFullMoon()}</span>
          <span data-testid="daysUntilNew">{getDaysUntilNewMoon()}</span>
          <button onClick={() => setSpecificDate(14, 2, 4725)}>Set Full Moon</button>
          <button onClick={() => setSpecificDate(26, 1, 4725)}>Set New Moon</button>
          <span data-testid="flags">{flags}</span>
          <span data-testid="currentDate">{`${gameDate.day}-${gameDate.month}-${gameDate.year}`}</span>
        </div>
      );
    };

    render(<GameDateProvider><MoonTest /></GameDateProvider>);
    act(() => {
      screen.getByText('Set Full Moon').click();
    });
    expect(screen.getByTestId('phase').textContent).toBe('4');
    expect(screen.getByTestId('isFull').textContent).toBe('true');
    expect(screen.getByTestId('daysUntilNew').textContent).toBe('16');
    expect(screen.getByTestId('currentDate').textContent).toBe('14-2-4725');

    act(() => {
      screen.getByText('Set New Moon').click();
    });
    expect(screen.getByTestId('phase').textContent).toBe('0');
    expect(screen.getByTestId('isNew').textContent).toBe('true');
    expect(screen.getByTestId('daysUntilFull').textContent).toBe('16');
    expect(screen.getByTestId('currentDate').textContent).toBe('26-1-4725');
  });

  it('advanceDays handles year transitions', () => {
    const YearTest = () => {
      const { gameDate, advanceDays } = useGameDate();
      return (
        <div>
          <span data-testid="year">{gameDate.year}</span>
          <span data-testid="month">{gameDate.month}</span>
          <span data-testid="day">{gameDate.day}</span>
          <button onClick={() => advanceDays(365)}>Advance Year</button>
        </div>
      );
    };
    render(<GameDateProvider><YearTest /></GameDateProvider>);
    act(() => { screen.getByText('Advance Year').click(); });
    expect(screen.getByTestId('year').textContent).toBe('4726');
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

  // --- Time of day ---

  // Captures the live context on every render so tests can drive it directly
  // via the returned getter (api()), and renders date/time for assertions.
  const ClockProbe = ({ capture }) => {
    const ctx = useGameDate();
    capture(ctx);
    return (
      <div>
        <span data-testid="time">{ctx.formatClockTime()}</span>
        <span data-testid="date">{`${ctx.gameDate.day}-${ctx.gameDate.month}-${ctx.gameDate.year}`}</span>
      </div>
    );
  };

  const renderClock = () => {
    let latest;
    render(<GameDateProvider><ClockProbe capture={(ctx) => { latest = ctx; }} /></GameDateProvider>);
    return () => latest;
  };

  it('defaults time of day to 08:00', () => {
    renderWithProvider(ctx => ctx.formatClockTime());
    expect(screen.getByTestId('result').textContent).toBe('08:00');
  });

  it('formatClockTime zero-pads hours and minutes', () => {
    const api = renderClock();
    act(() => { api().setSpecificTime(9, 5); });
    expect(screen.getByTestId('time').textContent).toBe('09:05');
  });

  it('advanceMinutes rolls into the next hour', () => {
    const api = renderClock();
    act(() => { api().advanceMinutes(75); }); // 08:00 + 75 min = 09:15
    expect(screen.getByTestId('time').textContent).toBe('09:15');
  });

  it('advanceHours rolls past midnight into the next day', () => {
    const api = renderClock();
    act(() => { api().advanceHours(20); }); // 08:00 + 20h = 04:00 next day
    expect(screen.getByTestId('time').textContent).toBe('04:00');
    expect(screen.getByTestId('date').textContent).toBe('6-2-4725'); // day 5 -> 6
  });

  it('advanceSeconds accrues and carries into minutes', () => {
    const api = renderClock();
    act(() => { api().advanceSeconds(150); }); // 08:00:00 + 150s = 08:02
    expect(screen.getByTestId('time').textContent).toBe('08:02');
  });

  it('advanceSeconds across a full day carries the date', () => {
    const api = renderClock();
    act(() => { api().advanceSeconds(86400 + 3600); }); // +25h -> 09:00 next day
    expect(screen.getByTestId('time').textContent).toBe('09:00');
    expect(screen.getByTestId('date').textContent).toBe('6-2-4725');
  });

  it('hour rollover at a month boundary advances the month', () => {
    const api = renderClock();
    act(() => { api().setSpecificDate(31, 2, 4725, 23, 0); }); // last day of Pharast, 23:00
    act(() => { api().advanceHours(2); }); // -> 01:00 of 1 Gozran (month 3)
    expect(screen.getByTestId('time').textContent).toBe('01:00');
    expect(screen.getByTestId('date').textContent).toBe('1-3-4725');
  });

  it('advanceHours wrapping the year increments the year', () => {
    const api = renderClock();
    act(() => { api().setSpecificDate(31, 11, 4725, 23, 0); }); // last day of Kuthona
    act(() => { api().advanceHours(2); }); // -> 01:00 of 1 Abadius next year
    expect(screen.getByTestId('time').textContent).toBe('01:00');
    expect(screen.getByTestId('date').textContent).toBe('1-0-4726');
  });

  it('advanceHours(-1) crossing midnight backward decrements the date', () => {
    const api = renderClock();
    act(() => { api().setSpecificDate(1, 3, 4725, 0, 30); }); // 1 Gozran 00:30
    act(() => { api().advanceHours(-1); }); // -> 31 Pharast 23:30
    expect(screen.getByTestId('time').textContent).toBe('23:30');
    expect(screen.getByTestId('date').textContent).toBe('31-2-4725');
  });

  it('advanceDays(-1) at a month boundary rolls back into the previous month', () => {
    const api = renderClock();
    act(() => { api().setSpecificDate(1, 3, 4725, 8, 0); }); // 1 Gozran
    act(() => { api().advanceDays(-1); }); // -> 31 Pharast
    expect(screen.getByTestId('date').textContent).toBe('31-2-4725');
  });

  it('advanceDays(-1) at the year boundary rolls back into the previous year', () => {
    const api = renderClock();
    act(() => { api().setSpecificDate(1, 0, 4726, 8, 0); }); // 1 Abadius 4726
    act(() => { api().advanceDays(-1); }); // -> 31 Kuthona 4725
    expect(screen.getByTestId('date').textContent).toBe('31-11-4725');
  });

  it('setSpecificDate preserves time of day when hour/minute omitted', () => {
    const api = renderClock();
    act(() => { api().advanceMinutes(30); }); // 08:30
    act(() => { api().setSpecificDate(10, 4, 4726); });
    expect(screen.getByTestId('time').textContent).toBe('08:30');
    expect(screen.getByTestId('date').textContent).toBe('10-4-4726');
  });

  it('setSpecificTime rejects out-of-range values', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = renderClock();
    act(() => { api().setSpecificTime(25, 0); });
    expect(screen.getByTestId('time').textContent).toBe('08:00'); // unchanged
    consoleSpy.mockRestore();
  });

  it('moon and weekday helpers are unaffected by time advancement', () => {
    const api = renderClock();
    const weekdayBefore = api().getCurrentWeekday();
    const phaseBefore = api().getMoonPhase();
    act(() => { api().advanceHours(10); }); // same calendar day
    expect(api().getCurrentWeekday()).toBe(weekdayBefore);
    expect(api().getMoonPhase()).toBe(phaseBefore);
  });
});
