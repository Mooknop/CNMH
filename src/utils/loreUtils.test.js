import {
  getAllCategories,
  getEntriesByCategory,
  groupEntriesByCategory,
  buildBacklinkMap,
  getConnectionData,
  filterBySearchTerm,
  getSubgroupsForCategory,
} from './loreUtils';

const entry = (overrides = {}) => ({
  id: 'entry-1',
  category: 'History',
  title: 'Test Entry',
  summary: 'A summary',
  tags: [],
  related: [],
  ...overrides,
});

describe('getAllCategories', () => {
  it('returns sorted unique categories', () => {
    const entries = [
      entry({ category: 'History' }),
      entry({ category: 'Factions' }),
      entry({ category: 'History' }),
    ];
    expect(getAllCategories(entries)).toEqual(['Factions', 'History']);
  });

  it('returns empty array for empty input', () => {
    expect(getAllCategories([])).toEqual([]);
  });
});

describe('getEntriesByCategory', () => {
  it('returns only entries matching the category', () => {
    const entries = [
      entry({ id: '1', category: 'History' }),
      entry({ id: '2', category: 'Factions' }),
    ];
    const result = getEntriesByCategory(entries, 'History');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns empty array when no entries match', () => {
    expect(getEntriesByCategory([entry()], 'NPCs')).toHaveLength(0);
  });
});

describe('groupEntriesByCategory', () => {
  it('groups entries by their category', () => {
    const entries = [
      entry({ id: '1', category: 'History' }),
      entry({ id: '2', category: 'Factions' }),
      entry({ id: '3', category: 'History' }),
    ];
    const result = groupEntriesByCategory(entries);
    expect(result).toHaveLength(2);
    const histGroup = result.find(g => g.category === 'History');
    expect(histGroup.entries).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(groupEntriesByCategory([])).toEqual([]);
  });
});

describe('buildBacklinkMap', () => {
  it('maps target ids to the ids of entries that reference them', () => {
    const entries = [
      entry({ id: 'a', related: ['b', 'c'] }),
      entry({ id: 'b', related: ['c'] }),
      entry({ id: 'c', related: [] }),
    ];
    const map = buildBacklinkMap(entries);
    expect(map.get('b')).toEqual(['a']);
    expect(map.get('c')).toEqual(['a', 'b']);
    expect(map.has('a')).toBe(false);
  });

  it('handles entries with no related field', () => {
    const entries = [entry({ related: undefined })];
    expect(buildBacklinkMap(entries).size).toBe(0);
  });

  it('returns empty map for empty input', () => {
    expect(buildBacklinkMap([]).size).toBe(0);
  });
});

describe('getConnectionData', () => {
  it('returns outgoing links resolved to entry objects', () => {
    const entries = [
      entry({ id: 'a', category: 'History', related: ['b'] }),
      entry({ id: 'b', category: 'Factions', related: [] }),
    ];
    const map = buildBacklinkMap(entries);
    const result = getConnectionData(entries[0], entries, map);
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0].id).toBe('b');
  });

  it('returns incoming links via the backlink map', () => {
    const entries = [
      entry({ id: 'a', category: 'History', related: ['b'] }),
      entry({ id: 'b', category: 'Factions', related: [] }),
    ];
    const map = buildBacklinkMap(entries);
    const result = getConnectionData(entries[1], entries, map);
    expect(result.incoming).toHaveLength(1);
    expect(result.incoming[0].id).toBe('a');
  });

  it('groups outgoing connections by category', () => {
    const entries = [
      entry({ id: 'a', category: 'History', related: ['b', 'c'] }),
      entry({ id: 'b', category: 'Factions', related: [] }),
      entry({ id: 'c', category: 'Factions', related: [] }),
    ];
    const map = buildBacklinkMap(entries);
    const result = getConnectionData(entries[0], entries, map);
    expect(result.outgoingByCategory['Factions']).toHaveLength(2);
  });

  it('groups incoming connections by category', () => {
    const entries = [
      entry({ id: 'a', category: 'History', related: ['c'] }),
      entry({ id: 'b', category: 'History', related: ['c'] }),
      entry({ id: 'c', category: 'Locations', related: [] }),
    ];
    const map = buildBacklinkMap(entries);
    const result = getConnectionData(entries[2], entries, map);
    expect(result.incomingByCategory['History']).toHaveLength(2);
  });

  it('handles entry with no connections', () => {
    const entries = [entry({ id: 'a', related: [] })];
    const map = buildBacklinkMap(entries);
    const result = getConnectionData(entries[0], entries, map);
    expect(result.outgoing).toHaveLength(0);
    expect(result.incoming).toHaveLength(0);
    expect(result.outgoingByCategory).toEqual({});
    expect(result.incomingByCategory).toEqual({});
  });
});

describe('filterBySearchTerm', () => {
  const entries = [
    entry({ id: '1', title: 'The Battle of Absalom', summary: 'A great conflict' }),
    entry({ id: '2', title: 'Aroden', summary: 'A dead god' }),
  ];

  it('returns all entries when search term is empty string', () => {
    expect(filterBySearchTerm(entries, '')).toHaveLength(2);
  });

  it('returns all entries when search term is null', () => {
    expect(filterBySearchTerm(entries, null)).toHaveLength(2);
  });

  it('returns all entries when search term is undefined', () => {
    expect(filterBySearchTerm(entries, undefined)).toHaveLength(2);
  });

  it('filters by title case-insensitively', () => {
    const result = filterBySearchTerm(entries, 'absalom');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by summary', () => {
    const result = filterBySearchTerm(entries, 'dead god');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterBySearchTerm(entries, 'zzznomatch')).toHaveLength(0);
  });

  it('trims whitespace from search term', () => {
    expect(filterBySearchTerm(entries, '  aroden  ')).toHaveLength(1);
  });
});

describe('getSubgroupsForCategory', () => {
  it('returns empty array for fewer than 2 entries', () => {
    expect(getSubgroupsForCategory([])).toEqual([]);
    expect(getSubgroupsForCategory([entry()])).toEqual([]);
  });

  it('returns subgroups for tags shared by multiple entries', () => {
    const entries = [
      entry({ id: '1', tags: ['war', 'arcane'] }),
      entry({ id: '2', tags: ['war', 'divine'] }),
      entry({ id: '3', tags: ['arcane'] }),
    ];
    const subgroups = getSubgroupsForCategory(entries);
    const warGroup = subgroups.find(s => s.tag === 'war');
    expect(warGroup).toBeDefined();
    expect(warGroup.entries).toHaveLength(2);
  });

  it('excludes tags that appear only once', () => {
    const entries = [
      entry({ id: '1', tags: ['unique'] }),
      entry({ id: '2', tags: ['other'] }),
    ];
    expect(getSubgroupsForCategory(entries)).toHaveLength(0);
  });

  it('excludes tags that appear in more than 70% of entries', () => {
    const entries = [
      entry({ id: '1', tags: ['common'] }),
      entry({ id: '2', tags: ['common'] }),
      entry({ id: '3', tags: ['common'] }),
    ];
    const subgroups = getSubgroupsForCategory(entries);
    expect(subgroups.find(s => s.tag === 'common')).toBeUndefined();
  });

  it('returns entries without tags as empty tag list', () => {
    const entries = [
      entry({ id: '1', tags: ['shared'] }),
      entry({ id: '2', tags: ['shared'] }),
      entry({ id: '3', tags: undefined }),
    ];
    const subgroups = getSubgroupsForCategory(entries);
    const sharedGroup = subgroups.find(s => s.tag === 'shared');
    expect(sharedGroup).toBeDefined();
    expect(sharedGroup.entries).toHaveLength(2);
  });
});
