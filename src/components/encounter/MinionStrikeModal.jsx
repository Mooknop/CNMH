import React, { useMemo, useRef, useState } from 'react';
import RollSheet from './RollSheet';
import { useAttackRollSheet } from '../../hooks/useAttackRollSheet';
import { useEncounter } from '../../hooks/useEncounter';
import { useIwrReveal } from '../../hooks/useIwrReveal';
import { useTargeting } from '../../hooks/useTargeting';
import { useTurnState } from '../../hooks/useTurnState';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useMinionActors } from '../../hooks/useMinionActors';
import { useHuntPrey } from '../../hooks/useHuntPrey';
import { resolveActionRoll } from '../../utils/rollResolution';
import { buildDamageProfile, formatDamageBreakdown } from '../../utils/damage';
import { isAttackAbility, mapStepFor, mapPenaltyFor } from '../../utils/map';
import { parseRangeIncrement, rangeIncrementResult } from '../../utils/rangeIncrement';
import { preyMatches } from '../../utils/huntPrey';
import { minionStrikeAttackMod, minionStrikeDamage, minionTurnId } from '../../utils/minionUtils';
import { ATTACK_DEGREE_LABELS } from '../../utils/degreeDisplay';
import { defenseDC, DEFENSE_LABELS } from '../../utils/defense';
import './MinionStrikeModal.css';
import { RELAY, globalKey } from '../../sync/keys';

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * A minion's Strike on the two-phase RollSheet (#261 flow, Roll Resolution
 * redesign successor arc — off TargetRollResolver/DamagePanel).
 *
 * The companion is its own actor: the attack bonus comes from its modifiers
 * (best of Str/Dex + the strike's proficiency at the owner's level) and the
 * Multiple Attack Penalty is tracked on the minion's *own* turn state
 * (`cnmh_turnstate_<owner>-<role>`), never the owner's. Damage results go to the
 * GM via the combat log, exactly like a PC strike — no direct enemy-HP mutation.
 *
 * Commit is one moment: the attack is recorded (MAP) and the granted action
 * spent there. The log line and the IWR reveal need the entered damage total,
 * so on a hit they defer to the sheet's finish transition (same split as
 * UseAbilityModal's attack path, #1687); a miss logs at the commit with the
 * identical text. Closing a committed sheet flushes the deferred steps with no
 * totals so the roll line is never lost.
 *
 * @param {Object} strike        - a companion strike (name, proficiency, type, damage, traits)
 * @param {Object} companionData - character.animalCompanion (abilities, name)
 * @param {Object} character     - the owner PC (level, id)
 * @param {string} role          - minion role slug (companion)
 */
const MinionStrikeSheet = ({ onClose, strike, companionData, character, role, themeColor }) => {
  const { encounter, appendLog } = useEncounter();
  const { revealFiredIwr } = useIwrReveal();
  const ownerId = character?.id;
  const turnId = minionTurnId(ownerId, role);
  const { turnState, recordAttack, spendActions } = useTurnState(turnId);
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  // Granted-action pool (#391): a Strike costs the minion 1 of its granted actions
  // (in encounter only). Hard-blocked when the pool is empty.
  const actionsLeft = (turnState?.actionsGranted ?? 0) - (turnState?.actionsSpent ?? 0);
  const strikeBlocked = encounterMode && actionsLeft <= 0;

  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(ownerId, order);
  const enemyTargets = useMemo(() => selectable.filter((e) => e.kind === 'enemy'), [selectable]);

  // Flanking (#362): the bridge lists the companion's own minion id under a
  // flanked enemy's byCharIds when it flanks (animal companions flank; familiars
  // don't, so they never reach this strike modal). Surface it as an off-guard
  // cue — like the PC flanked badge, it's informational; the GM applies the −2 in
  // Foundry. The action-economy epic (#391) is where this could feed roll math.
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});

  // Hunt Prey inheritance (#408): a ranged companion Strike against the owner's
  // designated prey ignores the second-range-increment penalty, just like the
  // owner's own ranged Strikes. Resolve the companion's own combatant cell via
  // its linked Foundry actor, then measure against the target.
  const [positionsState] = useSyncedState(globalKey(RELAY.POSITIONS), null);
  const { prey } = useHuntPrey(ownerId);
  const { linkFor } = useMinionActors();
  const companionLink = linkFor(ownerId, role);
  const companionEntry = companionLink
    ? order.find((e) => e.foundryActorId === companionLink.foundryActorId)
    : null;

  const [pickedId, setPickedId] = useState(null);
  const [mapOverride, setMapOverride] = useState(null);
  const deriveAttackSheet = useAttackRollSheet();
  // The commit records the attack, which bumps the minion's OWN attacksMade and
  // would shift `mapStep` — and with it the finish-time re-resolve's degrees —
  // while the sheet still shows the frozen card. Pin the committed step so the
  // deferred log/IWR steps keep the committed math.
  const commitMapRef = useRef(null);
  // Deferred-finish bookkeeping (#1687 pattern): `deferredRef` marks a commit
  // whose log/IWR steps await the amount step; `finishedRef` makes the finish
  // exactly-once (Apply damage, then Modal-chrome close, can both reach it).
  const deferredRef = useRef(false);
  const finishedRef = useRef(false);

  // The minion as a roll actor — enough for the resolver's Priority-2 strike path
  // (numeric attackMod); minion conditions/effects are out of scope this slice.
  const ownerLevel = character?.level ?? 1;
  const ability = useMemo(
    () => ({
      attackMod: minionStrikeAttackMod(strike, companionData, ownerLevel),
      type: strike?.type || 'melee',
      traits: strike?.traits || [],
      damage: minionStrikeDamage(strike, companionData),
    }),
    [strike, companionData, ownerLevel]
  );
  const minionActor = useMemo(
    () => ({ id: turnId, level: ownerLevel, keyAbility: 'strength' }),
    [turnId, ownerLevel]
  );

  const isAttack = isAttackAbility(ability);
  const autoStep = mapStepFor(turnState?.attacksMade ?? 0);
  const mapStep = isAttack ? (commitMapRef.current ?? mapOverride ?? autoStep) : 0;

  const rollProfile = useMemo(
    () => resolveActionRoll(ability, minionActor, { mapStep }),
    [ability, minionActor, mapStep]
  );
  const damageProfile = useMemo(
    () => buildDamageProfile(ability, minionActor),
    [ability, minionActor]
  );

  const target = useMemo(
    () => enemyTargets.find((e) => e.entryId === pickedId) || null,
    [enemyTargets, pickedId]
  );
  const resolverTargets = useMemo(() => (target ? [target] : []), [target]);

  // Range increments (#408) — ranged companion Strike vs the target, waiving the
  // 2nd increment against the owner's prey. Degrades to nothing for melee
  // companions, missing positions, or an unparseable range.
  const incrementFt = strike?.type === 'ranged' ? parseRangeIncrement(strike?.range) : null;
  const positions = positionsState?.positions || null;
  const rangeFrom = incrementFt && positions && companionEntry ? positions[companionEntry.entryId] : null;
  const rangeByEntry = {};
  if (rangeFrom && target) {
    const to = positions[target.entryId];
    if (to) rangeByEntry[target.entryId] = rangeIncrementResult({
      from: rangeFrom, to, incrementFt,
      waiveSecondIncrement: preyMatches(prey, target),
    });
  }
  const hasRangeData = Object.keys(rangeByEntry).length > 0;
  const targetOutOfRange = !!(target && rangeByEntry[target.entryId]?.beyondMaxRange);

  const isFlanking = !!(pickedId && flankedMap?.[pickedId]?.byCharIds?.includes(turnId));

  const attackSheet = deriveAttackSheet({
    rollBonus: rollProfile.bonus,
    enemyTargets: resolverTargets,
    defense: 'ac',
    rangeByEntry: hasRangeData ? rangeByEntry : null,
    damageProfile,
  });

  const rollFlavor =
    `${companionData?.name ? `${companionData.name} — ` : ''}Strike: ${strike?.name ?? ''}`;

  // The log line + IWR reveal — everything that reads the (possibly entered)
  // damage. Runs at the commit when no amount step follows, else at the finish.
  const finishStrike = (results) => {
    results.forEach((r) => {
      const degreeLabel = r.degree ? ATTACK_DEGREE_LABELS[r.degree] : null;
      const dmgSuffix = r.damage?.final != null ? ` · damage ${formatDamageBreakdown(r.damage)}` : '';
      const text = degreeLabel
        ? `${companionData.name} ${strike.name} vs ${r.name} (AC ${r.dc}): ${r.total} → ${degreeLabel}${dmgSuffix}`
        : `${companionData.name} ${strike.name} vs ${r.name}: ${r.total}`;
      appendLog({ type: 'action', charId: ownerId, text });
    });

    // Reveal-on-trigger (#1014): a hidden monster IWR that just modified the
    // applied damage becomes table knowledge.
    revealFiredIwr(results);
  };

  const runFinish = (amounts) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    finishStrike(attackSheet.resolveWithAmounts(amounts));
  };

  const summaryLine = [
    target ? target.name : null,
    attackSheet.bonus != null ? `attack ${signed(attackSheet.bonus)}` : null,
    mapStep ? `MAP ${mapPenaltyFor(ability, mapStep)}` : null,
    isFlanking && target ? `flanking — ${target.name} off-guard` : null,
  ].filter(Boolean).join(' · ');

  let blockLine = null;
  if (strikeBlocked) blockLine = 'No granted actions left — Command an Animal first.';
  else if (!target) blockLine = 'Pick a target first — open Edit.';
  else if (targetOutOfRange) blockLine = `${target.name} is out of range.`;

  const dcLine = ['nothing rolled yet', ...resolverTargets.map((e) => {
    const dc = defenseDC(e.defenses, 'ac');
    return dc != null ? `${e.name} ${DEFENSE_LABELS.ac} ${dc}` : null;
  }).filter(Boolean)].join(' · ');

  const editPanel = (
    <div className="msm-body">
      {/* Target picker */}
      <div className="msm-field">
        <label className="msm-label">Target</label>
        <div className="msm-target-picks">
          {enemyTargets.length === 0 ? (
            <span className="msm-empty">No enemies in the encounter.</span>
          ) : (
            enemyTargets.map((e) => (
              <button
                key={e.entryId}
                className={`msm-target-btn${pickedId === e.entryId ? ' msm-target-btn--active' : ''}`}
                onClick={() => setPickedId(e.entryId)}
              >
                {e.name}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Multiple attack penalty — the minion's own step */}
      {isAttack && (
        <div className="msm-field">
          <label className="msm-label">Multiple attack penalty</label>
          <div className="msm-target-picks">
            {[0, 1, 2].map((step) => {
              const pen = mapPenaltyFor(ability, step);
              return (
                <button
                  key={step}
                  className={`msm-target-btn${mapStep === step ? ' msm-target-btn--active' : ''}`}
                  onClick={() => setMapOverride(step)}
                >
                  {pen === 0 ? 'No MAP' : pen}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Flanking cue — companion + an ally sandwich the target (off-guard) */}
      {target && isFlanking && (
        <div className="msm-flank" aria-label={`${target.name} is flanked`}>
          <span className="msm-flank-badge" aria-hidden="true">⚔</span>
          Flanking — {target.name} is off-guard
        </div>
      )}

      {attackSheet.togglesRow}
    </div>
  );

  return (
    <RollSheet
      // Modal chrome (overlay / × / Escape) can leave a committed sheet at the
      // amount screen; the commit already recorded the attack and spent the
      // action, so flush the deferred log with no totals rather than lose it.
      onClose={() => { if (deferredRef.current) runFinish({}); onClose(); }}
      title={`${companionData?.name || 'Companion'} — ${strike.name}`}
      themeColor={themeColor}
      maxWidth="420px"
      summaryLine={summaryLine}
      blockLine={blockLine}
      editPanel={editPanel}
      charId={ownerId}
      flavor={rollFlavor}
      bonus={attackSheet.bonus}
      bonusLabel="attack"
      dcLine={dcLine}
      commitLabel="Log strike"
      attack
      // Commit is ONE moment: MAP + the action spend fire here; the rows it
      // hands back are frozen for the rest of the sheet's life.
      onCommit={(face) => {
        const results = attackSheet.commit(face);
        commitMapRef.current = mapStep;
        const hits = results.some((r) => r.degree === 'success' || r.degree === 'criticalSuccess');
        const willAskAmount = !!attackSheet.damageParts && hits;
        if (!willAskAmount) finishStrike(results);
        deferredRef.current = willAskAmount;
        if (isAttack) recordAttack(1);
        if (encounterMode) spendActions(1, strike.name);
        return attackSheet.rowsFor(results);
      }}
      damageParts={attackSheet.damageParts}
      amountExtras={attackSheet.amountExtras}
      breakdownFor={attackSheet.breakdownFor}
      onFinish={runFinish}
      costLabel={encounterMode ? '1 action' : ''}
    />
  );
};

// Open gate stays out here so a close UNMOUNTS the sheet — RollSheet's frozen
// commit, the picker/MAP state and the pinned commit step all reset for free
// on the next open (the parents keep this component mounted with isOpen=false).
const MinionStrikeModal = ({ isOpen, onClose, strike, companionData, character, role, themeColor }) => {
  if (!isOpen || !strike) return null;
  return (
    <MinionStrikeSheet
      onClose={onClose}
      strike={strike}
      companionData={companionData}
      character={character}
      role={role}
      themeColor={themeColor}
    />
  );
};

export default MinionStrikeModal;
