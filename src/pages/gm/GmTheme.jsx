import React, { useState, useMemo } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveTheme } from '../../utils/gmApi';
import { paletteToVars } from '../../utils/themeVars';
import { COLORBLIND_PRESETS } from '../../data/themePresets';
import { contrastRatio, wcagLevel } from '../../utils/contrast';
import DiceSetsPanel from '../../components/gm/DiceSetsPanel';
import './GmTheme.css';

const CB_LABEL = {
  none: 'Normal',
  deuter: 'Deuteranopia',
  protan: 'Protanopia',
  tritan: 'Tritanopia',
};

// Palette slots shown in the color editor with contrast checking.
// `against` is the palette key of the background to compare against.
const PALETTE_SLOTS = [
  { key: 'accent',        label: 'Accent / HP',       against: 'surfaceCard' },
  { key: 'gold',          label: 'Gold / legendary',  against: 'surfaceCard' },
  { key: 'arcane',        label: 'Arcane / magic',    against: 'surfaceCard' },
  { key: 'verdant',       label: 'Verdant / healing', against: 'surfaceCard' },
  { key: 'peril',         label: 'Danger / peril',    against: 'surfaceCard' },
  { key: 'text',          label: 'Body text',         against: 'bg' },
  { key: 'textSecondary', label: 'Secondary text',    against: 'bg' },
];

// Parse a hex or rgba CSS color to a #rrggbb for <input type="color">.
const toHex = (color) => {
  if (!color) return '#888888';
  if (color.startsWith('#')) return color.length === 4
    ? '#' + color[1].repeat(2) + color[2].repeat(2) + color[3].repeat(2)
    : color.slice(0, 7);
  const m = color.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (m) {
    const r = Math.round(parseFloat(m[1])).toString(16).padStart(2, '0');
    const g = Math.round(parseFloat(m[2])).toString(16).padStart(2, '0');
    const b = Math.round(parseFloat(m[3])).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#888888';
};

// Mini preview of one action card + a spell chip + a tab, rendered using
// the previewVars injected as inline style on the preview container.
// --preview-accent: dynamic accent from the draft palette (custom-property bridge)
const ThemePreview = ({ themeColor }) => (
  <div className="theme-preview-card" style={{ '--preview-accent': themeColor }}>
    <div className="preview-card-header">
      <span className="preview-card-name">Strike: Longsword</span>
      <span className="preview-chip">◆ Use</span>
    </div>
    <div className="preview-card-body">
      <div className="preview-detail-row">
        <span className="preview-label">Attack</span>
        <span className="preview-value">+12</span>
      </div>
      <div className="preview-detail-row">
        <span className="preview-label">Damage</span>
        <span className="preview-value">1d8+5</span>
      </div>
    </div>
    <div className="preview-tabs">
      <button className="preview-tab active">Encounter</button>
      <button className="preview-tab">Inventory</button>
      <button className="preview-tab">Spells</button>
    </div>
    <div className="preview-table-header">
      <span>Item</span><span>Bulk</span><span>Value</span>
    </div>
  </div>
);

const PerCharacterOverrides = ({ overrides, characters, onSet }) => {
  if (!characters || characters.length === 0) return null;
  return (
    <section className="gm-theme-overrides">
      <h2>Per-character accent overrides</h2>
      <p className="overrides-hint">
        A character override beats the global accent on that character's sheet.
        Leave blank to use the character default or the global accent.
      </p>
      <div className="overrides-list">
        {characters.map((c) => (
          <div key={c.id} className="override-row">
            <span className="override-name">{c.name}</span>
            <input
              type="color"
              className="override-swatch"
              value={toHex(overrides[c.id] || '#c0440e')}
              onChange={(e) => onSet(c.id, e.target.value)}
              aria-label={`Accent color for ${c.name}`}
            />
            {overrides[c.id] && (
              <button className="override-clear" onClick={() => onSet(c.id, undefined)}>
                Clear
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

const GmTheme = () => {
  const { theme, characters } = useContent();
  const [draft, setDraft] = useState(() => theme || {});
  const [sim, setSim] = useState('none');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const palette = useMemo(() => draft.palette || {}, [draft.palette]);
  const previewVars = useMemo(() => paletteToVars(palette), [palette]);
  const themeColor = palette.accent || 'var(--theme-accent)';

  const setColor = (key, value) =>
    setDraft((d) => ({ ...d, palette: { ...d.palette, [key]: value }, preset: 'custom' }));

  const applyPreset = (preset) =>
    setDraft((d) => ({
      ...d,
      preset: preset.id,
      palette: { ...d.palette, ...preset.palette },
    }));

  const setOverride = (charId, value) =>
    setDraft((d) => {
      const next = { ...(d.accentOverrides || {}) };
      if (value == null) delete next[charId];
      else next[charId] = value;
      return { ...d, accentOverrides: next };
    });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveTheme(draft);
      setMsg('Theme saved and synced to all players.');
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-theme">
      {/* SVG colorblind simulation filter definitions */}
      <svg aria-hidden="true" className="gm-theme-svgdefs">
        <defs>
          <filter id="cb-deuter">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cb-protan">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cb-tritan">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>

      <h1 className="gm-theme-title">Campaign Theme</h1>

      {/* ── Presets ─────────────────────────────────────────────── */}
      <section className="gm-theme-presets">
        <h2>Presets</h2>
        <div className="preset-row">
          {COLORBLIND_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset-card${draft.preset === p.id ? ' active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              <span className="preset-name">{p.name}</span>
              <span className="preset-dots">
                {/* --pdot-color: per-preset palette swatch color (custom-property bridge) */}
                {['accent', 'gold', 'arcane', 'verdant'].map((k) => (
                  <span key={k} className="pdot" style={{ '--pdot-color': p.palette[k] }} />
                ))}
              </span>
              <span className="preset-tag">{p.tag}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="gm-theme-body">
        {/* ── Color slots + contrast checker ─────────────────────── */}
        <section className="gm-theme-slots">
          <h2>Colors</h2>
          {PALETTE_SLOTS.map((slot) => {
            const fg = palette[slot.key];
            const bg = palette[slot.against];
            const ratio = fg && bg ? contrastRatio(fg, bg) : null;
            const level = ratio != null ? wcagLevel(ratio) : null;
            return (
              <div key={slot.key} className="slot">
                <input
                  type="color"
                  className="slot-swatch"
                  value={toHex(fg)}
                  onChange={(e) => setColor(slot.key, e.target.value)}
                  aria-label={slot.label}
                />
                <div className="slot-info">
                  <span className="slot-name">{slot.label}</span>
                  <span className="slot-token">--theme-{slot.key.replace(/([A-Z])/g, '-$1').toLowerCase()}</span>
                </div>
                {level && (
                  <span className={`contrast contrast--${level.cls}`}>
                    {ratio.toFixed(1)}:1 {level.label}
                  </span>
                )}
              </div>
            );
          })}
        </section>

        {/* ── Live preview with colorblind simulation toggle ───────── */}
        <section
          className={`gm-theme-preview cb-${sim}`}
          style={previewVars}
        >
          <h2>Preview</h2>
          <div className="preview-toolbar">
            {['none', 'deuter', 'protan', 'tritan'].map((m) => (
              <button
                key={m}
                className={`cb-btn${sim === m ? ' active' : ''}`}
                onClick={() => setSim(m)}
              >
                {CB_LABEL[m]}
              </button>
            ))}
          </div>
          <ThemePreview themeColor={themeColor} />
        </section>
      </div>

      {/* ── Per-character overrides ──────────────────────────────── */}
      <PerCharacterOverrides
        overrides={draft.accentOverrides || {}}
        characters={characters}
        onSet={setOverride}
      />

      {/* ── Dice So Nice dice sets (#1490 S7) — synced live, not part of the
          theme draft/save (the bridge reads cnmh_dicesets_global directly). */}
      <DiceSetsPanel />

      {/* ── Save / reset ─────────────────────────────────────────── */}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          Save &amp; sync
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => setDraft(theme || {})}>
          Reset
        </button>
      </div>
      {msg && <pre className="gm-result">{msg}</pre>}
    </div>
  );
};

export default GmTheme;
