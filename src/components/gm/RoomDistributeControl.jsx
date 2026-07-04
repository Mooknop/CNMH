import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useLootDrop } from '../../hooks/useLootDrop';
import { roomTreasureCache } from '../../utils/rooms';
import { buildLootDrop, cacheHasUnmatched, lineClaimedQty } from '../../utils/lootDrop';

// Distribute a room's treasure cache to the party (#1090/#1091, epic #1085
// T4/T5). Shown under a room in the dashboard Current Room panel and in
// World → Rooms. Three states in one place:
//   • Distribute button — cache with content, no unmatched lines, not yet
//     distributed, and no drop open elsewhere.
//   • Confirm/preview — what's about to drop, before it's written.
//   • Active drop panel — the live drop for THIS room: claims filling in from
//     the players, editable gold split, with Cancel / Finalize.
// One drop at a time is enforced session-wide by useLootDrop; a drop open on a
// different room disables the button with a pointer to it.
const LootLine = ({ name, variant, qty, claim }) => (
  <li className={`gm-loot-drop-line${claim ? ' is-claimed' : ''}`}>
    <span className="gm-loot-drop-line-name">{name}{variant ? ` (${variant})` : ''}</span>
    {qty > 1 && <span className="gm-loot-drop-line-qty">×{qty}</span>}
    {claim !== undefined && (
      <span className="gm-loot-drop-line-claim">{claim || 'unclaimed'}</span>
    )}
  </li>
);

// Who has claimed a line, condensed: "Aria ×2, Vestri". Empty ⇒ unclaimed.
const claimLabel = (line, nameById) =>
  (line.claims || [])
    .filter((c) => c.qty > 0)
    .map((c) => `${nameById[c.charId] || 'a player'}${c.qty > 1 ? ` ×${c.qty}` : ''}`)
    .join(', ');

const RoomDistributeControl = ({ room }) => {
  const { characters = [] } = useContent();
  const { drop, isOpen, shares, openDrop, setGoldSplit, cancelDrop, finalizeDrop } = useLootDrop();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const nameById = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c.name])),
    [characters],
  );

  if (!room || room.isFeatures) return null;

  const dropHere = isOpen && drop.roomId === room.id;

  // ── Active drop panel (this room) ──────────────────────────────────────────
  if (dropHere) {
    const onFinalize = async () => {
      setBusy(true);
      setError(null);
      try {
        await finalizeDrop();
      } catch {
        setError('Finalize failed — try again.');
      } finally {
        setBusy(false);
      }
    };
    // GM gold override: edit one character's share → write the full map as
    // goldSplit. "Reset" drops back to the even split (goldSplit = null).
    const overrideShare = (charId, raw) => {
      const next = { ...shares, [charId]: raw === '' ? 0 : Math.max(0, Number(raw) || 0) };
      setGoldSplit(next);
    };
    const anyClaims = (drop.items || []).some((it) => lineClaimedQty(it) > 0);
    return (
      <div className="gm-loot-drop" aria-label="Active treasure distribution">
        <div className="gm-loot-drop-head">
          <strong>Distributing treasure</strong>
          <span className="gm-loot-drop-room">{drop.roomName}</span>
        </div>
        {drop.items.length > 0 && (
          <ul className="gm-loot-drop-items">
            {drop.items.map((it) => (
              <LootLine
                key={it.lineId}
                name={it.name}
                variant={it.variant}
                qty={it.qty}
                claim={claimLabel(it, nameById)}
              />
            ))}
          </ul>
        )}
        {drop.gold > 0 && (
          <div className="gm-loot-drop-gold-split">
            <div className="gm-loot-drop-gold-head">
              <span className="gm-loot-drop-gold">{drop.gold} gp</span>
              <span className="gm-count">{drop.goldSplit ? '· custom split' : '· even split'}</span>
              {drop.goldSplit && (
                <button type="button" className="btn-small btn-secondary" onClick={() => setGoldSplit(null)}>
                  Reset to even
                </button>
              )}
            </div>
            <ul className="gm-loot-drop-shares">
              {characters.map((c) => (
                <li key={c.id} className="gm-loot-drop-share">
                  <span className="gm-loot-drop-share-name">{c.name}</span>
                  <input
                    type="number"
                    min="0"
                    className="gm-loot-drop-share-input"
                    aria-label={`${c.name} gold share`}
                    value={Math.max(0, Math.floor(Number(shares[c.id]) || 0))}
                    onChange={(e) => overrideShare(c.id, e.target.value)}
                  />
                  <span className="gm-loot-drop-share-unit">gp</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="gm-help">
          Players claim on their sheets. Finalize hands out the claimed loot and gold shares and locks
          this cache; anything unclaimed returns to the cache. Cancel discards the drop with nothing given out.
        </p>
        <div className="gm-loot-drop-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={cancelDrop}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={onFinalize}>
            {busy ? 'Finalizing…' : 'Finalize'}
          </button>
          {!anyClaims && !error && <span className="gm-count">no claims yet</span>}
          {error && <span className="gm-warn">{error}</span>}
        </div>
      </div>
    );
  }

  const cache = roomTreasureCache(room);
  if (!cache || room.distributedAt != null) return null; // nothing to offer / already done

  // ── Confirm / preview ──────────────────────────────────────────────────────
  if (confirming) {
    const preview = buildLootDrop(room);
    return (
      <div className="gm-distribute gm-distribute-confirm" aria-label="Confirm treasure distribution">
        <p className="gm-distribute-title">Distribute this treasure to the party?</p>
        {preview.gold > 0 && <p className="gm-loot-drop-gold">{preview.gold} gp</p>}
        {preview.items.length > 0 && (
          <ul className="gm-loot-drop-items">
            {preview.items.map((it) => (
              <LootLine key={it.lineId} name={it.name} variant={it.variant} qty={it.qty} />
            ))}
          </ul>
        )}
        <p className="gm-help">
          Opens a claim drop players resolve on their sheets — nothing is handed out until you Finalize.
        </p>
        <div className="gm-loot-drop-actions">
          <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { openDrop(room); setConfirming(false); }}
          >
            Start distribution
          </button>
        </div>
      </div>
    );
  }

  // ── Distribute button ──────────────────────────────────────────────────────
  const unmatched = cacheHasUnmatched(room);
  const openElsewhere = isOpen && !dropHere;
  return (
    <div className="gm-distribute">
      <button
        type="button"
        className="btn-primary gm-distribute-btn"
        disabled={unmatched || openElsewhere}
        onClick={() => setConfirming(true)}
      >
        Distribute treasure…
      </button>
      {unmatched && (
        <p className="gm-help gm-distribute-hint">
          Resolve the unmatched cache line(s) in the editor first — they can’t be handed out.
        </p>
      )}
      {openElsewhere && (
        <p className="gm-help gm-distribute-hint">
          Finish the open distribution in {drop.roomName} first.
        </p>
      )}
    </div>
  );
};

export default RoomDistributeControl;
