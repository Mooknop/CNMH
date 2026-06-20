import { earnIncomeSkillOptions } from './earnIncomeSkills';

describe('earnIncomeSkillOptions', () => {
  it('offers Crafting when trained', () => {
    const opts = earnIncomeSkillOptions({ skillProficiencies: { crafting: 2 } });
    expect(opts).toEqual([{ key: 'crafting', label: 'Crafting', rank: 2 }]);
  });

  it('omits Crafting when untrained', () => {
    const opts = earnIncomeSkillOptions({ skillProficiencies: { crafting: 0 } });
    expect(opts).toEqual([]);
  });

  it('offers trained lores with a "Lore" suffix, skips untrained ones', () => {
    const opts = earnIncomeSkillOptions({
      loreSkills: [
        { name: 'Esoteric', proficiency: 2 },
        { name: 'Mercantile', proficiency: 0 },
      ],
    });
    expect(opts).toEqual([{ key: 'lore:Esoteric', label: 'Esoteric Lore', rank: 2 }]);
  });

  it('adds Diplomacy for a Bargain Hunter even when untrained, tagged viaFeat', () => {
    const opts = earnIncomeSkillOptions({
      skillProficiencies: { diplomacy: 0 },
      feats: [{ name: 'Bargain Hunter' }],
    });
    expect(opts).toContainEqual({ key: 'diplomacy', label: 'Diplomacy', rank: 0, viaFeat: 'Bargain Hunter' });
  });

  it('adds Performance for a Celebrity, carrying its real rank', () => {
    const opts = earnIncomeSkillOptions({
      skillProficiencies: { performance: 3 },
      feats: [{ name: 'Celebrity Dedication' }],
    });
    expect(opts).toContainEqual({ key: 'performance', label: 'Performance', rank: 3, viaFeat: 'Celebrity Dedication' });
  });

  it('does not duplicate a feat skill already trained-and-listed', () => {
    // Diplomacy isn't a default Earn Income skill, so the only source here is the
    // feat — exactly one entry.
    const opts = earnIncomeSkillOptions({
      skillProficiencies: { diplomacy: 2 },
      feats: [{ name: 'Bargain Hunter' }],
    });
    expect(opts.filter((o) => o.key === 'diplomacy')).toHaveLength(1);
    expect(opts[0].rank).toBe(2);
  });

  it('returns an empty list for a character with no eligible skill', () => {
    expect(earnIncomeSkillOptions({})).toEqual([]);
    expect(earnIncomeSkillOptions(null)).toEqual([]);
  });
});
