// App-side half of the inbound relay-contract tripwire (#1749 S1 follow-up).
//
// The outbound rail (relayFixtures.js + relayConsumers.test.jsx +
// foundry-bridge/relayContract.test.js) records bridge→app emissions and
// shape-checks them against a committed fixture both sides import. Inbound
// channels (app→bridge) never had that: relayContract.test.js drove handlers
// with inline arguments, so an app-side payload rename never tripped a named
// bridge test.
//
// This file is the app half of the mirrored rail. For each of the three
// covered inbound channels — `action`, `moveplan`, `snapreq` (the epic's ask
// plus the two other inbound contracts shipped in the last three weeks) — it
// drives the REAL producer hook and shape-compares its emission against the
// SAME fixture file foundry-bridge/relayContractInbound.test.js drives its
// handler with (via diffShapes — the identical shape checker the outbound
// rail uses). A field rename on either side now fails a named test on both.
//
// See foundry-bridge/README.md's "Relay contract tests" section for the
// update rule (hand-author the fixture from the real producer's shape; never
// generate it from a schema) and the remaining uncovered inbound channels.
import { act } from '@testing-library/react';
import { renderHookWithProviders } from './renderWithProviders';
import { diffShapes } from '../../foundry-bridge/__fixtures__/relay/shape.js';
import actionFixture from '../../foundry-bridge/__fixtures__/relay/inbound/action.json';
import moveplanFixture from '../../foundry-bridge/__fixtures__/relay/inbound/moveplan.json';
import snapreqFixture from '../../foundry-bridge/__fixtures__/relay/inbound/snapreq.json';
import auraSetFixture from '../../foundry-bridge/__fixtures__/relay/inbound/auraset.json';
import groupmovereqFixture from '../../foundry-bridge/__fixtures__/relay/inbound/groupmovereq.json';
import { RELAY } from '../sync/keys';
import { useActionTargetSync, ACTION_SYNC_DEBOUNCE_MS } from '../hooks/useActionTargetSync';
import { useTokenMovement } from '../hooks/useTokenMovement';
import { useMoverMapSurface } from '../hooks/useMoverMapSurface';
import { useGroupMove } from '../hooks/useGroupMove';
import { buildAuraSet } from '../utils/auraRelay';

// useSyncedState mirrors every incoming update to REAL window.localStorage —
// a value left behind by an earlier test would otherwise hydrate a brand-new
// hook instance and defeat the "nothing sent yet" assertions here.
beforeEach(() => window.localStorage.clear());

const sentOn = (session, key) => session.sent.filter((m) => m.stateType === key);

describe('inbound relay contract — app producers (#1749 S1 follow-up)', () => {
  describe(`${RELAY.ACTION} — useActionTargetSync`, () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('emits the same shape the fixture drives the bridge handler with', () => {
      const { session } = renderHookWithProviders(
        () => useActionTargetSync(
          actionFixture.characterId,
          actionFixture.value.targets,
          { kind: actionFixture.value.kind, sourceUid: actionFixture.value.sourceUid }
        ),
        { session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 17 } } } } }
      );
      act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });

      const sent = sentOn(session, RELAY.ACTION);
      expect(sent).toHaveLength(1);
      const emitted = { characterId: sent[0].characterId, value: sent[0].value };

      expect(diffShapes(emitted, actionFixture)).toEqual([]);
      // Anti-vacuous: the actual values, not just field names/types — a bridge
      // rename AND a value regression both fail here.
      expect(emitted).toEqual({
        characterId: actionFixture.characterId,
        value: {
          kind: actionFixture.value.kind,
          sourceUid: actionFixture.value.sourceUid,
          targets: actionFixture.value.targets,
          ts: expect.any(Number),
        },
      });
    });
  });

  describe(`${RELAY.MOVEPLAN} — useTokenMovement.planMove`, () => {
    it('emits the same shape the fixture drives the bridge handler with', () => {
      const { result, session } = renderHookWithProviders(
        () => useTokenMovement(moveplanFixture.characterId)
      );

      // planMove sends `moveType: pendingMoveType`, set by an initial
      // requestMove — mirrors the real MoveActionSheet lifecycle (#1736 S2).
      act(() => result.current.requestMove(moveplanFixture.value.moveType));
      act(() => result.current.planMove(moveplanFixture.value.waypoints));

      const sent = sentOn(session, RELAY.MOVEPLAN);
      expect(sent).toHaveLength(1);
      const emitted = { characterId: sent[0].characterId, value: sent[0].value };

      expect(diffShapes(emitted, moveplanFixture)).toEqual([]);
      expect(emitted).toEqual({
        characterId: moveplanFixture.characterId,
        value: {
          waypoints: moveplanFixture.value.waypoints,
          moveType: moveplanFixture.value.moveType,
          ts: expect.any(Number),
        },
      });
    });
  });

  // The party-framed variant of this same channel (`{ party: true }`, #1807 /
  // #1808's usePartyMapSurface) has no inbound fixture yet: adding one is only
  // meaningful paired with a bridge-side recipe in relayContractInbound.test.js,
  // so it waits for a bridge PR. Its emitted shape is asserted app-side in
  // src/components/gm/DockExplorationPane.test.jsx meanwhile.
  describe(`${RELAY.SNAPREQ} — useMoverMapSurface (attacker-centered capture)`, () => {
    it('emits the same shape the fixture drives the bridge handler with', () => {
      const { session } = renderHookWithProviders(
        () => useMoverMapSurface(snapreqFixture.value.moverId, {
          active: true,
          radiusFeet: snapreqFixture.value.radiusFeet,
        }),
        { session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 17 } } } } }
      );

      const sent = sentOn(session, RELAY.SNAPREQ);
      expect(sent).toHaveLength(1);
      const emitted = { characterId: sent[0].characterId, value: sent[0].value };

      expect(diffShapes(emitted, snapreqFixture)).toEqual([]);
      // Anti-vacuous, minus `id` — it's generated fresh per call, so it's
      // asserted as a string rather than pinned to the fixture's literal.
      expect(emitted.characterId).toBe(snapreqFixture.characterId);
      expect(emitted.value).toMatchObject({
        moverId: snapreqFixture.value.moverId,
        radiusFeet: snapreqFixture.value.radiusFeet,
      });
      expect(typeof emitted.value.id).toBe('string');
      expect(typeof emitted.value.ts).toBe('number');
    });
  });

  describe(`${RELAY.GROUPMOVEREQ} — useGroupMove.dispatch (#1825, epic #1822 B1)`, () => {
    it('emits the same shape the fixture drives the bridge handler with', () => {
      const { result, session } = renderHookWithProviders(() => useGroupMove());

      act(() => { result.current.dispatch(groupmovereqFixture.value.moverIds, groupmovereqFixture.value.target); });

      const sent = sentOn(session, RELAY.GROUPMOVEREQ);
      expect(sent).toHaveLength(1);
      const emitted = { characterId: sent[0].characterId, value: sent[0].value };

      expect(diffShapes(emitted, groupmovereqFixture)).toEqual([]);
      // Anti-vacuous, minus `id` — it's generated fresh per call, like every
      // other id-correlated request builder (see the moveplan note above).
      expect(emitted.characterId).toBe(groupmovereqFixture.characterId);
      expect(emitted.value).toMatchObject({
        moverIds: groupmovereqFixture.value.moverIds,
        target: groupmovereqFixture.value.target,
      });
      expect(typeof emitted.value.id).toBe('string');
      expect(typeof emitted.value.ts).toBe('number');
    });
  });

  describe(`${RELAY.AURASET} — buildAuraSet (#1733 S1 app producer)`, () => {
    // `useAuraRegionSync` (the wired mirror, `src/hooks/useAuraRegionSync.jsx`)
    // is GM-gated + reads its own bridge-status/session context, which this
    // suite's provider stack doesn't stand up (unlike the other three hooks
    // here, none of which are GM-gated) — see that hook's own test file for
    // full coverage of the GATING behaviour. What's under test HERE is the
    // WIRE SHAPE the mirror's one call site builds, so this drives
    // `buildAuraSet` directly — the exact function `useAuraRegionSync` calls
    // to shape `RELAY.AURASET`'s payload (the builder-in-utils /
    // wiring-in-hooks split `auraRelay.js`'s header documents).
    it('emits the same shape the fixture drives the bridge handler with', () => {
      const emitted = {
        characterId: auraSetFixture.characterId,
        value: buildAuraSet({
          active: auraSetFixture.value.active,
          feet: auraSetFixture.value.feet,
          label: auraSetFixture.value.label,
          color: auraSetFixture.value.color,
        }),
      };

      expect(diffShapes(emitted, auraSetFixture)).toEqual([]);
      expect(emitted).toEqual({
        characterId: auraSetFixture.characterId,
        value: {
          active: auraSetFixture.value.active,
          feet: auraSetFixture.value.feet,
          label: auraSetFixture.value.label,
          color: auraSetFixture.value.color,
          ts: expect.any(Number),
        },
      });
    });

    // Contract drift this stitch caught (#1733 S4/E2E): the fixture pins a
    // `color` field (README: "optional presentation for the ring"), and
    // `buildAuraSet` genuinely supports one — but `useAuraRegionSync`, its
    // ONLY real call site, derives its opts from `auraProfile()`
    // (`utils/kineticAura.js`), which returns just `{ feet, label }`. There is
    // no authoring path for an aura ring color anywhere in the app today, so
    // in practice `auraset` NEVER carries `color` — a narrower emission than
    // the fixture's full documented shape. Not a bug (color is contract-
    // optional on the bridge side), but worth pinning explicitly rather than
    // leaving it to be rediscovered.
    it('the real mirror never authors a color today — auraProfile has no color field to read', () => {
      const noColor = buildAuraSet({ active: true, feet: 10, label: 'Channel Elements' });
      expect('color' in noColor).toBe(false);
    });
  });
});
