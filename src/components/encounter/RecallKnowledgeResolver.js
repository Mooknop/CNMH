import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useCharacter } from '../../hooks/useCharacter';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { computeSaveDegree } from '../../utils/saveDegree';
import { recallKnowledgeDC, recallKnowledgeSkills, KNOWLEDGE_SKILLS } from '../../utils/recallKnowledge';
import { formatModifier } from '../../utils/CharacterUtils';
import './RecallKnowledgeResolver.css';

const SKILL_LABELS = {
  arcana:     'Arcana',
  nature:     'Nature',
  occultism:  'Occultism',
  religion:   'Religion',
  society:    'Society',
};

const CHOICE_OPTIONS = [
  { value: 'fortitude', label: 'Fortitude save' },
  { value: 'reflex',    label: 'Reflex save' },
  { value: 'will',      label: 'Will save' },
  { value: 'lowest',    label: 'Lowest save' },
  { value: 'highest',   label: 'Highest save' },
  { value: 'immunities',   label: 'Immunities' },
  { value: 'resistances',  label: 'Resistances' },
  { value: 'weaknesses',   label: 'Weaknesses' },
];

const DEGREE_INFO = {
  criticalSuccess: { label: 'Critical Success', cls: 'tw-degree--crit-success' },
  success:         { label: 'Success',           cls: 'tw-degree--success'      },
  failure:         { label: 'Failure',           cls: 'tw-degree--failure'      },
  criticalFailure: { label: 'Critical Failure',  cls: 'tw-degree--crit-failure' },
};

const RecallKnowledgeResolver = ({ enemy, actingCharId, actingCharName, onDone }) => {
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
  const [choice, setChoice]               = useState(null);

  const skillMod  = charModel?.skillModifiers?.[selectedSkill] ?? 0;
  const dc        = bestiary?.level != null
    ? recallKnowledgeDC(bestiary.level, bestiary.rarity)
    : null;

  const d20    = parseInt(d20Input, 10);
  const hasD20 = !isNaN(d20) && d20 >= 1 && d20 <= 20;
  const total  = hasD20 ? d20 + skillMod : NaN;

  const degree = (hasD20 && dc != null)
    ? computeSaveDegree({ d20, total, dc })
    : null;

  const needsChoice = degree === 'success';
  const confirmEnabled = hasD20 && degree != null && (!needsChoice || choice != null);

  const handleConfirm = () => {
    if (!confirmEnabled) return;
    resolve(enemy.entryId, {
      degree,
      defenses,
      choice: needsChoice ? choice : null,
      by:     actingCharId,
      byName: actingCharName,
      skill:  SKILL_LABELS[selectedSkill] || selectedSkill,
      d20,
      total,
      dc,
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
            onChange={(e) => { setD20Input(e.target.value); setChoice(null); }}
          />
          <span className="trr-bonus-badge" aria-label="skill modifier">
            {formatModifier(skillMod)}
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

      {/* Choice picker (only on success) */}
      {needsChoice && (
        <section className="ct-section" data-testid="rkr-choice-section">
          <h3 className="ct-section-title">What did you learn?</h3>
          <div className="rkr-choice-list" role="group" aria-label="Choose what to learn">
            {CHOICE_OPTIONS.map((opt) => (
              <label key={opt.value} className="rkr-choice-item">
                <input
                  type="radio"
                  name="rkr-choice"
                  value={opt.value}
                  checked={choice === opt.value}
                  onChange={() => setChoice(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </section>
      )}

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
