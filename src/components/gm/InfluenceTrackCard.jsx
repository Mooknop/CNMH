import React from 'react';
import {
  entriesFor,
  effectiveDc,
  skillLabel,
} from '../../utils/victoryPoints';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import ActionSymbol from '../shared/ActionSymbol';
import './SkillChallengePanel.css';

/**
 * GM card for an influence track (#205) — the state the GM would otherwise
 * juggle in-head while roleplaying the NPC: influence points vs tier notes,
 * a one-tap ±2 DC stepper for resistances/weaknesses, reveal toggles per
 * influence skill, and the scene round (advanced manually when no combat
 * encounter is running; combat rounds drive the cadence otherwise).
 *
 * Points and tier notes render here only — players never see totals.
 */
const InfluenceTrackCard = ({
  challenge,
  roster,
  results,
  round,
  pool,
  encounterActive,
  onEnd,
  onNudge,
  onStepDc,
  onToggleReveal,
  onNextRound,
}) => {
  const targets = (challenge.targetIds || [])
    .map((id) => roster.find((c) => c.id === id))
    .filter(Boolean);

  const targetValues = targets.map((c) => results[c.id]);
  const vpSum = targetValues.reduce(
    (sum, v) => sum + entriesFor(v, challenge.id).reduce((s, e) => s + (e.vp ?? 0), 0),
    0
  );

  const revealed = new Set(challenge.revealed || []);
  const tiers = Array.isArray(challenge.tiers) ? challenge.tiers : [];
  const discoveries = Array.isArray(challenge.discoveries) ? challenge.discoveries : [];
  const dcMod = challenge.dcModifier ?? 0;
  const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

  const submittedCount = targets.filter((c) =>
    entriesFor(results[c.id], challenge.id).some((e) => e.round === round && !e.discovery)
  ).length;

  return (
    <section
      className="gm-dash-panel gm-vp-panel gm-influence-card"
      aria-label={`Influence: ${challenge.name}`}
      data-testid={`vp-track-${challenge.id}`}
    >
      <div className="gm-vp-header">
        <h2>{challenge.name}</h2>
        <span className="gm-vp-badges">
          <span className="gm-vp-mode-chip">influence</span>
          {challenge.actionCost > 0 && <ActionSymbol cost={challenge.actionCost} />}
        </span>
        <span className="gm-vp-total" aria-label={`${challenge.name} influence points`}>
          {pool} pts
        </span>
      </div>

      <div className="gm-influence-round">
        <span aria-label={`${challenge.name} round`}>
          Round {round}{challenge.roundsTotal > 0 ? ` / ${challenge.roundsTotal}` : ''}
        </span>
        {!encounterActive && (
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onNextRound(challenge)}
            aria-label={`${challenge.name} next round`}
          >
            Next Round
          </button>
        )}
      </div>

      {tiers.length > 0 && (
        <ul className="gm-influence-tiers" aria-label={`${challenge.name} thresholds`}>
          {tiers.map((t) => (
            <li key={t.at} data-reached={pool >= t.at || undefined}>
              <span className="gm-influence-tier-at">{t.at}</span>
              <span className="gm-influence-tier-note">{t.note}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="gm-vp-controls">
        <div className="gm-vp-nudges" role="group" aria-label={`${challenge.name} DC modifier`}>
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onStepDc(challenge, -2)}
            aria-label={`${challenge.name} DCs -2`}
          >
            −2
          </button>
          <span className="gm-influence-dcmod" data-hot={dcMod !== 0 || undefined}>
            DCs {fmtMod(dcMod)}
          </span>
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onStepDc(challenge, +2)}
            aria-label={`${challenge.name} DCs +2`}
          >
            +2
          </button>
        </div>
        <div className="gm-vp-nudges">
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onNudge(challenge, -1, vpSum)}
            aria-label={`Nudge ${challenge.name} down`}
          >
            −1
          </button>
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onNudge(challenge, +1, vpSum)}
            aria-label={`Nudge ${challenge.name} up`}
          >
            +1
          </button>
        </div>
      </div>

      <ul className="gm-influence-skills" aria-label={`${challenge.name} influence skills`}>
        {(challenge.skills || []).map((o) => (
          <li key={o.skill}>
            <span className="gm-vp-skill">{skillLabel(o.skill)}</span>
            <span className="gm-vp-roll">DC {effectiveDc(challenge, o.dc)}</span>
            <button
              type="button"
              className="gm-influence-reveal"
              aria-pressed={revealed.has(o.skill)}
              onClick={() => onToggleReveal(challenge, o.skill)}
              aria-label={`${revealed.has(o.skill) ? 'Hide' : 'Reveal'} ${skillLabel(o.skill)} for ${challenge.name}`}
            >
              {revealed.has(o.skill) ? '★ revealed' : '☆ hidden'}
            </button>
          </li>
        ))}
      </ul>

      {discoveries.length > 0 && (
        <p className="gm-influence-discoveries">
          Discovery: {discoveries.map((d) => `${skillLabel(d.skill)} ${effectiveDc(challenge, d.dc)}`).join(', ')}
        </p>
      )}

      {challenge.resistNote && (
        <p className="gm-influence-resist" aria-label={`${challenge.name} resistances`}>
          {challenge.resistNote}
        </p>
      )}

      <ul className="gm-vp-list" aria-label={`${challenge.name} submissions`}>
        {targets.map((c) => {
          const roundEntries = entriesFor(results[c.id], challenge.id)
            .filter((e) => e.round === round);
          if (!roundEntries.length) {
            return (
              <li className="gm-vp-row" key={c.id}>
                <span className="gm-vp-name">{c.name}</span>
                <span className="gm-vp-waiting">Waiting…</span>
              </li>
            );
          }
          return roundEntries.map((e, i) => (
            <li className="gm-vp-row" key={`${c.id}-${i}`}>
              <span className="gm-vp-name">{c.name}</span>
              {e.discovery && <span className="gm-vp-mode-chip">discovery</span>}
              <span className="gm-vp-skill">{skillLabel(e.skill)}</span>
              <span className="gm-vp-roll">{e.total}</span>
              <span className="gm-vp-degree" data-degree={e.degree}>
                {DEGREE_LABELS[e.degree] ?? e.degree}
              </span>
              {!e.discovery && (
                <span className="gm-vp-delta">
                  {e.vp >= 0 ? '+' : ''}{e.vp}
                </span>
              )}
            </li>
          ));
        })}
      </ul>

      <div className="gm-vp-footer">
        <span className="gm-vp-count">
          {submittedCount}/{targets.length} influenced this round
        </span>
        <button
          type="button"
          className="gm-vp-end-btn"
          onClick={() => onEnd(challenge, pool, false)}
          aria-label={`End ${challenge.name}`}
        >
          End Challenge
        </button>
      </div>
    </section>
  );
};

export default InfluenceTrackCard;
