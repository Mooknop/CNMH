import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { computeSaveDegree } from '../../utils/saveDegree';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import { getSkillModifier, getUnarmedAttackModifier } from '../../utils/CharacterUtils';
import { getCondition } from '../../data/pf2eConditions';
import { flattenInventory } from '../../utils/InventoryUtils';
import { affixedKey, affixedTalismanItems, deactivateTalisman } from '../../utils/affix';
import { checkBonusTalisman } from '../../utils/talismanActivation';
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
// is purely informational for the table.
const describeOutcome = (o) => {
  if (!o) return 'no effect';
  const parts = [];
  if (o.condition) parts.push(condLabel(o.condition, o.value));
  if (o.note) parts.push(o.note);
  if (o.selfCondition) parts.push(`you are ${condLabel(o.selfCondition)}`);
  return parts.length ? parts.join('; ') : 'no effect';
};

/**
 * Out-of-encounter skill action resolver (#407) — the exploration-side sibling of
 * SkillActionModal. The player picks a skill (when the action allows), sees their
 * net modifier, enters a raw d20 and a GM-entered DC, and the degree + outcome
 * note render live. Reuses resolveActionRoll for the bonus and computeSaveDegree
 * for the degree, plus the same feat/effect circumstance toggles and free-form
 * "+N" entry as the combat modal.
 *
 * Unlike SkillActionModal it has no enemy target, no Multiple Attack Penalty, no
 * action spend, no immunity, and no combat log — exploration checks resolve
 * standalone and apply nothing automatically.
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
  // only when actually used, mirroring SavePrompt's save-bonus flow.
  const [affixed, setAffixed] = useSyncedState(affixedKey(character?.id || 'none'), {});
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id || 'none'), {});

  const [d20, setD20] = useState('');
  const [dcInput, setDcInput] = useState('');
  const [pickedSkill, setPickedSkill] = useState(null);
  const [toggledIds, setToggledIds] = useState([]); // declared circumstance toggles, active
  const [circumstance, setCircumstance] = useState(''); // free-form "+N" entry
  const [talismanOn, setTalismanOn] = useState(false);

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
  const d20Val = parseInt(d20, 10);
  const total = !isNaN(d20Val) && netMod != null ? d20Val + netMod : null;
  const degree = total != null && dcVal != null && !isNaN(dcVal)
    ? computeSaveDegree({ d20: d20Val, total, dc: dcVal })
    : null;
  const outcome = degree ? action?.outcomes?.[degree] || null : null;

  const handleD20 = (e) => {
    const v = e.target.value;
    if (v === '' || (/^\d+$/.test(v) && parseInt(v, 10) <= 20)) setD20(v);
  };

  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDcInput(v);
  };

  const handleClose = () => {
    // Consume the talisman only when it was actually used on a roll.
    if (talismanOn && talisman && d20 !== '') {
      deactivateTalisman({ talisman, setConsumed, setAffixed });
    }
    setD20('');
    setDcInput('');
    setPickedSkill(null);
    setToggledIds([]);
    setCircumstance('');
    setTalismanOn(false);
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
    >
      <div className="scm-body">
        {/* Feat/companion hints — reminders for things the app can't auto-net. */}
        {(action.hints || []).length > 0 && (
          <div className="scm-hints" role="note">
            {action.hints.map((h, i) => (
              <p key={i} className="scm-hint">{h}</p>
            ))}
          </div>
        )}

        {/* Skill choice — actions that allow more than one skill */}
        {skillOptions && (
          <div className="scm-field">
            <label className="scm-label">Skill</label>
            <div className="scm-picks">
              {skillOptions.map((s) => (
                <button
                  key={s}
                  className={`scm-pick-btn${activeSkill === s ? ' scm-pick-btn--active' : ''}`}
                  onClick={() => setPickedSkill(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Net modifier */}
        {netMod != null && (
          <div className="scm-bonus-row">
            <span className="scm-bonus-label">{action.name}</span>
            <span className="scm-bonus-value">{fmtMod(netMod)}</span>
            {circumstanceBonus !== 0 && (
              <span className="scm-bonus-note">(incl. {fmtMod(circumstanceBonus)} circumstance)</span>
            )}
          </div>
        )}

        {/* Situational bonuses — declared feat/effect toggles + a free-form entry */}
        {declaredToggles.length > 0 && (
          <div className="scm-field">
            <label className="scm-label">Circumstance</label>
            <div className="scm-picks">
              {declaredToggles.map((t) => (
                <button
                  key={t.id}
                  className={`scm-pick-btn${toggledIds.includes(t.id) ? ' scm-pick-btn--active' : ''}`}
                  onClick={() => toggleCircumstance(t.id)}
                >
                  {t.label} {t.bonus >= 0 ? `+${t.bonus}` : t.bonus}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Check-bonus talisman opt-in (Sneaky Key, #1093) */}
        {talisman && (
          <div className="scm-field">
            <label className="scm-talisman">
              <input
                type="checkbox"
                checked={talismanOn}
                onChange={(e) => setTalismanOn(e.target.checked)}
                aria-label={`${talisman.name} (+${talismanEffect?.bonus || 0} ${talismanEffect?.value || ''})`}
              />
              {talisman.name} (+{talismanEffect?.bonus || 0} {talismanEffect?.value || 'bonus'}
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

        {/* d20 + GM-entered DC */}
        <div className="scm-inputs">
          <div className="scm-field">
            <label className="scm-label" htmlFor="scm-d20">d20 roll</label>
            <input
              id="scm-d20"
              className="scm-input"
              type="number"
              min="1"
              max="20"
              placeholder="1–20"
              value={d20}
              onChange={handleD20}
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
        </div>

        {/* Running total + degree + outcome note */}
        {total != null && (
          <div className="scm-total-row">
            <span className="scm-total-label">Total</span>
            <span className="scm-total-value">{total}</span>
          </div>
        )}
        {degree && (
          <div className={`scm-degree scm-degree--${degree}`}>
            {DEGREE_LABELS[degree]} — {describeOutcome(outcome)}
          </div>
        )}

        <div className="scm-footer">
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default SkillCheckModal;
