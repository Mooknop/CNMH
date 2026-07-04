// Helpers for the GM chapter-event tracker (#1112). Events are the live `event`
// collection imported from the adventure's chapter journals (see
// scripts/importAdventureRooms.js) — the scripted happenings between dungeons.
// The World → Events browser (#1114) and, later, the dashboard panel (#1116)
// share this module.

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
