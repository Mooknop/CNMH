// Intrinsic on-crit save riders (#1439). A specific weapon whose Strike inflicts
// a condition on a CRITICAL hit, gated by the target's save (Serpent Dagger —
// "sickened 1 unless it succeeds at a DC 19 Fortitude save"), carries an
// `onCritSave` block on its resolved strike. On each critical Strike result this
// pushes a fixed-DC save request to the GM rail — the intrinsic-weapon mirror of
// the Chroma Kaleidoscope whetstone crit save (#1216, applyWhetstoneReactionAndCrit).
//
// Shape (authored on the item's strike, carried through resolveItemStrikes):
//   onCritSave: {
//     defense: 'fortitude',          // save key into defenses.saves
//     dc: 19,                         // fixed DC (most wielders aren't casters)
//     label?: '<request name>',       // defaults to the strike source/name
//     conditions: { failure: [{ id, value?, note? }], criticalFailure: [...] }
//   }
// The `conditions` per-degree shape matches the consumable.kind:'save' contract
// (#1432), so RequestedSaves applies them on resolution.
//
// React-free applier: all rails (order, GM save rail, log) arrive in the arg bag.

const strikeResults = (rayGroups, chainResults) => [
  ...(rayGroups || []).flatMap((g) => g?.results || []),
  ...((chainResults?.rolls || []).flat()),
];

export const applyStrikeOnCritSave = ({
  ability,
  character,
  rayGroups,
  chainResults,
  order,
  addSaveRequest,
  appendLog,
}) => {
  const oc = ability?.onCritSave;
  if (!oc || !addSaveRequest) return;
  const crits = strikeResults(rayGroups, chainResults).filter((r) => r?.degree === 'criticalSuccess');
  if (!crits.length) return;

  const defense = oc.defense || 'fortitude';
  const targets = crits
    .map((r) => {
      const entry = (order || []).find((e) => e.entryId === r.entryId);
      return entry
        ? { entryId: entry.entryId, name: entry.name, saveMod: entry.defenses?.saves?.[defense] ?? null }
        : null;
    })
    .filter(Boolean);
  if (!targets.length) return;

  const name = oc.label || ability.source || ability.name || 'Critical effect';
  addSaveRequest({
    casterId: character.id,
    casterName: character.name,
    abilityName: name,
    save: defense,
    dc: oc.dc,
    basic: false,
    targets,
    ...(oc.conditions ? { conditions: oc.conditions } : {}),
  });
  appendLog({
    type: 'system',
    text: `${name}: critical hit — resolve the target's ${defense} save (DC ${oc.dc}).`,
  });
};

/**
 * Intrinsic on-crit conditions WITHOUT a save (#1439 tail). A weapon whose Strike
 * inflicts a condition automatically on a critical hit — the alchemical bombs:
 * Necrotic Bomb (sickened 1), Mud Bomb (dazzled), Pressure Bomb (prone), Redpitch
 * Bomb (clumsy 1), Tallow Bomb (sickened 1) — carries an `onCritConditions` array
 * on its resolved strike. On each critical Strike result the condition applies
 * straight to the enemy target (no roll), the direct-apply mirror of
 * whetstoneOnHit's condition rider.
 *
 * Shape (authored on the item's strike): onCritConditions: [{ id, value?, note? }]
 * A `note` is a non-mechanical rider (duration / edge case) surfaced in the log.
 */
export const applyStrikeOnCritConditions = ({
  ability,
  rayGroups,
  chainResults,
  order,
  applyEnemyCondition,
  appendLog,
}) => {
  const conds = ability?.onCritConditions;
  if (!Array.isArray(conds) || !conds.length || !applyEnemyCondition) return;
  const crits = strikeResults(rayGroups, chainResults).filter((r) => r?.degree === 'criticalSuccess');
  if (!crits.length) return;

  const source = ability.source || ability.name || 'Critical effect';
  crits.forEach((r) => {
    const entry = (order || []).find((e) => e.entryId === r.entryId);
    if (!entry || entry.kind !== 'enemy') return;
    conds.forEach((c) => {
      if (!c?.id) return;
      applyEnemyCondition(entry.entryId, { id: c.id, ...(c.value != null ? { value: c.value } : {}), source });
      const label = `${c.id}${c.value != null ? ` ${c.value}` : ''}`;
      appendLog({
        type: 'system',
        text: `${source}: critical hit — ${entry.name} is ${label}${c.note ? ` (${c.note})` : ''}.`,
      });
    });
  });
};

export default applyStrikeOnCritSave;
