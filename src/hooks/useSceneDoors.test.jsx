import { act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { pushRelayFixture } from '../test/relayFixtures';
import { useSceneDoors } from './useSceneDoors';
import { RELAY, SCENE_DOORS_PROTOCOL } from '../sync/keys';

// useSyncedState mirrors every incoming update to REAL window.localStorage —
// a stale dooropts_global from an earlier test would otherwise hydrate a
// brand-new hook instance (see useMoverMapSurface.test.jsx for the same note).
beforeEach(() => window.localStorage.clear());

const mountHook = (protocol = SCENE_DOORS_PROTOCOL) => renderHookWithProviders(
  () => useSceneDoors(),
  { session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol } } } } }
);

const sentOf = (session, key) => session.sent.filter((m) => m.stateType === key).at(-1);

describe('useSceneDoors (#1809, epic #1804 S5)', () => {
  it('requests every scene door on mount once the protocol floor is met', () => {
    const { session } = mountHook();
    const req = sentOf(session, RELAY.DOORREQ);
    expect(req).toMatchObject({ characterId: 'global' });
    expect(req.value).toMatchObject({ ts: expect.any(Number) });
    expect(req.value.wallId).toBeUndefined();
  });

  it('exposes the recorded scene doors, secret door included', () => {
    const { result, session } = mountHook();
    act(() => { pushRelayFixture(session, 'dooroptsGlobal'); });

    expect(result.current.doors).toHaveLength(3);
    expect(result.current.doors.find((d) => d.wallId === 'w2')).toMatchObject({ secret: true, state: 0 });
    expect(result.current.doors.find((d) => d.wallId === 'w1')).not.toHaveProperty('secret');
    expect(result.current.sceneId).toBe('scene-1');
  });

  it('tracks a later re-push (e.g. a native Foundry door open) with no re-request', () => {
    const { result, session } = mountHook();
    act(() => { pushRelayFixture(session, 'dooroptsGlobal'); });
    expect(result.current.doors.find((d) => d.wallId === 'w1').state).toBe(0);

    const before = session.sent.filter((s) => s.stateType === RELAY.DOORREQ).length;
    act(() => {
      pushRelayFixture(session, 'dooroptsGlobal', {
        doors: [{ wallId: 'w1', state: 1, x: 450, y: 500 }],
        reqTs: null,
      });
    });

    expect(result.current.doors).toEqual([{ wallId: 'w1', state: 1, x: 450, y: 500 }]);
    expect(session.sent.filter((s) => s.stateType === RELAY.DOORREQ)).toHaveLength(before);
  });

  it('interactDoor writes doorinteract_global with the wallId and op', () => {
    const { result, session } = mountHook();
    act(() => { result.current.interactDoor('w1', 'open'); });

    const sent = sentOf(session, RELAY.DOORINTERACT);
    expect(sent).toMatchObject({ characterId: 'global' });
    expect(sent.value).toMatchObject({ wallId: 'w1', op: 'open', ts: expect.any(Number) });
  });

  it('never requests, and reports doors as empty, below the protocol floor', () => {
    const { result, session } = mountHook(SCENE_DOORS_PROTOCOL - 1);
    expect(sentOf(session, RELAY.DOORREQ)).toBeUndefined();
    expect(result.current.eligible).toBe(false);
    expect(result.current.doors).toEqual([]);
  });
});
