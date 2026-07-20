import React, { useState, useCallback } from 'react';
import DamagePanel from '../components/encounter/DamagePanel';
import { buildDamageProfile } from '../utils/damage';
import { buildTargetSaveRequest } from '../utils/saveRequest';
import { mapSpellDefense } from '../utils/rollResolution';

/**
 * Secondary damage profiles (#987) — a spell whose damage lands in more than one
 * zone, against a DIFFERENT set of creatures than the primary save.
 *
 * Propagating Arc is the shape: the primary bolt is a basic Reflex save on the
 * struck target, and a separate 2d6 electricity splash hits everything within
 * 10 feet. Those are two independent saves against two independent target sets,
 * which the single-profile `damageData` model can't express — riders add to the
 * *same* damage instance, and `variants` swap one profile for another.
 *
 * The damage model itself was nearly free: an encounter holds `saveRequests` as
 * a list and `addSaveRequest` appends, so each secondary zone simply emits its
 * own save request and the GM resolver handles it exactly like the primary. The
 * real work is target selection, which is what this hook owns — each profile
 * gets its own enemy picker, independent of the modal's shared `useTargeting`
 * store (that one drives the primary targets and the focus rail).
 *
 * Authoring shape on the ability:
 *   secondaryProfiles: [{
 *     id, label, defense, damageData, note?, saveConditions?
 *   }]
 *
 * Section-hook shape, matching the #1317 D1/D2 gate pattern:
 *   { section, buildRequests, hasProfiles }
 *
 * `saveDc` is NOT a hook parameter: the modal derives it from `rollProfile`,
 * which is computed *after* its `if (!ability || !character) return null` guard.
 * Taking it at buildRequests() time keeps this hook callable unconditionally,
 * above that guard, as the rules of hooks require.
 *
 * @param {Object} ability
 * @param {Object} character
 * @param {Array}  order      - encounter order (the enemy pool to pick from)
 * @param {number} castRank   - the rank this cast happens at (heightens each zone)
 * @param {string} casterEntryId
 * @param {Array}  fxAnimations
 */
export const useSecondaryProfiles = ({
  ability,
  character,
  order = [],
  castRank,
  casterEntryId,
  fxAnimations,
}) => {
  const profiles = Array.isArray(ability?.secondaryProfiles) ? ability.secondaryProfiles : [];
  const hasProfiles = profiles.length > 0;

  // Per-profile state, keyed by profile id: which enemies are in the zone, the
  // caster's rolled total for it, and its rider toggles.
  const [selected, setSelected] = useState({});
  const [entered, setEntered] = useState({});
  const [riderState, setRiderState] = useState({});

  const toggleTarget = useCallback((profileId, entryId) => {
    setSelected((cur) => {
      const list = cur[profileId] || [];
      return {
        ...cur,
        [profileId]: list.includes(entryId)
          ? list.filter((id) => id !== entryId)
          : [...list, entryId],
      };
    });
  }, []);

  const toggleRider = useCallback((profileId, riderId) => {
    setRiderState((cur) => ({
      ...cur,
      [profileId]: { ...(cur[profileId] || {}), [riderId]: !(cur[profileId] || {})[riderId] },
    }));
  }, []);

  const enemies = order.filter((e) => e.kind === 'enemy');

  // A synthetic single-save ability per zone, so the existing builders do the
  // work. Deliberately NOT spread from `ability`: the primary's saveConditions /
  // saveOutcomeEffect / riders belong to the primary save, not to the splash.
  //
  // `level` MUST be carried through: buildDamageProfile heightens via
  // heightenedEntriesFor({ heightened, level: ability.level }, castRank), so an
  // undefined level makes every zone scale from rank 1 and over-heighten.
  const abilityFor = (p) => ({
    name: `${ability?.name || 'Spell'} — ${p.label}`,
    level: ability?.level,
    baseLevel: ability?.baseLevel,
    defense: p.defense,
    damageData: p.damageData,
    ...(p.saveConditions ? { saveConditions: p.saveConditions } : {}),
  });

  const profileFor = (p, targets) =>
    buildDamageProfile(abilityFor(p), character, {
      castRank,
      order,
      enemyEntries: targets,
    });

  /**
   * One save request per zone that has at least one picked target. Returns []
   * when nothing is selected, so confirm stays a no-op for an unused zone.
   *
   * @param {number} saveDc - the caster's spell DC, passed at confirm time (see
   *                          the note above about the modal's ability guard).
   */
  const buildRequests = useCallback((saveDc) => {
    if (!hasProfiles || saveDc == null) return [];
    return profiles.flatMap((p) => {
      const targets = enemies.filter((e) => (selected[p.id] || []).includes(e.entryId));
      if (!targets.length) return [];
      const defense = mapSpellDefense(p.defense);
      if (!defense) return [];
      const req = buildTargetSaveRequest({
        rollProfile: { mode: 'target-save', defense, dc: saveDc },
        saveTargets: targets,
        damageProfile: profileFor(p, targets),
        saveDmgInput: entered[p.id] ?? '',
        saveRiderState: riderState[p.id] || {},
        ability: abilityFor(p),
        character,
        casterEntryId,
        order,
        saveDc,
        directCastRank: castRank,
        fxAnimations,
      });
      return req ? [req] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfiles, profiles, enemies, selected, entered, riderState, castRank, character, casterEntryId, order, fxAnimations]);

  const section = hasProfiles ? (
    <>
      {profiles.map((p) => {
        const targets = enemies.filter((e) => (selected[p.id] || []).includes(e.entryId));
        const dmg = profileFor(p, targets);
        return (
          <React.Fragment key={p.id}>
            <hr className="ct-divider" />
            <section className="ct-section">
              <h3 className="ct-section-title">{p.label}</h3>
              {p.note && <div className="uam-variant-note">{p.note}</div>}
              <div className="uam-cost-options" role="group" aria-label={`${p.label} targets`}>
                {enemies.length === 0 && <div className="uam-variant-note">No enemies in the encounter.</div>}
                {enemies.map((e) => (
                  <label key={e.entryId} className="uam-cost-option">
                    <input
                      type="checkbox"
                      checked={(selected[p.id] || []).includes(e.entryId)}
                      onChange={() => toggleTarget(p.id, e.entryId)}
                    />
                    {e.name}
                  </label>
                ))}
              </div>
              {targets.length > 0 && dmg && (
                <DamagePanel
                  mode="save"
                  profile={dmg}
                  charId={character?.id}
                  flavor={`${ability?.name || ''} — ${p.label}`}
                  entered={entered[p.id] ?? ''}
                  onEntered={(v) => setEntered((cur) => ({ ...cur, [p.id]: v }))}
                  riderState={riderState[p.id] || {}}
                  onToggleRider={(riderId) => toggleRider(p.id, riderId)}
                />
              )}
            </section>
          </React.Fragment>
        );
      })}
    </>
  ) : null;

  return { section, buildRequests, hasProfiles };
};

export default useSecondaryProfiles;
