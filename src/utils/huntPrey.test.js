import { preyKeyFor, makePreyEntry, preyMatches } from './huntPrey';

describe('preyKeyFor', () => {
  it('prefers creatureKey', () => {
    expect(preyKeyFor({ creatureKey: 'gob', entryId: 'e1' })).toBe('gob');
  });
  it('falls back to entryId', () => {
    expect(preyKeyFor({ entryId: 'e1' })).toBe('e1');
  });
});

describe('makePreyEntry', () => {
  it('builds a stamped entry', () => {
    const entry = makePreyEntry({ targetKey: 'gob', targetName: 'Goblin' });
    expect(entry).toMatchObject({ targetKey: 'gob', targetName: 'Goblin' });
    expect(typeof entry.ts).toBe('number');
  });
  it('defaults a missing name to empty string', () => {
    expect(makePreyEntry({ targetKey: 'gob' }).targetName).toBe('');
  });
});

describe('preyMatches', () => {
  const prey = { targetKey: 'gob', targetName: 'Goblin' };

  it('matches an enemy with the same creatureKey (same-type)', () => {
    expect(preyMatches(prey, { creatureKey: 'gob', entryId: 'e2' })).toBe(true);
  });
  it('matches a manual enemy by its entryId when keyed that way', () => {
    expect(preyMatches({ targetKey: 'e1' }, { entryId: 'e1' })).toBe(true);
  });
  it('does not match a different creature', () => {
    expect(preyMatches(prey, { creatureKey: 'orc', entryId: 'e3' })).toBe(false);
  });
  it('is false for null prey or null entry', () => {
    expect(preyMatches(null, { creatureKey: 'gob' })).toBe(false);
    expect(preyMatches(prey, null)).toBe(false);
  });
});
