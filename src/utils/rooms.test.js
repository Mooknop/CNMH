import { describe, it, expect } from 'vitest';
import { groupRoomsBySite, roomMatches } from './rooms';

const docs = [
  { id: 'b1', code: 'B1', name: 'Catacomb', site: 'Catacombs', sort: 2100 },
  { id: 'a2', code: 'A2', name: 'Dining Hall', site: 'Warren', sort: 1700 },
  { id: 'feat-w', name: 'Warren Features', site: 'Warren', sort: 1500, isFeatures: true },
  { id: 'a1', code: 'A1', name: 'Entrance', site: 'Warren', sort: 1600 },
];

describe('groupRoomsBySite', () => {
  it('orders sites by earliest sort and rooms in book order', () => {
    const groups = groupRoomsBySite(docs);
    expect(groups.map((g) => g.site)).toEqual(['Warren', 'Catacombs']); // Warren minSort 1500
    expect(groups[0].rooms.map((r) => r.code)).toEqual(['A1', 'A2']); // sorted, features excluded
  });

  it('attaches a site’s Features doc separately from its rooms', () => {
    const [warren] = groupRoomsBySite(docs);
    expect(warren.features.id).toBe('feat-w');
    expect(warren.rooms.some((r) => r.isFeatures)).toBe(false);
  });

  it('falls back to chapter, then "Other", for docs with no site', () => {
    const groups = groupRoomsBySite([
      { id: 'x', name: 'K', chapter: 'Ch 9', sort: 5000 },
      { id: 'y', name: 'Z', sort: 6000 },
    ]);
    expect(groups.map((g) => g.site)).toEqual(['Ch 9', 'Other']);
  });
});

describe('roomMatches', () => {
  const doc = {
    code: 'A3',
    name: 'Shrine to Kabriri',
    notes: 'callback to the prologue',
    creatures: ['Glorkus'],
    hazards: [{ name: 'Fires of Abraxas' }],
    checks: [{ label: 'Force Open', statistic: 'athletics' }],
    body: '<p>A hidden <strong>secret door</strong> lurks.</p>',
  };
  it('matches on code or name, case-insensitively', () => {
    expect(roomMatches(doc, 'a3')).toBe(true);
    expect(roomMatches(doc, 'kabriri')).toBe(true);
    expect(roomMatches(doc, 'zzz')).toBe(false);
  });
  it('matches creatures, hazards, checks, notes, and body prose', () => {
    expect(roomMatches(doc, 'glorkus')).toBe(true);
    expect(roomMatches(doc, 'abraxas')).toBe(true);
    expect(roomMatches(doc, 'athletics')).toBe(true);
    expect(roomMatches(doc, 'prologue')).toBe(true);
    expect(roomMatches(doc, 'secret door')).toBe(true); // body HTML flattened
  });
  it('matches everything when the term is empty', () => {
    expect(roomMatches(doc, '')).toBe(true);
  });
});
