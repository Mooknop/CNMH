import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../contexts/ContentContext';
import { useSession } from '../contexts/SessionContext';
import { saveDocument } from '../utils/gmApi';
import { computePendingChanges } from '../utils/reconcile';
import { APP, syncKey } from '../sync/keys';

// GM reconciliation orchestrator (#557, epic #555). Reads the durable live
// overlays for every PC, asks the engine (#556) for the pending live↔doc
// divergences, and exposes a single party-wide Sync (+ per-change/per-PC
// Discard and an Undo). Coverage: `consumed` (consumables), `gold` (#558),
// `acquired`/`removed` (gifted items, #665). Each change carries its own
// `clearOverlay`, so the sync/undo fold overlay-clearing generically — a new
// durable overlay needs no change here once its engine computer lands.

// Stable id for a pending change (one per overlay slice on a character).
export const reconChangeId = (c) => `${c.charId}:${c.overlay}:${c.overlayRef}`;

const readConsumed = (getState, id) => {
  const server = getState(id, APP.CONSUMED);
  if (server && typeof server === 'object') return server;
  try {
    const raw = window.localStorage.getItem(syncKey(APP.CONSUMED, id));
    const v = raw != null ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

// Gold overlay is a plain number; `undefined` (no overlay at all) means "no
// opinion" so the engine surfaces nothing for that PC.
const readGold = (getState, id) => {
  const server = getState(id, APP.GOLD);
  if (typeof server === 'number') return server;
  try {
    const raw = window.localStorage.getItem(syncKey(APP.GOLD, id));
    const v = raw != null ? JSON.parse(raw) : undefined;
    return typeof v === 'number' ? v : undefined;
  } catch {
    return undefined;
  }
};

// acquired (array of inline item entries) and removed (array of given-away
// authored uids) overlays. Both default to [] — an absent overlay diverges
// from nothing.
const readArrayOverlay = (getState, id, type) => {
  const server = getState(id, type);
  if (Array.isArray(server)) return server;
  try {
    const raw = window.localStorage.getItem(syncKey(type, id));
    const v = raw != null ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const useReconciliation = () => {
  const { characters, rawCharacters, refresh } = useContent();
  const { getState, sendUpdate, subscribe } = useSession();

  const ids = (characters || []).map((c) => c.id);
  const idsKey = ids.join(',');

  // Live durable overlays per PC, seeded from the session + kept current via
  // per-character subscriptions (same primitive usePartyGold uses).
  const [consumedById, setConsumedById] = useState(() =>
    Object.fromEntries(ids.map((id) => [id, readConsumed(getState, id)])),
  );
  const [goldById, setGoldById] = useState(() =>
    Object.fromEntries(ids.map((id) => [id, readGold(getState, id)])),
  );
  const [acquiredById, setAcquiredById] = useState(() =>
    Object.fromEntries(ids.map((id) => [id, readArrayOverlay(getState, id, 'acquired')])),
  );
  const [removedById, setRemovedById] = useState(() =>
    Object.fromEntries(ids.map((id) => [id, readArrayOverlay(getState, id, 'removed')])),
  );

  useEffect(() => {
    const list = idsKey ? idsKey.split(',') : [];
    setConsumedById(Object.fromEntries(list.map((id) => [id, readConsumed(getState, id)])));
    setGoldById(Object.fromEntries(list.map((id) => [id, readGold(getState, id)])));
    setAcquiredById(Object.fromEntries(list.map((id) => [id, readArrayOverlay(getState, id, 'acquired')])));
    setRemovedById(Object.fromEntries(list.map((id) => [id, readArrayOverlay(getState, id, 'removed')])));
    const asArray = (val) => (Array.isArray(val) ? val : []);
    const unsubs = list.flatMap((id) => [
      subscribe(id, 'consumed', (val) =>
        setConsumedById((prev) => ({ ...prev, [id]: val && typeof val === 'object' ? val : {} })),
      ),
      subscribe(id, 'gold', (val) =>
        setGoldById((prev) => ({ ...prev, [id]: typeof val === 'number' ? val : Number(val) || 0 })),
      ),
      subscribe(id, 'acquired', (val) =>
        setAcquiredById((prev) => ({ ...prev, [id]: asArray(val) })),
      ),
      subscribe(id, 'removed', (val) =>
        setRemovedById((prev) => ({ ...prev, [id]: asArray(val) })),
      ),
    ]);
    return () => unsubs.forEach((u) => u());
    // idsKey is the stable roster signature; getState/subscribe are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Freshest raw docs available client-side (live-synced via ContentContext).
  const rawById = useMemo(
    () => Object.fromEntries((rawCharacters || []).map((c) => [c.id, c])),
    [rawCharacters],
  );

  const pendingByChar = useMemo(
    () =>
      (characters || [])
        .map((char) => ({
          char,
          changes: computePendingChanges(char, rawById[char.id], {
            consumed: consumedById[char.id],
            gold: goldById[char.id],
            acquired: acquiredById[char.id],
            removed: removedById[char.id],
          }),
        }))
        .filter((g) => g.changes.length > 0),
    [characters, rawById, consumedById, goldById, acquiredById, removedById],
  );

  // ── Discard ────────────────────────────────────────────────────────────────
  const [discarded, setDiscarded] = useState(() => new Set());
  const toggleDiscard = useCallback((id) => {
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const discardChar = useCallback(
    (charId) => {
      const group = pendingByChar.find((g) => g.char.id === charId);
      if (!group) return;
      setDiscarded((prev) => {
        const next = new Set(prev);
        group.changes.forEach((c) => next.add(reconChangeId(c)));
        return next;
      });
    },
    [pendingByChar],
  );

  // Non-discarded changes, grouped — what Sync actually commits.
  const activeByChar = useMemo(
    () =>
      pendingByChar
        .map((g) => ({ ...g, changes: g.changes.filter((c) => !discarded.has(reconChangeId(c))) }))
        .filter((g) => g.changes.length > 0),
    [pendingByChar, discarded],
  );
  const totalActive = activeByChar.reduce((n, g) => n + g.changes.length, 0);

  // ── Sync / Undo ──────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { synced: [id], failed: [{id, error}] }
  const [undoBuffer, setUndoBuffer] = useState(null); // [{ charId, rawBefore, overlaysBefore }]
  const activeRef = useRef(activeByChar);
  activeRef.current = activeByChar;
  const dataRef = useRef({});
  dataRef.current = { rawById, consumedById, goldById, acquiredById, removedById };

  // Current value of one overlay for a PC, with each overlay's empty default.
  const overlayValue = (data, type, charId) => {
    if (type === 'consumed') return data.consumedById[charId] ?? {};
    if (type === 'gold') return data.goldById[charId];
    if (type === 'acquired') return data.acquiredById[charId] ?? [];
    if (type === 'removed') return data.removedById[charId] ?? [];
    return undefined;
  };

  const sync = useCallback(async () => {
    if (busy) return;
    const groups = activeRef.current;
    const data = dataRef.current;
    if (groups.length === 0) return;
    setBusy(true);
    const buffer = [];
    const synced = [];
    const failed = [];
    try {
      for (const g of groups) {
        const charId = g.char.id;
        const rawBefore = data.rawById[charId];
        if (!rawBefore) continue;
        // Apply every change to a fresh copy of the doc, then fold each change's
        // clearOverlay into a working copy of its overlay (changes that anchor
        // their overlay — e.g. gold — carry no clearOverlay and touch nothing).
        const nextRaw = g.changes.reduce((doc, ch) => ch.apply(doc), rawBefore);
        const nextOverlays = {}; // type -> cleared value
        for (const ch of g.changes) {
          if (typeof ch.clearOverlay !== 'function') continue;
          const cur = Object.prototype.hasOwnProperty.call(nextOverlays, ch.overlay)
            ? nextOverlays[ch.overlay]
            : overlayValue(data, ch.overlay, charId);
          nextOverlays[ch.overlay] = ch.clearOverlay(cur);
        }
        try {
          await saveDocument('character', charId, nextRaw);
        } catch (e) {
          // Doc write failed — leave the overlays untouched so nothing is lost.
          failed.push({ id: charId, error: e?.message || String(e) });
          continue;
        }
        // Commit the cleared overlays and capture their pre-sync values for undo.
        const overlaysBefore = {};
        for (const type of Object.keys(nextOverlays)) {
          overlaysBefore[type] = overlayValue(data, type, charId);
          sendUpdate(charId, type, nextOverlays[type]);
        }
        buffer.push({ charId, rawBefore, overlaysBefore });
        synced.push(charId);
      }
      setUndoBuffer(buffer.length ? buffer : null);
      setLastResult({ synced, failed });
      if (synced.length && refresh) await refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, sendUpdate, refresh]);

  const undo = useCallback(async () => {
    if (busy || !undoBuffer) return;
    setBusy(true);
    try {
      for (const { charId, rawBefore, overlaysBefore } of undoBuffer) {
        try {
          await saveDocument('character', charId, rawBefore);
          // Restore every overlay we cleared — without this the player's change
          // is silently dropped (doc reverted but the live delta gone).
          Object.entries(overlaysBefore || {}).forEach(([type, val]) =>
            sendUpdate(charId, type, val),
          );
        } catch {
          /* best-effort restore */
        }
      }
      setUndoBuffer(null);
      setLastResult(null);
      if (refresh) await refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, undoBuffer, sendUpdate, refresh]);

  return {
    pendingByChar,
    discarded,
    toggleDiscard,
    discardChar,
    totalActive,
    sync,
    undo,
    canUndo: !!undoBuffer,
    busy,
    lastResult,
  };
};

export default useReconciliation;
