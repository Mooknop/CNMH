import { earnIncomeSkillOptions } from './earnIncomeSkills';
import { FREELANCE, employerById } from '../data/earnIncomeEmployers';

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

  describe('with a job context', () => {
    it('unlocks an employer core skill when trained, alongside Crafting', () => {
      // Red Dog Smithy unlocks Athletics.
      const job = employerById('red-dog-smithy');
      const opts = earnIncomeSkillOptions(
        { skillProficiencies: { crafting: 1, athletics: 3 } },
        job,
      );
      expect(opts).toContainEqual({ key: 'crafting', label: 'Crafting', rank: 1 });
      expect(opts).toContainEqual({ key: 'athletics', label: 'Athletics', rank: 3 });
    });

    it('omits an unlocked core skill the character is untrained in', () => {
      const job = employerById('red-dog-smithy');
      const opts = earnIncomeSkillOptions({ skillProficiencies: { athletics: 0 } }, job);
      expect(opts.some((o) => o.key === 'athletics')).toBe(false);
    });

    it('offers only the named Lores the employer unlocks and the char has trained', () => {
      // Shipyard unlocks Engineering / Labor / Sailing Lore.
      const job = employerById('sandpoint-shipyard');
      const opts = earnIncomeSkillOptions(
        {
          loreSkills: [
            { name: 'Sailing', proficiency: 2 },
            { name: 'Warfare', proficiency: 3 }, // not unlocked here
          ],
        },
        job,
      );
      expect(opts).toContainEqual({ key: 'lore:Sailing', label: 'Sailing Lore', rank: 2 });
      expect(opts.some((o) => o.key === 'lore:Warfare')).toBe(false);
    });

    it('offers every trained Lore when the job takes anyLore', () => {
      // Turandarok Academy accepts most Lore skills.
      const job = employerById('turandarok-academy');
      const opts = earnIncomeSkillOptions(
        {
          loreSkills: [
            { name: 'Academia', proficiency: 1 },
            { name: 'Warfare', proficiency: 2 },
          ],
        },
        job,
      );
      expect(opts).toContainEqual({ key: 'lore:Academia', label: 'Academia Lore', rank: 1 });
      expect(opts).toContainEqual({ key: 'lore:Warfare', label: 'Warfare Lore', rank: 2 });
    });

    it('freelance offers Performance to a trained performer with no feat', () => {
      const opts = earnIncomeSkillOptions(
        { skillProficiencies: { performance: 2 } },
        FREELANCE,
      );
      expect(opts).toContainEqual({ key: 'performance', label: 'Performance', rank: 2 });
    });

    it('still offers a feat skill at an employer that does not list it', () => {
      // Red Dog Smithy only unlocks Athletics, but Bargain Hunter grants Diplomacy anywhere.
      const job = employerById('red-dog-smithy');
      const opts = earnIncomeSkillOptions(
        { skillProficiencies: { diplomacy: 0 }, feats: [{ name: 'Bargain Hunter' }] },
        job,
      );
      expect(opts).toContainEqual({
        key: 'diplomacy', label: 'Diplomacy', rank: 0, viaFeat: 'Bargain Hunter',
      });
    });
  });
});
