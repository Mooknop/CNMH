import React from 'react';
import { useEffects } from '../../hooks/useEffects';
import { useSustains } from '../../hooks/useSustains';
import { useSpellCounters } from '../../hooks/useSpellCounters';
import { useStance } from '../../hooks/useStance';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import './EffectsPanel.css';
import { expiryLabel, expiryLabelSecs } from '../../utils/expiry';
import { toGameSeconds } from '../../utils/gameTime';
import { IMMUNITY_EFFECT_ID } from '../../utils/treatWounds';
import { ABILITY_IMMUNITY_EFFECT_ID } from '../../utils/immunity';
import { withWhetstoneArmedVs } from '../../utils/whetstone';
import { RELAY, globalKey } from '../../sync/keys';

const FROM_NAME_EFFECT_IDS = [IMMUNITY_EFFECT_ID, ABILITY_IMMUNITY_EFFECT_ID];

const EffectsPanel = ({ charId, themeColor }) => {
  const { effects, removeEffect } = useEffects(charId);
  const { sustains, end: endSustain } = useSustains(charId);
  const { counters, adjust: adjustCounter, end: endCounter } = useSpellCounters(charId);
  const { active: stanceActive, stanceName, leave: leaveStance } = useStance(charId);
  const { effects: effectCatalog, characters } = useContent();
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const getEffect = (id) => (effectCatalog || []).find((e) => e.id === id) || null;
  const getCharName = (id) => (characters || []).find((c) => c.id === id)?.name || null;
  // Armable whetstone bonuses (#1216 — Chivalric Emblem): the player arms the
  // effect against the enemy that downed/crit an ally (witnessing is a table
  // call); the strike surface then offers the bonus vs that enemy.
  const [, setRawEffects] = useSyncedState(`cnmh_effects_${charId}`, []);
  const [encounterState] = useSyncedState(globalKey(RELAY.ENCOUNTER), null);
  const enemyEntries = (encounterState?.order || []).filter((e) => e.kind === 'enemy');
  const armVs = (entryId, target) => setRawEffects((cur) => withWhetstoneArmedVs(cur, entryId, target));

  const stanceCount = stanceActive ? 1 : 0;
  if (effects.length === 0 && sustains.length === 0 && counters.length === 0 && !stanceActive) return null;

  return (
    <div className="effects-panel" aria-label="Active effects">
      <div className="effects-panel-header">
        <span className="effects-panel-title">
          EFFECTS
        </span>
        <span className="effects-panel-count">{effects.length + sustains.length + counters.length + stanceCount}</span>
      </div>
      <ul className="effects-panel-list">
        {effects.map((entry) => {
          const def = getEffect(entry.effectId);
          // Inline effects (#1001 S2) have no catalog def — fall back to the
          // entry's own name (e.g. "Energy Ablation (fire)") before the raw id.
          const baseName = def ? def.name : (entry.name || entry.effectId);
          // Ability immunity carries its source ability ("Immune: Guidance").
          const name = entry.effectId === ABILITY_IMMUNITY_EFFECT_ID && entry.source
            ? `${baseName}: ${entry.source}`
            : baseName;
          // Clock-based expiry (immunity timers) takes precedence over the
          // encounter-boundary label when present.
          const expLabel = typeof entry.expireAtSecs === 'number'
            ? expiryLabelSecs(entry.expireAtSecs, nowSecs)
            : expiryLabel(entry.expireAt);
          const sourceName = FROM_NAME_EFFECT_IDS.includes(entry.effectId) && entry.appliedBy
            ? getCharName(entry.appliedBy)
            : null;
          const displayName = sourceName ? `${name} — from ${sourceName}` : name;
          // Foundry-sourced effects (#455) are owned by Foundry's own duration /
          // aura engine — show them read-only (no × ) with a tag, mirroring how
          // sustained spells render below.
          const armable = !entry.fromFoundry && entry.whetstone?.effect?.armedBonus;
          const armedVs = entry.whetstone?.armedVs || null;
          return (
            <li key={entry.id} className="effects-panel-item">
              <span className="effects-panel-name">{displayName}</span>
              {armable && (armedVs ? (
                <button
                  className="effects-panel-adjust"
                  onClick={() => armVs(entry.id, null)}
                  title={`Armed vs ${armedVs.name} — click to disarm`}
                >
                  vs {armedVs.name} ×
                </button>
              ) : (
                <select
                  className="effects-panel-arm"
                  value=""
                  aria-label={`Arm ${displayName} against an enemy`}
                  title={entry.whetstone.effect.armedBonus.trigger || 'Arm against the triggering enemy'}
                  onChange={(e) => {
                    const target = enemyEntries.find((en) => en.entryId === e.target.value);
                    if (target) armVs(entry.id, { entryId: target.entryId, name: target.name });
                  }}
                >
                  <option value="">Arm vs…</option>
                  {enemyEntries.map((en) => (
                    <option key={en.entryId} value={en.entryId}>{en.name}</option>
                  ))}
                </select>
              ))}
              {expLabel && (
                <span className="effects-panel-expiry" title={`Expires: ${expLabel}`}>
                  {expLabel}
                </span>
              )}
              {entry.fromFoundry ? (
                <span className="effects-panel-tag" title="Applied in Foundry">aura</span>
              ) : (
                <button
                  className="effects-panel-remove"
                  onClick={() => removeEffect(entry.id)}
                  aria-label={`Remove ${displayName}`}
                  title={`Remove ${displayName}`}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
        {/* Sustained spells (#220) — visible off-turn; End mirrors the caster's
            turn prompt by writing the same cnmh_sustains_<charId> ledger. */}
        {sustains.map((s) => (
          <li key={s.id} className="effects-panel-item effects-panel-item--sustain">
            <span className="effects-panel-name">{s.spellName}</span>
            <span className="effects-panel-tag" title="Sustained spell">sustained</span>
            <button
              className="effects-panel-remove"
              onClick={() => endSustain(s.id)}
              aria-label={`End ${s.spellName}`}
              title={`End ${s.spellName}`}
            >
              ×
            </button>
          </li>
        ))}
        {/* Per-spell counters (#220) — Mirror Image images, Bless radius. */}
        {counters.map((c) => (
          <li key={c.id} className="effects-panel-item effects-panel-item--counter">
            <span className="effects-panel-name">{c.spellName}</span>
            <span className="effects-panel-tag">{c.value}{c.unit ? ` ${c.unit}` : ''}</span>
            {c.kind === 'images' ? (
              <button
                className="effects-panel-adjust"
                onClick={() => adjustCounter(c.id, -1)}
                aria-label={`Destroy an image of ${c.spellName}`}
                title="An image is destroyed"
              >
                Pop
              </button>
            ) : (
              <button
                className="effects-panel-adjust"
                onClick={() => adjustCounter(c.id, c.step)}
                aria-label={`Grow ${c.spellName} by ${c.step} ${c.unit}`}
                title={`+${c.step} ${c.unit}`}
              >
                +{c.step}
              </button>
            )}
            <button
              className="effects-panel-remove"
              onClick={() => endCounter(c.id)}
              aria-label={`End ${c.spellName}`}
              title={`End ${c.spellName}`}
            >
              ×
            </button>
          </li>
        ))}
        {/* Active stance (#224) — the voluntary-leave path; auto-clears at
            encounter end via the cnmh_stance_<charId> sweep in endEncounter. */}
        {stanceActive && (
          <li className="effects-panel-item effects-panel-item--stance">
            <span className="effects-panel-name">{stanceName || 'Stance'}</span>
            <span className="effects-panel-tag" title="Active stance">stance</span>
            <button
              className="effects-panel-remove"
              onClick={() => leaveStance()}
              aria-label={`Leave ${stanceName || 'stance'}`}
              title={`Leave ${stanceName || 'stance'}`}
            >
              ×
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};

export default EffectsPanel;
