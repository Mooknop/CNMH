import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useCharacter } from '../../hooks/useCharacter';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { computeSaveDegree } from '../../utils/saveDegree';
import { recallKnowledgeDC, recallKnowledgeSkills, KNOWLEDGE_SKILLS, rkKeyFor } from '../../utils/recallKnowledge';
import { formatModifier } from '../../utils/CharacterUtils';
import { heldShieldRollBonus } from '../../utils/shieldRuneEffects';
import './RecallKnowledgeResolver.css';

const SKILL_LABELS = {
  arcana:     'Arcana',
  nature:     'Nature',
  occultism:  'Occultism',
  religion:   'Religion',
  society:    'Society',
};

// Auto-revealed on any success; not pickable.
// All remaining facts are pickable.
const CHOICE_OPTIONS = [
  { value: 'ac',          label: 'Armor Class' },
  { value: 'perception',  label: 'Perception' },
  { value: 'speed',       label: 'Speed' },
  { value: 'fortitude',   label: 'Fortitude save' },
  { value: 'reflex',      label: 'Reflex save' },
  { value: 'will',        label: 'Will save' },
  { value: 'lowest',      label: 'Lowest save' },
  { value: 'highest',     label: 'Highest save' },
  { value: 'immunities',  label: 'Immunities' },
  { value: 'resistances', label: 'Resistances' },
  { value: 'weaknesses',  label: 'Weaknesses' },
];

const DEGREE_INFO = {
  criticalSuccess: { label: 'Critical Success', cls: 'tw-degree--crit-success' },
  success:         { label: 'Success',           cls: 'tw-degree--success'      },
  failure:         { label: 'Failure',           cls: 'tw-degree--failure'      },
  criticalFailure: { label: 'Critical Failure',  cls: 'tw-degree--crit-failure' },
};

// How many facts the player picks per degree.
const CHOICE_LIMIT = { success: 1, criticalSuccess: 2 };

const RecallKnowledgeResolver = ({ enemy, actingCharId, actingCharName, onDone, outOfCombat = false, currentDay = null }) => {
  const { characters } = useContent();
  const rawChar = characters.find((c) => c.id === actingCharId) || null;
  const charModel = useCharacter(rawChar);
  const { resolve } = useRecallKnowledge();

  const bestiary   = enemy?.bestiary;
  const defenses   = enemy?.defenses;
  const traits     = bestiary?.traits || [];
  const recommended = recallKnowledgeSkills(traits);

  const [selectedSkill, setSelectedSkill] = useState(recommended[0] || 'arcana');
  const [d20Input, setD20Input]           = useState('');
  const [choices, setChoices]             = useState([]);
  const [knowingOn, setKnowingOn]         = useState(false);

  const skillMod  = charModel?.skillModifiers?.[selectedSkill] ?? 0;
  // Knowing shield rune (#1196 G3): +1 item bonus to Recall Knowledge while
  // wielding — offered as an opt-in toggle rather than baked into every skill.
  const knowingBonus = heldShieldRollBonus(charModel?.inventory, 'knowing');
  const runeBonus    = knowingBonus && knowingOn ? knowingBonus.amount : 0;
  const effectiveMod = skillMod + runeBonus;
  const baseDc    = bestiary?.level != null
    ? recallKnowledgeDC(bestiary.level, bestiary.rarity)
    : null;
  // Out of combat the party studies at leisure: DC is 2 lower (#396).
  const dc        = baseDc != null ? baseDc - (outOfCombat ? 2 : 0) : null;

  const d20    = parseInt(d20Input, 10);
  const hasD20 = !isNaN(d20) && d20 >= 1 && d20 <= 20;
  const total  = hasD20 ? d20 + effectiveMod : NaN;

  const degree = (hasD20 && dc != null)
    ? computeSaveDegree({ d20, total, dc })
    : null;

  const limit       = degree ? CHOICE_LIMIT[degree] ?? 0 : 0;
  const needsChoice = limit > 0;
  const confirmEnabled = hasD20 && degree != null && (!needsChoice || choices.length === limit);

  const toggleChoice = (value) => {
    setChoices((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (prev.length >= limit) return prev; // cap reached — ignore
      return [...prev, value];
    });
  };

  const handleConfirm = () => {
    if (!confirmEnabled) return;
    resolve(rkKeyFor(enemy), {
      degree,
      defenses,
      choices: needsChoice ? choices : [],
      by:     actingCharId,
      byName: actingCharName,
      skill:  SKILL_LABELS[selectedSkill] || selectedSkill,
      d20,
      total,
      dc,
      outOfCombat,
      currentDay,
    });
    onDone();
  };

  const degreeInfo = degree ? DEGREE_INFO[degree] : null;

  return (
    <div className="rkr-resolver" data-testid="rkr-resolver">
      {/* DC display */}
      {dc != null && (
        <div className="rkr-dc-row">
          <span className="rkr-dc-label">DC</span>
          <span className="rkr-dc-value">{dc}</span>
          {outOfCombat && <span className="rkr-dc-note">−2 · studied</span>}
        </div>
      )}

      {/* Skill picker */}
      <section className="ct-section">
        <h3 className="ct-section-title">Skill</h3>
        <div className="rkr-skill-row" role="group" aria-label="Select knowledge skill">
          {KNOWLEDGE_SKILLS.map((sk) => {
            const isRec = recommended[0] === sk;
            return (
              <button
                key={sk}
                type="button"
                className={[
                  'rkr-skill-btn',
                  selectedSkill === sk ? 'rkr-skill-btn--on' : '',
                  isRec ? 'rkr-skill-btn--recommended' : '',
                ].filter(Boolean).join(' ')}
                aria-pressed={selectedSkill === sk}
                onClick={() => setSelectedSkill(sk)}
              >
                <span className="rkr-skill-name">{SKILL_LABELS[sk]}</span>
                <span className="rkr-skill-mod">{formatModifier(charModel?.skillModifiers?.[sk] ?? 0)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Knowing shield rune — opt-in +1 item bonus to this Recall Knowledge */}
      {knowingBonus && (
        <section className="ct-section" data-testid="rkr-knowing-section">
          <h3 className="ct-section-title">Shield rune</h3>
          <button
            type="button"
            className={['rkr-skill-btn', knowingOn ? 'rkr-skill-btn--on' : ''].filter(Boolean).join(' ')}
            aria-pressed={knowingOn}
            onClick={() => { setKnowingOn((v) => !v); setChoices([]); }}
          >
            <span className="rkr-skill-name">{knowingBonus.label}</span>
            <span className="rkr-skill-mod">+{knowingBonus.amount}</span>
          </button>
        </section>
      )}

      {/* Roll input */}
      <section className="ct-section">
        <h3 className="ct-section-title">Roll</h3>
        <div className="trr-entry-row">
          <input
            type="number"
            className="trr-roll-input"
            placeholder="d20"
            min="1"
            max="20"
            aria-label="raw d20"
            value={d20Input}
            onChange={(e) => { setD20Input(e.target.value); setChoices([]); }}
          />
          <span className="trr-bonus-badge" aria-label="skill modifier">
            {formatModifier(effectiveMod)}
          </span>
          {hasD20 && (
            <span className="trr-total-badge">= {total}</span>
          )}
          {degreeInfo && (
            <span className={`tw-degree-chip ${degreeInfo.cls}`}>
              {degreeInfo.label}
            </span>
          )}
        </div>
      </section>

      {/* Choice picker (success: pick 1; crit success: pick 2) */}
      {needsChoice && (
        <section className="ct-section" data-testid="rkr-choice-section">
          <h3 className="ct-section-title">
            {limit === 1 ? 'What did you learn?' : `What did you learn? (pick ${limit})`}
          </h3>
          <p className="rkr-auto-note">
            You also learn the creature&apos;s name, description, and current HP automatically.
          </p>
          <div className="rkr-choice-list" role="group" aria-label="Choose what to learn">
            {CHOICE_OPTIONS.map((opt) => {
              const checked   = choices.includes(opt.value);
              const disabled  = !checked && choices.length >= limit;
              return (
                <label
                  key={opt.value}
                  className={`rkr-choice-item${disabled ? ' rkr-choice-item--disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    name="rkr-choice"
                    value={opt.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleChoice(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* Success auto-note (no choice needed for failure) */}
      {degree === 'success' && !needsChoice && null}

      {/* Crit-failure note */}
      {degree === 'criticalFailure' && (
        <p className="rkr-lockout-notice">
          Critical failure — you cannot recall further knowledge about this creature.
        </p>
      )}

      <div className="rkr-footer">
        <button className="btn-secondary" type="button" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn-primary"
          type="button"
          onClick={handleConfirm}
          disabled={!confirmEnabled}
        >
          Apply
        </button>
      </div>
    </div>
  );
};

export default RecallKnowledgeResolver;
