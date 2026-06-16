// src/components/encounter/commandsheet/FocusBanner.jsx
// Command Sheet focus banner (#411). The persistent target context: the focused
// foe's AC / save DCs / Perception DC / Recall-Knowledge DC / weaknesses. Drives
// what the grid adapts to. Visibility follows the same Recall Knowledge reveal
// gating as BestiaryEntry — a player only sees what they've learned — and the
// whole banner degrades gracefully (rows hide, "no stat block" fallback) when a
// foe hasn't been captured.
import React from 'react';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useRecallKnowledge } from '../../../hooks/useRecallKnowledge';
import { defenseDC } from '../../../utils/defense';
import {
  rkKeyFor,
  recallKnowledgeDC,
  isFieldRevealed,
  isSaveRevealed,
  isIwrRevealed,
} from '../../../utils/recallKnowledge';
import './FocusBanner.css';

// Compact labels for the banner (the full DEFENSE_LABELS are too long here).
const SAVE_LABEL = { fortitude: 'Fort', reflex: 'Ref', will: 'Will' };

const FocusBanner = ({ charId }) => {
  const { focusEnemy } = useFocusTarget(charId);
  const { recordFor } = useRecallKnowledge();

  if (!focusEnemy) return null;

  const { defenses, bestiary, name } = focusEnemy;
  const rec = recordFor(rkKeyFor(focusEnemy));

  // Homebrew / un-captured combatant — no Foundry stat block to read from.
  if (!defenses && !bestiary) {
    return (
      <div className="cmd-focus" role="region" aria-label={`Focused: ${name}`}>
        <span className="cmd-focus-name">{name}</span>
        <span className="cmd-focus-empty">No stat block — Recall Knowledge to learn more</span>
      </div>
    );
  }

  const stats = [];
  const ac = defenseDC(defenses, 'ac');
  if (ac != null && isFieldRevealed(rec, 'ac')) stats.push({ key: 'ac', label: 'AC', value: ac });

  ['fortitude', 'reflex', 'will'].forEach((k) => {
    const dc = defenseDC(defenses, k);
    if (dc != null && isSaveRevealed(rec, k)) stats.push({ key: k, label: SAVE_LABEL[k], value: dc });
  });

  const perc = defenseDC(defenses, 'perception');
  if (perc != null && isFieldRevealed(rec, 'perception')) {
    stats.push({ key: 'perception', label: 'Perc DC', value: perc });
  }

  // RK DC follows BestiaryEntry: shown once the creature's identity is known.
  const rkDC = bestiary?.level != null ? recallKnowledgeDC(bestiary.level, bestiary.rarity) : null;
  if (rkDC != null && isFieldRevealed(rec, 'identity')) {
    stats.push({ key: 'rk', label: 'RK DC', value: rkDC });
  }

  // Weaknesses — full reveal (iwr.weaknesses) or per-type partial (Exploit Vuln).
  const weaknessesFull = isIwrRevealed(rec, 'weaknesses');
  const weaknessList = weaknessesFull
    ? (defenses?.weaknesses || [])
    : (defenses?.weaknesses || []).filter((w) => rec.weaknessesRevealed?.[w.type]);

  return (
    <div className="cmd-focus" role="region" aria-label={`Focused: ${name}`}>
      <span className="cmd-focus-name">{name}</span>
      {stats.length > 0 && (
        <div className="cmd-focus-stats">
          {stats.map((s) => (
            <span key={s.key} className="cmd-focus-stat">
              <span className="cmd-focus-stat-label">{s.label}</span>
              <span className="cmd-focus-stat-value">{s.value}</span>
            </span>
          ))}
        </div>
      )}
      {weaknessList.length > 0 && (
        <div className="cmd-focus-weak">
          <span className="cmd-focus-stat-label">Weak</span>
          <span className="cmd-focus-weak-values">
            {weaknessList.map((w) => `${w.type} ${w.value}`).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
};

export default FocusBanner;
