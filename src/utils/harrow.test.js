import { HARROW_SUITS, suitById, isHarrowSuit, HARROW_CAST_DC, harrowCastEffect } from './harrow';

describe('suit vocabulary', () => {
  it('has the six suits with check associations', () => {
    expect(HARROW_SUITS.map((s) => s.id)).toEqual([
      'Hammers', 'Keys', 'Shields', 'Books', 'Stars', 'Crowns',
    ]);
    expect(suitById('Keys').checks).toBe('Reflex Saves');
    expect(isHarrowSuit('Stars')).toBe(true);
    expect(isHarrowSuit('Cups')).toBe(false);
  });
});

describe('harrowCastEffect', () => {
  it('Hammers is a damage note scaled by spell rank, doubled on a match', () => {
    expect(harrowCastEffect('Hammers', { spellRank: 3 }).note).toContain('+3 force damage');
    const matched = harrowCastEffect('Hammers', { spellRank: 3, match: true });
    expect(matched.kind).toBe('damage-note');
    expect(matched.note).toContain('+6 force damage');
    expect(matched.note).toContain('omen match');
  });

  it('Keys picks the +1 ward, upgraded to +2 on a match', () => {
    expect(harrowCastEffect('Keys', {})).toMatchObject({ kind: 'self-effect', effectId: 'harrow-key-ward' });
    expect(harrowCastEffect('Keys', { match: true })).toMatchObject({ effectId: 'harrow-key-ward-2' });
  });

  it('Shields heals 2d6+rank, 4d6+2×rank on a match', () => {
    expect(harrowCastEffect('Shields', { spellRank: 2 })).toMatchObject({ kind: 'self-heal', dice: '2d6+2' });
    expect(harrowCastEffect('Shields', { spellRank: 2, match: true }).dice).toBe('4d6+4');
  });

  it('Stars heals the target and adds the save ward only on a match', () => {
    const base = harrowCastEffect('Stars', { spellRank: 1 });
    expect(base).toMatchObject({ kind: 'target-heal', dice: '2d6+1', effectId: null });
    expect(harrowCastEffect('Stars', { spellRank: 1, match: true }).effectId).toBe('harrow-star-saves');
  });

  it('Books and Crowns are log-only notes with a +2 hint on a match', () => {
    expect(harrowCastEffect('Books', {}).kind).toBe('note');
    expect(harrowCastEffect('Books', { match: true }).note).toContain('+2 status');
    expect(harrowCastEffect('Crowns', {}).kind).toBe('note');
    expect(harrowCastEffect('Crowns', { match: true }).note).toContain('+2 status');
  });

  it('unknown suit returns null; the DC is 11', () => {
    expect(harrowCastEffect('Cups', {})).toBeNull();
    expect(HARROW_CAST_DC).toBe(11);
  });
});
