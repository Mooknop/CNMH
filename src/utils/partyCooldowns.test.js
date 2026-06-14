import { describe, it, expect } from 'vitest';
import { collectCooldowns, collectImmunities } from './partyCooldowns';

const NOW = 1_000_000;
const HOUR = 3600;
const DAY = 86400;

// A character with one frequency-bearing action and an Eld power source.
const CHAR = {
  id: 'thorn',
  name: 'Thorn',
  actions: [
    { name: 'Battle Cry', frequency: 'once per day' },
    { name: 'Stride' }, // no frequency
  ],
  spellcasting: {
    eldPowers: [
      { source: 'Flame', powers: [{ name: 'Eld Flare' }] },
    ],
  },
};

describe('collectCooldowns', () => {
  it('returns nothing for an empty ledger', () => {
    expect(collectCooldowns(CHAR, {}, { nowSecs: NOW })).toEqual([]);
    expect(collectCooldowns(CHAR, null, { nowSecs: NOW })).toEqual([]);
  });

  it('surfaces a window-locked indexed ability with its name and ready-at', () => {
    const usedAt = NOW - 100;
    const ledger = { 'battle-cry': [{ per: 'day', gameSecs: usedAt }] };
    const [cd] = collectCooldowns(CHAR, ledger, { nowSecs: NOW });
    expect(cd.name).toBe('Battle Cry');
    expect(cd.per).toBe('day');
    expect(cd.availableAtSecs).toBe(usedAt + DAY);
  });

  it('resolves Eld powers via the injected once-per-hour rule', () => {
    const usedAt = NOW - 600;
    const ledger = { 'eld-flare': [{ per: 'hour', gameSecs: usedAt }] };
    const [cd] = collectCooldowns(CHAR, ledger, { nowSecs: NOW });
    expect(cd.name).toBe('Eld Flare');
    expect(cd.availableAtSecs).toBe(usedAt + HOUR);
  });

  it('omits an ability whose window has already aged out', () => {
    const ledger = { 'battle-cry': [{ per: 'day', gameSecs: NOW - DAY - 10 }] };
    expect(collectCooldowns(CHAR, ledger, { nowSecs: NOW })).toEqual([]);
  });

  it('ignores turn/round records (no clock-derived ready-at)', () => {
    const ledger = { 'battle-cry': [{ per: 'round', round: 2 }] };
    expect(collectCooldowns(CHAR, ledger, { nowSecs: NOW })).toEqual([]);
  });

  it('infers a once-per-window rule for an unindexed key, prettifying the slug', () => {
    const usedAt = NOW - 100;
    const ledger = { 'mystery-power': [{ per: 'hour', gameSecs: usedAt }] };
    const [cd] = collectCooldowns(CHAR, ledger, { nowSecs: NOW });
    expect(cd.name).toBe('Mystery Power');
    expect(cd.availableAtSecs).toBe(usedAt + HOUR);
  });

  it('sorts soonest-ready first', () => {
    const ledger = {
      'battle-cry':  [{ per: 'day', gameSecs: NOW - 100 }],   // ready in ~a day
      'eld-flare':   [{ per: 'hour', gameSecs: NOW - 100 }],  // ready in ~an hour
    };
    const out = collectCooldowns(CHAR, ledger, { nowSecs: NOW });
    expect(out.map((c) => c.key)).toEqual(['eld-flare', 'battle-cry']);
  });
});

describe('collectImmunities', () => {
  const ABILITY = (over) => ({ id: 'a1', effectId: 'ability-immunity', source: 'Tell Fortune', expireAtSecs: NOW + DAY, ...over });
  const TREAT   = (over) => ({ id: 't1', effectId: 'treat-wounds-immunity', source: 'Battle Medicine', expireAtSecs: NOW + HOUR, ...over });

  it('returns both immunity kinds, soonest-expiring first', () => {
    const out = collectImmunities([ABILITY(), TREAT()], NOW);
    expect(out.map((i) => i.label)).toEqual(['Battle Medicine', 'Tell Fortune']);
    expect(out[0].expireAtSecs).toBe(NOW + HOUR);
  });

  it('excludes already-expired immunities', () => {
    expect(collectImmunities([ABILITY({ expireAtSecs: NOW - 1 })], NOW)).toEqual([]);
  });

  it('excludes immunities with no absolute expiry', () => {
    expect(collectImmunities([ABILITY({ expireAtSecs: undefined })], NOW)).toEqual([]);
  });

  it('ignores non-immunity effects', () => {
    expect(collectImmunities([{ id: 'x', effectId: 'frightened', expireAtSecs: NOW + DAY }], NOW)).toEqual([]);
  });

  it('falls back to a generic label when source is missing', () => {
    const [imm] = collectImmunities([ABILITY({ source: undefined })], NOW);
    expect(imm.label).toBe('Immunity');
  });
});
