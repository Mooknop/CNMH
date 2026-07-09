// App half of the relay contract (#1308): the highest-traffic consumers run
// against the RECORDED bridge fixtures (see relayFixtures.js) instead of
// hand-rolled payloads. If the bridge changes a field and re-records, the
// assertions here fail until the consumer is updated — the tripwire.
import { act } from '@testing-library/react';
import { renderHookWithProviders } from './renderWithProviders';
import { relayFixtures, pushRelayFixture } from './relayFixtures';
import { RELAY } from '../sync/keys';
import { useTokenMovement } from '../hooks/useTokenMovement';
import { useEncounter } from '../hooks/useEncounter';
import { useAdjacency } from '../hooks/useAdjacency';
import { useMinions } from '../hooks/useMinions';
import { useDoors } from '../hooks/useDoors';
import { useCharacterLiveState } from '../hooks/useCharacterLiveState';

beforeEach(() => window.localStorage.clear());

describe('movement chain (moveopts / movedone / nextOpts)', () => {
  it('useTokenMovement opens the picker from the recorded moveopts payload', () => {
    const { result, session } = renderHookWithProviders(() => useTokenMovement('Pellias'));
    act(() => result.current.requestMove('step'));
    const { ts } = session.sent.at(-1).value;

    act(() => { pushRelayFixture(session, RELAY.MOVEOPTS, { charId: 'Pellias', reqTs: ts }); });

    expect(result.current.stage).toBe('picking');
    const opts = result.current.pickerOpts;
    // The fields the app actually reads off the wire payload. Typed asserts on
    // purpose (not fixture-equality): if the bridge renames a field and the
    // fixture is re-recorded, these fail instead of passing vacuously on
    // undefined === undefined.
    expect(opts.speed).toEqual(expect.any(Number));
    expect(opts.originOccupied).toEqual(expect.any(Boolean));
    expect(opts.origin).toMatchObject({ col: expect.any(Number), row: expect.any(Number) });
    expect(opts.gridSize).toBeGreaterThan(0);
    expect(opts.reachable.length).toBeGreaterThan(0);
    expect(opts.reachable[0]).toMatchObject({ col: expect.any(Number), row: expect.any(Number), feet: expect.any(Number) });
    expect(opts.blocked[0]).toMatchObject({ col: expect.any(Number), row: expect.any(Number), kind: expect.any(String) });
  });

  it('movedone resolves the move and its nextOpts feed a free refresh', () => {
    const onMoveDone = vi.fn();
    const { result, session } = renderHookWithProviders(() => useTokenMovement('Pellias', { onMoveDone }));
    act(() => result.current.requestMove('step'));
    const { ts } = session.sent.at(-1).value;
    act(() => { pushRelayFixture(session, RELAY.MOVEOPTS, { charId: 'Pellias', reqTs: ts }); });
    act(() => result.current.confirmMove({ col: 6, row: 5 , x: 600, y: 500 }, 1));

    act(() => { pushRelayFixture(session, RELAY.MOVEDONE, { charId: 'Pellias', reqTs: ts }); });

    expect(onMoveDone).toHaveBeenCalledWith(expect.objectContaining({
      newPosition: expect.objectContaining({ col: expect.any(Number), row: expect.any(Number) }),
      feetMoved: expect.any(Number),
    }));

    // The recorded payload's piggybacked nextOpts must satisfy a refresh with
    // NO extra movereq round-trip (#451).
    const sentBefore = session.sent.length;
    act(() => result.current.requestMoveRefresh('step'));
    expect(result.current.stage).toBe('picking');
    expect(result.current.pickerOpts).toMatchObject({ speed: expect.any(Number), reachable: expect.any(Array) });
    expect(session.sent.length).toBe(sentBefore);
  });
});

describe('encounter', () => {
  it('useEncounter exposes the recorded encounter payload fields', () => {
    const { result, session } = renderHookWithProviders(() => useEncounter());
    act(() => { pushRelayFixture(session, RELAY.ENCOUNTER); });

    const enc = result.current.encounter;
    expect(enc.active).toBe(true);
    expect(enc.round).toBe(relayFixtures.encounter.value.round);
    expect(enc.order.length).toBe(relayFixtures.encounter.value.order.length);
    expect(enc.order[0]).toMatchObject({ entryId: expect.any(String), kind: expect.any(String), name: expect.any(String) });
  });
});

describe('adjacency', () => {
  it('useAdjacency gates reach on the recorded adjacency map', () => {
    const adjacency = relayFixtures.adjacency.value;
    const [viewerEntry, otherEntry] = Object.keys(adjacency);
    const { result, session } = renderHookWithProviders(() => useAdjacency('Pellias'));

    // Encounter order ties the viewer's charId to an entryId present in the map.
    const order = [{ ...relayFixtures.encounter.value.order[0], entryId: viewerEntry, kind: 'pc', charId: 'Pellias' }];
    act(() => { pushRelayFixture(session, RELAY.ENCOUNTER, { order }); });
    act(() => { pushRelayFixture(session, RELAY.ADJACENCY); });

    expect(result.current.hasData).toBe(true);
    expect(result.current.viewerEntryId).toBe(viewerEntry);
    expect(result.current.inReach(otherEntry)).toBe(adjacency[viewerEntry].includes(otherEntry));
  });
});

describe('character live state (hp / conditions)', () => {
  it('useCharacterLiveState reflects the recorded hp and conditions payloads', () => {
    const { result, session } = renderHookWithProviders(() => useCharacterLiveState('Pellias'));
    act(() => { pushRelayFixture(session, RELAY.HP, { charId: 'Pellias' }); });
    act(() => { pushRelayFixture(session, RELAY.CONDITIONS, { charId: 'Pellias' }); });

    expect(result.current.liveState.hp).toMatchObject({
      current: expect.any(Number),
      max: expect.any(Number),
    });
    expect(result.current.liveState.conditions[0]).toMatchObject({ id: expect.any(String), value: expect.any(Number) });
  });
});

describe('minions', () => {
  it('useMinions reads role HP from the recorded merged minions payload', () => {
    const { result, session } = renderHookWithProviders(() => useMinions('Ashka'));
    act(() => { pushRelayFixture(session, RELAY.MINIONS, { charId: 'Ashka' }); });

    const fixtureHp = relayFixtures.minions.value.companion.hp;
    expect(fixtureHp).toMatchObject({ current: expect.any(Number), max: expect.any(Number) });
    expect(result.current.getHp('companion')).toEqual({
      current: fixtureHp.current,
      max: fixtureHp.max,
      temp: fixtureHp.temp,
    });
  });
});

describe('doors', () => {
  it('useDoors renders the recorded dooropts doors list', () => {
    const { result, session } = renderHookWithProviders(() => useDoors('Pellias'));
    // Hook fires a doorreq on mount; the reply is uncorrelated by design.
    expect(session.sent.at(-1)).toMatchObject({ stateType: RELAY.DOORREQ });

    act(() => { pushRelayFixture(session, RELAY.DOOROPTS, { charId: 'Pellias' }); });

    expect(result.current.doors.length).toBe(relayFixtures.dooropts.value.doors.length);
    expect(result.current.doors[0]).toMatchObject({ wallId: expect.any(String), state: expect.any(Number) });
  });
});
