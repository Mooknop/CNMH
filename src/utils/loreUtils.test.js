import {
  getAllCategories,
  getEntriesByCategory,
  groupEntriesByCategory,
  buildBacklinkMap,
  getConnectionData,
  filterBySearchTerm,
  parseWikiTarget,
  buildTitleToIdMap,
  resolveWikilink,
  buildChildrenMap,
  getChildren,
  getAncestors,
} from './loreUtils';

const entry = (overrides = {}) => ({
  id: 'entry-1',
  category: 'History',
  title: 'Test Entry',
  summary: 'A summary',
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

  it('excludes the parent and direct children from the generic buckets', () => {
    const entries = [
      entry({ id: 'varisia', category: 'Location', related: [] }),
      // A residual related[] link to both parent and child must not double-list.
      entry({ id: 'sandpoint', category: 'Location', parent: 'varisia', related: ['varisia', 'cathedral'] }),
      entry({ id: 'cathedral', category: 'Location', parent: 'sandpoint', related: [] }),
    ];
    const map = buildBacklinkMap(entries);
    const result = getConnectionData(entries[1], entries, map);
    expect(result.outgoing).toHaveLength(0); // varisia (parent) + cathedral (child) both stripped
    expect(result.incoming).toHaveLength(0);
  });
});

describe('buildChildrenMap / getChildren', () => {
  const entries = [
    entry({ id: 'sandpoint', title: 'Sandpoint' }),
    entry({ id: 'cathedral', title: 'Cathedral', parent: 'sandpoint' }),
    entry({ id: 'garrison', title: 'Garrison', parent: 'sandpoint' }),
    entry({ id: 'magnimar', title: 'Magnimar' }),
  ];

  it('maps a parent id to its title-sorted children', () => {
    const map = buildChildrenMap(entries);
    expect(getChildren(entries[0], map).map((e) => e.id)).toEqual(['cathedral', 'garrison']);
  });

  it('returns an empty list for a childless entry or missing map', () => {
    const map = buildChildrenMap(entries);
    expect(getChildren(entries[3], map)).toEqual([]);
    expect(getChildren(entries[0], null)).toEqual([]);
  });
});

describe('getAncestors', () => {
  const entries = [
    entry({ id: 'varisia', title: 'Varisia' }),
    entry({ id: 'sandpoint', title: 'Sandpoint', parent: 'varisia' }),
    entry({ id: 'cathedral', title: 'Cathedral', parent: 'sandpoint' }),
  ];

  it('returns the root-first chain excluding the entry itself', () => {
    const found = entries.find((e) => e.id === 'cathedral');
    expect(getAncestors(found, entries).map((e) => e.id)).toEqual(['varisia', 'sandpoint']);
  });

  it('returns empty for a top-level entry', () => {
    expect(getAncestors(entries[0], entries)).toEqual([]);
  });

  it('is cycle-guarded against bad data', () => {
    const looped = [
      entry({ id: 'a', parent: 'b' }),
      entry({ id: 'b', parent: 'a' }),
    ];
    // Must terminate, not loop forever.
    expect(getAncestors(looped[0], looped).map((e) => e.id)).toEqual(['b']);
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

describe('parseWikiTarget', () => {
  it('strips the wikilink brackets', () => {
    expect(parseWikiTarget('[[Sandpoint]]')).toBe('Sandpoint');
  });

  it('uses the target, not the alias, for piped links', () => {
    expect(parseWikiTarget('[[Sandpoint|the town]]')).toBe('Sandpoint');
  });

  it('tolerates surrounding whitespace and bare text', () => {
    expect(parseWikiTarget('  [[Abadar]] ')).toBe('Abadar');
    expect(parseWikiTarget('Abadar')).toBe('Abadar');
  });
});

describe('buildTitleToIdMap', () => {
  it('maps lowercased titles to ids', () => {
    const map = buildTitleToIdMap([
      entry({ id: 'sandpoint', title: 'Sandpoint' }),
      entry({ id: 'abadar', title: 'Abadar' }),
    ]);
    expect(map.get('sandpoint')).toBe('sandpoint');
    expect(map.get('abadar')).toBe('abadar');
  });

  it('skips entries missing a title or id', () => {
    const map = buildTitleToIdMap([{ id: 'x' }, { title: 'Y' }]);
    expect(map.size).toBe(0);
  });
});

describe('resolveWikilink', () => {
  const map = buildTitleToIdMap([entry({ id: 'sandpoint', title: 'Sandpoint' })]);

  it('resolves case-insensitively, honoring aliases', () => {
    expect(resolveWikilink('[[sandpoint]]', map)).toBe('sandpoint');
    expect(resolveWikilink('[[SANDPOINT|home]]', map)).toBe('sandpoint');
  });

  it('returns null for an unknown target', () => {
    expect(resolveWikilink('[[Nowhere]]', map)).toBeNull();
  });

  it('returns null with no map or empty target', () => {
    expect(resolveWikilink('[[Sandpoint]]', null)).toBeNull();
    expect(resolveWikilink('', map)).toBeNull();
  });
});
