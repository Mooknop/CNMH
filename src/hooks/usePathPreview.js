import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncedState } from './useSyncedState';
import { useBridgeStatus } from './useBridgeStatus';
import { useEncounter } from './useEncounter';
import { RELAY, globalKey } from '../sync/keys';
import { MAP_MOVE_PROTOCOL } from '../utils/movement';

// In-app consumer for the bridge's route-ghost push (#1744 S3/WS-4). The
// bridge (#1746, protocol 16) emits TWO channels of the SAME payload shape —
// see foundry-bridge/pathPreview.js's header for the full contract:
//
//   { tokenId, id, name, disposition, sceneId,
//     origin: {col,row}, path: [{col,row}, …], phase: 'plan'|'move',
//     source: 'app'|'foundry', ts }
//
//   cnmh_pathpreview_global   — PUBLIC: friendly + non-hidden movers only.
//   cnmh_pathpreviewgm_global — GM: everything, unfiltered.
//
// `audience: 'gm'` picks the unfiltered channel and must NEVER be passed from
// a player-facing surface — the relay has no per-key ACL (OQ-2 ruling), so the
// filtering is entirely a bridge-side (channel choice) + app-side (render
// gate) contract. Only GM-exclusive mounts may request it.
export const PATHPREVIEW_AUDIENCE = Object.freeze({ PLAYER: 'player', GM: 'gm' });

// Client-side TTL (no terminator exists on the wire — see the module doc in
// foundry-bridge/pathPreview.js and epic #1744's design sketch). Both
// constants are exported + accept an override so a caller (or a test) can
// dial them without reaching into the hook's internals.
//
// PLAN_GHOST_TTL_MS: plan-phase emissions throttle to a 150ms cadence
// (PLAN_THROTTLE_MS in the bridge) for as long as a GM drag continues, so
// consecutive emissions for the SAME token never sit further apart than that
// while the drag is live. 2.5s of silence is ~16x that cadence — generous
// headroom for relay/render jitter — while still clearing a ghost within a
// couple of seconds of the GM releasing the drag (or abandoning it outright,
// which emits nothing at all).
export const PLAN_GHOST_TTL_MS = 2500;

// MOVE_GHOST_TTL_MS: a 'move' emission fires once, when the animation STARTS
// — nothing on the wire says when it ends, and the app has no way to measure
// a specific token's animation duration (it depends on distance and the
// table's Foundry settings). 8s comfortably covers a full-Speed stride's
// canvas animation with room to spare, plus a couple of beats of "that just
// happened" lingering visibility once the token settles — long enough to be
// legible, short enough to not still be showing when the next mover starts.
export const MOVE_GHOST_TTL_MS = 8000;

const audienceKey = (audience) =>
  audience === PATHPREVIEW_AUDIENCE.GM ? globalKey(RELAY.PATHPREVIEWGM) : globalKey(RELAY.PATHPREVIEW);

// Look up the order entry a pathpreview `id` names — a PC charId or a combat
// entryId (see resolveMoverId's precedence in foundry-bridge/movement.js); a
// minion's `<ownerCharId>-<role>` id never resolves here (minions carry no
// order entry of their own), which is fine — the payload's OWN `name` (#1744
// WS-1/OQ-7) already covers that case. Same join shape existing consumers use
// (e.g. useAdjacency, SpellgunAttackModal's casterEntry lookup).
const findOrderEntry = (order, id) => {
  if (!id) return null;
  return (order || []).find((e) => e.entryId === id || (e.kind === 'pc' && e.charId === id)) || null;
};

/**
 * Route ghosts for token moves the viewer didn't make (#1744 S3/WS-4).
 *
 *   const { entries } = usePathPreview({ audience: 'player' });
 *
 * Accumulates the single global, last-writer-wins channel into a per-tokenId
 * map (§ the epic's design sketch, point 1) so two movers moving at once don't
 * erase each other, applies the client TTL above (re-armed on every fresh
 * payload for that token — a 'move' naturally supersedes a 'plan' since both
 * key on the same tokenId), and returns nothing at all below the bridge floor
 * that taught the wire to filter this channel in the first place
 * (MAP_MOVE_PROTOCOL — an older unfiltered bridge must never feed
 * player-visible ghosts).
 *
 * Each entry carries the raw payload fields plus `entryId`/`charId` enrichment
 * from a join against the live encounter order (null when the mover has no
 * order entry — an anonymous NPC, or a minion, which already carries its own
 * `name` off the wire).
 */
export function usePathPreview({
  audience = PATHPREVIEW_AUDIENCE.PLAYER,
  planTtlMs = PLAN_GHOST_TTL_MS,
  moveTtlMs = MOVE_GHOST_TTL_MS,
} = {}) {
  const [payload] = useSyncedState(audienceKey(audience), null);
  const { protocol } = useBridgeStatus();
  const { encounter } = useEncounter();
  const order = encounter?.order;

  const eligible = (protocol ?? 0) >= MAP_MOVE_PROTOCOL;

  const [byToken, setByToken] = useState(() => new Map());
  const timersRef = useRef(new Map());

  const clearTimer = (tokenId) => {
    const timer = timersRef.current.get(tokenId);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(tokenId);
  };

  const dropToken = (tokenId) => {
    clearTimer(tokenId);
    setByToken((cur) => {
      if (!cur.has(tokenId)) return cur;
      const next = new Map(cur);
      next.delete(tokenId);
      return next;
    });
  };

  // Merge one incoming payload. Runs on every fresh emission AND once on
  // mount for whatever the DO replayed on hydration (or localStorage mirrored
  // last session) — the ts-anchored deadline below means a payload that's
  // already stale by the time this hook sees it is dropped outright instead
  // of being granted a fresh TTL window, which is exactly what should happen
  // to a replayed FULL_STATE ghost from a drag that ended minutes ago.
  useEffect(() => {
    if (!eligible || !payload?.tokenId) return;
    const { tokenId } = payload;
    const ttl = payload.phase === 'plan' ? planTtlMs : moveTtlMs;
    const ts = Number.isFinite(payload.ts) ? payload.ts : Date.now();
    const remaining = ts + ttl - Date.now();

    clearTimer(tokenId);
    if (remaining <= 0) {
      dropToken(tokenId);
      return;
    }

    setByToken((cur) => {
      const next = new Map(cur);
      next.set(tokenId, payload);
      return next;
    });
    timersRef.current.set(tokenId, setTimeout(() => dropToken(tokenId), remaining));
    // dropToken/clearTimer close over stable state setters + the timersRef
    // instance, not over reactive values — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, payload, planTtlMs, moveTtlMs]);

  // A bridge that drops below the floor mid-session (reconnect to an older
  // module) must stop showing ghosts a filtered channel no longer guarantees
  // — drop every armed timer and the accumulated map together.
  useEffect(() => {
    if (eligible) return;
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    setByToken(new Map());
  }, [eligible]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const entries = useMemo(() => {
    if (!eligible) return [];
    return Array.from(byToken.values()).map((p) => {
      const orderEntry = findOrderEntry(order, p.id);
      return {
        ...p,
        entryId: orderEntry?.entryId ?? null,
        charId: orderEntry?.charId ?? null,
        name: p.name || orderEntry?.name || null,
      };
    });
  }, [byToken, eligible, order]);

  return { entries };
}

export default usePathPreview;
