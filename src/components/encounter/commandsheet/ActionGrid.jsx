// src/components/encounter/commandsheet/ActionGrid.jsx
// Command Sheet action grid (#410) — replaces the old category buttons +
// ActionCategoryModal. One filterable grid grouped by action cost. Tiles still
// open the existing resolution path (ActionDetailModal → onUse → handleUse), so
// behavior is preserved while the navigation collapses to a single screen.
import React, { useMemo, useState } from 'react';
import ActionTile from './ActionTile';
import ActionDetailModal from '../ActionDetailModal';
import ThaumaturgeExploitsDisplay from '../../actions/ThaumaturgeExploitsDisplay';
import { useCharacter } from '../../../hooks/useCharacter';
import { buildActionCatalog, filterTiles, categoriesPresent } from './buildActionCatalog';
import './ActionGrid.css';

const CAT_LABEL = {
  all: 'All',
  attack: 'Attack',
  magic: 'Magic',
  skill: 'Skill',
  defense: 'Defense',
  move: 'Move',
  item: 'Item',
};

const COST_GROUPS = [
  { key: '1', label: '1 Action' },
  { key: '2', label: '2 Actions' },
  { key: '3', label: '3 Actions' },
];

const ActionGrid = ({ character, themeColor, encounterMode, onUse, onMagicOpen }) => {
  const { actions, strikes, flags, thaumaturge } = useCharacter(character);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [openItem, setOpenItem] = useState(null);

  const tiles = useMemo(
    () => buildActionCatalog({ actions, strikes }),
    [actions, strikes]
  );

  const chips = useMemo(() => {
    const present = categoriesPresent(tiles);
    return onMagicOpen ? [...present, 'magic'] : present;
  }, [tiles, onMagicOpen]);

  const visible = useMemo(() => filterTiles(tiles, { cat, query }), [tiles, cat, query]);

  const showMagicLauncher = !!onMagicOpen && (cat === 'all' || cat === 'magic');
  const showGroups = cat !== 'magic';

  return (
    <div className="cmd-grid-root">
      {flags?.isThaumaturge && (
        <ThaumaturgeExploitsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}

      <div className="cmd-controls">
        <div className="cmd-chips" role="tablist" aria-label="Filter actions">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={cat === c}
              className={`cmd-chip${cat === c ? ' cmd-chip--active' : ''}`}
              onClick={() => setCat(c)}
            >
              {CAT_LABEL[c] || c}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="cmd-search"
          placeholder="Search actions…"
          aria-label="Search actions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {showMagicLauncher && (
        <button type="button" className="cmd-magic-launcher" aria-label="Cast a Spell" onClick={onMagicOpen}>
          <span className="cmd-magic-glyph" aria-hidden="true">✦</span>
          <span className="cmd-magic-label">Cast a Spell</span>
          <span className="cmd-magic-sub">Open spellbook</span>
        </button>
      )}

      {showGroups && COST_GROUPS.map(({ key, label }) => {
        const groupTiles = visible.filter((t) => t.costGroup === key);
        if (groupTiles.length === 0) return null;
        return (
          <section key={key} className="cmd-group" aria-label={label}>
            <h3 className="cmd-group-head">{label}</h3>
            <div className="cmd-group-grid">
              {groupTiles.map((tile) => (
                <ActionTile key={tile.id} tile={tile} onSelect={setOpenItem} />
              ))}
            </div>
          </section>
        );
      })}

      {showGroups && visible.length === 0 && (
        <p className="cmd-empty">No actions match.</p>
      )}

      {openItem && (
        <ActionDetailModal
          item={openItem.raw}
          type="action"
          isOpen
          onClose={() => setOpenItem(null)}
          themeColor={themeColor}
          encounterMode={encounterMode}
          onUse={onUse}
        />
      )}
    </div>
  );
};

export default ActionGrid;
