import React, { useMemo, useState } from 'react';
import RollSheet from './RollSheet';
import { useAttackRollSheet } from '../../hooks/useAttackRollSheet';
import { useEncounter } from '../../hooks/useEncounter';
import { useTargeting } from '../../hooks/useTargeting';
import { useTurnState } from '../../hooks/useTurnState';
import { familiarSkillBonus, minionTurnId, MINION_FAMILIAR } from '../../utils/minionUtils';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import { defenseDC, DEFENSE_LABELS } from '../../utils/defense';
import './FamiliarManeuverModal.css';

// Outcome phrasing per maneuver, logged for the GM. No enemy-state mutation —
// the result goes to the GM via the combat log, like the minion strike resolver.
const OUTCOMES = {
  trip: {
    criticalSuccess: 'knocked prone',
    success:         'knocked prone',
  },
  disarm: {
    criticalSuccess: 'item knocked to the ground',
    success:         'disarmed (−2 to attacks with that weapon until its turn ends)',
  },
};

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * A Squox familiar's Disarm/Trip via Acrobatics (#223), on the two-phase
 * RollSheet (Roll Resolution redesign successor arc — off TargetRollResolver).
 * Squox Tricks lets the familiar use Acrobatics for these two maneuvers and
 * grants a +2 circumstance bonus against an off-guard target. The familiar is
 * its own actor: the check resolves against the target's Reflex DC and the
 * result is logged for the GM at the commit — no enemy-state mutation,
 * mirroring MinionStrikeModal. No damage profile, so the sheet has no amount
 * phase: commit → result card → settled receipt.
 *
 * The target picker, the GM-overridable Acrobatics modifier and the off-guard
 * toggle live in the sheet's edit disclosure, exactly like UseAbilityModal's
 * target picker + MAP row (#1687).
 *
 * @param {Object} maneuver     - { id: 'disarm'|'trip', name }
 * @param {Object} familiarData - character.familiar (name, skills)
 * @param {Object} character    - the owner PC (level, id)
 */
const FamiliarManeuverSheet = ({ onClose, maneuver, familiarData, character, themeColor }) => {
  const { encounter, appendLog } = useEncounter();
  const ownerId = character?.id;
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  // A maneuver costs the familiar 1 of its granted actions (#391), in encounter only.
  const { spendActions } = useTurnState(minionTurnId(ownerId, MINION_FAMILIAR));
  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(ownerId, order);
  const enemyTargets = useMemo(() => selectable.filter((e) => e.kind === 'enemy'), [selectable]);

  // Acrobatics is the Squox's check (not Athletics). Familiars carry no ability
  // scores, so seed from the sheet's familiar-skill convention and let the GM
  // override — the table's familiar ruling wins over any derived number.
  const baseAcro = familiarSkillBonus('acrobatics', familiarData, character?.level ?? 1);
  const [acroMod, setAcroMod] = useState(String(baseAcro));
  const [offGuard, setOffGuard] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const deriveAttackSheet = useAttackRollSheet();

  const acroNum = /^-?\d+$/.test(acroMod) ? parseInt(acroMod, 10) : baseAcro;
  const netBonus = acroNum + (offGuard ? 2 : 0);

  const target = useMemo(
    () => enemyTargets.find((e) => e.entryId === pickedId) || null,
    [enemyTargets, pickedId]
  );
  const resolverTargets = useMemo(() => (target ? [target] : []), [target]);

  // The maneuver's outcome text keyed the way `rowsFor` reads authored degree
  // maps (rulebook headings, same shape as ability.degrees) — it becomes the
  // result rows' note ("knocked prone").
  const outcomeNotes = useMemo(
    () => Object.fromEntries(
      Object.entries(OUTCOMES[maneuver?.id] || {}).map(([degree, text]) => [DEGREE_LABELS[degree], text]),
    ),
    [maneuver?.id]
  );

  const attackSheet = deriveAttackSheet({
    rollBonus: netBonus,
    enemyTargets: resolverTargets,
    defense: 'reflex',
    degrees: outcomeNotes,
  });

  const rollFlavor =
    `${familiarData?.name ? `${familiarData.name} — ` : ''}${maneuver?.name ?? 'Familiar maneuver'}`;

  const summaryLine = [
    target ? target.name : null,
    attackSheet.bonus != null ? `Acrobatics ${signed(attackSheet.bonus)}` : null,
  ].filter(Boolean).join(' · ');

  const dcLine = ['nothing rolled yet', ...resolverTargets.map((e) => {
    const dc = defenseDC(e.defenses, 'reflex');
    return dc != null ? `${e.name} ${DEFENSE_LABELS.reflex} ${dc}` : null;
  }).filter(Boolean)].join(' · ');

  const editPanel = (
    <div className="fmm-body">
      {/* Target picker */}
      <div className="fmm-field">
        <label className="fmm-label">Target</label>
        <div className="fmm-target-picks">
          {enemyTargets.length === 0 ? (
            <span className="fmm-empty">No enemies in the encounter.</span>
          ) : (
            enemyTargets.map((e) => (
              <button
                key={e.entryId}
                className={`fmm-target-btn${pickedId === e.entryId ? ' fmm-target-btn--active' : ''}`}
                onClick={() => setPickedId(e.entryId)}
              >
                {e.name}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Acrobatics modifier — Squox Tricks uses Acrobatics; GM-overridable */}
      <div className="fmm-field">
        <label className="fmm-label" htmlFor="fmm-acro">Acrobatics modifier</label>
        <input
          id="fmm-acro"
          className="fmm-input"
          type="number"
          value={acroMod}
          onChange={(e) => setAcroMod(e.target.value)}
        />
      </div>

      {/* Squox Tricks — +2 circumstance against an off-guard target */}
      <div className="fmm-field">
        <label className="fmm-label">Circumstance</label>
        <div className="fmm-target-picks">
          <button
            type="button"
            className={`fmm-target-btn${offGuard ? ' fmm-target-btn--active' : ''}`}
            aria-pressed={offGuard}
            onClick={() => setOffGuard((v) => !v)}
          >
            Target off-guard +2
          </button>
        </div>
      </div>

      {attackSheet.togglesRow}
    </div>
  );

  return (
    <RollSheet
      onClose={onClose}
      title={`${familiarData?.name || 'Familiar'} — ${maneuver.name}`}
      themeColor={themeColor}
      maxWidth="420px"
      summaryLine={summaryLine}
      blockLine={target ? null : 'Pick a target first — open Edit.'}
      editPanel={editPanel}
      charId={ownerId}
      flavor={rollFlavor}
      bonus={attackSheet.bonus}
      bonusLabel="check"
      dcLine={dcLine}
      commitLabel={`Log ${maneuver.name}`}
      // Commit is ONE moment: the log lines and the granted-action spend fire
      // here, and the rows it hands back are frozen for the rest of the sheet.
      onCommit={(face) => {
        const results = attackSheet.commit(face);
        results.forEach((r) => {
          const degreeLabel = r.degree ? DEGREE_LABELS[r.degree] : null;
          const outcome = (r.degree && OUTCOMES[maneuver?.id]?.[r.degree]) || null;
          const dcSuffix = r.dc != null ? ` (Reflex DC ${r.dc})` : '';
          const tail = degreeLabel
            ? `: ${r.total} → ${degreeLabel}${outcome ? ` — ${r.name} ${outcome}` : ''}`
            : `: ${r.total}`;
          appendLog({
            type: 'action',
            charId: ownerId,
            text: `${familiarData?.name || 'Familiar'} ${maneuver?.name} vs ${r.name}${dcSuffix}${tail}${offGuard ? ' [off-guard +2]' : ''}`,
          });
        });
        if (encounterMode) spendActions(1, maneuver?.name || 'Maneuver');
        return attackSheet.rowsFor(results);
      }}
      damageParts={null}
      costLabel={encounterMode ? '1 action' : ''}
    />
  );
};

// Open gate stays out here so a close UNMOUNTS the sheet — RollSheet's frozen
// commit and the picker/off-guard state all reset for free on the next open
// (the parents keep this component mounted with isOpen=false).
const FamiliarManeuverModal = ({ isOpen, onClose, maneuver, familiarData, character, themeColor }) => {
  if (!isOpen || !maneuver) return null;
  return (
    <FamiliarManeuverSheet
      onClose={onClose}
      maneuver={maneuver}
      familiarData={familiarData}
      character={character}
      themeColor={themeColor}
    />
  );
};

export default FamiliarManeuverModal;
