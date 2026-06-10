import {
  getAgePeriod,
  getHistoryEntries,
  groupByAgePeriod,
  sortByDateNewestFirst,
  getDateLabel,
  buildTimelineData,
  getRelatedEntries,
} from './timelineUtils';

const entry = (overrides = {}) => ({
  id: 'test-1',
  category: 'History',
  title: 'Test Entry',
  summary: 'A summary',
  content: 'Content',
  dateArStart: 4700,
  related: [],
  ...overrides,
});

describe('getAgePeriod', () => {
  it('returns Age of Lost Omens for year >= 4606', () => {
    expect(getAgePeriod(4606).key).toBe('age-of-lost-omens');
    expect(getAgePeriod(10000).key).toBe('age-of-lost-omens');
  });

  it('returns Age of Enthronement for 1 <= year < 4606', () => {
    expect(getAgePeriod(1).key).toBe('age-of-enthronement');
    expect(getAgePeriod(2000).key).toBe('age-of-enthronement');
  });

  it('returns Age of Destiny for -3470 <= year < 1', () => {
    expect(getAgePeriod(0).key).toBe('age-of-destiny');
    expect(getAgePeriod(-1000).key).toBe('age-of-destiny');
  });

  it('returns Age of Anguish for -4294 <= year < -3470', () => {
    expect(getAgePeriod(-4000).key).toBe('age-of-anguish');
  });

  it('returns Age of Darkness for -5293 <= year < -4294', () => {
    expect(getAgePeriod(-5000).key).toBe('age-of-darkness');
  });

  it('returns Age Before Ages for year < -5293', () => {
    expect(getAgePeriod(-10000).key).toBe('age-before-ages');
  });
});

describe('getHistoryEntries', () => {
  it('keeps only History category entries', () => {
    const entries = [
      entry({ id: '1', category: 'History' }),
      entry({ id: '2', category: 'Factions' }),
      entry({ id: '3', category: 'History' }),
    ];
    const result = getHistoryEntries(entries);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.category === 'History')).toBe(true);
  });

  it('returns empty array when no History entries exist', () => {
    expect(getHistoryEntries([entry({ category: 'Locations' })])).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(getHistoryEntries([])).toEqual([]);
  });
});

describe('sortByDateNewestFirst', () => {
  it('sorts descending by dateArStart', () => {
    const entries = [
      entry({ id: '1', dateArStart: 100 }),
      entry({ id: '2', dateArStart: 4700 }),
      entry({ id: '3', dateArStart: -1000 }),
    ];
    const sorted = sortByDateNewestFirst(entries);
    expect(sorted.map(e => e.id)).toEqual(['2', '1', '3']);
  });

  it('treats missing dateArStart as 0', () => {
    const entries = [
      entry({ id: '1', dateArStart: undefined }),
      entry({ id: '2', dateArStart: 100 }),
      entry({ id: '3', dateArStart: -50 }),
    ];
    const sorted = sortByDateNewestFirst(entries);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
    expect(sorted[2].id).toBe('3');
  });

  it('does not mutate the original array', () => {
    const entries = [entry({ id: '1', dateArStart: 100 }), entry({ id: '2', dateArStart: 50 })];
    sortByDateNewestFirst(entries);
    expect(entries[0].id).toBe('1');
  });
});

describe('getDateLabel', () => {
  it('returns Unknown Date when no start or end', () => {
    expect(getDateLabel({ dateArStart: undefined, dateArEnd: undefined })).toBe('Unknown Date');
    expect(getDateLabel({})).toBe('Unknown Date');
  });

  it('returns "X AR" for positive start with no end', () => {
    expect(getDateLabel({ dateArStart: 4700 })).toBe('4700 AR');
  });

  it('returns "X years before AR" for negative start with no end', () => {
    expect(getDateLabel({ dateArStart: -1000 })).toBe('1000 years before AR');
  });

  it('returns single positive date when start equals end', () => {
    expect(getDateLabel({ dateArStart: 100, dateArEnd: 100 })).toBe('100 AR');
  });

  it('returns single negative date when start equals end', () => {
    expect(getDateLabel({ dateArStart: -500, dateArEnd: -500 })).toBe('500 years before AR');
  });

  it('returns range for two positive dates', () => {
    expect(getDateLabel({ dateArStart: 100, dateArEnd: 200 })).toBe('100-200 AR');
  });

  it('returns range for two negative dates', () => {
    expect(getDateLabel({ dateArStart: -2000, dateArEnd: -1000 })).toBe('1000-2000 years before AR');
  });

  it('returns cross-era label for negative start and positive end', () => {
    expect(getDateLabel({ dateArStart: -500, dateArEnd: 300 })).toBe('500 years before AR - 300 AR');
  });
});

describe('groupByAgePeriod', () => {
  it('places entries in the correct period', () => {
    const entries = [
      entry({ id: '1', dateArStart: 4700 }),
      entry({ id: '2', dateArStart: 2000 }),
    ];
    const grouped = groupByAgePeriod(entries);
    expect(grouped['age-of-lost-omens'].entries).toHaveLength(1);
    expect(grouped['age-of-enthronement'].entries).toHaveLength(1);
    expect(grouped['age-of-destiny'].entries).toHaveLength(0);
  });

  it('returns all six period keys even for empty input', () => {
    const grouped = groupByAgePeriod([]);
    const keys = Object.keys(grouped);
    expect(keys).toContain('age-of-lost-omens');
    expect(keys).toContain('age-of-enthronement');
    expect(keys).toContain('age-of-destiny');
    expect(keys).toContain('age-of-anguish');
    expect(keys).toContain('age-of-darkness');
    expect(keys).toContain('age-before-ages');
  });

  it('uses 0 when dateArStart is missing', () => {
    const entries = [entry({ id: '1', dateArStart: undefined })];
    const grouped = groupByAgePeriod(entries);
    expect(grouped['age-of-destiny'].entries).toHaveLength(1);
  });
});

describe('getRelatedEntries', () => {
  it('returns empty array when related is empty', () => {
    expect(getRelatedEntries(entry({ related: [] }), [])).toEqual([]);
  });

  it('returns empty array when related is undefined', () => {
    expect(getRelatedEntries(entry({ related: undefined }), [])).toEqual([]);
  });

  it('resolves related ids to matching entries', () => {
    const all = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
    const e = entry({ related: ['a', 'c'] });
    const result = getRelatedEntries(e, all);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(['a', 'c']);
  });

  it('filters out ids that do not match any entry', () => {
    const all = [entry({ id: 'a' })];
    const e = entry({ related: ['a', 'missing'] });
    expect(getRelatedEntries(e, all)).toHaveLength(1);
  });
});

describe('buildTimelineData', () => {
  it('returns six periods and zero entries for empty input', () => {
    const result = buildTimelineData([]);
    expect(result.periods).toHaveLength(6);
    expect(result.totalEntries).toBe(0);
  });

  it('counts only History entries in totalEntries', () => {
    const entries = [
      entry({ id: '1', category: 'History' }),
      entry({ id: '2', category: 'Factions' }),
    ];
    expect(buildTimelineData(entries).totalEntries).toBe(1);
  });

  it('places entries in the correct period bucket', () => {
    const entries = [entry({ id: '1', category: 'History', dateArStart: 4700 })];
    const result = buildTimelineData(entries);
    const lost = result.periods.find(p => p.periodKey === 'age-of-lost-omens');
    expect(lost.entries).toHaveLength(1);
  });
});
