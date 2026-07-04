import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';
import CatalogPickerModal from './CatalogPickerModal';

// Editable Treasure Cache for one adventure room (#1089, epic #1085). Sits below
// the significance-notes editor in World → Rooms and saves with the same
// mechanics — the full room doc round-trips through the single-doc PUT, which
// archives the prior version. Remounted per room (key) so the draft resets when
// the GM switches rooms.
//
// Item lines carry the transform's shape: { ref?, name, qty, variant?, value? }.
// A line WITHOUT `ref` is an unmatched placeholder — a coin-valuable or story
// item the T0/T2 pipeline couldn't bind to the catalog. It renders flagged with
// a "Resolve" control (bind to a real catalog id) or can be deleted. This is the
// manual repair path for anything the import didn't cover.
//
// `distributedAt` is a top-level room field (set later by T4 Distribute — see
// mergeGmFields in scripts/importAdventureRooms.js). While it's set the cache is
// locked read-only behind a "Reopen cache" guard so a room can't be distributed
// twice by accident.

// The generic Treasure Item (see utils/treasure.js): a cache line bound to it
// keeps its own name + gp value, so it can stand in for gems/jewelry/art with a
// shared icon. Its lines are name/value-editable inline rather than catalog-fixed.
const TREASURE_ITEM_ID = 'treasure-item';

const catalogLine = (item) => ({ ref: item.id, name: item.name || item.id, qty: 1 });

const normalize = (gold, items) => ({ gold: Number(gold) || 0, items });

const RoomTreasureEditor = ({ room }) => {
  const { items = [], runes = [], refresh } = useContent();
  // Cache lines can bind to a loose property/fundamental rune (raiment, etc.)
  // as well as a catalog item — those live in `rune.json`, a separate
  // collection. Merge both so add/resolve can reach either (item id wins on the
  // rare id collision).
  const catalog = useMemo(() => {
    const seen = new Set(items.map((i) => i.id));
    return [...items, ...runes.filter((r) => !seen.has(r.id))];
  }, [items, runes]);
  const [gold, setGold] = useState(room.treasureCache?.gold ?? 0);
  const [lines, setLines] = useState(() => (room.treasureCache?.items || []).map((it) => ({ ...it })));
  const [picker, setPicker] = useState(null); // null | { mode:'add' } | { mode:'resolve', index }
  const [state, setState] = useState('idle'); // idle | saving | saved | error

  const distributed = room.distributedAt != null;

  const dirty = useMemo(() => {
    const original = JSON.stringify(normalize(room.treasureCache?.gold ?? 0, room.treasureCache?.items || []));
    return JSON.stringify(normalize(gold, lines)) !== original;
  }, [gold, lines, room.treasureCache]);

  const touch = () => setState((s) => (s === 'saved' || s === 'error' ? 'idle' : s));

  const setQty = (i, raw) => {
    const qty = Math.max(1, Math.floor(Number(raw) || 1));
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, qty } : l)));
    touch();
  };

  const removeLine = (i) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    touch();
  };

  const setName = (i, name) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, name } : l)));
    touch();
  };

  const setValue = (i, raw) => {
    const v = raw === '' ? null : Math.max(0, Number(raw) || 0);
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l };
        if (v == null) delete next.value;
        else next.value = v;
        return next;
      }),
    );
    touch();
  };

  const onPick = (picked) => {
    if (!picker) return;
    if (picker.mode === 'add') {
      setLines((prev) => [...prev, ...picked.map(catalogLine)]);
    } else {
      const item = picked[0];
      setLines((prev) =>
        prev.map((l, idx) => {
          if (idx !== picker.index) return l;
          // Binding to the generic Treasure Item keeps the placeholder's identity
          // (name + gp value) — only the ref is added, so it's catalogued (icon,
          // no "not in catalog" flag) but still reads as "Garnet Beads / 5 gp".
          if (item.id === TREASURE_ITEM_ID) {
            return { ref: TREASURE_ITEM_ID, name: l.name, qty: l.qty, ...(l.value != null ? { value: l.value } : {}) };
          }
          // Otherwise adopt the catalog item's canonical name + ref, keep qty,
          // drop the stale coin `value` (it's a real item now).
          return { ref: item.id, name: item.name || item.id, qty: l.qty, ...(l.variant ? { variant: l.variant } : {}) };
        }),
      );
    }
    setPicker(null);
    touch();
  };

  const save = async () => {
    setState('saving');
    try {
      await saveDocument('room', room.id, { ...room, treasureCache: normalize(gold, lines) });
      if (refresh) await refresh();
      setState('saved');
    } catch {
      setState('error');
    }
  };

  const reopen = async () => {
    setState('saving');
    try {
      // Clear the stamp by omitting the key from the PUT (full-doc overwrite).
      const { distributedAt, ...rest } = room;
      await saveDocument('room', room.id, rest);
      if (refresh) await refresh();
      setState('saved');
    } catch {
      setState('error');
    }
  };

  if (distributed) {
    return (
      <div className="gm-room-treasure-edit is-distributed">
        <label className="gm-room-treasure-label">Treasure cache</label>
        <p className="gm-room-treasure-locked">
          Distributed {new Date(room.distributedAt).toLocaleDateString()} — cache is locked to prevent a
          double hand-out.
        </p>
        <div className="gm-room-treasure-actions">
          <button type="button" className="btn-secondary" disabled={state === 'saving'} onClick={reopen}>
            {state === 'saving' ? 'Reopening…' : 'Reopen cache'}
          </button>
          {state === 'error' && <span className="gm-warn">Couldn’t reopen — try again.</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="gm-room-treasure-edit">
      <label className="gm-room-treasure-label" htmlFor="gm-room-gold">Treasure cache</label>

      <div className="gm-room-treasure-gold">
        <label htmlFor="gm-room-gold">Gold (gp)</label>
        <input
          id="gm-room-gold"
          type="number"
          min="0"
          className="gm-room-treasure-gold-input"
          value={gold}
          onChange={(e) => { setGold(e.target.value); touch(); }}
        />
      </div>

      <ul className="gm-room-treasure-lines" aria-label="Treasure cache items">
        {lines.length === 0 && <li className="gm-count gm-room-treasure-empty">No items yet.</li>}
        {lines.map((line, i) => {
          const isTreasure = line.ref === TREASURE_ITEM_ID;
          const label = line.name || 'treasure';
          return (
            <li
              key={i}
              className={`gm-room-treasure-line${line.ref ? '' : ' is-unmatched'}${isTreasure ? ' is-treasure' : ''}`}
            >
              {isTreasure ? (
                <>
                  <input
                    type="text"
                    className="gm-room-treasure-name-input"
                    aria-label={`Treasure name for line ${i + 1}`}
                    placeholder="Treasure name"
                    value={line.name || ''}
                    onChange={(e) => setName(i, e.target.value)}
                  />
                  <span className="gm-room-treasure-value">
                    <input
                      type="number"
                      min="0"
                      className="gm-room-treasure-value-input"
                      aria-label={`Value (gp) for line ${i + 1}`}
                      placeholder="0"
                      value={line.value ?? ''}
                      onChange={(e) => setValue(i, e.target.value)}
                    />
                    <span className="gm-room-treasure-value-unit">gp</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="gm-room-treasure-name">
                    {line.name}{line.variant ? ` (${line.variant})` : ''}
                  </span>
                  {!line.ref && <span className="gm-room-treasure-flag">not in catalog</span>}
                </>
              )}
              <input
                type="number"
                min="1"
                className="gm-room-treasure-qty"
                aria-label={`Quantity for ${label}`}
                value={line.qty}
                onChange={(e) => setQty(i, e.target.value)}
              />
              {!line.ref && (
                <button
                  type="button"
                  className="btn-small btn-secondary"
                  onClick={() => setPicker({ mode: 'resolve', index: i })}
                >
                  Resolve…
                </button>
              )}
              <button
                type="button"
                className="gm-room-treasure-remove"
                aria-label={`Remove ${label}`}
                onClick={() => removeLine(i)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <div className="gm-room-treasure-actions">
        <button type="button" className="btn-small btn-secondary" onClick={() => setPicker({ mode: 'add' })}>
          Add item…
        </button>
        <button type="button" className="btn-primary" disabled={!dirty || state === 'saving'} onClick={save}>
          {state === 'saving' ? 'Saving…' : 'Save cache'}
        </button>
        {state === 'saved' && <span className="gm-ok">Saved.</span>}
        {state === 'error' && <span className="gm-warn">Save failed — try again.</span>}
      </div>

      <CatalogPickerModal
        isOpen={!!picker}
        onClose={() => setPicker(null)}
        catalog={catalog}
        multiSelect={picker?.mode === 'add'}
        title={picker?.mode === 'resolve' ? 'Resolve to a catalog item' : 'Add items to the cache'}
        onSelect={onPick}
      />
    </div>
  );
};

export default RoomTreasureEditor;
