import React from 'react';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { useContent } from '../../contexts/ContentContext';
import { getFocusInfo } from '../../utils/SpellUtils';
import { monogram } from '../encounter/commandsheet/Dossier';
import './DockPcVitals.css';

// PC spotlight identity + vitals card (#1556 S4) — the design's chrome over
// the mirrored player deck. READ-ONLY: every value is the same live state the
// deck below edits (HP/focus via cnmh_* keys, AC/saves from the useCharacter
// spine), so this card adds a glanceable header without owning any writes.

const SAVE_LABEL = { fortitude: 'Fort', reflex: 'Ref', will: 'Will' };
const fmtMod = (v) => (v >= 0 ? `+${v}` : `${v}`);

const DockPcVitals = ({ character, model, pinned = false }) => {
  const { liveState } = useCharacterLiveState(character.id);
  const { effects: effectCatalog } = useContent();

  const hp = liveState?.hp;
  const current = hp?.current ?? character.maxHp ?? 0;
  const max = hp?.max ?? character.maxHp ?? 0;
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const tone = pct > 50 ? 'is-ok' : pct >= 25 ? 'is-warn' : 'is-low';

  const ac = model?.armorClass?.value ?? model?.ac ?? null;
  const saves = model?.saves || {};

  // Focus pool: the live key stores SPENT points; max comes off the sheet.
  const focusMax = getFocusInfo(character)?.max ?? null;
  const focusSpent = Number(liveState?.focus) || 0;
  const focusLeft = focusMax != null ? Math.max(0, focusMax - focusSpent) : 0;

  // Active effect chips — names off the catalog when the entry only carries
  // an effectId; capped so a buff-stacked PC can't flood the header.
  const effectChips = (Array.isArray(liveState?.effects) ? liveState.effects : [])
    .map((e) => {
      const catalogName = e?.effectId
        ? (effectCatalog || []).find((c) => c.id === e.effectId)?.name
        : null;
      return e?.name || catalogName || e?.source || null;
    })
    .filter(Boolean)
    .slice(0, 6);

  const classLine = [
    model?.characterClass,
    character.level != null ? `Level ${character.level}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="dock-pc-card" data-testid="dock-pc-vitals">
      <header className="dock-pc-head">
        <span className="dock-pc-medal" aria-hidden="true">{monogram(character.name)}</span>
        <div className="dock-pc-id">
          <span className="gm-dock-acting">
            <span className="gm-dock-acting-kicker">Acting as</span>
            <span className="gm-dock-acting-name">{character.name}</span>
            {pinned && <span className="gm-dock-pin-tag">pinned</span>}
          </span>
          {classLine && <span className="dock-pc-class">{classLine}</span>}
        </div>
        {focusMax != null && focusMax > 0 && (
          <div
            className="dock-pc-focus"
            aria-label={`Focus points: ${focusLeft} of ${focusMax}`}
          >
            <span className="dock-pc-focus-pips" aria-hidden="true">
              {Array.from({ length: focusMax }, (_, i) => (
                <span
                  key={i}
                  className={`dock-pc-focus-pip${i < focusLeft ? ' is-full' : ''}`}
                />
              ))}
            </span>
            <span className="dock-pc-focus-label">Focus</span>
          </div>
        )}
      </header>
      <div className="dock-pc-vitals">
        <div className="dock-pc-dial-wrap">
          <div className={`dock-pc-dial ${tone}`} style={{ '--hp-pct': pct }}>
            <div className="dock-pc-dial-inner">
              <span className="dock-pc-dial-value">{current}</span>
              {max > 0 && <span className="dock-pc-dial-max">/{max}</span>}
            </div>
          </div>
          <span className="dock-pc-dial-label">Hit Points</span>
        </div>
        <div className="dock-pc-slabs">
          <div className="dock-pc-slab dock-pc-slab--ac">
            <span className="dock-pc-slab-value">{ac ?? '—'}</span>
            <span className="dock-pc-slab-label">AC</span>
          </div>
          <div className="dock-pc-slab dock-pc-slab--saves">
            {Object.keys(SAVE_LABEL).map((k) => (
              <span key={k} className="dock-pc-save">
                <span className="dock-pc-save-label">{SAVE_LABEL[k]}</span>
                <span className="dock-pc-save-value">
                  {saves[k] != null ? fmtMod(saves[k]) : '—'}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {effectChips.length > 0 && (
        <div className="dock-pc-chips">
          {effectChips.map((label, i) => (
            <span key={`${label}-${i}`} className="dock-pc-chip">{label}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default DockPcVitals;
