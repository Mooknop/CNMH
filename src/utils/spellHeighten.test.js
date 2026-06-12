import { parseHeightenedKey, heightenedEntriesFor } from './spellHeighten';

describe('parseHeightenedKey', () => {
  test('parses absolute ordinal keys', () => {
    expect(parseHeightenedKey('1st')).toEqual({ kind: 'absolute', rank: 1 });
    expect(parseHeightenedKey('2nd')).toEqual({ kind: 'absolute', rank: 2 });
    expect(parseHeightenedKey('3rd')).toEqual({ kind: 'absolute', rank: 3 });
    expect(parseHeightenedKey('10th')).toEqual({ kind: 'absolute', rank: 10 });
  });

  test('parses relative step keys', () => {
    expect(parseHeightenedKey('+1')).toEqual({ kind: 'relative', step: 1 });
    expect(parseHeightenedKey('+4')).toEqual({ kind: 'relative', step: 4 });
  });

  test('returns null for unrecognized keys', () => {
    expect(parseHeightenedKey('special')).toBeNull();
    expect(parseHeightenedKey('+0')).toBeNull();
    expect(parseHeightenedKey('')).toBeNull();
    expect(parseHeightenedKey('5')).toBeNull();
  });
});

describe('heightenedEntriesFor', () => {
  const summon = {
    level: 1,
    heightened: {
      '2nd': 'The creature can be up to Level 1.',
      '3rd': 'The creature can be up to Level 2.',
      '4th': 'The creature can be up to Level 3.',
    },
  };

  test('absolute keys accumulate up to the cast rank', () => {
    expect(heightenedEntriesFor(summon, 3)).toEqual([
      { key: '2nd', text: 'The creature can be up to Level 1.', times: 1 },
      { key: '3rd', text: 'The creature can be up to Level 2.', times: 1 },
    ]);
  });

  test('absolute keys above the cast rank are excluded', () => {
    expect(heightenedEntriesFor(summon, 2)).toHaveLength(1);
  });

  test('native-rank cast yields nothing', () => {
    expect(heightenedEntriesFor(summon, 1)).toEqual([]);
  });

  test('relative keys repeat per step', () => {
    const spell = { level: 1, heightened: { '+1': 'The damage increases by 1d4.' } };
    expect(heightenedEntriesFor(spell, 2)).toEqual([
      { key: '+1', text: 'The damage increases by 1d4.', times: 1 },
    ]);
    expect(heightenedEntriesFor(spell, 4)).toEqual([
      { key: '+1', text: 'The damage increases by 1d4.', times: 3 },
    ]);
  });

  test('relative step larger than the height difference is excluded', () => {
    const spell = { level: 1, heightened: { '+2': 'The damage increases by 1d8.' } };
    expect(heightenedEntriesFor(spell, 2)).toEqual([]);
    expect(heightenedEntriesFor(spell, 5)).toEqual([
      { key: '+2', text: 'The damage increases by 1d8.', times: 2 },
    ]);
  });

  test('mixed absolute and relative keys both apply in map order', () => {
    const spell = {
      level: 1,
      heightened: { '3rd': 'Targets two creatures.', '+1': 'Add 1d6.' },
    };
    expect(heightenedEntriesFor(spell, 3)).toEqual([
      { key: '3rd', text: 'Targets two creatures.', times: 1 },
      { key: '+1', text: 'Add 1d6.', times: 2 },
    ]);
  });

  test('cantrip (level 0 native) heightens from rank 1', () => {
    const cantrip = { level: 0, heightened: { '+1': 'Add 1d4.' } };
    expect(heightenedEntriesFor(cantrip, 1)).toEqual([]);
    expect(heightenedEntriesFor(cantrip, 2)).toEqual([
      { key: '+1', text: 'Add 1d4.', times: 1 },
    ]);
    expect(heightenedEntriesFor(cantrip, 3)).toEqual([
      { key: '+1', text: 'Add 1d4.', times: 2 },
    ]);
  });

  test('handles missing heightened map, bad castRank, and malformed keys', () => {
    expect(heightenedEntriesFor({ level: 1 }, 3)).toEqual([]);
    expect(heightenedEntriesFor(null, 3)).toEqual([]);
    expect(heightenedEntriesFor(summon, undefined)).toEqual([]);
    expect(heightenedEntriesFor(summon, '3')).toEqual([]);
    const weird = { level: 1, heightened: { special: 'GM fiat.', '2nd': 'Works.' } };
    expect(heightenedEntriesFor(weird, 2)).toEqual([
      { key: '2nd', text: 'Works.', times: 1 },
    ]);
  });
});
