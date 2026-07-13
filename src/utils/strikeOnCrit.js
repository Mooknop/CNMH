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

export default applyStrikeOnCritSave;
