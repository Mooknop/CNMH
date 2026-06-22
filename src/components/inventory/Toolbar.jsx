import React from 'react';
import { FILTERS, FILTER_LABELS, SORT_LABELS } from '../../utils/inventoryFilter';

/**
 * Inventory toolbar: a search field, an auto-sort button that cycles
 * A–Z → Type → Bulk, and a horizontally-scrolling row of filter chips. All of
 * it acts on the active bag's items (see BagGrid).
 *
 * @param {string}   query     - current search text
 * @param {Function} setQuery  - (string) => void
 * @param {string}   sort      - current sort mode ('name' | 'type' | 'bulk')
 * @param {Function} onCycleSort - advance the sort mode
 * @param {string}   filter    - active filter key
 * @param {Function} setFilter - (key) => void
 */
const Toolbar = ({ query, setQuery, sort, onCycleSort, filter, setFilter }) => (
  <div className="toolbar">
    <div className="toolbar-top">
      <label className="search">
        <span className="search-ico" aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items"
          data-testid="inventory-search"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </label>
      <button
        type="button"
        className="sort-btn"
        onClick={onCycleSort}
        data-testid="inventory-sort"
        title="Auto-sort"
      >
        <span className="sort-ico" aria-hidden="true">⇅</span>
        {SORT_LABELS[sort]}
      </button>
    </div>
    <div className="chips" data-scroll-x>
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          className={'chip' + (filter === f ? ' is-on' : '')}
          aria-pressed={filter === f}
          onClick={() => setFilter(f)}
          data-testid={`inventory-filter-${f}`}
        >
          {FILTER_LABELS[f]}
        </button>
      ))}
    </div>
  </div>
);

export default Toolbar;
