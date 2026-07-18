import React from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import {
  DICESETS_KEY, ENEMY_SET_KEY, DICE_MATERIALS, DEFAULT_ENEMY_SET, deriveDiceSet,
} from '../../utils/diceSets';
import './DiceSetsPanel.css';

// Dice So Nice dice sets (#1490 S7) — one 3D-dice appearance per character
// plus an Enemies row, edited with real pickers (no raw-JSON box, #248) and
// written straight to cnmh_dicesets_global (GM-authored global config: writes
// survive the offline-sandbox freeze). A row without a saved entry shows its
// theme-derived preview; "Fill from theme accents" saves those defaults for
// every unset row in one tap, so zero-config tables still get per-character
// dice. The bridge styles every 3D roll from this map — delegated rolls,
// native enemy saves, NPC initiative, and GM manual rolls alike.

const COLOR_FIELDS = [
  { key: 'background', label: 'body' },
  { key: 'foreground', label: 'numerals' },
  { key: 'outline', label: 'outline' },
  { key: 'edge', label: 'edge' },
];

const SetRow = ({ label, saved, derived, onSet, onClear }) => {
  const set = saved || derived;
  const setField = (field, value) => onSet({ ...set, [field]: value });
  return (
    <div className="dice-set-row">
      <span className="dice-set-name">
        {label}
        {!saved && <span className="dice-set-derived-tag">theme default</span>}
      </span>
      {COLOR_FIELDS.map((f) => (
        <input
          key={f.key}
          type="color"
          className="dice-set-swatch"
          value={set[f.key] || '#888888'}
          onChange={(e) => setField(f.key, e.target.value)}
          aria-label={`${label} dice ${f.label}`}
        />
      ))}
      <select
        className="dice-set-material"
        value={set.material || 'plastic'}
        onChange={(e) => setField('material', e.target.value)}
        aria-label={`${label} dice material`}
      >
        {DICE_MATERIALS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <input
        type="text"
        className="dice-set-colorset"
        placeholder="DSN colorset (opt.)"
        value={set.colorset || ''}
        onChange={(e) => setField('colorset', e.target.value)}
        aria-label={`${label} DSN colorset`}
      />
      {saved && (
        <button type="button" className="override-clear" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
};

const DiceSetsPanel = () => {
  const { theme, characters } = useContent();
  const [sets, setSets] = useSyncedState(DICESETS_KEY, {});

  const accentFor = (c) => theme?.accentOverrides?.[c.id] || c.color || null;

  const saveEntry = (key, set) => setSets((cur) => ({ ...(cur || {}), [key]: set }));
  const clearEntry = (key) =>
    setSets((cur) => {
      const next = { ...(cur || {}) };
      delete next[key];
      return next;
    });

  // Zero-config in one tap: persist the derived default for every unset row.
  const fillDefaults = () =>
    setSets((cur) => {
      const next = { ...(cur || {}) };
      for (const c of characters || []) {
        if (!next[c.id]) next[c.id] = deriveDiceSet(accentFor(c));
      }
      if (!next[ENEMY_SET_KEY]) next[ENEMY_SET_KEY] = DEFAULT_ENEMY_SET;
      return next;
    });

  return (
    <section className="gm-theme-overrides dice-sets-panel">
      <h2>Dice So Nice dice sets</h2>
      <p className="overrides-hint">
        Each character&rsquo;s 3D dice on the Foundry table — body, numerals, outline,
        edge, and material. Rolls from unmapped actors (monsters) use the Enemies set.
        A DSN colorset name (e.g. <code>fire</code>, <code>rainbow</code>) overrides
        the flat colors when set.
      </p>
      <button type="button" className="btn-secondary dice-sets-fill" onClick={fillDefaults}>
        Fill from theme accents
      </button>
      <div className="overrides-list">
        {(characters || []).map((c) => (
          <SetRow
            key={c.id}
            label={c.name}
            saved={sets?.[c.id] || null}
            derived={deriveDiceSet(accentFor(c))}
            onSet={(set) => saveEntry(c.id, set)}
            onClear={() => clearEntry(c.id)}
          />
        ))}
        <SetRow
          label="Enemies"
          saved={sets?.[ENEMY_SET_KEY] || null}
          derived={DEFAULT_ENEMY_SET}
          onSet={(set) => saveEntry(ENEMY_SET_KEY, set)}
          onClear={() => clearEntry(ENEMY_SET_KEY)}
        />
      </div>
    </section>
  );
};

export default DiceSetsPanel;
