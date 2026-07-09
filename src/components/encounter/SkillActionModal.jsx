import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useFocusTarget } from '../../hooks/useFocusTarget';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useShield } from '../../hooks/useShield';
import { useGameDate } from '../../contexts/GameDateContext';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { computeSaveDegree } from '../../utils/saveDegree';
import { getSkillModifier, getUnarmedAttackModifier } from '../../utils/CharacterUtils';
import { defenseDC, DEFENSE_LABELS } from '../../utils/defense';
import { immunityConfigFor } from '../../utils/immunity';
import { isAttackAbility, mapStepFor, mapPenaltyFor } from '../../utils/map';
import { getCondition } from '../../data/pf2eConditions';
import { toGameSeconds } from '../../utils/gameTime';
import { flattenInventory } from '../../utils/InventoryUtils';
import { affixedKey, affixedTalismanItems, deactivateTalisman } from '../../utils/affix';
import { maneuverDamageTalisman, computeAmount } from '../../utils/talismanActivation';
import { heldShieldRollBonus } from '../../utils/shieldRuneEffects';
import './SkillActionModal.css';
import { RELAY, APP, syncKey } from '../../sync/keys';

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

/**
 * Player-initiated skill action (#260). Enemy-facing — Demoralize, the Athletics
 * maneuvers (Trip / Grapple / Shove / Disarm), Feint — and self-facing (Escape).
 *
 * Mirrors the existing roll resolvers — the player sees their skill modifier,
 * enters a raw d20, and the degree is computed vs a DC (the enemy's defense,
 * prefilled when known, or GM-entered). On confirm the action is spent and the
 * degree's outcome is applied: an enemy condition, a note for GM-resolved
 * effects, a self-condition (maneuver/Feint crit-fail), and/or removing
 * conditions from the acting PC (Escape). Attack-trait actions read and advance
 * the Multiple Attack Penalty; Demoralize stamps its per-target immunity.
 *
 * @param {object} action - a skillActions.js entry
 */
const SkillActionModal = ({ isOpen, onClose, action, character, themeColor }) => {
  const characterModel = useCharacter(character);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();
  const [activeConditions] = useSyncedState(syncKey(RELAY.CONDITIONS, character?.id || 'none'), []);
  // Affixed-talisman + consumed overlays — for a Trip-triggered talisman (Wolf Fang).
  const [affixed, setAffixed] = useSyncedState(affixedKey(character?.id), {});
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id), {});
  const { encounter, appendLog } = useEncounter();
  const { spendActions, recordAttack, turnState } = useTurnState(character?.id);
  const { applyCondition, stampImmunity, isImmune } = useEnemyEffects();
  const { getState, sendUpdate } = useSession();
  const { gameDate, time } = useGameDate();
  // Shield rune roll bonus (#1196 G3): Glamourous grants +1 to Feint while the
  // shield is RAISED — offered below as an opt-in toggle. `raised` comes from the
  // live shield state so an unraised shield never surfaces it.
  const { raised: shieldRaised } = useShield(character?.id, characterModel?.inventory);
  const shieldRuneBonus = action?.shieldRune
    ? heldShieldRollBonus(characterModel?.inventory, action.shieldRune, { raised: shieldRaised })
    : null;

  // Attack-trait actions participate in the Multiple Attack Penalty.
  const isAttack = isAttackAbility(action);
  const autoStep = mapStepFor(turnState?.attacksMade ?? 0);
  const [mapOverride, setMapOverride] = useState(null);
  const mapStep = isAttack ? (mapOverride ?? autoStep) : 0;

  // Self-facing actions (Escape) resolve against the acting PC: no enemy picker,
  // GM-entered DC, and condition-removal outcomes.
  const selfTarget = !!action?.selfTarget;

  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(character?.id, order);
  const enemyTargets = useMemo(
    () => selectable.filter((e) => e.kind === 'enemy'),
    [selectable]
  );

  // Pre-select the focused foe (#412) so focus → maneuver is one tap (not for
  // self-target actions like Escape).
  const { focusEnemy } = useFocusTarget(character?.id);
  const [pickedId, setPickedId] = useState(
    () => (!selfTarget && focusEnemy?.entryId) || null
  );
  const [d20, setD20] = useState('');
  const [dcInput, setDcInput] = useState('');
  const [pickedSkill, setPickedSkill] = useState(null);
  const [toggledIds, setToggledIds] = useState([]); // declared circumstance toggles, active
  const [circumstance, setCircumstance] = useState(''); // free-form "+N (reason)" entry
  const [shieldRuneOn, setShieldRuneOn] = useState(false); // shield-rune roll bonus, opted in
  const [resolved, setResolved] = useState(null); // locks the UI after confirm
  const [talismanUsed, setTalismanUsed] = useState(false); // Wolf Fang activated this resolve

  const target = useMemo(
    () => order.find((e) => e.entryId === pickedId) || null,
    [order, pickedId]
  );

  // Skill choice — actions with skillOptions (Escape) let the player pick; we
  // default to whichever option has the higher modifier for this character. The
  // special 'unarmed' option rolls the unarmed-attack modifier (#349) rather
  // than a skill.
  const skillOptions = action?.skillOptions || null;
  const optionModifier = (opt) =>
    opt === 'unarmed' ? getUnarmedAttackModifier(character) : getSkillModifier(character, opt);
  const defaultSkill = useMemo(() => {
    if (!skillOptions || !character) return action?.skill;
    return skillOptions.reduce(
      (best, s) => (optionModifier(s) > optionModifier(best) ? s : best),
      skillOptions[0]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillOptions, character, action]);
  const activeSkill = pickedSkill || defaultSkill;

  // Net skill modifier via the shared resolver (conditions + effects + MAP).
  // The synthetic ability carries the action's traits so the resolver's post-hoc
  // MAP block applies to Attack-trait actions exactly like a strike.
  const rollProfile = useMemo(() => {
    if (!character || !characterModel || !action) return null;
    // 'unarmed' resolves through the strike path (attackMod → melee nets + MAP);
    // every other option is a skill roll.
    const synthetic = activeSkill === 'unarmed'
      ? { traits: action.traits, type: 'melee', attackMod: getUnarmedAttackModifier(character) }
      : { traits: action.traits, roll: { type: 'skill', skill: activeSkill } };
    return resolveActionRoll(synthetic, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
      mapStep,
    });
  }, [character, characterModel, action, activeSkill, activeConditions, effects, effectCatalog, mapStep]);

  const baseMod = rollProfile?.bonus ?? null;

  // Situational bonus toggles (#260 AC4): feat-declared circumstance line items
  // plus a free-form "+N (reason)" for table rulings (Aid, GM-granted bonuses).
  // The declared list is the hook #223/#226 wire feat bonuses (Threat Display,
  // prey, Squox) onto. Active toggles + the free-form value adjust the net.
  const declaredToggles = action?.toggles || [];
  const toggleBonus = declaredToggles
    .filter((t) => toggledIds.includes(t.id))
    .reduce((sum, t) => sum + (t.bonus || 0), 0);
  const freeform = /^-?\d+$/.test(circumstance) ? parseInt(circumstance, 10) : 0;
  // The shield-rune bonus is an ITEM bonus; it's added flat here (no competing
  // item bonus at these skill actions) and labelled distinctly from circumstance.
  const runeBonus = shieldRuneBonus && shieldRuneOn ? shieldRuneBonus.amount : 0;
  const circumstanceBonus = toggleBonus + freeform;
  const netMod = baseMod != null ? baseMod + circumstanceBonus + runeBonus : null;

  // Labels for the active bonus sources (combat log + summary).
  const circumstanceSources = [
    ...declaredToggles.filter((t) => toggledIds.includes(t.id)).map((t) => t.label),
    ...(freeform ? [`${freeform >= 0 ? '+' : ''}${freeform} circumstance`] : []),
    ...(runeBonus ? [`${shieldRuneBonus.label} +${runeBonus}`] : []),
  ];

  // DC: prefill from the enemy's defense when present; always GM-overridable.
  const prefilledDC = target?.defenses ? defenseDC(target.defenses, action?.defense) : null;
  const dcVal = dcInput !== '' ? parseInt(dcInput, 10) : prefilledDC;

  const d20Val = parseInt(d20, 10);
  const total = !isNaN(d20Val) && netMod != null ? d20Val + netMod : null;
  const degree = total != null && dcVal != null && !isNaN(dcVal)
    ? computeSaveDegree({ d20: d20Val, total, dc: dcVal })
    : null;

  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const immuneConfig = immunityConfigFor(action);
  const targetImmune = pickedId && immuneConfig
    ? isImmune(pickedId, {
        abilityKey: action.id,
        casterId: character?.id,
        scope: immuneConfig.scope,
        nowSecs,
      })
    : false;

  const outcome = degree ? action?.outcomes?.[degree] || null : null;

  // A condition catalog entry is "valued" (frightened 2) vs flat (prone).
  const condLabel = (id, value) => {
    if (!id) return null;
    const def = getCondition(id);
    const name = def?.name || id;
    return def?.valued && value != null ? `${name} ${value}` : name;
  };

  // Conditions an Escape would actually shed — the removeSelf ids the PC has now.
  const removableNow = (o) =>
    (o?.removeSelf || []).filter((id) => (activeConditions || []).some((c) => c.id === id));

  // Human-readable summary of an outcome: enemy condition, GM note, a
  // self-condition (maneuver/Feint crit-fail), and/or conditions Escape sheds.
  const describeOutcome = (o) => {
    if (!o) return 'no effect';
    const parts = [];
    if (o.condition) {
      const base = condLabel(o.condition, o.value);
      parts.push(o.scopedToAttacker ? `${base} to your attacks` : base);
    }
    if (o.note) parts.push(o.note);
    if (o.selfCondition) parts.push(`you are ${condLabel(o.selfCondition)}`);
    if (o.removeSelf) {
      const shed = removableNow(o);
      parts.push(shed.length ? `you are no longer ${shed.map((id) => condLabel(id)).join(', ')}` : 'nothing to escape');
    }
    return parts.length ? parts.join('; ') : 'no effect';
  };

  const defenseLabel = DEFENSE_LABELS[action?.defense] || 'DC';

  const canConfirm =
    !resolved && (selfTarget || (!!target && !targetImmune)) && total != null && degree != null;

  const handleD20 = (e) => {
    const v = e.target.value;
    if (v === '' || (/^\d+$/.test(v) && parseInt(v, 10) <= 20)) setD20(v);
  };

  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDcInput(v);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;

    spendActions(action.actionCost, action.name);

    // Enemy condition (frightened / prone / grabbed / restrained). Outcomes
    // flagged scopedToAttacker (Feint's off-guard, #348) record the acting PC so
    // the attack resolver applies the off-guard only to that attacker's rolls.
    if (outcome?.condition) {
      applyCondition(pickedId, {
        id: outcome.condition,
        value: outcome.value ?? null,
        source: action.name,
        ...(outcome.scopedToAttacker
          ? { scopedTo: character?.id || null, scopedToName: character?.name || null }
          : {}),
      });
    }

    // Self-condition on a maneuver/Feint crit-fail (you fall prone / off-guard).
    // Mirrors the off-guard write in useExploitVulnerability — de-dupe, then sync.
    if (outcome?.selfCondition && character?.id) {
      const cur = getState(character.id, RELAY.CONDITIONS) || [];
      if (!cur.some((c) => c.id === outcome.selfCondition)) {
        sendUpdate(character.id, RELAY.CONDITIONS, [...cur, { id: outcome.selfCondition, value: null }]);
      }
    }

    // Escape success — shed grabbed/restrained/immobilized from the acting PC.
    if (outcome?.removeSelf && character?.id) {
      const cur = getState(character.id, RELAY.CONDITIONS) || [];
      const next = cur.filter((c) => !outcome.removeSelf.includes(c.id));
      if (next.length !== cur.length) sendUpdate(character.id, RELAY.CONDITIONS, next);
    }

    // Attack-trait actions advance the Multiple Attack Penalty.
    if (isAttack) recordAttack(1);

    // Per RAW the target is temporarily immune after any (non-errored) attempt.
    if (immuneConfig) {
      stampImmunity(pickedId, {
        abilityKey: action.id,
        abilityName: action.name,
        casterId: character?.id,
        nowSecs,
        durationSecs: immuneConfig.durationSecs,
      });
    }

    const resultStr = describeOutcome(outcome);
    const targetClause = selfTarget ? '' : ` vs ${target.name}`;
    const circumstanceClause = circumstanceSources.length ? ` [${circumstanceSources.join(', ')}]` : '';
    appendLog({
      type: 'action',
      charId: character?.id,
      text: `${character?.name} ${action.name}${targetClause} (${defenseLabel} ${dcVal}): ${total}${circumstanceClause} → ${DEGREE_LABELS[degree]} — ${resultStr}`,
    });

    setResolved({ degree, total, resultStr, targetName: selfTarget ? character?.name : target.name });
  };

  // A talisman that deals damage on a successful maneuver (Wolf Fang on Trip,
  // #254). Offered after the maneuver succeeds; activating logs the computed
  // damage and consumes the talisman (no enemy-HP model, so the line is a log).
  const succeeded = resolved && (resolved.degree === 'success' || resolved.degree === 'criticalSuccess');
  const maneuverTalisman = succeeded
    ? maneuverDamageTalisman(affixedTalismanItems(affixed, flattenInventory(characterModel?.inventory)), action?.id)
    : null;
  const activateManeuverTalisman = () => {
    const amount = computeAmount(maneuverTalisman.talisman.activation.effect, character);
    const dmgType = maneuverTalisman.talisman.activation.effect.damageType || 'damage';
    appendLog({
      type: 'action',
      charId: character?.id,
      text: `${character?.name} activates ${maneuverTalisman.name}: ${amount} ${dmgType} to ${resolved.targetName}`,
    });
    deactivateTalisman({ talisman: maneuverTalisman, setConsumed, setAffixed });
    setTalismanUsed(true);
  };

  const handleClose = () => {
    setPickedId(null);
    setD20('');
    setDcInput('');
    setPickedSkill(null);
    setMapOverride(null);
    setToggledIds([]);
    setCircumstance('');
    setShieldRuneOn(false);
    setResolved(null);
    setTalismanUsed(false);
    onClose();
  };

  const toggleCircumstance = (id) =>
    setToggledIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (!isOpen || !action) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={action.name}
      themeColor={themeColor}
      maxWidth="400px"
      placement="bottom"
    >
      <div className="sam-body">
        {/* Feat/companion hints (#223) — reminders for bonuses the app can't
            auto-net (e.g. Threat Display ignoring the −4 no-language penalty). */}
        {(action.hints || []).length > 0 && (
          <div className="sam-hints" role="note">
            {action.hints.map((h, i) => (
              <p key={i} className="sam-hint">{h}</p>
            ))}
          </div>
        )}

        {/* Target picker — enemy-facing actions only */}
        {!selfTarget && (
          <div className="sam-field">
            <label className="sam-label">Target</label>
            <div className="sam-target-picks">
              {enemyTargets.length === 0 ? (
                <span className="sam-empty">No enemies in the encounter.</span>
              ) : (
                enemyTargets.map((e) => (
                  <button
                    key={e.entryId}
                    className={`sam-target-btn${pickedId === e.entryId ? ' sam-target-btn--active' : ''}`}
                    onClick={() => { setPickedId(e.entryId); setDcInput(''); setResolved(null); }}
                    disabled={!!resolved}
                  >
                    {e.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Skill choice — actions that allow more than one skill (Escape) */}
        {skillOptions && (
          <div className="sam-field">
            <label className="sam-label">Skill</label>
            <div className="sam-target-picks">
              {skillOptions.map((s) => (
                <button
                  key={s}
                  className={`sam-target-btn${activeSkill === s ? ' sam-target-btn--active' : ''}`}
                  onClick={() => { setPickedSkill(s); setResolved(null); }}
                  disabled={!!resolved}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {(selfTarget || target) && (
          <>
            {/* Immunity notice */}
            {targetImmune && (
              <div className="sam-immune" role="status">
                {target.name} is immune to {action.name} right now.
              </div>
            )}

            {/* Net modifier */}
            {netMod != null && (
              <div className="sam-bonus-row">
                <span className="sam-bonus-label">{action.name}</span>
                <span className="sam-bonus-value">{fmtMod(netMod)}</span>
                {circumstanceBonus !== 0 && (
                  <span className="sam-bonus-note">(incl. {fmtMod(circumstanceBonus)} circumstance)</span>
                )}
              </div>
            )}

            {/* Multiple Attack Penalty — Attack-trait maneuvers only */}
            {isAttack && (
              <div className="sam-field">
                <label className="sam-label">Multiple attack penalty</label>
                <div className="sam-target-picks">
                  {[0, 1, 2].map((step) => {
                    const pen = mapPenaltyFor(action, step);
                    const active = mapStep === step;
                    return (
                      <button
                        key={step}
                        className={`sam-target-btn${active ? ' sam-target-btn--active' : ''}`}
                        onClick={() => setMapOverride(step)}
                        disabled={!!resolved}
                      >
                        {pen === 0 ? 'No MAP' : pen}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shield rune bonus — opt-in item bonus from a held (raised, for
                Glamourous) shield with the relevant rune (#1196 G3). */}
            {shieldRuneBonus && (
              <div className="sam-field">
                <label className="sam-label">Shield rune</label>
                <div className="sam-target-picks">
                  <button
                    type="button"
                    className={`sam-target-btn${shieldRuneOn ? ' sam-target-btn--active' : ''}`}
                    aria-pressed={shieldRuneOn}
                    onClick={() => setShieldRuneOn((v) => !v)}
                    disabled={!!resolved}
                  >
                    {shieldRuneBonus.label} +{shieldRuneBonus.amount}
                  </button>
                </div>
              </div>
            )}

            {/* Situational bonuses — declared feat toggles + a free-form entry */}
            {declaredToggles.length > 0 && (
              <div className="sam-field">
                <label className="sam-label">Circumstance</label>
                <div className="sam-target-picks">
                  {declaredToggles.map((t) => (
                    <button
                      key={t.id}
                      className={`sam-target-btn${toggledIds.includes(t.id) ? ' sam-target-btn--active' : ''}`}
                      onClick={() => toggleCircumstance(t.id)}
                      disabled={!!resolved}
                    >
                      {t.label} {t.bonus >= 0 ? `+${t.bonus}` : t.bonus}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="sam-field">
              <label className="sam-label" htmlFor="sam-circ">Other circumstance ±</label>
              <input
                id="sam-circ"
                className="sam-input"
                type="number"
                placeholder="0"
                value={circumstance}
                onChange={(e) => setCircumstance(e.target.value)}
                disabled={!!resolved}
              />
            </div>

            {/* d20 + DC */}
            <div className="sam-inputs">
              <div className="sam-field">
                <label className="sam-label" htmlFor="sam-d20">d20 roll</label>
                <input
                  id="sam-d20"
                  className="sam-input"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="1–20"
                  value={d20}
                  onChange={handleD20}
                  disabled={!!resolved}
                />
              </div>
              <div className="sam-field">
                <label className="sam-label" htmlFor="sam-dc">{defenseLabel}</label>
                <input
                  id="sam-dc"
                  className="sam-input"
                  type="number"
                  min="1"
                  placeholder={prefilledDC != null ? String(prefilledDC) : 'DC'}
                  value={dcInput}
                  onChange={handleDc}
                  disabled={!!resolved}
                />
              </div>
            </div>

            {/* Running total + degree */}
            {total != null && (
              <div className="sam-total-row">
                <span className="sam-total-label">Total</span>
                <span className="sam-total-value">{total}</span>
              </div>
            )}
            {degree && (
              <div className={`sam-degree sam-degree--${degree}`}>
                {DEGREE_LABELS[degree]} — {describeOutcome(outcome)}
              </div>
            )}

            {/* Confirm / result */}
            {resolved ? (
              <>
                <div className="sam-result">
                  ✓ {action.name}{selfTarget ? '' : ` vs ${resolved.targetName}`} — {resolved.resultStr}
                </div>
                {maneuverTalisman && !talismanUsed && (
                  <button
                    type="button"
                    className="sam-talisman-btn"
                    onClick={activateManeuverTalisman}
                  >
                    Activate {maneuverTalisman.name} (free): deal{' '}
                    {computeAmount(maneuverTalisman.talisman.activation.effect, character)}{' '}
                    {maneuverTalisman.talisman.activation.effect.damageType || 'damage'}
                  </button>
                )}
                {talismanUsed && (
                  <div className="sam-result sam-result--talisman">✓ {maneuverTalisman?.name} activated</div>
                )}
              </>
            ) : (
              <button
                className="sam-confirm-btn"
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                {targetImmune
                  ? 'Target is immune'
                  : `Use ${action.name} (${action.actionCost} act)`}
              </button>
            )}
          </>
        )}

        <div className="sam-footer">
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default SkillActionModal;
