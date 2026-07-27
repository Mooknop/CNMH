import React, { useState, useMemo } from 'react';
import RollSheet from '../encounter/RollSheet';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { computeSaveDegree } from '../../utils/saveDegree';
import { getSkillModifier, getUnarmedAttackModifier } from '../../utils/CharacterUtils';
import { getCondition } from '../../data/pf2eConditions';
import { flattenInventory } from '../../utils/InventoryUtils';
import { affixedKey, affixedTalismanItems, deactivateTalisman } from '../../utils/affix';
import { checkBonusTalisman, hasOutcomeShift, shiftCheckOutcome } from '../../utils/talismanActivation';
import './SkillCheckModal.css';
import { RELAY, APP, syncKey } from '../../sync/keys';

const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

const condLabel = (id, value) => {
  if (!id) return null;
  const def = getCondition(id);
  const name = def?.name || id;
  return def?.valued && value != null ? `${name} ${value}` : name;
};

// Display-only summary of a degree's outcome — a GM note and/or condition label.
// The exploration surface applies nothing (no enemy, no turn, no log), so this
// is purely informational for the table. Rendered as the result row's `note`.
const describeOutcome = (o) => {
  if (!o) return 'no effect';
  const parts = [];
  if (o.condition) parts.push(condLabel(o.condition, o.value));
  if (o.note) parts.push(o.note);
  if (o.selfCondition) parts.push(`you are ${condLabel(o.selfCondition)}`);
  return parts.length ? parts.join('; ') : 'no effect';
};

/**
 * Out-of-encounter skill action resolver (#407) on RollSheet (#1690, Roll
 * Resolution redesign — workstream H) — the exploration-side sibling of
 * SkillActionModal. The player picks a skill (when the action allows), sees
 * their net modifier, taps a raw d20 on the shell's die pad, and the degree +
 * outcome note render only after commit, in the result card's row `note`.
 * Reuses resolveActionRoll for the bonus and computeSaveDegree for the
 * degree (nat-1/20 shift included, unchanged), plus the same feat/effect
 * circumstance toggles and free-form "+N" entry as the combat modal. Neither
 * a skill action nor an exploration activity ever carries an authored DC, so
 * the DC stays a pre-commit player entry, moved into the shell's Edit panel.
 *
 * Unlike SkillActionModal it has no enemy target, no Multiple Attack Penalty,
 * no action spend, no immunity, and no combat log — exploration checks
 * resolve standalone and apply nothing automatically.
 *
 * @param {object} action - a skillActions.js entry (pre-augmented for the PC)
 */
const SkillCheckModal = ({ isOpen, onClose, action, character, themeColor }) => {
  const characterModel = useCharacter(character);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();
  const [activeConditions] = useSyncedState(syncKey(RELAY.CONDITIONS, character?.id || 'none'), []);

  // Affixed-talisman overlay (#254) + consumed overlay — a check-bonus talisman
  // (Sneaky Key, #1093) is offered as an opt-in on matching checks and consumed
  // only when actually used on a committed roll, mirroring SavePrompt's
  // save-bonus flow.
  const [affixed, setAffixed] = useSyncedState(affixedKey(character?.id || 'none'), {});
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id || 'none'), {});

  const [dcInput, setDcInput] = useState('');
  const [pickedSkill, setPickedSkill] = useState(null);
  const [toggledIds, setToggledIds] = useState([]); // declared circumstance toggles, active
  const [circumstance, setCircumstance] = useState(''); // free-form "+N" entry
  const [talismanOn, setTalismanOn] = useState(false);
  const [hasRolled, setHasRolled] = useState(false); // a commit actually happened this mount

  // Skill choice — actions with skillOptions let the player pick; default to the
  // option with the higher modifier. The special 'unarmed' option rolls the
  // unarmed-attack modifier rather than a skill.
  const skillOptions = action?.skillOptions || null;
  const optionModifier = (opt) =>
    opt === 'unarmed' ? getUnarmedAttackModifier(character) : getSkillModifier(character, opt);
  const defaultSkill = useMemo(() => {
    if (!skillOptions || !character) return action?.skill;
    return skillOptions.reduce(
      (best, s) => (optionModifier(s) > optionModifier(best) ? s : best),
      skillOptions[0]
    );
    // optionModifier derives solely from `character`, which is already a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillOptions, character, action]);
  const activeSkill = pickedSkill || defaultSkill;

  // Net skill modifier via the shared resolver (conditions + effects).
  const rollProfile = useMemo(() => {
    if (!character || !characterModel || !action) return null;
    const synthetic = activeSkill === 'unarmed'
      ? { traits: action.traits, type: 'melee', attackMod: getUnarmedAttackModifier(character) }
      : { traits: action.traits, roll: { type: 'skill', skill: activeSkill } };
    return resolveActionRoll(synthetic, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
    });
  }, [character, characterModel, action, activeSkill, activeConditions, effects, effectCatalog]);

  const baseMod = rollProfile?.bonus ?? null;

  // A check-bonus talisman (Sneaky Key) affixed to this PC matching the rolled
  // skill. Opt-in, like SavePrompt's pin — it usually applies only to a specific
  // use (Pick a Lock), which the player/GM judges.
  const affixedTalismans = affixedTalismanItems(affixed, flattenInventory(characterModel?.inventory));
  const talisman = activeSkill !== 'unarmed' ? checkBonusTalisman(affixedTalismans, activeSkill) : null;
  const talismanEffect = talisman?.talisman?.activation?.effect || null;
  const talismanBonus = talismanOn && talismanEffect ? talismanEffect.bonus || 0 : 0;
  // Label the opt-in by what it grants: a numeric bonus, or (Mesmerizing Opal
  // #1085) a degree-of-success shift with no flat bonus.
  const talismanEffectLabel = talismanEffect
    ? (talismanEffect.bonus
        ? `+${talismanEffect.bonus} ${talismanEffect.value || 'bonus'}`
        : hasOutcomeShift(talismanEffect) ? 'outcome shift' : 'bonus')
    : 'bonus';

  // Circumstance: feat-declared toggles (Hunt Prey vs prey, conditional effects)
  // plus a free-form "+N" for table rulings (Aid, GM-granted bonuses).
  const declaredToggles = action?.toggles || [];
  const toggleBonus = declaredToggles
    .filter((t) => toggledIds.includes(t.id))
    .reduce((sum, t) => sum + (t.bonus || 0), 0);
  const freeform = /^-?\d+$/.test(circumstance) ? parseInt(circumstance, 10) : 0;
  const circumstanceBonus = toggleBonus + freeform;
  const netMod = baseMod != null ? baseMod + circumstanceBonus + talismanBonus : null;

  const dcVal = dcInput !== '' ? parseInt(dcInput, 10) : null;
  const hasDc = dcVal != null && !isNaN(dcVal);

  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDcInput(v);
  };

  const handleClose = () => {
    // Consume the talisman only when it was actually used on a committed roll.
    if (talismanOn && talisman && hasRolled) {
      deactivateTalisman({ talisman, setConsumed, setAffixed });
    }
    setDcInput('');
    setPickedSkill(null);
    setToggledIds([]);
    setCircumstance('');
    setTalismanOn(false);
    setHasRolled(false);
    onClose();
  };

  const toggleCircumstance = (id) =>
    setToggledIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (!isOpen || !action) return null;

  const blockLine = hasDc ? null : 'Enter a DC in Edit before rolling.';
  const dcLine = hasDc ? `nothing rolled yet · DC ${dcVal}` : 'nothing rolled yet · no DC set';
  const summaryLine = netMod != null ? `${action.name} ${fmtMod(netMod)}` : action.name;
  const editStatusLine = circumstanceBonus !== 0 ? `incl. ${fmtMod(circumstanceBonus)} circumstance` : '';

  const handleCommit = (face) => {
    setHasRolled(true);
    const total = face + (netMod ?? 0);
    const rawDegree = computeSaveDegree({ d20: face, total, dc: dcVal });
    const degree = talismanOn && rawDegree ? shiftCheckOutcome(rawDegree, talismanEffect) : rawDegree;
    const outcome = degree ? action?.outcomes?.[degree] || null : null;
    return [{
      entryId: character?.id || 'self',
      name: action.name,
      dcLabel: `DC ${dcVal}`,
      degree,
      note: describeOutcome(outcome),
    }];
  };

  const editPanel = (
    <>
      {(action.hints || []).length > 0 && (
        <div className="scm-hints" role="note">
          {action.hints.map((h, i) => (
            <p key={i} className="scm-hint">{h}</p>
          ))}
        </div>
      )}

      {skillOptions && (
        <div className="scm-field">
          <label className="scm-label">Skill</label>
          <div className="scm-picks">
            {skillOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`scm-pick-btn${activeSkill === s ? ' scm-pick-btn--active' : ''}`}
                onClick={() => setPickedSkill(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {declaredToggles.length > 0 && (
        <div className="scm-field">
          <label className="scm-label">Circumstance</label>
          <div className="scm-picks">
            {declaredToggles.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`scm-pick-btn${toggledIds.includes(t.id) ? ' scm-pick-btn--active' : ''}`}
                onClick={() => toggleCircumstance(t.id)}
              >
                {t.label} {t.bonus >= 0 ? `+${t.bonus}` : t.bonus}
              </button>
            ))}
          </div>
        </div>
      )}

      {talisman && (
        <div className="scm-field">
          <label className="scm-talisman">
            <input
              type="checkbox"
              checked={talismanOn}
              onChange={(e) => setTalismanOn(e.target.checked)}
              aria-label={`${talisman.name} (${talismanEffectLabel})`}
            />
            {talisman.name} ({talismanEffectLabel}
            {talismanEffect?.note ? ` — ${talismanEffect.note}` : ''})
          </label>
        </div>
      )}

      <div className="scm-field">
        <label className="scm-label" htmlFor="scm-circ">Other circumstance ±</label>
        <input
          id="scm-circ"
          className="scm-input"
          type="number"
          placeholder="0"
          value={circumstance}
          onChange={(e) => setCircumstance(e.target.value)}
        />
      </div>

      <div className="scm-field">
        <label className="scm-label" htmlFor="scm-dc">DC</label>
        <input
          id="scm-dc"
          className="scm-input"
          type="number"
          min="1"
          placeholder="DC"
          value={dcInput}
          onChange={handleDc}
        />
      </div>
    </>
  );

  return (
    <RollSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={action.name}
      themeColor={themeColor}
      maxWidth="400px"
      summaryLine={summaryLine}
      blockLine={blockLine}
      editPanel={editPanel}
      editStatusLine={editStatusLine}
      hasD20
      charId={character?.id}
      flavor={action.name}
      bonus={netMod}
      bonusLabel={action.name}
      dcLine={dcLine}
      commitLabel={`Resolve ${action.name}`}
      onCommit={handleCommit}
      damageParts={null}
    />
  );
};

export default SkillCheckModal;
