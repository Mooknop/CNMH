import {
  recallKnowledgeDC,
  recallKnowledgeSkills,
  applyRecallKnowledge,
  defaultRecord,
  isLockedFor,
  KNOWLEDGE_SKILLS,
} from './recallKnowledge';

describe('recallKnowledgeDC', () => {
  test.each([
    [-1, 'common', 13],
    [0,  'common', 14],
    [1,  'common', 15],
    [5,  'common', 20],
    [10, 'common', 27],
    [20, 'common', 40],
    [25, 'common', 50],
  ])('level %i common → %i', (level, rarity, expected) => {
    expect(recallKnowledgeDC(level, rarity)).toBe(expected);
  });

  test('uncommon adds 2', () => {
    expect(recallKnowledgeDC(1, 'uncommon')).toBe(17);
  });

  test('rare adds 5', () => {
    expect(recallKnowledgeDC(1, 'rare')).toBe(20);
  });

  test('unique adds 10', () => {
    expect(recallKnowledgeDC(1, 'unique')).toBe(25);
  });

  test('defaults rarity to common when omitted', () => {
    expect(recallKnowledgeDC(5)).toBe(recallKnowledgeDC(5, 'common'));
  });

  test('clamps level below -1 to -1', () => {
    expect(recallKnowledgeDC(-5, 'common')).toBe(13);
  });

  test('clamps level above 25 to 25', () => {
    expect(recallKnowledgeDC(99, 'common')).toBe(50);
  });

  test('handles non-finite level gracefully (defaults to level 0)', () => {
    expect(recallKnowledgeDC(null, 'common')).toBe(14);
    expect(recallKnowledgeDC(undefined, 'common')).toBe(14);
    expect(recallKnowledgeDC(NaN, 'common')).toBe(14);
  });

  test('unknown rarity bumps by 0', () => {
    expect(recallKnowledgeDC(1, 'legendary')).toBe(15);
  });
});

describe('recallKnowledgeSkills', () => {
  test('returns all 5 skills when no trait matches', () => {
    const result = recallKnowledgeSkills([]);
    expect(result).toHaveLength(5);
    KNOWLEDGE_SKILLS.forEach((s) => expect(result).toContain(s));
  });

  test('aberration → occultism first', () => {
    expect(recallKnowledgeSkills(['aberration'])[ 0]).toBe('occultism');
  });

  test('animal → nature first', () => {
    expect(recallKnowledgeSkills(['animal'])[0]).toBe('nature');
  });

  test('undead → religion first', () => {
    expect(recallKnowledgeSkills(['undead'])[0]).toBe('religion');
  });

  test('dragon → arcana first', () => {
    expect(recallKnowledgeSkills(['dragon'])[0]).toBe('arcana');
  });

  test('humanoid → society first', () => {
    expect(recallKnowledgeSkills(['goblin', 'humanoid'])[0]).toBe('society');
  });

  test('returns exactly 5 skills with recommended first', () => {
    const result = recallKnowledgeSkills(['dragon']);
    expect(result[0]).toBe('arcana');
    expect(result).toHaveLength(5);
    // no duplicates
    expect(new Set(result).size).toBe(5);
  });

  test('handles undefined/null traits gracefully', () => {
    expect(recallKnowledgeSkills(undefined)).toHaveLength(5);
    expect(recallKnowledgeSkills(null)).toHaveLength(5);
  });
});

describe('applyRecallKnowledge', () => {
  const defenses = {
    saves: { fortitude: 4, reflex: 7, will: 2 },
  };

  test('criticalSuccess sets all:true', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), { degree: 'criticalSuccess', defenses, choice: null, charId: 'c1' });
    expect(next.all).toBe(true);
  });

  test('failure returns record unchanged', () => {
    const base = defaultRecord();
    const { next } = applyRecallKnowledge(base, { degree: 'failure', defenses, choice: 'fortitude', charId: 'c1' });
    expect(next).toEqual(base);
  });

  test('criticalFailure adds charId to lockedOut', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), { degree: 'criticalFailure', defenses, choice: null, charId: 'c1' });
    expect(next.lockedOut.c1).toBe(true);
    expect(isLockedFor(next, 'c1')).toBe(true);
    expect(isLockedFor(next, 'c2')).toBe(false);
  });

  test('criticalFailure does not lock a different character', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), { degree: 'criticalFailure', defenses, choice: null, charId: 'c1' });
    expect(isLockedFor(next, 'c2')).toBe(false);
  });

  test('success sets description, hp, and named save', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), { degree: 'success', defenses, choice: 'reflex', charId: 'c1' });
    expect(next.description).toBe(true);
    expect(next.hp).toBe(true);
    expect(next.saves.reflex).toBe(true);
    expect(next.saves.fortitude).toBe(false);
    expect(learned).toBe('reflex');
  });

  test('success with lowest save resolves to will (value 2)', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), { degree: 'success', defenses, choice: 'lowest', charId: 'c1' });
    expect(learned).toBe('will');
    expect(next.saves.will).toBe(true);
    expect(next.saves.reflex).toBe(false);
  });

  test('success with highest save resolves to reflex (value 7)', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), { degree: 'success', defenses, choice: 'highest', charId: 'c1' });
    expect(learned).toBe('reflex');
    expect(next.saves.reflex).toBe(true);
  });

  test('success with immunities sets iwr.immunities', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), { degree: 'success', defenses, choice: 'immunities', charId: 'c1' });
    expect(next.iwr.immunities).toBe(true);
    expect(next.iwr.resistances).toBe(false);
    expect(learned).toBe('immunities');
  });

  test('success with resistances sets iwr.resistances', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), { degree: 'success', defenses, choice: 'resistances', charId: 'c1' });
    expect(next.iwr.resistances).toBe(true);
  });

  test('success with weaknesses sets iwr.weaknesses', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), { degree: 'success', defenses, choice: 'weaknesses', charId: 'c1' });
    expect(next.iwr.weaknesses).toBe(true);
  });

  test('lowest/highest with all saves null falls back to fortitude', () => {
    const { learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success',
      defenses: { saves: {} },
      choice: 'lowest',
      charId: 'c1',
    });
    expect(learned).toBe('fortitude');
  });
});
