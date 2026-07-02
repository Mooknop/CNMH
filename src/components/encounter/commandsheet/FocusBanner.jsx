// src/components/encounter/commandsheet/FocusBanner.jsx
// Command Sheet focus banner (#411, #429). The persistent target context:
// - a focused **foe** shows AC / save DCs / Perception / RK DC / weaknesses,
//   reveal-gated by Recall Knowledge (degrades gracefully when uncaptured);
// - a focused **ally** (#429) shows their HP + conditions — the support context
//   the grid targets healing/Battle Medicine against.
import React from 'react';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useRecallKnowledge } from '../../../hooks/useRecallKnowledge';
import { useExploitVulnerability } from '../../../hooks/useExploitVulnerability';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { defenseDC } from '../../../utils/defense';
import { hydrateConditions } from '../../../data/pf2eConditions';
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
  const { focusEnemy, focusAlly } = useFocusTarget(charId);
  const { recordFor } = useRecallKnowledge();
  const { exploitFor } = useExploitVulnerability();
  // Ally state (read unconditionally to keep hook order stable; keys are inert
  // when no ally is focused).
  const allyId = focusAlly?.charId || 'none';
  const [allyHp] = useSyncedState(`cnmh_hp_${allyId}`, null);
  const [allyConditionsRaw] = useSyncedState(`cnmh_conditions_${allyId}`, []);

  // Focused ally (#429) — support context.
  if (focusAlly) {
    const conditions = hydrateConditions(allyConditionsRaw || []);
    return (
      <div className="cmd-focus cmd-focus--ally" role="region" aria-label={`Focused ally: ${focusAlly.name}`}>
        <span className="cmd-focus-name">{focusAlly.name}</span>
        {typeof allyHp === 'number' && (
          <div className="cmd-focus-stats">
            <span className="cmd-focus-stat">
              <span className="cmd-focus-stat-label">HP</span>
              <span className="cmd-focus-stat-value">{allyHp}</span>
            </span>
          </div>
        )}
        {conditions.length > 0 && (
          <div className="cmd-focus-weak">
            <span className="cmd-focus-stat-label">Conditions</span>
            <span className="cmd-focus-weak-values">
              {conditions.map((c) => `${c.name}${c.value ? ` ${c.value}` : ''}`).join(', ')}
            </span>
          </div>
        )}
      </div>
    );
  }

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

  // Resistances/immunities — same gating (#1014: damage triggers reveal types).
  const resistanceList = isIwrRevealed(rec, 'resistances')
    ? (defenses?.resistances || [])
    : (defenses?.resistances || []).filter((r) => rec.resistancesRevealed?.[r.type]);
  const immunityList = isIwrRevealed(rec, 'immunities')
    ? (defenses?.immunities || [])
    : (defenses?.immunities || []).filter((t) => rec.immunitiesRevealed?.[t]);

  // Active Exploit Vulnerability (#454) — the persistent "which foe have I
  // exploited" signal. Matches the acting character's exploit to this foe.
  const exploit = exploitFor(charId);
  const activeExploit = exploit?.targetEntryId === rkKeyFor(focusEnemy) ? exploit : null;
  const exploitText = activeExploit
    ? activeExploit.type === 'mortal'
      ? `Mortal Weakness ${activeExploit.weaknessType} ${activeExploit.value}`
      : `Personal Antithesis ${activeExploit.value}`
    : null;

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
      {resistanceList.length > 0 && (
        <div className="cmd-focus-weak" data-testid="cmd-focus-resist">
          <span className="cmd-focus-stat-label">Resist</span>
          <span className="cmd-focus-weak-values">
            {resistanceList.map((r) => `${r.type} ${r.value}`).join(', ')}
          </span>
        </div>
      )}
      {immunityList.length > 0 && (
        <div className="cmd-focus-weak" data-testid="cmd-focus-immune">
          <span className="cmd-focus-stat-label">Immune</span>
          <span className="cmd-focus-weak-values">{immunityList.join(', ')}</span>
        </div>
      )}
      {exploitText && (
        <div className="cmd-focus-weak cmd-focus-exploit" data-testid="cmd-focus-exploit">
          <span className="cmd-focus-stat-label">Exploited</span>
          <span className="cmd-focus-weak-values">{exploitText}</span>
        </div>
      )}
    </div>
  );
};

export default FocusBanner;
