import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useSessionLog } from './useSessionLog';
import { saveDocument } from '../utils/gmApi';
import { docGold } from '../utils/gold';
import {
  buildLootDrop,
  applyClaim,
  goldShares,
  charClaimedLines,
  acquiredEntry,
  unclaimedCache,
  receiptText,
  charClaimQty,
  claimedDelta,
  accumulateClaimed,
} from '../utils/lootDrop';

// The treasure-distribution lifecycle (#1090/#1091, epic #1085 T4/T5). One drop
// at a time, session-wide, on the synced global cnmh_lootdrop_global:
//
//   open   → GM writes a room's cache to the drop
//   claim  → players tap lines to claim/release/split (writes items[].claims)
//   cancel → drop discarded, nothing written to anyone
//   finalize → GM (single writer, avoiding claim races at the moment it matters)
//              credits each character's claimed items + gold share onto the
//              proven cnmh_acquired_/cnmh_gold_ overlays (same primitives as
//              useBuyItems / #654 transfers — no new inventory-write code), then
//              returns anything unclaimed to the room cache and stamps
//              distributedAt.
//
// Offline gate: claims and finalize are frozen in the offline sandbox
// (connected && !foundryConnected), mirroring the buy/transfer flows (#550). The
// pin/finalize surface is GM-only (GM pages sit behind useGmAuth in GmLayout).
export const useLootDrop = () => {
  const { connected, foundryConnected, getState, sendUpdate } = useSession();
  const { characters = [], rooms = [], items = [], runes = [], refresh } = useContent();
  const { appendEvent } = useSessionLog();
  const [drop, setDrop] = useSyncedState('cnmh_lootdrop_global', null);

  const isOpen = !!drop && drop.status === 'open';
  const offline = connected && !foundryConnected;

  const ids = useMemo(() => (characters || []).map((c) => c.id), [characters]);
  const byId = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c])),
    [characters],
  );

  // Cache lines can bind to items or loose runes (same merge as
  // RoomTreasureEditor, item id wins) — used to value claimed lines at finalize.
  const catalogById = useMemo(() => {
    const m = new Map();
    for (const r of runes || []) m.set(r.id, r);
    for (const i of items || []) m.set(i.id, i);
    return m;
  }, [items, runes]);

  // Live even-split (or GM override) gold shares for the open drop, keyed by id.
  const shares = useMemo(
    () => (drop ? goldShares(drop.gold, ids, drop.goldSplit) : {}),
    [drop, ids],
  );

  // Create a drop from a room's cache. No-op (returns null) when a drop is
  // already open — one at a time — or the room has nothing to distribute.
  const openDrop = useCallback(
    (room) => {
      if (isOpen) return null;
      const built = buildLootDrop(room);
      if (!built) return null;
      setDrop(built);
      return built;
    },
    [isOpen, setDrop],
  );

  // Player claim: set this character's TOTAL on a line (0 releases). Frozen
  // offline. Functional update so concurrent claims last-writer-wins cleanly.
  const claimLine = useCallback(
    (lineId, charId, qty) => {
      if (offline || !charId) return;
      setDrop((prev) => (prev && prev.status === 'open' ? applyClaim(prev, lineId, charId, qty) : prev));
    },
    [offline, setDrop],
  );

  // GM per-character gold override (null = back to even split).
  const setGoldSplit = useCallback(
    (goldSplit) => {
      setDrop((prev) => (prev && prev.status === 'open' ? { ...prev, goldSplit } : prev));
    },
    [setDrop],
  );

  // Discard the open drop. Nothing is written to any inventory or gold balance;
  // clearing the key closes the claim UI on every device.
  const cancelDrop = useCallback(() => {
    setDrop(null);
  }, [setDrop]);

  // Finalize (GM single writer). Credits each character's claimed items + gold
  // share, logs a per-character receipt, returns anything unclaimed to the room
  // cache, and stamps distributedAt. Frozen offline. Throws if the doc save
  // fails so the caller can surface it WITHOUT clearing the drop; the overlay
  // credits run first (players keep their loot even if the stamp fails, exactly
  // like credit-before-debit in useBuyItems). Returns true once committed.
  const finalizeDrop = useCallback(async () => {
    if (!drop || offline) return false;

    const shareMap = goldShares(drop.gold, ids, drop.goldSplit);
    let distributedGold = 0;

    ids.forEach((cid) => {
      const lines = charClaimedLines(drop, cid);
      const goldShare = Math.max(0, Math.floor(Number(shareMap[cid]) || 0));
      distributedGold += goldShare;
      if (lines.length === 0 && goldShare === 0) return;

      // Credit claimed items (one re-resolvable ref entry per unit) onto the
      // additive acquired overlay, defaulting to whatever's already there.
      const entries = [];
      (drop.items || []).forEach((line) => {
        for (let i = 0; i < charClaimQty(line, cid); i += 1) entries.push(acquiredEntry(line));
      });
      if (entries.length) {
        const cur = getState(cid, 'acquired');
        sendUpdate(cid, 'acquired', [...(Array.isArray(cur) ? cur : []), ...entries]);
      }
      // Credit the gold share onto the live balance (default to the committed
      // doc value so an unset balance reflects real gold, not 0 — like #670).
      if (goldShare > 0) {
        const cur = getState(cid, 'gold');
        const base = typeof cur === 'number' ? cur : docGold(byId[cid]);
        sendUpdate(cid, 'gold', base + goldShare);
      }
      appendEvent({
        type: 'action',
        text: `${byId[cid]?.name || 'Someone'} claimed ${receiptText(lines, goldShare)}`,
      });
    });

    // Unclaimed lines (and any gold an override left over) return to the cache so
    // nothing is silently lost; then the room is stamped distributed (locking
    // its cache read-only, T3). T5's overlay credits above are already synced.
    const room = rooms.find((r) => r.id === drop.roomId);
    if (room) {
      await saveDocument('room', room.id, {
        ...room,
        treasureCache: unclaimedCache(drop, distributedGold),
        distributedAt: Date.now(),
        // Historical value handed out, for claimed-vs-unclaimed budgeting
        // (#1281) — survives reopen (full-doc spread) and re-import (merge).
        claimed: accumulateClaimed(room.claimed, claimedDelta(drop, distributedGold, catalogById)),
      });
      if (refresh) await refresh();
    }

    setDrop(null);
    return true;
  }, [drop, offline, ids, byId, rooms, catalogById, refresh, getState, sendUpdate, appendEvent, setDrop]);

  return { drop, isOpen, offline, shares, openDrop, claimLine, setGoldSplit, cancelDrop, finalizeDrop };
};

export default useLootDrop;
