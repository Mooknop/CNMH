// src/utils/gameTime.js
// Pure Golarion calendar/time math shared by GameDateContext and the ability
// frequency engine. A "clock" is { day, month, year, hour, minute, second }
// (month 0-11); "game seconds" are absolute seconds since 1 Abadius 4700,
// 00:00:00 — a single comparable number for cooldown windows and expiries.

// Golarion calendar data following Pathfinder 2E lore
export const GOLARION_MONTHS = [
  { name: "Abadius", days: 31, season: "Winter", index: 0 },    //jan
  { name: "Calistril", days: 28, season: "Winter", index: 1 },  //feb
  { name: "Pharast", days: 31, season: "Spring", index: 2 },    //mar
  { name: "Gozran", days: 30, season: "Spring", index: 3 },     //apr
  { name: "Desnus", days: 31, season: "Spring", index: 4 },     //may
  { name: "Sarenith", days: 30, season: "Summer", index: 5 },   //jun
  { name: "Erastus", days: 31, season: "Summer", index: 6 },    //jul
  { name: "Arodus", days: 31, season: "Summer", index: 7 },     //aug
  { name: "Rova", days: 30, season: "Autumn", index: 8 },
  { name: "Lamashan", days: 31, season: "Autumn", index: 9 },
  { name: "Neth", days: 30, season: "Autumn", index: 10 },
  { name: "Kuthona", days: 31, season: "Winter", index: 11 }
];

export const SECS_PER_DAY = 86400;

/**
 * Calculate total days since the reference point (1 Abadius 4700).
 * Golarion leap years add a day every 8 years.
 * @param {Object} date - { day, month, year }
 * @returns {number} Total days since reference point
 */
export function totalDaysSince4700(date) {
  const baseYear = 4700; // Reference year
  const yearDiff = date.year - baseYear;
  let totalDays = yearDiff * 365 + Math.floor(yearDiff / 8); // Golarion leap years every 8 years

  // Add days from completed months in current year
  for (let i = 0; i < date.month; i++) {
    totalDays += GOLARION_MONTHS[i].days;
  }

  // Add days in current month
  totalDays += date.day - 1;

  return totalDays;
}

/**
 * Convert a full clock to absolute game seconds.
 * @param {Object} clock - { day, month, year, hour, minute, second }
 * @returns {number} seconds since 1 Abadius 4700, 00:00:00
 */
export function toGameSeconds(clock) {
  return (
    totalDaysSince4700(clock) * SECS_PER_DAY +
    (clock.hour || 0) * 3600 +
    (clock.minute || 0) * 60 +
    (clock.second || 0)
  );
}

/**
 * Inverse of toGameSeconds — rebuild a clock from absolute game seconds.
 * Walks years/months forward from the 4700 reference; campaign dates sit a
 * few decades past it, so the walk is short.
 * @param {number} secs
 * @returns {Object} { day, month, year, hour, minute, second }
 */
export function gameSecondsToClock(secs) {
  let days = Math.floor(secs / SECS_PER_DAY);
  let rem = secs - days * SECS_PER_DAY;

  let year = 4700;
  // Year length: 365, +1 on leap years. Leap day accrues when floor(diff/8)
  // increments, i.e. entering year 4708, 4716, ... matches totalDaysSince4700.
  for (;;) {
    const nextDiff = year - 4700 + 1;
    const yearLen = 365 + (Math.floor(nextDiff / 8) - Math.floor((nextDiff - 1) / 8));
    if (days < yearLen) break;
    days -= yearLen;
    year++;
  }
  let month = 0;
  while (days >= GOLARION_MONTHS[month].days) {
    days -= GOLARION_MONTHS[month].days;
    month++;
  }
  const day = days + 1;
  const hour = Math.floor(rem / 3600);
  rem -= hour * 3600;
  const minute = Math.floor(rem / 60);
  const second = rem - minute * 60;
  return { day, month, year, hour, minute, second };
}

/**
 * Compact human duration for "used Xh ago" style labels.
 * Picks the two largest non-zero units: "2h 15m", "3d 4h", "45s".
 * @param {number} secs - non-negative duration in seconds
 * @returns {string}
 */
export function formatGameDuration(secs) {
  const s = Math.max(0, Math.floor(secs));
  const units = [
    ['d', SECS_PER_DAY],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  const parts = [];
  let rem = s;
  for (const [label, size] of units) {
    const n = Math.floor(rem / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rem -= n * size;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(' ') : '0s';
}

const hhmm = (clock) =>
  `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;

/**
 * Format an absolute game-seconds moment relative to "now" for
 * "available at ..." labels: same day → "14:30"; next day → "tomorrow 09:00";
 * further out → "12 Sarenith 08:00".
 * @param {number} secs - the future moment
 * @param {number} nowSecs - current game seconds
 * @returns {string}
 */
export function formatAvailableAt(secs, nowSecs) {
  const target = gameSecondsToClock(secs);
  const dayDelta =
    Math.floor(secs / SECS_PER_DAY) - Math.floor(nowSecs / SECS_PER_DAY);
  if (dayDelta <= 0) return hhmm(target);
  if (dayDelta === 1) return `tomorrow ${hhmm(target)}`;
  return `${target.day} ${GOLARION_MONTHS[target.month].name} ${hhmm(target)}`;
}
