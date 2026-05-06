// PF2e penalty stacking rules:
//   Status penalties: only the *highest* applies
//   Circumstance penalties: only the *highest* applies
//   Different penalty types DO stack with each other

function worstOf(candidates) {
  // candidates: Array of [magnitude, label]  where magnitude is a positive number
  // Returns { total: -N, sources: [{ label, penalty }] } for the worst (highest) candidate
  const active = candidates.filter(([mag]) => mag > 0);
  if (!active.length) return { total: 0, sources: [] };
  const [mag, label] = active.reduce((best, cur) => (cur[0] > best[0] ? cur : best));
  return { total: -mag, sources: [{ label, penalty: -mag }] };
}

function combine(...parts) {
  return {
    total: parts.reduce((sum, p) => sum + p.total, 0),
    sources: parts.flatMap((p) => p.sources),
  };
}

/**
 * Compute all condition-derived penalties for the character sheet.
 *
 * @param {Array}  activeConditions  - from StatsBlock state
 * @param {string} keyAbility        - character's key ability (for Class DC / Stupefied)
 * @param {number} level             - character level (for Drained max-HP calc)
 * @returns {object} penalty objects keyed by stat area
 */
export function computeConditionEffects(activeConditions, keyAbility = '', level = 1) {
  const getVal = (id) => {
    const c = activeConditions.find((c) => c.id === id);
    return c ? (c.value ?? 1) : 0;
  };
  const isActive = (id) => activeConditions.some((c) => c.id === id);

  // ── valued conditions ──────────────────────────────────────────────
  const frightened  = getVal('frightened');
  const sickened    = getVal('sickened');
  const clumsy      = getVal('clumsy');
  const drained     = getVal('drained');
  const enfeebled   = getVal('enfeebled');
  const stupefied   = getVal('stupefied');

  // ── toggle conditions ──────────────────────────────────────────────
  const fatigued   = isActive('fatigued')   ? 1 : 0;
  const offGuard   = isActive('off-guard')  ? 2 : 0;
  const prone      = isActive('prone')      ? 2 : 0;
  const grabbed    = isActive('grabbed')    ? 2 : 0;
  const restrained = isActive('restrained') ? 2 : 0;
  const paralyzed  = isActive('paralyzed')  ? 2 : 0;
  const confused   = isActive('confused')   ? 2 : 0;
  const fascinated = isActive('fascinated') ? 2 : 0;
  const encumbered = isActive('encumbered') ? 1 : 0;

  const key = keyAbility?.toLowerCase() ?? '';
  const mentalKey = ['intelligence', 'wisdom', 'charisma'].includes(key);

  // labels for each valued source
  const lFrightened = frightened ? `Frightened ${frightened}` : '';
  const lSickened   = sickened   ? `Sickened ${sickened}`     : '';
  const lClumsy     = clumsy     ? `Clumsy ${clumsy}`         : '';
  const lDrained    = drained    ? `Drained ${drained}`       : '';
  const lEnfeebled  = enfeebled  ? `Enfeebled ${enfeebled}`   : '';
  const lStupefied  = stupefied  ? `Stupefied ${stupefied}`   : '';

  // ── AC ─────────────────────────────────────────────────────────────
  const acStatus = worstOf([
    [clumsy,   lClumsy],
    [fatigued, 'Fatigued'],
  ]);
  const acCirc = worstOf([
    [offGuard,   'Off-Guard'],
    [prone,      'Prone'],
    [grabbed,    'Grabbed'],
    [restrained, 'Restrained'],
    [paralyzed,  'Paralyzed'],
    [confused,   'Confused'],
  ]);
  const ac = combine(acStatus, acCirc);

  // ── Saving throws ──────────────────────────────────────────────────
  const fort = worstOf([
    [drained,   lDrained],
    [frightened, lFrightened],
    [sickened,   lSickened],
    [fatigued,  'Fatigued'],
  ]);

  const reflex = worstOf([
    [clumsy,     lClumsy],
    [frightened, lFrightened],
    [sickened,   lSickened],
    [fatigued,  'Fatigued'],
  ]);

  const will = worstOf([
    [frightened, lFrightened],
    [sickened,   lSickened],
    [stupefied,  lStupefied],
    [fatigued,  'Fatigued'],
  ]);

  // ── Attack bonuses ─────────────────────────────────────────────────
  const meleeAttack = combine(
    worstOf([
      [frightened, lFrightened],
      [sickened,   lSickened],
      [enfeebled,  lEnfeebled],
    ]),
    worstOf([[prone, 'Prone']]),
  );

  const rangedAttack = worstOf([
    [frightened, lFrightened],
    [sickened,   lSickened],
    [clumsy,     lClumsy],
  ]);

  const spellAttack = worstOf([
    [frightened, lFrightened],
    [sickened,   lSickened],
    [stupefied,  lStupefied],
  ]);

  // ── Class DC ───────────────────────────────────────────────────────
  const classDCCandidates = [
    [frightened, lFrightened],
    [sickened,   lSickened],
  ];
  if (mentalKey) classDCCandidates.push([stupefied, lStupefied]);
  const classDC = worstOf(classDCCandidates);

  // ── Spell DC ───────────────────────────────────────────────────────
  const spellDC = worstOf([
    [frightened, lFrightened],
    [sickened,   lSickened],
    [stupefied,  lStupefied],
  ]);

  // ── Speed ──────────────────────────────────────────────────────────
  const speedReduction = encumbered ? 10 : 0;
  const speedSources   = encumbered ? [{ label: 'Encumbered', penalty: -10 }] : [];

  // ── Max HP (Drained: −value × level) ──────────────────────────────
  const maxHpReduction = drained * level;
  const maxHpSources   = drained
    ? [{ label: `Drained ${drained}`, penalty: -(drained * level) }]
    : [];

  // ── Skill penalty factory ──────────────────────────────────────────
  // Returns a penalty object for a skill governed by the given ability.
  function skillPenalty(ability) {
    const ab = ability?.toLowerCase() ?? '';
    const candidates = [
      [frightened, lFrightened],
      [sickened,   lSickened],
      [fascinated, 'Fascinated'],
    ];
    if (ab === 'strength') {
      candidates.push([enfeebled,  lEnfeebled], [encumbered, 'Encumbered']);
    } else if (ab === 'dexterity') {
      candidates.push([clumsy,     lClumsy],    [encumbered, 'Encumbered']);
    } else if (['intelligence', 'wisdom', 'charisma'].includes(ab)) {
      candidates.push([stupefied,  lStupefied]);
    }
    return worstOf(candidates);
  }

  return {
    ac,
    fort,
    reflex,
    will,
    meleeAttack,
    rangedAttack,
    spellAttack,
    classDC,
    spellDC,
    speed:     { total: -speedReduction,  sources: speedSources  },
    maxHp:     { total: -maxHpReduction,  sources: maxHpSources  },
    skillPenalty,
  };
}
