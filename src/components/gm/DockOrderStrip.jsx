import React, { useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useSummons } from '../../hooks/useSummons';
import { useContent } from '../../contexts/ContentContext';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { monogram } from '../encounter/commandsheet/Dossier';
import PersistentChip from '../encounter/PersistentChip';
import BystanderChip from '../encounter/BystanderChip';
import GmReactionBadge from './GmReactionBadge';
import './DockOrderStrip.css';

// Dock initiative rail (#1556 S2) — the order strip restyled into the
// battle-mode left rail: medallion, name + kind, HP micro-bar, init value,
// current-turn glow, and click-to-stage on PC rows (absorbing the old pin
// chips — staging stays per-GM-client local state owned by the page).
// Everything the horizontal strip carried rides along: enemy condition chips,
// persistent/bystander badges, PC reaction state, inline actor-map assignment
// ("Not a PC" stores the null sentinel so ActorMapSync never re-matches a
// decided slot), and summon HP + Dismiss.

// HP triage per the design: >50% verdant, 25–50% gold, <25% peril.
const hpTone = (pct) => (pct > 50 ? 'ok' : pct >= 25 ? 'warn' : 'low');

const HpBar = ({ current, max, label }) => {
  if (!(max > 0)) return null;
  const pct = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  return (
    <span className="dock-order-hp" style={{ '--hp-pct': `${pct}%` }}>
      <span className={`dock-order-hp-track is-${hpTone(pct)}`} aria-hidden="true">
        <span className="dock-order-hp-fill" />
      </span>
      <span className="dock-order-hp-text" aria-label={label}>
        {current}/{max}
      </span>
    </span>
  );
};

// Per-PC vitals need a hook subscription, so each PC row hosts its own child.
const PcHpBar = ({ charId, name, maxHp }) => {
  const { liveState } = useCharacterLiveState(charId);
  const hp = liveState?.hp;
  return (
    <HpBar
      current={hp?.current ?? maxHp ?? 0}
      max={hp?.max ?? maxHp ?? 0}
      label={`${name} hp`}
    />
  );
};

const condLabel = (c) => {
  const base = String(c.id || '')
    .replace(/-/g, ' ')
    .replace(/^./, (ch) => ch.toUpperCase());
  return c.value != null ? `${base} ${c.value}` : base;
};

const DockOrderStrip = ({ stagedCharId = null, onStage = null, onFollow = null }) => {
  const { encounter, actorMap, setActorMap } = useEncounter();
  const { effectsFor } = useEnemyEffects();
  const { removeSummon } = useSummons();
  const { characters, theme } = useContent();
  const [editingEntryId, setEditingEntryId] = useState(null);

  const phase = encounter?.phase || 'idle';
  const order = encounter?.order || [];
  const currentIndex = encounter?.currentTurnIndex ?? 0;
  if (phase === 'idle' || order.length === 0) return null;

  const roster = characters || [];
  const canStage = typeof onStage === 'function';
  const accentFor = (charId) => {
    const idx = roster.findIndex((c) => c.id === charId);
    if (idx < 0) return null;
    return theme?.accentOverrides?.[charId] || getCharacterColor(idx);
  };

  const assign = (foundryActorId, charId) => {
    setActorMap((prev) => {
      const next = { ...(prev || {}) };
      next[foundryActorId] = charId === '' ? null : charId;
      return next;
    });
    setEditingEntryId(null);
  };

  return (
    <aside className="dock-order" role="group" aria-label="Stage a character">
      <div className="dock-order-head">
        <span className="dock-order-head-label">Initiative</span>
        {canStage && (
          <button
            type="button"
            className={`dock-order-follow${stagedCharId ? '' : ' is-active'}`}
            aria-pressed={!stagedCharId}
            onClick={() => onFollow && onFollow()}
          >
            Follow turn
          </button>
        )}
      </div>
      <div className="dock-order-list" role="list" aria-label="Initiative order">
        {order.map((e, i) => {
          const current = phase === 'in-progress' && i === currentIndex;
          const decided = e.foundryActorId ? actorMap?.[e.foundryActorId] !== undefined : true;
          const showSelect = !!e.foundryActorId && (!decided || editingEntryId === e.entryId);
          const enemyConditions = e.kind === 'enemy' ? (effectsFor(e.entryId).conditions || []) : [];
          const ally = e.kind === 'enemy' && e.disposition === 1;
          const kindClass = e.kind === 'summon'
            ? 'is-summon'
            : e.kind === 'enemy'
              ? (ally ? 'is-ally' : 'is-enemy')
              : 'is-pc';
          const character = e.kind === 'pc' && e.charId
            ? roster.find((c) => c.id === e.charId)
            : null;
          const stageable = canStage && !!character;
          const staged = stageable && stagedCharId === e.charId;
          const accent = character ? accentFor(e.charId) : null;
          const kindTag = e.kind === 'summon'
            ? 'Summon'
            : e.kind === 'enemy'
              ? (ally ? 'Ally' : 'Enemy')
              : character?.class || 'PC';
          const main = (
            <>
              <span className="dock-order-medal" aria-hidden="true">
                {monogram(e.name)}
              </span>
              <span className="dock-order-mid">
                <span className="dock-order-name-row">
                  {current && <span className="dock-order-marker" aria-hidden="true">▶</span>}
                  <span className="dock-order-name">{e.name}</span>
                  <span className="dock-order-kind">{kindTag}</span>
                </span>
                {character ? (
                  <PcHpBar charId={e.charId} name={e.name} maxHp={character.maxHp} />
                ) : (
                  <HpBar
                    current={e.bestiary?.hp?.current ?? 0}
                    max={e.bestiary?.hp?.max ?? 0}
                    label={`${e.name} hp`}
                  />
                )}
              </span>
              <span className="dock-order-init">
                {e.initiative === null || e.initiative === undefined ? '—' : e.initiative}
              </span>
            </>
          );
          return (
            <div
              key={e.entryId}
              role="listitem"
              className={`dock-order-entry ${kindClass}${current ? ' is-current' : ''}${staged ? ' is-staged' : ''}`}
              style={accent ? { '--medal-accent': accent } : undefined}
              data-testid={`dock-order-${e.entryId}`}
            >
              {stageable ? (
                <button
                  type="button"
                  className="dock-order-main"
                  aria-label={`Stage ${e.name}`}
                  aria-pressed={staged}
                  onClick={() => onStage(e.charId)}
                >
                  {main}
                </button>
              ) : (
                <div className="dock-order-main">{main}</div>
              )}
              <span className="dock-order-badges">
                {enemyConditions.length > 0 && (
                  <span
                    className="dock-order-conds"
                    role="group"
                    aria-label={`${e.name}: ${enemyConditions.length} applied conditions`}
                  >
                    {enemyConditions.map((c) => (
                      <span key={c.id} className="dock-order-chip">{condLabel(c)}</span>
                    ))}
                  </span>
                )}
                <PersistentChip entry={e} />
                <BystanderChip entry={e} />
                {phase === 'in-progress' && e.kind === 'pc' && e.charId && (
                  <GmReactionBadge charId={e.charId} name={e.name} />
                )}
                {!!e.foundryActorId && decided && !showSelect && (
                  <button
                    type="button"
                    className="dock-order-edit"
                    aria-label={`Reassign ${e.name}`}
                    onClick={() => setEditingEntryId(e.entryId)}
                  >
                    ✎
                  </button>
                )}
                {e.kind === 'summon' && (
                  <button
                    type="button"
                    className="dock-order-edit"
                    aria-label={`Dismiss ${e.name}`}
                    onClick={() => removeSummon(e.entryId)}
                  >
                    Dismiss
                  </button>
                )}
              </span>
              {showSelect && (
                <select
                  className="dock-order-assign"
                  aria-label={`assign-${e.entryId}`}
                  value={actorMap?.[e.foundryActorId] ?? ''}
                  onChange={(ev) => assign(e.foundryActorId, ev.target.value)}
                >
                  <option value="">Not a PC</option>
                  {roster.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default DockOrderStrip;
