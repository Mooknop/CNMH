import {
  GOLARION_MONTHS,
  SECS_PER_DAY,
  totalDaysSince4700,
  toGameSeconds,
  gameSecondsToClock,
  formatGameDuration,
  formatAvailableAt,
} from './gameTime';

const clock = (day, month, year, hour = 0, minute = 0, second = 0) => ({
  day, month, year, hour, minute, second,
});

describe('totalDaysSince4700', () => {
  it('returns 0 at the reference date (1 Abadius 4700)', () => {
    expect(totalDaysSince4700(clock(1, 0, 4700))).toBe(0);
  });

  it('matches the historical GameDateContext math (leap day every 8 years)', () => {
    // 25 years past reference: 25*365 + floor(25/8)=3 leap days
    expect(totalDaysSince4700(clock(1, 0, 4725))).toBe(25 * 365 + 3);
  });

  it('is monotonic across a month boundary', () => {
    const last = totalDaysSince4700(clock(31, 0, 4725)); // 31 Abadius
    const first = totalDaysSince4700(clock(1, 1, 4725)); // 1 Calistril
    expect(first).toBe(last + 1);
  });

  it('is monotonic across a year boundary', () => {
    const last = totalDaysSince4700(clock(31, 11, 4724)); // 31 Kuthona
    const first = totalDaysSince4700(clock(1, 0, 4725));
    expect(first).toBe(last + 1);
  });
});

describe('toGameSeconds / gameSecondsToClock', () => {
  it('converts time-of-day on top of whole days', () => {
    const c = clock(5, 2, 4725, 8, 30, 6);
    expect(toGameSeconds(c)).toBe(
      totalDaysSince4700(c) * SECS_PER_DAY + 8 * 3600 + 30 * 60 + 6
    );
  });

  it('round-trips clocks through seconds, including leap-adjacent years', () => {
    const samples = [
      clock(1, 0, 4700),
      clock(28, 1, 4707, 23, 59, 59), // year before a leap increment
      clock(1, 0, 4708),              // leap increment year
      clock(5, 2, 4725, 8, 0, 0),     // campaign default
      clock(31, 11, 4730, 12, 34, 56),
    ];
    for (const c of samples) {
      expect(gameSecondsToClock(toGameSeconds(c))).toEqual(c);
    }
  });

  it('an hour of seconds advances the rebuilt clock by an hour', () => {
    const base = toGameSeconds(clock(5, 2, 4725, 23, 30, 0));
    const later = gameSecondsToClock(base + 3600);
    expect(later.hour).toBe(0);
    expect(later.minute).toBe(30);
    expect(later.day).toBe(6);
  });
});

describe('formatGameDuration', () => {
  it('picks the two largest units', () => {
    expect(formatGameDuration(2 * 3600 + 15 * 60)).toBe('2h 15m');
    expect(formatGameDuration(3 * SECS_PER_DAY + 4 * 3600 + 30)).toBe('3d 4h');
    expect(formatGameDuration(45)).toBe('45s');
    expect(formatGameDuration(0)).toBe('0s');
  });
});

describe('formatAvailableAt', () => {
  const now = toGameSeconds(clock(5, 2, 4725, 8, 0, 0));

  it('shows bare time for the same day', () => {
    const at = toGameSeconds(clock(5, 2, 4725, 14, 30, 0));
    expect(formatAvailableAt(at, now)).toBe('14:30');
  });

  it('says tomorrow for the next day', () => {
    const at = toGameSeconds(clock(6, 2, 4725, 9, 0, 0));
    expect(formatAvailableAt(at, now)).toBe('tomorrow 09:00');
  });

  it('spells out the date further ahead', () => {
    const at = toGameSeconds(clock(12, 5, 4725, 8, 0, 0));
    expect(formatAvailableAt(at, now)).toBe(`12 ${GOLARION_MONTHS[5].name} 08:00`);
  });
});
