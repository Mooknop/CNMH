// GM remediation panel: per-PC consumable usage (authored quantity vs the
// player-writable cnmh_consumed_<charId> overlay). Fully-depleted items are
// already hidden from the player inventory; this is where the GM purges them
// from the authored character doc (and resets the overlay counter).
// Seed of the #229 character-state inspector.

import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { saveDocument } from '../../utils/gmApi';
import { isConsumable, remainingQuantity } from '../../utils/InventoryUtils';
import './ConsumablesCleanup.css';

// Match a resolved consumable back to its authored inventory entry: by the
// stable per-entry uid when present, by name for legacy inline items.
const matchesRaw = (entry, item) => {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.uid != null && item.uid != null) return entry.uid === item.uid;
  return entry.name === item.name;
};

const CharacterConsumablesRow = ({ resolved, raw }) => {
  const [consumed, setConsumed] = useSyncedState(`cnmh_consumed_${resolved.id}`, {});
  const [busy, setBusy] = useState(false);

  const rows = (resolved.inventory || [])
    .filter(isConsumable)
    .map((item) => ({ item, remaining: remainingQuantity(item, consumed) }));
  if (rows.length === 0) return null;

  const removeItem = async (item) => {
    if (!raw) return;
    setBusy(true);
    try {
      const inventory = (raw.inventory || []).filter((e) => !matchesRaw(e, item));
      await saveDocument('character', raw.id, { ...raw, inventory });
      // Clear the overlay counter so a future re-add starts fresh.
      setConsumed((prev) => {
        const next = { ...(prev || {}) };
        delete next[item.name];
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-consumables-row">
      <span className="gm-consumables-char">{resolved.name}</span>
      <ul className="gm-consumables-items">
        {rows.map(({ item, remaining }) => (
          <li
            key={item.uid ?? item.name}
            className={remaining <= 0 ? 'is-depleted' : ''}
          >
            <span className="gm-consumables-name">{item.name}</span>
            <span className="gm-consumables-count">
              {remaining}/{item.quantity ?? 1} left
            </span>
            {remaining <= 0 && (
              <button
                className="btn-secondary btn-small"
                disabled={busy}
                onClick={() => removeItem(item)}
              >
                Remove from inventory
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ConsumablesCleanup = () => {
  const { characters, rawCharacters } = useContent();
  const rawById = Object.fromEntries((rawCharacters || []).map((c) => [c.id, c]));

  return (
    <section className="gm-consumables" aria-label="Consumables cleanup">
      <h3 className="gm-consumables-title">Consumables</h3>
      <p className="gm-consumables-hint">
        Live usage from player casts. Items at 0 are hidden from the player's
        inventory — remove them here to clean up the character doc.
      </p>
      {(characters || []).map((c) => (
        <CharacterConsumablesRow key={c.id} resolved={c} raw={rawById[c.id]} />
      ))}
    </section>
  );
};

export default ConsumablesCleanup;
