import {
  recallKnowledgeDC,
  recallKnowledgeSkills,
  applyRecallKnowledge,
  defaultRecord,
  isLockedFor,
  personalAntithesisValue,
  highestWeakness,
  revealFromExploit,
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

  // ── success: auto identity/desc/hp + 1 choice ──────────────────────────────

  test('success sets identity, description, hp', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['reflex'], charId: 'c1',
    });
    expect(next.identity).toBe(true);
    expect(next.description).toBe(true);
    expect(next.hp).toBe(true);
  });

  test('success with reflex sets saves.reflex', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['reflex'], charId: 'c1',
    });
    expect(next.saves.reflex).toBe(true);
    expect(next.saves.fortitude).toBe(false);
    expect(learned).toEqual(['reflex']);
  });

  test('success with ac sets ac flag', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['ac'], charId: 'c1',
    });
    expect(next.ac).toBe(true);
    expect(learned).toEqual(['ac']);
  });

  test('success with perception sets perception flag', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['perception'], charId: 'c1',
    });
    expect(next.perception).toBe(true);
  });

  test('success with speed sets speed flag', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['speed'], charId: 'c1',
    });
    expect(next.speed).toBe(true);
  });

  test('success with lowest save resolves to will (value 2)', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['lowest'], charId: 'c1',
    });
    expect(learned).toEqual(['will']);
    expect(next.saves.will).toBe(true);
    expect(next.saves.reflex).toBe(false);
  });

  test('success with highest save resolves to reflex (value 7)', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['highest'], charId: 'c1',
    });
    expect(learned).toEqual(['reflex']);
    expect(next.saves.reflex).toBe(true);
  });

  test('success with immunities sets iwr.immunities', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['immunities'], charId: 'c1',
    });
    expect(next.iwr.immunities).toBe(true);
    expect(next.iwr.resistances).toBe(false);
    expect(learned).toEqual(['immunities']);
  });

  test('success with resistances sets iwr.resistances', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['resistances'], charId: 'c1',
    });
    expect(next.iwr.resistances).toBe(true);
  });

  test('success with weaknesses sets iwr.weaknesses', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success', defenses, choices: ['weaknesses'], charId: 'c1',
    });
    expect(next.iwr.weaknesses).toBe(true);
  });

  test('lowest/highest with all saves null falls back to fortitude', () => {
    const { learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'success',
      defenses: { saves: {} },
      choices: ['lowest'],
      charId: 'c1',
    });
    expect(learned).toEqual(['fortitude']);
  });

  // ── criticalSuccess: auto identity/desc/hp + 2 choices ─────────────────────

  test('criticalSuccess sets identity, description, hp', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'criticalSuccess', defenses, choices: ['ac', 'fortitude'], charId: 'c1',
    });
    expect(next.identity).toBe(true);
    expect(next.description).toBe(true);
    expect(next.hp).toBe(true);
  });

  test('criticalSuccess applies both chosen facts', () => {
    const { next, learned } = applyRecallKnowledge(defaultRecord(), {
      degree: 'criticalSuccess', defenses, choices: ['ac', 'fortitude'], charId: 'c1',
    });
    expect(next.ac).toBe(true);
    expect(next.saves.fortitude).toBe(true);
    expect(learned).toEqual(['ac', 'fortitude']);
  });

  test('criticalSuccess with no choices still sets auto flags', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'criticalSuccess', defenses, choices: [], charId: 'c1',
    });
    expect(next.identity).toBe(true);
    expect(next.description).toBe(true);
  });

  // ── failure & criticalFailure ───────────────────────────────────────────────

  test('failure returns record unchanged', () => {
    const base = defaultRecord();
    const { next } = applyRecallKnowledge(base, {
      degree: 'failure', defenses, choices: ['fortitude'], charId: 'c1',
    });
    expect(next).toEqual(base);
  });

  test('criticalFailure adds charId to lockedOut', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'criticalFailure', defenses, choices: [], charId: 'c1',
    });
    expect(next.lockedOut.c1).toBe(true);
    expect(isLockedFor(next, 'c1')).toBe(true);
    expect(isLockedFor(next, 'c2')).toBe(false);
  });

  test('criticalFailure does not lock a different character', () => {
    const { next } = applyRecallKnowledge(defaultRecord(), {
      degree: 'criticalFailure', defenses, choices: [], charId: 'c1',
    });
    expect(isLockedFor(next, 'c2')).toBe(false);
  });
});

// ── Exploit Vulnerability helpers ─────────────────────────────────────────────

describe('personalAntithesisValue', () => {
  test.each([
    [0, 2],
    [1, 2],
    [2, 3],
    [3, 3],
    [4, 4],
    [5, 4],
    [6, 5],
    [10, 7],
    [20, 12],
  ])('level %i → %i', (level, expected) => {
    expect(personalAntithesisValue(level)).toBe(expected);
  });

  test('undefined/null level → 2', () => {
    expect(personalAntithesisValue(undefined)).toBe(2);
    expect(personalAntithesisValue(null)).toBe(2);
  });
});

describe('highestWeakness', () => {
  test('returns null for empty weaknesses', () => {
    expect(highestWeakness({ weaknesses: [] })).toBeNull();
  });

  test('returns null when defenses is undefined', () => {
    expect(highestWeakness(undefined)).toBeNull();
  });

  test('returns the single weakness when there is only one', () => {
    expect(highestWeakness({ weaknesses: [{ type: 'fire', value: 5 }] }))
      .toEqual({ type: 'fire', value: 5 });
  });

  test('returns the highest weakness when there are multiple', () => {
    expect(highestWeakness({
      weaknesses: [
        { type: 'cold', value: 3 },
        { type: 'fire', value: 10 },
        { type: 'silver', value: 5 },
      ],
    })).toEqual({ type: 'fire', value: 10 });
  });

  test('returns first of ties (first reduces, no preference guarantee)', () => {
    const result = highestWeakness({
      weaknesses: [
        { type: 'cold', value: 5 },
        { type: 'fire', value: 5 },
      ],
    });
    expect(result.value).toBe(5);
  });
});

describe('revealFromExploit', () => {
  const defenses = {
    weaknesses: [
      { type: 'cold', value: 3 },
      { type: 'fire', value: 10 },
    ],
  };

  test('success adds highest weakness type to weaknessesRevealed', () => {
    const next = revealFromExploit(defaultRecord(), 'success', defenses);
    expect(next.weaknessesRevealed).toEqual({ fire: true });
    // Does not reveal full category
    expect(next.iwr.weaknesses).toBe(false);
    // Does not touch identity
    expect(next.identity).toBe(false);
  });

  test('success with no weaknesses leaves record unchanged', () => {
    const base = defaultRecord();
    const next = revealFromExploit(base, 'success', { weaknesses: [] });
    expect(next).toEqual(base);
  });

  test('criticalSuccess reveals all three IWR categories', () => {
    const next = revealFromExploit(defaultRecord(), 'criticalSuccess', defenses);
    expect(next.iwr.immunities).toBe(true);
    expect(next.iwr.resistances).toBe(true);
    expect(next.iwr.weaknesses).toBe(true);
    // Does not touch identity/saves
    expect(next.identity).toBe(false);
    expect(next.saves.fortitude).toBe(false);
  });

  test('failure leaves record unchanged', () => {
    const base = defaultRecord();
    expect(revealFromExploit(base, 'failure', defenses)).toEqual(base);
  });

  test('criticalFailure leaves record unchanged', () => {
    const base = defaultRecord();
    expect(revealFromExploit(base, 'criticalFailure', defenses)).toEqual(base);
  });

  test('accumulates multiple partial reveals across calls', () => {
    const defTwo = {
      weaknesses: [
        { type: 'cold', value: 3 },
        { type: 'fire', value: 10 },
      ],
    };
    const step1 = revealFromExploit(defaultRecord(), 'success', { weaknesses: [{ type: 'cold', value: 3 }] });
    const step2 = revealFromExploit(step1, 'success', defTwo);
    expect(step2.weaknessesRevealed).toEqual({ cold: true, fire: true });
  });
});
