// src/components/encounter/commandsheet/ActionGrid.jsx
// Command Sheet action grid (#410, #412) — replaces the old category buttons +
// ActionCategoryModal. One filterable grid grouped by action cost. Tapping a tile
// goes STRAIGHT to resolution via onUse → ActionsList.handleUse (which opens the
// right slide-up resolver, pre-filled with the focused foe) — no intermediate
// description modal.
import React, { useMemo, useState } from 'react';
import ActionTile from './ActionTile';
import ThaumaturgeExploitsDisplay from '../../actions/ThaumaturgeExploitsDisplay';
import { useCharacter } from '../../../hooks/useCharacter';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useTurnState } from '../../../hooks/useTurnState';
import { buildActionCatalog, filterTiles, categoriesPresent } from './buildActionCatalog';
import { suggestNow } from './suggestNow';
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
  { key: 'rf', label: 'Reactions & Free' },
];

const ActionGrid = ({ character, themeColor, encounterMode, onUse, onMagicOpen }) => {
  const { actions, strikes, reactions, freeActions, flags, thaumaturge } = useCharacter(character);
  const { focusEnemy } = useFocusTarget(character.id);
  const { turnState } = useTurnState(character.id);
  const hasFocus = !!focusEnemy;
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');

  // Tapping a tile resolves immediately: hand the raw action + its cost to
  // handleUse, which routes to the right slide-up resolver (or logs+spends for
  // no-dice basics). Variable-cost actions pass their minimum; the resolver lets
  // the player bump it (actionCountOverride).
  const handleTileSelect = (tile) =>
    onUse?.(tile.raw, tile.variableActionCount ? tile.variableActionCount.min : tile.cost);

  const tiles = useMemo(
    () => buildActionCatalog({ actions, strikes, reactions, freeActions }),
    [actions, strikes, reactions, freeActions]
  );

  const chips = useMemo(() => {
    const present = categoriesPresent(tiles);
    return onMagicOpen ? [...present, 'magic'] : present;
  }, [tiles, onMagicOpen]);

  const visible = useMemo(() => filterTiles(tiles, { cat, query }), [tiles, cat, query]);

  // "Right Now" shortlist (#413) — the most likely next actions, one tap away.
  // Ranked over the full catalog (not the filtered view) against the live budget
  // + focus, so it stays useful no matter which chip/search is active.
  const actionsLeft = Math.max(0, 3 - (turnState?.actionsSpent ?? 0));
  const suggestions = useMemo(
    () => (encounterMode ? suggestNow(tiles, { actionsLeft, hasFocus }) : []),
    [encounterMode, tiles, actionsLeft, hasFocus]
  );

  const showMagicLauncher = !!onMagicOpen && (cat === 'all' || cat === 'magic');
  const showGroups = cat !== 'magic';

  return (
    <div className="cmd-grid-root">
      {flags?.isThaumaturge && (
        <ThaumaturgeExploitsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}

      {suggestions.length > 0 && (
        <section className="cmd-now" aria-label="Right now">
          <h3 className="cmd-now-head">
            <span className="cmd-now-dot" aria-hidden="true" />
            Right Now
          </h3>
          <div className="cmd-now-grid">
            {suggestions.map((tile) => (
              <ActionTile
                key={`now-${tile.id}`}
                tile={tile}
                onSelect={handleTileSelect}
                encounterMode={encounterMode}
                hasFocus={hasFocus}
              />
            ))}
          </div>
        </section>
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
                <ActionTile
                  key={tile.id}
                  tile={tile}
                  onSelect={handleTileSelect}
                  encounterMode={encounterMode}
                  hasFocus={hasFocus}
                />
              ))}
            </div>
          </section>
        );
      })}

      {showGroups && visible.length === 0 && (
        <p className="cmd-empty">No actions match.</p>
      )}
    </div>
  );
};

export default ActionGrid;
