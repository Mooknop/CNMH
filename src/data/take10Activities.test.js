import { availableTake10Activities, TAKE10_ACTIVITIES } from './take10Activities';

describe('availableTake10Activities', () => {
  it('returns [] for a missing model', () => {
    expect(availableTake10Activities(null)).toEqual([]);
  });

  it('always offers the generic GM-adjudicated activity', () => {
    const list = availableTake10Activities({ flags: {}, skillProficiencies: {} });
    expect(list.map((a) => a.id)).toContain('other');
  });

  it('gates Refocus on a focus pool', () => {
    const without = availableTake10Activities({ flags: {}, skillProficiencies: {} });
    expect(without.map((a) => a.id)).not.toContain('refocus');
    const withPool = availableTake10Activities({ flags: { hasFocusSpells: true }, skillProficiencies: {} });
    expect(withPool.map((a) => a.id)).toContain('refocus');
  });

  it('gates Treat Wounds / Repair on skill training', () => {
    const trained = availableTake10Activities({
      flags: {},
      skillProficiencies: { medicine: 1, crafting: 2 },
    });
    const ids = trained.map((a) => a.id);
    expect(ids).toContain('treat-wounds');
    expect(ids).toContain('repair');
  });

  it('gates Learn a Spell on spellcasting AND a trained magic skill', () => {
    const skillOnly = availableTake10Activities({
      flags: {},
      skillProficiencies: { arcana: 1 },
    });
    expect(skillOnly.map((a) => a.id)).not.toContain('learn-a-spell');

    const both = availableTake10Activities({
      flags: { hasSpellcasting: true },
      skillProficiencies: { arcana: 1 },
    });
    expect(both.map((a) => a.id)).toContain('learn-a-spell');
  });

  it('declares a positive minute cost on every activity', () => {
    expect(TAKE10_ACTIVITIES.every((a) => a.minutes > 0)).toBe(true);
  });
});
