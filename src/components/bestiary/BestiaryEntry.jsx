import React from 'react';
import TraitTag from '../shared/TraitTag';
import { recallKnowledgeDC, defaultRecord } from '../../utils/recallKnowledge';
import { useContent } from '../../contexts/ContentContext';
import '../encounter/BestiaryModal.css';

// A solid redacted bar in place of a hidden value.
export const Redacted = ({ width = '4ch', label = 'redacted' }) => (
  <span
    className="bm-redacted"
    style={{ width }}
    aria-label={label}
    aria-hidden="true"
  />
);

export const StatRow = ({ label, value, revealed, redactWidth = '4ch' }) => {
  if (!revealed) {
    return (
      <div className="bm-stat-row">
        <span className="bm-stat-label">{label}</span>
        <Redacted width={redactWidth} />
      </div>
    );
  }
  return value != null ? (
    <div className="bm-stat-row">
      <span className="bm-stat-label">{label}</span>
      <span className="bm-stat-value">{value}</span>
    </div>
  ) : null;
};

export const SignedMod = ({ value, revealed }) => {
  if (!revealed) return <Redacted width="3ch" />;
  if (value == null) return <span className="bm-stat-value">—</span>;
  return <span className="bm-stat-value">{value >= 0 ? `+${value}` : value}</span>;
};

// Reveal-gated creature stat block, shared verbatim by the in-combat BestiaryModal
// and the out-of-combat /bestiary browser (#334) so both render identically.
//
// Visibility is driven entirely by `record` (a Recall Knowledge record) with a
// `revealAll` escape hatch — the browser passes `revealAll={isGm}` so the GM sees
// everything; the modal leaves it false so combat behavior is unchanged. `badge`
// is an optional node slotted after the RK-DC box (the modal passes its Exploit
// Vulnerability badge there to preserve layout; the browser passes nothing).
const BestiaryEntry = ({ enemy, members = [enemy], record, revealAll = false, badge = null }) => {
  const { bestiary, defenses, name } = enemy;
  const { monsters } = useContent();
  const rec = record || defaultRecord();

  // Override controls content; RK controls visibility.
  // override present → use descriptionOverride (empty = GM redacted);
  // no override → fall back to imported bestiary.description.
  const monsterOverride = enemy.creatureKey
    ? (monsters || []).find((m) => String(m.id) === String(enemy.creatureKey))
    : null;
  const effectiveDescription = monsterOverride
    ? monsterOverride.descriptionOverride
    : bestiary?.description;

  if (!bestiary && !defenses) {
    return (
      <div className="bm-detail" data-testid="bm-detail">
        <h3 className="bm-detail-name">{name}</h3>
        <p className="bm-no-statblock">No Foundry stat block available for this combatant.</p>
      </div>
    );
  }

  const rkDC = bestiary?.level != null
    ? recallKnowledgeDC(bestiary.level, bestiary.rarity)
    : null;

  // Granular reveal flags — `revealAll` (GM in the browser) unlocks everything.
  const identityRevealed     = revealAll || !!(rec.identity);
  const descriptionRevealed  = revealAll || !!(rec.description);
  const hpRevealed           = revealAll || !!(rec.hp);
  const acRevealed           = revealAll || !!(rec.ac);
  const perceptionRevealed   = revealAll || !!(rec.perception);
  const speedRevealed        = revealAll || !!(rec.speed);
  const fortRevealed         = revealAll || !!(rec.saves?.fortitude);
  const refRevealed          = revealAll || !!(rec.saves?.reflex);
  const willRevealed         = revealAll || !!(rec.saves?.will);
  const immunitiesRevealed   = revealAll || !!(rec.iwr?.immunities);
  const resistancesRevealed  = revealAll || !!(rec.iwr?.resistances);

  // Partial weakness reveal from Exploit Vulnerability (per-type).
  const weaknessesFullyRevealed = revealAll || !!(rec.iwr?.weaknesses);
  const partialWeaknesses = !weaknessesFullyRevealed
    ? (defenses?.weaknesses || []).filter((w) => rec.weaknessesRevealed?.[w.type])
    : [];
  const anyWeaknessRevealed = weaknessesFullyRevealed || partialWeaknesses.length > 0;

  return (
    <div className="bm-detail" data-testid="bm-detail">
      {/* Image — always visible */}
      {bestiary?.img && (
        <div className="bm-img-wrap">
          <img
            className="bm-creature-img"
            src={bestiary.img}
            alt={name}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Name — redacted until identity revealed */}
      <h3 className="bm-detail-name">
        {identityRevealed ? name : <Redacted width="8ch" label={`${name} name redacted`} />}
      </h3>

      {bestiary?.level != null && (
        <div className="bm-level">
          {identityRevealed ? `Creature ${bestiary.level}` : <Redacted width="6ch" />}
        </div>
      )}

      {/* Traits */}
      {bestiary?.traits?.length > 0 && (
        <div className="bm-traits">
          {identityRevealed
            ? bestiary.traits.map((t) => <TraitTag key={t} trait={t} />)
            : <Redacted width="10ch" />}
        </div>
      )}

      {/* RK DC box — shown once identity is known */}
      {rkDC != null && identityRevealed && (
        <div className="bm-rk-dc" data-testid="bm-rk-dc">
          <span className="bm-rk-label">Recall Knowledge DC</span>
          <span className="bm-rk-value">{rkDC}</span>
          {bestiary.rarity !== 'common' && (
            <span className="bm-rarity-tag">{bestiary.rarity}</span>
          )}
        </div>
      )}

      {badge}

      <div className="bm-stats-grid">
        <StatRow label="AC"   value={defenses?.ac ?? null} revealed={acRevealed} redactWidth="3ch" />
        {bestiary?.hp != null && members.length === 1 && (
          <StatRow
            label="HP"
            value={`${bestiary.hp.current} / ${bestiary.hp.max}`}
            revealed={hpRevealed}
          />
        )}
        {/* Multiple same-type tokens: HP is per-token, so list each one. */}
        {members.length > 1 && (
          <div className="bm-hp-list" data-testid="bm-hp-list">
            <span className="bm-stat-label">HP</span>
            {hpRevealed ? (
              <ul className="bm-hp-tokens">
                {members.map((m) => (
                  <li key={m.entryId} className="bm-hp-token">
                    <span className="bm-hp-token-name">{m.name}</span>
                    <span className="bm-stat-value">
                      {m.bestiary?.hp != null
                        ? `${m.bestiary.hp.current} / ${m.bestiary.hp.max}`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Redacted width="6ch" />
            )}
          </div>
        )}
        {bestiary?.perception != null && (
          <div className="bm-stat-row">
            <span className="bm-stat-label">Perception</span>
            <SignedMod value={bestiary.perception} revealed={perceptionRevealed} />
          </div>
        )}
        {bestiary?.speed != null && (
          <StatRow label="Speed" value={`${bestiary.speed} ft.`} revealed={speedRevealed} />
        )}
      </div>

      {/* Saves */}
      {defenses?.saves && (
        <div className="bm-saves">
          <span className="bm-saves-label">Saves</span>
          <div className="bm-saves-row">
            <span className="bm-save-item">
              <span className="bm-save-name">Fort</span>
              <SignedMod value={defenses.saves.fortitude} revealed={fortRevealed} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Ref</span>
              <SignedMod value={defenses.saves.reflex} revealed={refRevealed} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Will</span>
              <SignedMod value={defenses.saves.will} revealed={willRevealed} />
            </span>
          </div>
        </div>
      )}

      {/* IWR */}
      {defenses?.immunities?.length > 0 && immunitiesRevealed && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <span className="bm-iwr-values">{defenses.immunities.join(', ')}</span>
        </div>
      )}
      {defenses?.immunities?.length > 0 && !immunitiesRevealed && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <Redacted width="8ch" />
        </div>
      )}

      {defenses?.resistances?.length > 0 && resistancesRevealed && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <span className="bm-iwr-values">
            {defenses.resistances.map((r) => `${r.type} ${r.value}`).join(', ')}
          </span>
        </div>
      )}
      {defenses?.resistances?.length > 0 && !resistancesRevealed && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <Redacted width="8ch" />
        </div>
      )}

      {/* Weaknesses — supports full reveal (iwr.weaknesses) or partial (weaknessesRevealed) */}
      {defenses?.weaknesses?.length > 0 && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Weaknesses</span>
          {anyWeaknessRevealed ? (
            <span className="bm-iwr-values">
              {weaknessesFullyRevealed
                ? defenses.weaknesses.map((w) => `${w.type} ${w.value}`).join(', ')
                : partialWeaknesses.map((w) => `${w.type} ${w.value}`).join(', ')}
            </span>
          ) : (
            <Redacted width="8ch" />
          )}
        </div>
      )}

      {/* Description — content from override if present, else imported; visibility gated by RK */}
      {descriptionRevealed
        ? effectiveDescription && (
            <p className="bm-description">{effectiveDescription}</p>
          )
        : <Redacted width="100%" label="description redacted" />
      }
    </div>
  );
};

export default BestiaryEntry;
