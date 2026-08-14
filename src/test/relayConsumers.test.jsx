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
import { useFoeKit } from '../hooks/useFoeKit';
import { usePathPreview } from '../hooks/usePathPreview';

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

  it('useTokenMovement reaches "planned" from the recorded moveplanned payload (#1736)', () => {
    const { result, session } = renderHookWithProviders(() => useTokenMovement('Pellias'));
    act(() => result.current.requestMove('stride'));
    const { ts: optsTs } = session.sent.at(-1).value;
    act(() => { pushRelayFixture(session, RELAY.MOVEOPTS, { charId: 'Pellias', reqTs: optsTs }); });

    act(() => result.current.planMove([{ col: 8, row: 6 }]));
    const { ts: planTs } = session.sent.at(-1).value;
    act(() => { pushRelayFixture(session, RELAY.MOVEPLANNED, { charId: 'Pellias', reqTs: planTs }); });

    expect(result.current.stage).toBe('planned');
    const planned = result.current.plannedPath;
    // Typed asserts on the fields the app reads off the wire (see the moveopts
    // note above): a bridge-side rename + re-record fails here, not vacuously.
    expect(planned.costFeet).toEqual(expect.any(Number));
    expect(planned.clipped).toEqual(expect.any(Boolean));
    expect(planned.path.length).toBeGreaterThan(0);
    expect(planned.path[0]).toMatchObject({ col: expect.any(Number), row: expect.any(Number) });

    // Confirming forwards the recorded path cells as the moveconfirm waypoints.
    act(() => result.current.confirmPlannedMove(1));
    const confirm = session.sent.at(-1);
    expect(confirm.stateType).toBe(RELAY.MOVECONFIRM);
    expect(confirm.value.waypoints).toEqual(planned.path);
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

describe('foekit (#1531)', () => {
  it('useFoeKit exposes the recorded kit for the matching entry', () => {
    const recordedEntryId = relayFixtures.foekit.value.entryId;
    const { result, session } = renderHookWithProviders(() => useFoeKit(recordedEntryId));
    act(() => { pushRelayFixture(session, RELAY.FOEKIT); });

    // The fields the pane actually reads — typed asserts so a bridge re-record
    // that renames one fails here instead of passing on undefined.
    expect(result.current.strikes[0]).toMatchObject({
      index: expect.any(Number),
      label: expect.any(String),
      attackModifier: expect.any(Number),
      variantLabels: expect.any(Array),
      damage: expect.any(Array),
    });
    expect(result.current.strikes[0].damage[0]).toMatchObject({
      formula: expect.any(String), type: expect.any(String),
    });
    expect(result.current.spellcasting[0]).toMatchObject({
      name: expect.any(String),
      dc: expect.any(Number),
      spells: expect.any(Array),
    });
    expect(result.current.spellcasting[0].spells[0]).toMatchObject({
      name: expect.any(String), rank: expect.any(Number),
    });
    expect(result.current.abilities[0]).toMatchObject({
      name: expect.any(String), actionType: expect.any(String),
    });
    expect(result.current.skills[0]).toMatchObject({
      slug: expect.any(String), mod: expect.any(Number),
    });
  });

  it('guards against a stale kit keyed to another combatant', () => {
    const { result, session } = renderHookWithProviders(() => useFoeKit('cbt-someone-else'));
    act(() => { pushRelayFixture(session, RELAY.FOEKIT); });
    expect(result.current).toBeNull();
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

describe('pathpreview (#1744 S3/WS-4)', () => {
  it('usePathPreview surfaces a friendly mover from the recorded PUBLIC payload', () => {
    const { result, session } = renderHookWithProviders(() => usePathPreview({ audience: 'player' }));
    act(() => { session.push('global', RELAY.BRIDGEHELLO, { protocol: 16, module: '0.0.0-test' }); });
    // The recorded fixture's `ts` is a fixed point in the past — override it
    // to "now" so the client TTL (which anchors expiry to `ts`, not arrival)
    // doesn't treat a perfectly valid recorded payload as already stale.
    act(() => { pushRelayFixture(session, RELAY.PATHPREVIEW, { ts: Date.now() }); });

    expect(result.current.entries).toHaveLength(1);
    // Typed asserts on the fields the ghost overlay actually reads off the
    // wire (see the moveopts note above): a bridge-side rename + re-record
    // fails here, not vacuously on undefined === undefined.
    const entry = result.current.entries[0];
    expect(entry.tokenId).toEqual(expect.any(String));
    expect(entry.name).toEqual(expect.any(String));
    expect(entry.phase).toMatch(/^(plan|move)$/);
    expect(entry.origin).toMatchObject({ col: expect.any(Number), row: expect.any(Number) });
    expect(entry.path.length).toBeGreaterThan(0);
    expect(entry.path[0]).toMatchObject({ col: expect.any(Number), row: expect.any(Number) });
  });

  it('usePathPreview({ audience: "gm" }) surfaces the recorded UNFILTERED payload (a hostile mover the public channel would drop)', () => {
    const { result, session } = renderHookWithProviders(() => usePathPreview({ audience: 'gm' }));
    act(() => { session.push('global', RELAY.BRIDGEHELLO, { protocol: 16, module: '0.0.0-test' }); });
    act(() => { pushRelayFixture(session, RELAY.PATHPREVIEWGM, { ts: Date.now() }); });

    expect(result.current.entries).toHaveLength(1);
    const entry = result.current.entries[0];
    expect(entry.name).toEqual(expect.any(String));
    expect(entry.disposition).toEqual(relayFixtures.pathpreviewgm.value.disposition);
    expect(entry.path.length).toBeGreaterThan(0);
  });

  it('returns nothing below the map-move protocol floor even with a live recorded payload', () => {
    const { result, session } = renderHookWithProviders(() => usePathPreview({ audience: 'player' }));
    act(() => { session.push('global', RELAY.BRIDGEHELLO, { protocol: 15, module: '0.0.0-test' }); });
    act(() => { pushRelayFixture(session, RELAY.PATHPREVIEW); });

    expect(result.current.entries).toEqual([]);
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
