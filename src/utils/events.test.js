import { describe, it, expect } from 'vitest';
import {
  groupEventsByChapter,
  eventMatches,
  eventStatus,
  isEventHidden,
  EVENT_STATUSES,
  STATUS_META,
} from './events';

describe('groupEventsByChapter', () => {
  const events = [
    { id: 'e3', name: 'Copycat Killer', chapter: 'Ch 2: Strange Times', sort: 5600 },
    { id: 'e1', name: 'Bones', chapter: 'Ch 1: Bones and Ashes', sort: 1000 },
    { id: 'e2', name: 'Ripnugget Rumors', chapter: 'Ch 2: Strange Times', sort: 4200 },
  ];

  it('groups by chapter, ordering chapters by earliest sort and events within by sort', () => {
    const groups = groupEventsByChapter(events);
    expect(groups.map((g) => g.chapter)).toEqual(['Ch 1: Bones and Ashes', 'Ch 2: Strange Times']);
    expect(groups[1].events.map((e) => e.name)).toEqual(['Ripnugget Rumors', 'Copycat Killer']); // 4200 before 5600
  });

  it('buckets events with no chapter under "Other" and tolerates empty input', () => {
    expect(groupEventsByChapter([{ id: 'x', name: 'Loose', sort: 0 }])[0].chapter).toBe('Other');
    expect(groupEventsByChapter()).toEqual([]);
  });
});

describe('eventStatus', () => {
  it('returns the known status', () => {
    expect(eventStatus({ status: 'active' })).toBe('active');
  });
  it('defaults an unknown or missing status to upcoming', () => {
    expect(eventStatus({ status: 'bogus' })).toBe('upcoming');
    expect(eventStatus({})).toBe('upcoming');
    expect(eventStatus(null)).toBe('upcoming');
  });
  it('every declared status has display metadata', () => {
    for (const s of EVENT_STATUSES) expect(STATUS_META[s]).toBeTruthy();
  });
});

describe('isEventHidden', () => {
  it('only an explicit tracked:false hides an event', () => {
    expect(isEventHidden({ tracked: false })).toBe(true);
    expect(isEventHidden({ tracked: true })).toBe(false);
    expect(isEventHidden({})).toBe(false); // missing field → tracked (visible)
  });
});

describe('eventMatches', () => {
  const event = {
    name: 'Ripnugget Rumors',
    notes: 'Ties back to Thistletop',
    outcome: 'PCs learned the truth',
    creatures: ['Bandit'],
    hazards: [{ name: 'Rockslide' }],
    checks: [{ label: 'Gather Information', statistic: 'diplomacy' }],
    body: '<p>Ask around town for <em>rumors</em>.</p>',
  };

  it('matches on name, notes, outcome, creatures, hazards, checks, and flattened body', () => {
    expect(eventMatches(event, 'ripnugget')).toBe(true);
    expect(eventMatches(event, 'thistletop')).toBe(true);
    expect(eventMatches(event, 'learned')).toBe(true);
    expect(eventMatches(event, 'bandit')).toBe(true);
    expect(eventMatches(event, 'rockslide')).toBe(true);
    expect(eventMatches(event, 'diplomacy')).toBe(true);
    expect(eventMatches(event, 'gather')).toBe(true);
    expect(eventMatches(event, 'town')).toBe(true); // body prose, HTML stripped
  });

  it('an empty term matches everything; a miss returns false', () => {
    expect(eventMatches(event, '')).toBe(true);
    expect(eventMatches(event, 'dragon')).toBe(false);
  });
});
