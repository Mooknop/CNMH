import { downtimeExpertFor } from './downtimeExperts';

// party entries mirror usePartyDowntime: { char: { id, name, skills }, plan }
const pc = (id, skills, plan) => ({ char: { id, name: id, skills }, plan });

describe('downtimeExpertFor', () => {
  it('returns null for an activity with no keyed expert skill (Retrain)', () => {
    const party = [pc('a', { crafting: { proficiency: 4 } }, { Retrain: 3 })];
    expect(downtimeExpertFor('Retrain', party, 'me')).toBeNull();
  });

  it('finds the Crafting expert among PCs also crafting this week', () => {
    const party = [
      pc('me', { crafting: { proficiency: 4 } }, { Crafting: 2 }),
      pc('a', { crafting: { proficiency: 2 } }, { Crafting: 3 }),
    ];
    const expert = downtimeExpertFor('Crafting', party, 'me');
    expect(expert.char.id).toBe('a');
    expect(expert.skillId).toBe('crafting');
    expect(expert.rank).toBe(2);
  });

  it('excludes the viewer even when they are the most proficient', () => {
    const party = [
      pc('me', { crafting: { proficiency: 4 } }, { Crafting: 5 }),
    ];
    expect(downtimeExpertFor('Crafting', party, 'me')).toBeNull();
  });

  it('ignores PCs who are not pursuing the activity this week', () => {
    const party = [pc('a', { crafting: { proficiency: 4 } }, { Research: 4 })];
    expect(downtimeExpertFor('Crafting', party, 'me')).toBeNull();
  });

  it('requires Expert (rank 2)+ — a trained-only PC is not an expert', () => {
    const party = [pc('a', { crafting: { proficiency: 1 } }, { Crafting: 4 })];
    expect(downtimeExpertFor('Crafting', party, 'me')).toBeNull();
  });

  it('picks the highest relevant proficiency for Research across its skills', () => {
    const party = [
      pc('a', { occultism: { proficiency: 2 } }, { Research: 3 }),
      pc('b', { religion: { proficiency: 3 } }, { Research: 2 }),
    ];
    const expert = downtimeExpertFor('Research', party, 'me');
    expect(expert.char.id).toBe('b');
    expect(expert.skillId).toBe('religion');
    expect(expert.rank).toBe(3);
  });

  it('breaks ties by keeping the earlier PC', () => {
    const party = [
      pc('a', { arcana: { proficiency: 2 } }, { Research: 1 }),
      pc('b', { society: { proficiency: 2 } }, { Research: 1 }),
    ];
    expect(downtimeExpertFor('Research', party, 'me').char.id).toBe('a');
  });

  it('handles bare-number skill proficiencies', () => {
    const party = [pc('a', { crafting: 3 }, { Crafting: 2 })];
    expect(downtimeExpertFor('Crafting', party, 'me').rank).toBe(3);
  });
});
