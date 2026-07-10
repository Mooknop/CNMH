// Helpers for the GM chapter-event tracker (#1112). Events are the live `event`
// collection imported from the adventure's chapter journals (see
// scripts/importAdventureRooms.mjs) — the scripted happenings between dungeons.
// The World → Events browser (#1114) and the dashboard panel (#1116) share
// this module.
import { GOLARION_MONTHS, totalDaysSince4700 } from './gameTime';

// The tracking lifecycle a GM moves an event through. `upcoming` is the fresh
// import default; `skipped` is for events the party never triggered. Order is
// book/lifecycle order, used for any status-sorted display.
export const EVENT_STATUSES = ['upcoming', 'active', 'resolved', 'skipped'];

export const STATUS_META = {
  upcoming: { label: 'Upcoming', className: 'is-upcoming' },
  active: { label: 'Active', className: 'is-active' },
  resolved: { label: 'Resolved', className: 'is-resolved' },
  skipped: { label: 'Skipped', className: 'is-skipped' },
};

// An event's status, defaulting to `upcoming` for a doc that predates the field
// or carries an unknown value — never returns something without STATUS_META.
export const eventStatus = (event) => {
  const s = event && event.status;
  return STATUS_META[s] ? s : 'upcoming';
};

// Whether the GM has hidden this event from the default view (opt-out). Only an
// explicit `tracked === false` hides it; a missing field means tracked (the
// import default), so older docs stay visible.
export const isEventHidden = (event) => event && event.tracked === false;

// Group events into chapters in book order. Events within a chapter sort by
// their page `sort`; chapters order by the earliest sort they contain, so the
// list reads front-to-back through the adventure — mirrors groupRoomsBySite.
export const groupEventsByChapter = (events) => {
  const map = new Map();
  for (const ev of events || []) {
    const key = ev.chapter || 'Other';
    if (!map.has(key)) map.set(key, { chapter: key, events: [], minSort: Infinity });
    const g = map.get(key);
    g.events.push(ev);
    g.minSort = Math.min(g.minSort, ev.sort || 0);
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.events.sort((a, b) => (a.sort || 0) - (b.sort || 0)));
  groups.sort((a, b) => a.minSort - b.minSort);
  return groups;
};

// Case-insensitive match of an event doc against a search term — the things a
// GM searches for mid-session: the event name, a check label or skill, a
// creature/hazard name, GM notes, the recorded outcome, and the body prose
// (HTML flattened to text). Mirrors roomMatches.
export const eventMatches = (event, term) => {
  if (!term) return true;
  const t = term.toLowerCase();
  const hit = (s) => (s || '').toLowerCase().includes(t);
  if (hit(event.name) || hit(event.notes) || hit(event.outcome)) return true;
  if ((event.creatures || []).some(hit)) return true;
  if ((event.hazards || []).some((h) => hit(h.name))) return true;
  if ((event.checks || []).some((c) => hit(c.label) || hit(c.statistic))) return true;
  return hit((event.body || '').replace(/<[^>]+>/g, ' '));
};

// Parse a free-text `scheduledFor` (the GM types it — "Rova 12", "12 Rova",
// "Rova 12, 4725") into { day, month, year } (month 0-11), or null when it
// can't find both a Golarion month name and a day. Year is optional (a 4-digit
// number); callers default it to the campaign year. Lenient by design — the
// field stays free text so odd notes ("early Rova") simply don't light up.
export const parseScheduledDate = (text) => {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  const month = GOLARION_MONTHS.findIndex((m) => lower.includes(m.name.toLowerCase()));
  if (month < 0) return null;
  const yearMatch = lower.match(/\b(\d{4})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  // Day = first 1-2 digit run that isn't part of the (stripped) year.
  const dayMatch = lower.replace(/\b\d{4}\b/g, '').match(/\b(\d{1,2})\b/);
  if (!dayMatch) return null;
  const day = parseInt(dayMatch[1], 10);
  return { day, month, year };
};

// Whether an event is "due": it carries a parseable `scheduledFor` that falls
// on or before the current campaign date. When the GM omits the year (the
// common case — they write "Rova 12"), it defaults to the campaign year.
// Returns false with no schedule, an unparseable one, or no game date.
export const isEventDue = (event, gameDate) => {
  if (!event || !gameDate) return false;
  const sched = parseScheduledDate(event.scheduledFor);
  if (!sched) return false;
  const year = sched.year ?? gameDate.year;
  const due = totalDaysSince4700({ day: sched.day, month: sched.month, year });
  return due <= totalDaysSince4700(gameDate);
};

// Count of an event's completed and total party-progress steps, tolerating a
// missing/garbled steps array. Shared by the tracker and the dashboard panel.
export const stepProgress = (event) => {
  const steps = Array.isArray(event && event.steps) ? event.steps : [];
  return { done: steps.filter((s) => s && s.done).length, total: steps.length };
};
