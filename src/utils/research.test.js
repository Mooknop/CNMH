import {
  topicProgress,
  totalMaxRp,
  accrueSourceRp,
  adjustRp,
  unlockedTiers,
  newlyCrossedTiers,
} from './research';

const topic = {
  id: 'topic-1',
  title: 'The Sunken Archive',
  level: 5,
  traits: ['Rare'],
  description: 'A drowned library of pre-Thassilonian records.',
  sources: [
    { name: 'Library Research', note: 'Diligent Search', maxRp: 6, checks: [{ skill: 'Occultism', dc: 20 }] },
    { name: 'Interviews', note: 'Ask around town', costNote: '5 gp per attempt', maxRp: 4, checks: [{ skill: 'Diplomacy', dc: 18 }] },
  ],
  unlocks: [
    { rp: 4, text: 'You learn the archive was moved.' },
    { rp: 8, text: 'You learn the sunken coordinates.', loreId: 'sunken-coords' },
    { rp: 10, text: 'You learn the ward sequence.' },
  ],
  reward: { text: 'A ring of the sea.' },
};

describe('topicProgress', () => {
  it('returns safe defaults for a topic never touched', () => {
    expect(topicProgress(null, 'topic-1')).toEqual({ available: false, rp: 0, perSourceRp: {} });
    expect(topicProgress(undefined, 'topic-1')).toEqual({ available: false, rp: 0, perSourceRp: {} });
    expect(topicProgress({}, 'topic-1')).toEqual({ available: false, rp: 0, perSourceRp: {} });
  });

  it('returns the stored entry when present', () => {
    const map = { 'topic-1': { available: true, rp: 3, perSourceRp: { 'Library Research': 3 } } };
    expect(topicProgress(map, 'topic-1')).toEqual({
      available: true,
      rp: 3,
      perSourceRp: { 'Library Research': 3 },
    });
  });

  it('does not return a reference into the input map', () => {
    const map = { 'topic-1': { available: true, rp: 3, perSourceRp: { 'Library Research': 3 } } };
    const out = topicProgress(map, 'topic-1');
    out.perSourceRp['Library Research'] = 999;
    expect(map['topic-1'].perSourceRp['Library Research']).toBe(3);
  });

  it('tolerates a malformed entry (non-object perSourceRp, non-number rp)', () => {
    const map = { 'topic-1': { available: 'yes', rp: 'lots', perSourceRp: null } };
    expect(topicProgress(map, 'topic-1')).toEqual({ available: true, rp: 0, perSourceRp: {} });
  });
});

describe('totalMaxRp', () => {
  it('sums every source maxRp', () => {
    expect(totalMaxRp(topic)).toBe(10);
  });

  it('is 0 for a topic with no sources', () => {
    expect(totalMaxRp({ id: 'x', sources: [] })).toBe(0);
    expect(totalMaxRp({ id: 'x' })).toBe(0);
    expect(totalMaxRp(null)).toBe(0);
  });

  it('ignores a source with a non-number maxRp', () => {
    expect(totalMaxRp({ sources: [{ name: 'A', maxRp: 5 }, { name: 'B' }] })).toBe(5);
  });
});

describe('accrueSourceRp', () => {
  it('accrues RP against a source and mirrors it into the topic total', () => {
    const next = accrueSourceRp(null, topic, 'Library Research', 3);
    expect(next['topic-1']).toEqual({ available: false, rp: 3, perSourceRp: { 'Library Research': 3 } });
  });

  it('accrues from multiple sources independently and sums into the topic total', () => {
    let map = accrueSourceRp(null, topic, 'Library Research', 3);
    map = accrueSourceRp(map, topic, 'Interviews', 2);
    expect(map['topic-1']).toEqual({
      available: false,
      rp: 5,
      perSourceRp: { 'Library Research': 3, Interviews: 2 },
    });
  });

  it('caps a single source at its own maxRp — no further contribution once capped (#206 acceptance criterion)', () => {
    let map = accrueSourceRp(null, topic, 'Library Research', 6); // exactly at cap
    expect(map['topic-1'].perSourceRp['Library Research']).toBe(6);
    expect(map['topic-1'].rp).toBe(6);

    // Push past the cap — clamped, no extra RP applied to the topic total.
    map = accrueSourceRp(map, topic, 'Library Research', 5);
    expect(map['topic-1'].perSourceRp['Library Research']).toBe(6);
    expect(map['topic-1'].rp).toBe(6);

    // A DIFFERENT source on the same topic still accrues normally.
    map = accrueSourceRp(map, topic, 'Interviews', 2);
    expect(map['topic-1'].perSourceRp).toEqual({ 'Library Research': 6, Interviews: 2 });
    expect(map['topic-1'].rp).toBe(8);
  });

  it('a single accrual that overshoots the cap only applies the capped remainder', () => {
    // maxRp 4 on Interviews; ask for 9 in one shot.
    const map = accrueSourceRp(null, topic, 'Interviews', 9);
    expect(map['topic-1'].perSourceRp.Interviews).toBe(4);
    expect(map['topic-1'].rp).toBe(4);
  });

  it('supports negative deltas to remove RP from a source, never below 0', () => {
    let map = accrueSourceRp(null, topic, 'Library Research', 3);
    map = accrueSourceRp(map, topic, 'Library Research', -5);
    expect(map['topic-1'].perSourceRp['Library Research']).toBe(0);
    expect(map['topic-1'].rp).toBe(0);
  });

  it('never drops the topic total below 0 even if sources disagree', () => {
    let map = accrueSourceRp(null, topic, 'Library Research', 2);
    map = accrueSourceRp(map, topic, 'Library Research', -10);
    expect(map['topic-1'].rp).toBe(0);
    expect(map['topic-1'].perSourceRp['Library Research']).toBe(0);
  });

  it('treats an unknown source name as uncapped rather than dropping RP', () => {
    const map = accrueSourceRp(null, topic, 'Mystery Source', 7);
    expect(map['topic-1'].perSourceRp['Mystery Source']).toBe(7);
    expect(map['topic-1'].rp).toBe(7);
  });

  it('preserves other topics and the `available` flag already in the map', () => {
    const seed = {
      'topic-1': { available: true, rp: 1, perSourceRp: { 'Library Research': 1 } },
      'topic-2': { available: false, rp: 5, perSourceRp: {} },
    };
    const next = accrueSourceRp(seed, topic, 'Library Research', 1);
    expect(next['topic-1']).toEqual({ available: true, rp: 2, perSourceRp: { 'Library Research': 2 } });
    expect(next['topic-2']).toEqual(seed['topic-2']);
  });

  it('does not mutate the input progressMap', () => {
    const seed = { 'topic-1': { available: false, rp: 0, perSourceRp: {} } };
    const snapshot = JSON.parse(JSON.stringify(seed));
    accrueSourceRp(seed, topic, 'Library Research', 3);
    expect(seed).toEqual(snapshot);
  });
});

describe('adjustRp', () => {
  it('adjusts the total RP without touching perSourceRp', () => {
    const seed = { 'topic-1': { available: false, rp: 2, perSourceRp: { 'Library Research': 2 } } };
    const next = adjustRp(seed, topic, 3);
    expect(next['topic-1']).toEqual({ available: false, rp: 5, perSourceRp: { 'Library Research': 2 } });
  });

  it('clamps to [0, totalMaxRp]', () => {
    expect(adjustRp(null, topic, 999)['topic-1'].rp).toBe(10);
    expect(adjustRp(null, topic, -5)['topic-1'].rp).toBe(0);
  });

  it('supports negative deltas relative to existing rp', () => {
    const seed = { 'topic-1': { available: false, rp: 6, perSourceRp: {} } };
    expect(adjustRp(seed, topic, -2)['topic-1'].rp).toBe(4);
  });

  it('does not mutate the input progressMap', () => {
    const seed = { 'topic-1': { available: false, rp: 2, perSourceRp: {} } };
    const snapshot = JSON.parse(JSON.stringify(seed));
    adjustRp(seed, topic, 1);
    expect(seed).toEqual(snapshot);
  });

  it('tolerates a null progressMap', () => {
    expect(adjustRp(null, topic, 4)['topic-1'].rp).toBe(4);
  });
});

describe('unlockedTiers', () => {
  it('returns tiers at or below the given rp, ascending', () => {
    expect(unlockedTiers(topic, 8)).toEqual([
      { rp: 4, text: 'You learn the archive was moved.' },
      { rp: 8, text: 'You learn the sunken coordinates.', loreId: 'sunken-coords' },
    ]);
  });

  it('unlocks exactly at the threshold (inclusive)', () => {
    expect(unlockedTiers(topic, 4)).toEqual([{ rp: 4, text: 'You learn the archive was moved.' }]);
  });

  it('is empty below the first tier', () => {
    expect(unlockedTiers(topic, 3)).toEqual([]);
  });

  it('returns every tier once rp meets the highest', () => {
    expect(unlockedTiers(topic, 10)).toHaveLength(3);
  });

  it('tolerates a topic with no unlocks', () => {
    expect(unlockedTiers({ id: 'x' }, 5)).toEqual([]);
    expect(unlockedTiers(null, 5)).toEqual([]);
  });
});

describe('newlyCrossedTiers', () => {
  it('returns tiers strictly after prevRp and up to nextRp', () => {
    expect(newlyCrossedTiers(topic, 0, 4)).toEqual([
      { rp: 4, text: 'You learn the archive was moved.' },
    ]);
  });

  it('crosses multiple tiers in one jump', () => {
    expect(newlyCrossedTiers(topic, 0, 10)).toHaveLength(3);
  });

  it('excludes a tier sitting exactly at prevRp (already unlocked)', () => {
    expect(newlyCrossedTiers(topic, 4, 8)).toEqual([
      { rp: 8, text: 'You learn the sunken coordinates.', loreId: 'sunken-coords' },
    ]);
  });

  it('includes a tier sitting exactly at nextRp (inclusive upper bound)', () => {
    expect(newlyCrossedTiers(topic, 7, 8).map((t) => t.rp)).toEqual([8]);
  });

  it('is empty when nextRp equals prevRp (no-op)', () => {
    expect(newlyCrossedTiers(topic, 4, 4)).toEqual([]);
  });

  it('is empty when nextRp is less than prevRp (a decrease)', () => {
    expect(newlyCrossedTiers(topic, 8, 4)).toEqual([]);
  });

  it('tolerates a topic with no unlocks', () => {
    expect(newlyCrossedTiers({ id: 'x' }, 0, 10)).toEqual([]);
    expect(newlyCrossedTiers(null, 0, 10)).toEqual([]);
  });
});
