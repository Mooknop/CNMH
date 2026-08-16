import React, { useCallback, useMemo, useState } from 'react';
import MapSnapshotViewer from '../components/encounter/MapSnapshotViewer';
import TokenMarkersOverlay from '../components/encounter/TokenMarkersOverlay';
import RangeBandsOverlay from '../components/encounter/RangeBandsOverlay';
import { useSession } from '../contexts/SessionContext';
import { useSceneSnapshot } from './useSceneSnapshot';
import { useMoverMapSurface } from './useMoverMapSurface';
import { useBridgeStatus } from './useBridgeStatus';
import { useTapOrder } from './useTapOrder';
import { useAdjacency } from './useAdjacency';
import { buildTokenMarkers } from '../utils/tokenMarkers';
import { hitTestMarkers } from '../utils/markerHitTest';
import { buildRangeBands, originWorldFromPosition } from '../utils/rangeBands';
import { targetFramingRadiusFeet, meleeReachFeet } from '../utils/targetFraming';
import { parseRangeIncrement } from '../utils/rangeIncrement';
import { MAP_TARGET_PROTOCOL } from '../utils/movement';
import { RELAY } from '../sync/keys';

/**
 * Tap-to-target on the live map (#1749 S4/S5).
 *
 * ## Where it lives, and why there is no toggle (OQ-6 ruling)
 *
 * The map mounts inside `RollSheet`'s `editPanel`, right beside `TargetPicker`.
 * Grid-vs-map for MOVEMENT are true alternatives (each is a complete
 * destination picker, hence `MOVE_SURFACE_PREF`); chips and map are not — the
 * chips say WHO, the map says WHERE, and both write the same `useTargeting`
 * set. So they are one surface, shown together, with no preference to store.
 *
 * ## When the capture fires (OQ-6 + OQ-7 rulings)
 *
 * NEVER on modal open. `editPanel` is collapsed by default, so the "Show the
 * battlefield" button below is not even reachable until the player expands it,
 * and tapping it is what sends the one `snapreq { moverId, radiusFeet }`.
 * `useSceneSnapshot` permits one in-flight request per CLIENT, not globally —
 * N players opening ability modals would be N captures on the GM's machine —
 * and OQ-7's ruling is "expand-gate only; measure before adding any broadcast
 * trigger". An explicit tap is the strictest reading of that gate: opening
 * Edit to override a frequency lock or nudge the MAP step costs the GM client
 * nothing.
 *
 * `shown` deliberately lives HERE, above the panel, not inside the rendered
 * section: collapsing and re-expanding `editPanel` unmounts and remounts the
 * JSX, and a mount-triggered capture would fire again every time. Held here,
 * the snapshot survives the collapse and the `active` false→true edge that
 * `useMoverMapSurface` keys on happens exactly once per "Show". Hiding the map
 * (or closing the modal) tears the hook's effect down, which `cancel()`s an
 * unanswered request so the client's one in-flight slot is freed.
 *
 * `useMoverMapSurface` will also adopt the bridge's unsolicited post-`movedone`
 * rebroadcast when it names this same mover. That capture is framed on 1.5x
 * Speed rather than on our range, which is fine and deliberately left alone:
 * every overlay here derives its geometry from the snapshot's OWN transform,
 * so a differently-framed picture is still exactly as correct — just wider or
 * tighter — and it is strictly fresher than the one it replaces.
 *
 * ## What a tap does
 *
 * `MapSnapshotViewer.onPick` → `hitTestMarkers` (direct footprint hit, else
 * nearest marker centre within a CSS-px radius) → `toggleTarget(entryId)`,
 * byte-identical to tapping that creature's chip, because `entryId` IS the
 * Foundry combatant id on both paths. The tap ALSO records itself in
 * `useTapOrder`, which ordered resolvers (multi-ray) consume as a per-ray
 * default — OQ-2's option (b): the map keeps its own sequence, `useTargeting`
 * stays an unordered set for the five other flows that share it.
 *
 * Focus is deliberately NOT touched. `useFocusTarget.toggleFocus` has exactly
 * one caller in the app (`InitiativeStrip`'s `Target ▸` row); `UseAbilityModal`
 * only READS `focusEnemy`, to seed `defaultTargetId`. A map tap that silently
 * re-pointed the dossier would be a side effect no chip tap has.
 *
 * ## Degradation
 *
 * No bridge, no snapshot support, protocol below MAP_TARGET_PROTOCOL, no
 * `positions`, or nothing selectable → this returns `section: null` and the
 * edit panel looks exactly as it does today: chips only. A capture that comes
 * back `ok:false` or times out lands on `status === 'unavailable'` and says so
 * without disturbing the chips.
 *
 * Section-hook shape, matching the #1317 D1/D2 pattern:
 *   { section, tapOrder, mapShown, radiusFeet }
 *
 * @param {Object}   opts
 * @param {string}   opts.charId          the attacker (the capture is centred on them)
 * @param {Object}   opts.ability
 * @param {boolean}  opts.isRangedStrike  `ability.type === 'ranged'`
 * @param {Array}    opts.order           encounter order entries
 * @param {Object}   opts.positionsState  cnmh_positions_global: { gridSize, positions }
 * @param {string}   opts.casterEntryId   the attacker's own entryId (range/reach origin)
 * @param {Array}    opts.targets         the live `useTargeting` selection
 * @param {Array}    opts.selectable      `useTargeting.selectable` — the ONLY tappable set
 * @param {Function} opts.toggleTarget    `useTargeting.toggleTarget`
 * @param {Array}    [opts.flankedIds]    entryIds this attacker flanks (useFlanking)
 * @param {number}   [opts.maxTaps]       cap for the tap-order list (multi-ray's rayCount)
 */
export const useMapTargetSection = ({
  charId,
  ability,
  isRangedStrike = false,
  order = [],
  positionsState,
  casterEntryId,
  targets = [],
  selectable = [],
  toggleTarget,
  flankedIds = [],
  maxTaps,
} = {}) => {
  const [shown, setShown] = useState(false);
  const { sendUpdate } = useSession();
  const { available } = useSceneSnapshot();
  const { protocol } = useBridgeStatus();
  const { inReach } = useAdjacency(charId);
  const tapOrder = useTapOrder({ max: maxTaps });

  const radiusFeet = useMemo(
    () => targetFramingRadiusFeet({ ability, isRangedStrike }),
    [ability, isRangedStrike]
  );

  const { status, snapshot } = useMoverMapSurface(charId, { active: shown, radiusFeet });

  // The one marker derivation: the overlay draws it and the hit test resolves
  // against it, so "where is this marker" cannot disagree between the picture
  // and the tap. Restricted to what the CHIPS could target — a creature the
  // chip row won't offer (hidden, per OQ-5; or self on a flow that excludes
  // self) must not become targetable just because it has a token.
  const selectableIds = useMemo(
    () => new Set((selectable || []).map((e) => e.entryId)),
    [selectable]
  );
  const markers = useMemo(
    () => buildTokenMarkers({ positions: positionsState, order, snapshot }),
    [positionsState, order, snapshot]
  );
  const tappable = useMemo(
    () => markers.filter((m) => selectableIds.has(m.entryId)),
    [markers, selectableIds]
  );

  // Range bands (S5) from the SAME parse `buildStrikeRangeGating` feeds
  // `rangeIncrementResult`: a ranged Strike gets its increments, everything
  // else gets a reach ring.
  const bands = useMemo(() => buildRangeBands({
    incrementFt: isRangedStrike ? parseRangeIncrement(ability?.range) : null,
    reachFt: meleeReachFeet(ability),
  }), [ability, isRangedStrike]);

  const originWorld = useMemo(
    () => originWorldFromPosition(
      positionsState?.positions?.[casterEntryId],
      snapshot?.gridSize ?? positionsState?.gridSize
    ),
    [positionsState, casterEntryId, snapshot]
  );

  // `inReach` fails open (no adjacency data ⇒ everything reads reachable), so
  // this dims nothing until the bridge actually says so — and only for melee,
  // where reach is the relevant question at all.
  const outOfReachIds = useMemo(() => {
    if (isRangedStrike) return [];
    return tappable.filter((m) => !inReach(m.entryId)).map((m) => m.entryId);
  }, [tappable, inReach, isRangedStrike]);

  const onMapTap = useCallback(({ nx, ny, paneWidthPx, paneHeightPx }) => {
    const hit = hitTestMarkers({ nx, ny }, tappable, { paneWidthPx, paneHeightPx });
    if (!hit) return;   // empty ground: a miss is a no-op, never a cleared set
    toggleTarget?.(hit.entryId);
    tapOrder.toggle(hit.entryId);
  }, [tappable, toggleTarget, tapOrder]);

  const show = useCallback(() => {
    // The image and the markers come from two different channels, and only one
    // of them is being captured right now. `UseAbilityModal` already refreshes
    // `positions` on open for a RANGED strike (it needs the distances); a melee
    // flow never did, so without this the markers could be drawn from a push
    // several turns old on top of a snapshot taken this second. Same
    // fire-and-forget request, at the moment the picture is about to matter.
    sendUpdate?.('global', RELAY.POSITIONSREQ, { ts: Date.now() });
    setShown(true);
  }, [sendUpdate]);
  const hide = useCallback(() => setShown(false), []);

  // Gate on everything the surface genuinely needs before offering it at all —
  // an affordance that can only disappoint is worse than the chip row alone.
  const eligible = !!charId
    && available
    && (protocol ?? 0) >= MAP_TARGET_PROTOCOL
    && !!positionsState?.positions
    && (selectable || []).length > 0;

  const section = !eligible ? null : (
    <>
      <hr className="ct-divider" />
      <section className="ct-section" data-testid="map-target-section">
        <h3 className="ct-section-title">Battlefield</h3>

        {!shown && (
          <button
            type="button"
            className="btn-secondary"
            onClick={show}
            data-testid="map-target-show"
          >
            Show the battlefield
          </button>
        )}

        {shown && status === 'loading' && (
          <div className="uam-variant-note" role="status">Framing the battlefield…</div>
        )}

        {shown && status === 'unavailable' && (
          <div className="uam-variant-note" role="status">
            No map came back — pick your targets from the list.
          </div>
        )}

        {shown && status === 'ready' && snapshot && (
          <>
            <MapSnapshotViewer
              src={snapshot.url}
              onPick={onMapTap}
              overlay={(
                <>
                  <RangeBandsOverlay
                    snapshot={snapshot}
                    originWorld={originWorld}
                    bands={bands}
                  />
                  <TokenMarkersOverlay
                    snapshot={snapshot}
                    markers={markers}
                    selectedIds={targets}
                    flankedIds={flankedIds}
                    outOfReachIds={outOfReachIds}
                    originId={casterEntryId}
                  />
                </>
              )}
            />
            <p className="uam-variant-note">
              Tap a creature to target it — the same selection as the list above.
              Rings are a hint; the GM&apos;s canvas is the authority.
            </p>
          </>
        )}

        {shown && (
          <button type="button" className="btn-secondary" onClick={hide}>
            Hide the battlefield
          </button>
        )}
      </section>
    </>
  );

  return { section, tapOrder, mapShown: shown, radiusFeet };
};

export default useMapTargetSection;
