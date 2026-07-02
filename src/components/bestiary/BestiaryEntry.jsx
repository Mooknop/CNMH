import React from 'react';
import TraitTag from '../shared/TraitTag';
import FieldNote from './FieldNote';
import { recallKnowledgeDC, defaultRecord } from '../../utils/recallKnowledge';
import {
  revealFlags,
  traitToAccent,
  classificationLabel,
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

// Reveal-gated creature stat block, shared by the in-combat BestiaryModal
// (variant="compact") and the out-of-combat /bestiary browser + GM editor
// preview (variant="full") so the party's learned knowledge renders identically.
//
// Visibility is driven entirely by `record` (a Recall Knowledge record) with a
// `revealAll` escape hatch — the browser passes `revealAll={isGm}` so the GM sees
// everything; the modal leaves it false so combat behavior is unchanged. `badge`
// is an optional node slotted after the RK-DC box (the modal passes its Exploit
// Vulnerability badge there to preserve layout; the browser passes nothing).
const BestiaryEntry = ({
  enemy,
  members = [enemy],
  record,
  revealAll = false,
  badge = null,
  variant = 'full',
  note = '',
  onEditNote = null,
}) => {
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
  // Per-type partial reveals for resistances/immunities (#1014 — a hidden IWR
  // that fires on applied damage), mirroring the weakness pattern above.
  const partialResistances = !resistancesRevealed
    ? (defenses?.resistances || []).filter((r) => rec.resistancesRevealed?.[r.type])
    : [];
  const anyResistanceRevealed = resistancesRevealed || partialResistances.length > 0;
  const shownResistances = resistancesRevealed ? (defenses?.resistances || []) : partialResistances;
  const partialImmunities = !immunitiesRevealed
    ? (defenses?.immunities || []).filter((t) => rec.immunitiesRevealed?.[t])
    : [];
  const anyImmunityRevealed = immunitiesRevealed || partialImmunities.length > 0;
  const shownImmunities = immunitiesRevealed ? (defenses?.immunities || []) : partialImmunities;

  const accent = traitToAccent(bestiary?.traits);
  const dexNum = dexNumber(monsters, enemy.creatureKey);
  const dexNo = formatDexNo(dexNum);
  const dexDigits = dexNum == null ? '0??' : String(dexNum).padStart(3, '0');
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

          {note && (
            <div className="dex-mini-foot">
              <FieldNote note={note} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full vertical dex device (the /bestiary entry + GM editor preview, #778) ──
  return (
    <div className="dex-full" data-testid="bm-detail" style={{ '--acc': accent }}>
      <span className="brk tl" aria-hidden="true" />
      <span className="brk tr" aria-hidden="true" />
      <span className="brk bl" aria-hidden="true" />
      <span className="brk br" aria-hidden="true" />

      {/* Status bar — specimen index + classification */}
      <div className="dex-bar">
        <span className="dex-no"><small>№</small>{dexDigits}</span>
        {identityRevealed && bestiary?.traits?.length > 0 && (
          <span className="dex-class">{classificationLabel(bestiary.traits)}</span>
        )}
      </div>

      {/* Hero art viewport — the creature art is the hero */}
      <div className="dex-hero metal">
        <div className="dex-hero-screen">
          {bestiary?.img ? (
            <img
              className="dex-hero-img"
              src={bestiary.img}
              alt={identityRevealed ? name : 'Unidentified creature'}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span className="dex-hero-noart" aria-hidden="true" />
          )}
          <span className="dex-hero-scan" aria-hidden="true" />
          <span className="dex-hero-glow" aria-hidden="true" />
          {identityRevealed && <span className="dex-hero-rune" aria-hidden="true">ᚹ</span>}
          <span className="dex-hero-tab">Specimen {dexNo}</span>
        </div>
      </div>

      {/* Identity */}
      <div className="dex-id">
        <h3 className="dex-name">
          {identityRevealed ? name : <Redacted width="8ch" label={`${name} name redacted`} />}
        </h3>
        {bestiary?.level != null && (
          <div className="dex-level">
            {identityRevealed ? `Creature ${bestiary.level}` : <Redacted width="6ch" />}
          </div>
        )}
        {bestiary?.traits?.length > 0 && (
          <div className="dex-traits">
            {identityRevealed
              ? bestiary.traits.map((t) => <TraitTag key={t} trait={t} />)
              : <Redacted width="10ch" />}
          </div>
        )}
      </div>

      {/* Readout grid */}
      <div className="dex-readout">
        <div className="dex-grid">
          <div className="dex-cell">
            <div className="k">AC</div>
            <div className="v">{acRevealed ? (defenses?.ac ?? '—') : <Redacted width="3ch" />}</div>
          </div>
          <div className="dex-cell">
            <div className="k">HP</div>
            <div className="v">
              {members.length > 1
                ? '—'
                : hpRevealed
                  ? (bestiary?.hp ? `${bestiary.hp.current} / ${bestiary.hp.max}` : '—')
                  : <Redacted width="3ch" />}
            </div>
          </div>
          <div className="dex-cell">
            <div className="k">Perception</div>
            <div className="v">
              {perceptionRevealed
                ? (bestiary?.perception != null ? signed(bestiary.perception) : '—')
                : <Redacted width="3ch" />}
            </div>
          </div>
          <div className="dex-cell">
            <div className="k">Speed</div>
            <div className="v">
              {speedRevealed
                ? (bestiary?.speed != null ? bestiary.speed : '—')
                : <Redacted width="3ch" />}
            </div>
          </div>
          <div className="dex-cell">
            <div className="k">Fort</div>
            <div className="v">{fortRevealed ? signed(defenses?.saves?.fortitude) : <Redacted width="3ch" />}</div>
          </div>
          <div className="dex-cell">
            <div className="k">Ref</div>
            <div className="v">{refRevealed ? signed(defenses?.saves?.reflex) : <Redacted width="3ch" />}</div>
          </div>
          <div className="dex-cell">
            <div className="k">Will</div>
            <div className="v">{willRevealed ? signed(defenses?.saves?.will) : <Redacted width="3ch" />}</div>
          </div>
          <div className="dex-cell">
            <div className="k">Resist</div>
            <div className="v dex-cell-sm">
              {anyResistanceRevealed
                ? (shownResistances.length
                    ? shownResistances.map((r) => `${r.type} ${r.value}`).join(', ')
                    : '—')
                : <Redacted width="3ch" />}
            </div>
          </div>
        </div>

        {/* Defenses line — immunities + accent-coloured weakness */}
        {(defenses?.immunities?.length > 0 || defenses?.weaknesses?.length > 0) && (
          <div className="dex-defs">
            {defenses?.immunities?.length > 0 && (
              <span className="d">
                <span className="l">Immunities</span>
                {anyImmunityRevealed
                  ? <span className="val">{shownImmunities.join(', ')}</span>
                  : <Redacted width="8ch" />}
              </span>
            )}
            {defenses?.weaknesses?.length > 0 && (
              <span className="d">
                <span className="l">Weakness</span>
                {anyWeaknessRevealed
                  ? shownWeaknesses.map((w) => (
                      <span key={w.type} className="wk">{w.type} {w.value}</span>
                    ))
                  : <Redacted width="8ch" />}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Per-token HP — only when several same-type tokens share this entry. */}
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

      {/* Lore — content from override if present, else imported; visibility gated by RK */}
      {descriptionRevealed
        ? effectiveDescription && <p className="dex-lore">{effectiveDescription}</p>
        : <Redacted block label="description redacted" />}

      {/* Footer — Recall DC device chip + the party field-note scrap */}
      {((rkDC != null && identityRevealed) || onEditNote || note) && (
        <div className="dex-foot">
          {rkDC != null && identityRevealed && (
            <div className="dex-dc" data-testid="bm-rk-dc">
              <span className="glyph" aria-hidden="true">ᛣ</span>
              <span className="n">{rkDC}</span>
              <span className="l">Recall<br />Knowledge</span>
            </div>
          )}
          <FieldNote note={note} editable={!!onEditNote} onSave={onEditNote} />
        </div>
      )}

      {badge}
    </div>
  );
};

export default BestiaryEntry;
