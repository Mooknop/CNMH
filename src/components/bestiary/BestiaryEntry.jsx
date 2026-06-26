import React from 'react';
import TraitTag from '../shared/TraitTag';
import { recallKnowledgeDC, defaultRecord } from '../../utils/recallKnowledge';
import {
  revealFlags,
  traitToAccent,
  dexNumber,
  formatDexNo,
} from '../../utils/bestiaryPresentation';
import { useContent } from '../../contexts/ContentContext';
import '../encounter/BestiaryModal.css';

// An inkblot stain in place of a hidden value. `block` renders the full-width
// description variant (gentler stain edge); otherwise `width` sizes the blot.
export const Redacted = ({ width = '4ch', label = 'redacted', block = false }) => (
  <span
    className={`bm-redacted${block ? ' bm-redacted--block' : ''}`}
    style={block ? undefined : { width }}
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
const BestiaryEntry = ({ enemy, members = [enemy], record, revealAll = false, badge = null, variant = 'full' }) => {
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
  const {
    identity:    identityRevealed,
    description: descriptionRevealed,
    hp:          hpRevealed,
    ac:          acRevealed,
    perception:  perceptionRevealed,
    speed:       speedRevealed,
    fortitude:   fortRevealed,
    reflex:      refRevealed,
    will:        willRevealed,
    immunities:  immunitiesRevealed,
    resistances: resistancesRevealed,
    weaknesses:  weaknessesFullyRevealed,
  } = revealFlags(rec, revealAll);
  const partialWeaknesses = !weaknessesFullyRevealed
    ? (defenses?.weaknesses || []).filter((w) => rec.weaknessesRevealed?.[w.type])
    : [];
  const anyWeaknessRevealed = weaknessesFullyRevealed || partialWeaknesses.length > 0;

  const accent = traitToAccent(bestiary?.traits);
  const dexNo = formatDexNo(dexNumber(monsters, enemy.creatureKey));
  const signed = (v) => (v == null ? '—' : v >= 0 ? `+${v}` : `${v}`);
  const shownWeaknesses = weaknessesFullyRevealed ? (defenses?.weaknesses || []) : partialWeaknesses;

  // ── Compact in-combat card (the Specimen Dex "mini" device, #777) ──────────
  // Art-forward horizontal card: name + Recall DC, trait/weakness chips, and a
  // 5-cell AC/HP/Fort/Ref/Will strip. Perception/Speed/immunities/resistances
  // are intentionally dropped here — the full /bestiary entry carries them.
  if (variant === 'compact') {
    return (
      <div className="dex-mini" data-testid="bm-detail" style={{ '--acc': accent }}>
        <span className="brk tl" aria-hidden="true" />
        <span className="brk br" aria-hidden="true" />

        <div className="dex-mini-art metal">
          <div className="dex-mini-screen">
            <span className="dex-mini-no">{dexNo}</span>
            {bestiary?.img ? (
              <img
                className="dex-mini-img"
                src={bestiary.img}
                alt={identityRevealed ? name : 'Unidentified creature'}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span className="dex-mini-noart" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="dex-mini-body">
          <div className="dex-mini-name">
            {identityRevealed ? name : <Redacted width="8ch" label={`${name} name redacted`} />}
          </div>
          <div className="dex-mini-sub">
            {bestiary?.level != null && (
              identityRevealed ? `Creature ${bestiary.level}` : <Redacted width="6ch" />
            )}
            {rkDC != null && identityRevealed && (
              <span data-testid="bm-rk-dc" className="dex-mini-dc"> · Recall DC {rkDC}</span>
            )}
          </div>

          {badge}

          {(identityRevealed || anyWeaknessRevealed) && (
            <div className="dex-mini-traits">
              {identityRevealed && (bestiary?.traits || []).map((t) => <TraitTag key={t} trait={t} />)}
              {anyWeaknessRevealed && shownWeaknesses.map((w) => (
                <span key={w.type} className="dex-mini-weak">weak {w.type} {w.value}</span>
              ))}
            </div>
          )}

          <div className="dex-mini-stats">
            <div className="st">
              <div className="k">AC</div>
              <div className="v">{acRevealed ? (defenses?.ac ?? '—') : <Redacted width="3ch" />}</div>
            </div>
            <div className="st">
              <div className="k">HP</div>
              <div className="v">
                {members.length > 1
                  ? '—'
                  : hpRevealed
                    ? (bestiary?.hp ? `${bestiary.hp.current} / ${bestiary.hp.max}` : '—')
                    : <Redacted width="3ch" />}
              </div>
            </div>
            <div className="st">
              <div className="k">Fort</div>
              <div className="v">{fortRevealed ? signed(defenses?.saves?.fortitude) : <Redacted width="3ch" />}</div>
            </div>
            <div className="st">
              <div className="k">Ref</div>
              <div className="v">{refRevealed ? signed(defenses?.saves?.reflex) : <Redacted width="3ch" />}</div>
            </div>
            <div className="st">
              <div className="k">Will</div>
              <div className="v">{willRevealed ? signed(defenses?.saves?.will) : <Redacted width="3ch" />}</div>
            </div>
          </div>

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

          {descriptionRevealed && effectiveDescription && (
            <p className="dex-mini-lore">{effectiveDescription}</p>
          )}
        </div>
      </div>
    );
  }

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
        : <Redacted block label="description redacted" />
      }
    </div>
  );
};

export default BestiaryEntry;
