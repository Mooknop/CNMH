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
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useAdjacency } from '../../../hooks/useAdjacency';
import { useChambers } from '../../../hooks/useChambers';
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
  const { actions, strikes, reactions, freeActions, inventory, maxHp, flags, thaumaturge } = useCharacter(character);
  const { focusEnemy, focusAlly } = useFocusTarget(character.id);
  const { inReach } = useAdjacency(character.id);
  const { turnState } = useTurnState(character.id);
  // Chamber overlay drives the Reload tile gating (#675) — read-only here, the
  // ReloadSheet (via useChambers) is the writer.
  const { chambers } = useChambers(character.id);
  const [hp] = useSyncedState(`cnmh_hp_${character.id}`, null);
  const hasFocus = !!focusEnemy;
  const allyFocused = !!focusAlly;
  // A focused ally out of reach hard-disables ally-support tiles (#430). No relay
  // data ⇒ inReach is true, so the gate is dormant without a connected bridge.
  const allyInReach = !focusAlly || inReach(focusAlly.entryId);
  const allyOutOfReach = allyFocused && !allyInReach;
  // HP fraction drives the low-HP healing boost in suggestNow (#428); 1 (full) if unknown.
  const hpRatio = (typeof hp === 'number' && maxHp > 0) ? hp / maxHp : 1;
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');

  // Tapping a tile resolves immediately: hand the raw action + its cost to
  // handleUse, which routes to the right slide-up resolver (or logs+spends for
  // no-dice basics). Variable-cost actions pass their minimum; the resolver lets
  // the player bump it (actionCountOverride).
  const handleTileSelect = (tile) =>
    onUse?.(tile.raw, tile.variableActionCount ? tile.variableActionCount.min : tile.cost);

  const tiles = useMemo(
    () => buildActionCatalog({ actions, strikes, reactions, freeActions, inventory, chambers }),
    [actions, strikes, reactions, freeActions, inventory, chambers]
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
    () => (encounterMode ? suggestNow(tiles, { actionsLeft, hasFocus, hpRatio, allyFocused, allyInReach }) : []),
    [encounterMode, tiles, actionsLeft, hasFocus, hpRatio, allyFocused, allyInReach]
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
                allyOutOfReach={allyOutOfReach}
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
                  allyOutOfReach={allyOutOfReach}
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
