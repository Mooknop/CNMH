import { computeConditionEffects } from './ConditionUtils';

// Helpers to build active condition objects quickly
const valued = (id, value) => ({ id, value });
const toggle = (id) => ({ id });

describe('computeConditionEffects', () => {
  describe('with no active conditions', () => {
    const effects = computeConditionEffects([]);

    it('returns zero total for AC', () => expect(effects.ac.total).toBe(0));
    it('returns zero total for fortitude', () => expect(effects.fort.total).toBe(0));
    it('returns zero total for reflex', () => expect(effects.reflex.total).toBe(0));
    it('returns zero total for will', () => expect(effects.will.total).toBe(0));
    it('returns zero total for meleeAttack', () => expect(effects.meleeAttack.total).toBe(0));
    it('returns zero total for rangedAttack', () => expect(effects.rangedAttack.total).toBe(0));
    it('returns zero total for spellAttack', () => expect(effects.spellAttack.total).toBe(0));
    it('returns zero total for classDC', () => expect(effects.classDC.total).toBe(0));
    it('returns zero total for spellDC', () => expect(effects.spellDC.total).toBe(0));
    it('returns zero speed reduction', () => expect(effects.speed.total).toBe(0));
    it('returns zero maxHp reduction', () => expect(effects.maxHp.total).toBe(0));
    it('returns empty sources arrays', () => {
      expect(effects.ac.sources).toHaveLength(0);
      expect(effects.fort.sources).toHaveLength(0);
    });
  });

  // ── AC ────────────────────────────────────────────────────────────
  describe('AC penalties', () => {
    it('applies Clumsy (status) to AC', () => {
      const { ac } = computeConditionEffects([valued('clumsy', 2)]);
      expect(ac.total).toBe(-2);
      expect(ac.sources[0].label).toBe('Clumsy 2');
    });

    it('applies Fatigued as -1 status to AC', () => {
      expect(computeConditionEffects([toggle('fatigued')]).ac.total).toBe(-1);
    });

    it('status penalties to AC do not stack — worst applies', () => {
      // Clumsy 3 vs Fatigued 1 → only -3 applies
      const { ac } = computeConditionEffects([valued('clumsy', 3), toggle('fatigued')]);
      expect(ac.total).toBe(-3);
    });

    it('applies Off-Guard as -2 circumstance to AC', () => {
      expect(computeConditionEffects([toggle('off-guard')]).ac.total).toBe(-2);
    });

    it('applies Prone as -2 circumstance to AC', () => {
      expect(computeConditionEffects([toggle('prone')]).ac.total).toBe(-2);
    });

    it('applies Grabbed as -2 circumstance to AC', () => {
      expect(computeConditionEffects([toggle('grabbed')]).ac.total).toBe(-2);
    });

    it('applies Restrained as -2 circumstance to AC', () => {
      expect(computeConditionEffects([toggle('restrained')]).ac.total).toBe(-2);
    });

    it('applies Paralyzed as -2 circumstance to AC', () => {
      expect(computeConditionEffects([toggle('paralyzed')]).ac.total).toBe(-2);
    });

    it('applies Confused as -2 circumstance to AC', () => {
      expect(computeConditionEffects([toggle('confused')]).ac.total).toBe(-2);
    });

    it('circumstance penalties to AC do not stack — worst applies', () => {
      // Off-Guard -2 + Prone -2 → only -2 total (same magnitude, one applies)
      const { ac } = computeConditionEffects([toggle('off-guard'), toggle('prone')]);
      expect(ac.total).toBe(-2);
    });

    it('status and circumstance penalties to AC stack with each other', () => {
      // Clumsy 1 (status) + Off-Guard (circumstance) = -1 + -2 = -3
      const { ac } = computeConditionEffects([valued('clumsy', 1), toggle('off-guard')]);
      expect(ac.total).toBe(-3);
    });
  });

  // ── Fortitude ─────────────────────────────────────────────────────
  describe('Fortitude save penalties', () => {
    it('applies Drained to Fort', () => {
      expect(computeConditionEffects([valued('drained', 2)]).fort.total).toBe(-2);
    });

    it('applies Frightened to Fort', () => {
      expect(computeConditionEffects([valued('frightened', 3)]).fort.total).toBe(-3);
    });

    it('applies Sickened to Fort', () => {
      expect(computeConditionEffects([valued('sickened', 1)]).fort.total).toBe(-1);
    });

    it('applies Fatigued to Fort', () => {
      expect(computeConditionEffects([toggle('fatigued')]).fort.total).toBe(-1);
    });

    it('Fort takes worst status (Frightened 3 beats Fatigued 1)', () => {
      const { fort } = computeConditionEffects([valued('frightened', 3), toggle('fatigued')]);
      expect(fort.total).toBe(-3);
    });
  });

  // ── Reflex ────────────────────────────────────────────────────────
  describe('Reflex save penalties', () => {
    it('applies Clumsy to Reflex', () => {
      expect(computeConditionEffects([valued('clumsy', 2)]).reflex.total).toBe(-2);
    });

    it('applies Frightened to Reflex', () => {
      expect(computeConditionEffects([valued('frightened', 1)]).reflex.total).toBe(-1);
    });

    it('applies Sickened to Reflex', () => {
      expect(computeConditionEffects([valued('sickened', 3)]).reflex.total).toBe(-3);
    });

    it('applies Fatigued to Reflex', () => {
      expect(computeConditionEffects([toggle('fatigued')]).reflex.total).toBe(-1);
    });

    it('Reflex takes worst status (Frightened 3 beats Clumsy 2)', () => {
      const { reflex } = computeConditionEffects([valued('clumsy', 2), valued('frightened', 3)]);
      expect(reflex.total).toBe(-3);
    });
  });

  // ── Will ──────────────────────────────────────────────────────────
  describe('Will save penalties', () => {
    it('applies Frightened to Will', () => {
      expect(computeConditionEffects([valued('frightened', 2)]).will.total).toBe(-2);
    });

    it('applies Sickened to Will', () => {
      expect(computeConditionEffects([valued('sickened', 2)]).will.total).toBe(-2);
    });

    it('applies Stupefied to Will', () => {
      expect(computeConditionEffects([valued('stupefied', 4)]).will.total).toBe(-4);
    });

    it('applies Fatigued to Will', () => {
      expect(computeConditionEffects([toggle('fatigued')]).will.total).toBe(-1);
    });

    it('Will takes worst status', () => {
      const { will } = computeConditionEffects([valued('frightened', 2), valued('stupefied', 3)]);
      expect(will.total).toBe(-3);
    });
  });

  // ── Melee attacks ─────────────────────────────────────────────────
  describe('Melee attack penalties', () => {
    it('applies Frightened to melee', () => {
      expect(computeConditionEffects([valued('frightened', 2)]).meleeAttack.total).toBe(-2);
    });

    it('applies Sickened to melee', () => {
      expect(computeConditionEffects([valued('sickened', 1)]).meleeAttack.total).toBe(-1);
    });

    it('applies Enfeebled to melee', () => {
      expect(computeConditionEffects([valued('enfeebled', 3)]).meleeAttack.total).toBe(-3);
    });

    it('applies Prone as -2 circumstance to melee', () => {
      expect(computeConditionEffects([toggle('prone')]).meleeAttack.total).toBe(-2);
    });

    it('Prone circumstance stacks with Frightened status on melee', () => {
      const { meleeAttack } = computeConditionEffects([valued('frightened', 1), toggle('prone')]);
      expect(meleeAttack.total).toBe(-3);
    });

    it('melee takes worst status penalty among Frightened/Sickened/Enfeebled', () => {
      const { meleeAttack } = computeConditionEffects([
        valued('frightened', 2),
        valued('enfeebled', 3),
      ]);
      expect(meleeAttack.total).toBe(-3);
    });
  });

  // ── Ranged attacks ────────────────────────────────────────────────
  describe('Ranged attack penalties', () => {
    it('applies Frightened to ranged', () => {
      expect(computeConditionEffects([valued('frightened', 2)]).rangedAttack.total).toBe(-2);
    });

    it('applies Clumsy to ranged', () => {
      expect(computeConditionEffects([valued('clumsy', 1)]).rangedAttack.total).toBe(-1);
    });

    it('applies Sickened to ranged', () => {
      expect(computeConditionEffects([valued('sickened', 2)]).rangedAttack.total).toBe(-2);
    });

    it('ranged takes worst status (Frightened 3 beats Clumsy 1)', () => {
      const { rangedAttack } = computeConditionEffects([
        valued('frightened', 3),
        valued('clumsy', 1),
      ]);
      expect(rangedAttack.total).toBe(-3);
    });
  });

  // ── Spell attacks & DC ────────────────────────────────────────────
  describe('Spell attack and Spell DC penalties', () => {
    it('applies Stupefied to spell attack', () => {
      expect(computeConditionEffects([valued('stupefied', 2)]).spellAttack.total).toBe(-2);
    });

    it('applies Frightened to spell attack', () => {
      expect(computeConditionEffects([valued('frightened', 1)]).spellAttack.total).toBe(-1);
    });

    it('applies Stupefied to spell DC', () => {
      expect(computeConditionEffects([valued('stupefied', 3)]).spellDC.total).toBe(-3);
    });

    it('applies Frightened to spell DC', () => {
      expect(computeConditionEffects([valued('frightened', 1)]).spellDC.total).toBe(-1);
    });
  });

  // ── Class DC ──────────────────────────────────────────────────────
  describe('Class DC penalties', () => {
    it('applies Frightened to Class DC regardless of key ability', () => {
      expect(computeConditionEffects([valued('frightened', 2)], 'strength').classDC.total).toBe(-2);
    });

    it('applies Sickened to Class DC regardless of key ability', () => {
      expect(computeConditionEffects([valued('sickened', 1)], 'dexterity').classDC.total).toBe(-1);
    });

    it('applies Stupefied to Class DC when key ability is charisma', () => {
      expect(computeConditionEffects([valued('stupefied', 3)], 'charisma').classDC.total).toBe(-3);
    });

    it('applies Stupefied to Class DC when key ability is intelligence', () => {
      expect(computeConditionEffects([valued('stupefied', 2)], 'intelligence').classDC.total).toBe(-2);
    });

    it('applies Stupefied to Class DC when key ability is wisdom', () => {
      expect(computeConditionEffects([valued('stupefied', 1)], 'wisdom').classDC.total).toBe(-1);
    });

    it('does NOT apply Stupefied to Class DC when key ability is strength', () => {
      expect(computeConditionEffects([valued('stupefied', 3)], 'strength').classDC.total).toBe(0);
    });

    it('does NOT apply Stupefied to Class DC when key ability is dexterity', () => {
      expect(computeConditionEffects([valued('stupefied', 3)], 'dexterity').classDC.total).toBe(0);
    });

    it('does NOT apply Stupefied to Class DC when key ability is constitution', () => {
      expect(computeConditionEffects([valued('stupefied', 3)], 'constitution').classDC.total).toBe(0);
    });

    it('handles empty/missing key ability gracefully', () => {
      expect(() => computeConditionEffects([valued('stupefied', 2)], '')).not.toThrow();
    });

    it('handles undefined key ability gracefully', () => {
      expect(() => computeConditionEffects([valued('stupefied', 2)], undefined)).not.toThrow();
    });
  });

  // ── Speed ─────────────────────────────────────────────────────────
  describe('Speed reduction', () => {
    it('reduces speed by 10 when Encumbered', () => {
      const { speed } = computeConditionEffects([toggle('encumbered')]);
      expect(speed.total).toBe(-10);
      expect(speed.sources[0].label).toBe('Encumbered');
      expect(speed.sources[0].penalty).toBe(-10);
    });

    it('no speed reduction without Encumbered', () => {
      expect(computeConditionEffects([valued('frightened', 4)]).speed.total).toBe(0);
      expect(computeConditionEffects([toggle('fatigued')]).speed.total).toBe(0);
    });
  });

  // ── Max HP (Drained) ──────────────────────────────────────────────
  describe('Max HP reduction', () => {
    it('reduces max HP by value × level for Drained', () => {
      const { maxHp } = computeConditionEffects([valued('drained', 2)], '', 5);
      expect(maxHp.total).toBe(-10);
    });

    it('uses correct label in sources', () => {
      const { maxHp } = computeConditionEffects([valued('drained', 3)], '', 4);
      expect(maxHp.sources[0].label).toBe('Drained 3');
      expect(maxHp.sources[0].penalty).toBe(-12);
    });

    it('Drained 1 at level 1 reduces max HP by 1', () => {
      expect(computeConditionEffects([valued('drained', 1)], '', 1).maxHp.total).toBe(-1);
    });

    it('no max HP reduction when Drained is not active', () => {
      expect(computeConditionEffects([valued('frightened', 4)], '', 10).maxHp.total).toBe(0);
      expect(computeConditionEffects([]).maxHp.total).toBe(0);
    });
  });

  // ── skillPenalty factory ──────────────────────────────────────────
  describe('skillPenalty(ability)', () => {
    it('applies Frightened to all abilities', () => {
      const effects = computeConditionEffects([valued('frightened', 2)]);
      expect(effects.skillPenalty('strength').total).toBe(-2);
      expect(effects.skillPenalty('dexterity').total).toBe(-2);
      expect(effects.skillPenalty('intelligence').total).toBe(-2);
      expect(effects.skillPenalty('wisdom').total).toBe(-2);
      expect(effects.skillPenalty('charisma').total).toBe(-2);
    });

    it('applies Sickened to all abilities', () => {
      const effects = computeConditionEffects([valued('sickened', 1)]);
      expect(effects.skillPenalty('strength').total).toBe(-1);
      expect(effects.skillPenalty('dexterity').total).toBe(-1);
    });

    it('applies Fascinated (-2 status) to all abilities', () => {
      const effects = computeConditionEffects([toggle('fascinated')]);
      expect(effects.skillPenalty('strength').total).toBe(-2);
      expect(effects.skillPenalty('charisma').total).toBe(-2);
    });

    it('applies Clumsy only to dexterity-based skills', () => {
      const effects = computeConditionEffects([valued('clumsy', 2)]);
      expect(effects.skillPenalty('dexterity').total).toBe(-2);
      expect(effects.skillPenalty('strength').total).toBe(0);
      expect(effects.skillPenalty('intelligence').total).toBe(0);
    });

    it('applies Enfeebled only to strength-based skills', () => {
      const effects = computeConditionEffects([valued('enfeebled', 1)]);
      expect(effects.skillPenalty('strength').total).toBe(-1);
      expect(effects.skillPenalty('dexterity').total).toBe(0);
      expect(effects.skillPenalty('wisdom').total).toBe(0);
    });

    it('applies Stupefied only to INT/WIS/CHA-based skills', () => {
      const effects = computeConditionEffects([valued('stupefied', 3)]);
      expect(effects.skillPenalty('intelligence').total).toBe(-3);
      expect(effects.skillPenalty('wisdom').total).toBe(-3);
      expect(effects.skillPenalty('charisma').total).toBe(-3);
      expect(effects.skillPenalty('strength').total).toBe(0);
      expect(effects.skillPenalty('dexterity').total).toBe(0);
    });

    it('applies Encumbered to both STR and DEX but not INT/WIS/CHA', () => {
      const effects = computeConditionEffects([toggle('encumbered')]);
      expect(effects.skillPenalty('strength').total).toBe(-1);
      expect(effects.skillPenalty('dexterity').total).toBe(-1);
      expect(effects.skillPenalty('intelligence').total).toBe(0);
      expect(effects.skillPenalty('charisma').total).toBe(0);
    });

    it('takes worst status for DEX (Frightened 3 beats Clumsy 2)', () => {
      const effects = computeConditionEffects([valued('clumsy', 2), valued('frightened', 3)]);
      expect(effects.skillPenalty('dexterity').total).toBe(-3);
    });

    it('takes worst status for STR (Fascinated 2 beats Enfeebled 1)', () => {
      const effects = computeConditionEffects([valued('enfeebled', 1), toggle('fascinated')]);
      expect(effects.skillPenalty('strength').total).toBe(-2);
    });
  });

  // ── Sources tracking ──────────────────────────────────────────────
  describe('sources tracking', () => {
    it('includes the winning condition label and penalty', () => {
      const { fort } = computeConditionEffects([valued('frightened', 2)]);
      expect(fort.sources).toHaveLength(1);
      expect(fort.sources[0].label).toBe('Frightened 2');
      expect(fort.sources[0].penalty).toBe(-2);
    });

    it('returns empty sources when no condition applies', () => {
      expect(computeConditionEffects([]).fort.sources).toHaveLength(0);
      expect(computeConditionEffects([toggle('encumbered')]).fort.sources).toHaveLength(0);
    });

    it('combine merges sources from status and circumstance parts', () => {
      // Frightened 1 (status) + Prone (circumstance) on melee
      const { meleeAttack } = computeConditionEffects([valued('frightened', 1), toggle('prone')]);
      expect(meleeAttack.sources).toHaveLength(2);
    });
  });
});
