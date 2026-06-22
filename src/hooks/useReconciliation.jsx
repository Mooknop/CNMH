import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../contexts/ContentContext';
import { useSession } from '../contexts/SessionContext';
import { saveDocument } from '../utils/gmApi';
import { computePendingChanges } from '../utils/reconcile';

// GM reconciliation orchestrator (#557, epic #555). Reads the durable live
// overlays for every PC, asks the engine (#556) for the pending live↔doc
// divergences, and exposes a single party-wide Sync (+ per-change/per-PC
// Discard and an Undo). MVP coverage is the `consumed` overlay (consumables
// parity); gold/loadout/acquired/removed land via their sub-issues once the
// engine's stub computers are wired — this hook needs no change to pick them up.

// Stable id for a pending change (one per overlay slice on a character).
export const reconChangeId = (c) => `${c.charId}:${c.overlay}:${c.overlayRef}`;

const readConsumed = (getState, id) => {
  const server = getState(id, 'consumed');
  if (server && typeof server === 'object') return server;
  try {
    const raw = window.localStorage.getItem(`cnmh_consumed_${id}`);
    const v = raw != null ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

// Gold overlay is a plain number; `undefined` (no overlay at all) means "no
// opinion" so the engine surfaces nothing for that PC.
const readGold = (getState, id) => {
  const server = getState(id, 'gold');
  if (typeof server === 'number') return server;
  try {
    const raw = window.localStorage.getItem(`cnmh_gold_${id}`);
    const v = raw != null ? JSON.parse(raw) : undefined;
    return typeof v === 'number' ? v : undefined;
  } catch {
    return undefined;
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

  useEffect(() => {
    const list = idsKey ? idsKey.split(',') : [];
    setConsumedById(Object.fromEntries(list.map((id) => [id, readConsumed(getState, id)])));
    setGoldById(Object.fromEntries(list.map((id) => [id, readGold(getState, id)])));
    const unsubs = list.flatMap((id) => [
      subscribe(id, 'consumed', (val) =>
        setConsumedById((prev) => ({ ...prev, [id]: val && typeof val === 'object' ? val : {} })),
      ),
      subscribe(id, 'gold', (val) =>
        setGoldById((prev) => ({ ...prev, [id]: typeof val === 'number' ? val : Number(val) || 0 })),
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
          }),
        }))
        .filter((g) => g.changes.length > 0),
    [characters, rawById, consumedById, goldById],
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
  const [undoBuffer, setUndoBuffer] = useState(null); // [{ charId, rawBefore, consumedBefore }]
  const activeRef = useRef(activeByChar);
  activeRef.current = activeByChar;
  const dataRef = useRef({ rawById, consumedById });
  dataRef.current = { rawById, consumedById };

  const sync = useCallback(async () => {
    if (busy) return;
    const groups = activeRef.current;
    const { rawById: raws, consumedById: consumed } = dataRef.current;
    if (groups.length === 0) return;
    setBusy(true);
    const buffer = [];
    const synced = [];
    const failed = [];
    try {
      for (const g of groups) {
        const charId = g.char.id;
        const rawBefore = raws[charId];
        if (!rawBefore) continue;
        const consumedBefore = consumed[charId] || {};
        // Apply every change to a fresh copy of the doc, then clear the
        // committed overlay slices.
        const nextRaw = g.changes.reduce((doc, ch) => ch.apply(doc), rawBefore);
        const nextConsumed = { ...consumedBefore };
        g.changes.forEach((ch) => {
          if (ch.overlay === 'consumed') delete nextConsumed[ch.overlayRef];
        });
        try {
          await saveDocument('character', charId, nextRaw);
        } catch (e) {
          // Doc write failed — leave the overlay untouched so nothing is lost.
          failed.push({ id: charId, error: e?.message || String(e) });
          continue;
        }
        sendUpdate(charId, 'consumed', nextConsumed);
        buffer.push({ charId, rawBefore, consumedBefore });
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
      for (const { charId, rawBefore, consumedBefore } of undoBuffer) {
        try {
          await saveDocument('character', charId, rawBefore);
          // Restore the overlay too — without this the player's change is
          // silently dropped (doc reverted but the live delta gone).
          sendUpdate(charId, 'consumed', consumedBefore);
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
