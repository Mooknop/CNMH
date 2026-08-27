import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { relayFixtures, pushRelayFixture } from '../../test/relayFixtures';
import { RELAY } from '../../sync/keys';
import { PARTY_MAP_PROTOCOL } from '../../utils/snapshotRelay';
import DockExplorationPane from './DockExplorationPane';

// The pane is the party-map control surface (#1808, epic #1804 S4): one
// party-framed snapshot, tap a PC to select them, tap a destination to move
// them, no confirm gate. Everything below runs against the REAL provider
// stack and the RECORDED bridge fixtures (snapdone-party / moveopts /
// moveplanned / movedone), so a bridge-side payload rename fails here.

const PARTY = relayFixtures.snapdoneParty.value;
const CAPTURE = PARTY.capture;

// The image occupies the capture's own screen rect, so a client-space tap
// lands on `world * capture.a` (tx/ty are 0 in the recording) and the
// normalized math the pane does is exact.
const IMG_RECT = {
  left: 0, top: 0, width: CAPTURE.screenW, height: CAPTURE.screenH,
  right: CAPTURE.screenW, bottom: CAPTURE.screenH,
};

// World point → the client coordinate a tap on it needs.
const clientFor = ({ x, y }) => ({ x: x * CAPTURE.a + CAPTURE.tx, y: y * CAPTURE.d + CAPTURE.ty });

const CHARACTERS = [
  makeCharacter({ id: 'Pellias', name: 'Pellias' }),
  makeCharacter({ id: 'Ashka', name: 'Ashka' }),
];

const seededState = ({ protocol = PARTY_MAP_PROTOCOL, exploremove = true } = {}) => ({
  global: {
    [RELAY.BRIDGEHELLO]: { protocol, module: '0.0.0-test' },
    [RELAY.EXPLOREMOVE]: exploremove,
  },
});

const mountPane = (sessionOpts = {}) => {
  const utils = renderWithProviders(<DockExplorationPane />, {
    content: { character: CHARACTERS },
    session: { state: seededState(), ...sessionOpts },
  });
  return utils;
};

// Push the recorded party ack, correlated to whatever snapreq the pane just
// sent so the promise path settles too (the adoption path would take it
// anyway — that's what makes the post-movedone rebroadcast work).
const landPartyMap = (session) => {
  const req = [...session.sent].reverse().find((s) => s.stateType === RELAY.SNAPREQ);
  act(() => { pushRelayFixture(session, 'snapdoneParty', { id: req?.value?.id }); });
};

const withImageRect = (container) => {
  const img = container.querySelector('.msv-img');
  if (img) img.getBoundingClientRect = () => ({ ...IMG_RECT });
  return img;
};

// A clean single-pointer tap on the viewer frame.
const tapAt = (x, y, pointerId = 1) => {
  const frame = screen.getByTestId('map-snapshot-frame');
  fireEvent.pointerDown(frame, { pointerId, clientX: x, clientY: y });
  fireEvent.pointerUp(frame, { pointerId, clientX: x, clientY: y });
};

const tapWorld = (world, pointerId = 1) => {
  const { x, y } = clientFor(world);
  tapAt(x, y, pointerId);
};

const lastSent = (session, stateType) =>
  [...session.sent].reverse().find((s) => s.stateType === stateType) || null;

beforeEach(() => window.localStorage.clear());

describe('DockExplorationPane (#1808)', () => {
  it('asks the bridge for a party-framed capture on entry', () => {
    const { session } = mountPane();
    const req = lastSent(session, RELAY.SNAPREQ);
    expect(req).toMatchObject({ characterId: 'global' });
    expect(req.value).toMatchObject({ party: true, id: expect.any(String) });
    // A party request never names a mover — that's the other capture shape.
    expect(req.value.moverId).toBeUndefined();
  });

  it('draws a tappable marker per token in the recorded party ack', () => {
    const { session, container } = mountPane();
    landPartyMap(session);

    const markers = [...container.querySelectorAll('.pto-marker')];
    expect(markers.map((m) => m.dataset.moverId)).toEqual(
      PARTY.tokens.map((t) => t.moverId)
    );
    // Roster join: the marker wears the PC's name, not the bare mover id.
    expect(container.querySelector('.pto-label').textContent).toBe('Pellias');
    expect(screen.getByText('Tap a party member to move them.')).toBeInTheDocument();
  });

  it('tapping a PC selects them and probes their reachable squares (ignoreOccupancy)', () => {
    const { session, container } = mountPane();
    landPartyMap(session);
    withImageRect(container);

    act(() => { tapWorld(PARTY.tokens[0]); });

    const req = lastSent(session, RELAY.MOVEREQ);
    expect(req).toMatchObject({ characterId: 'Pellias' });
    // #1806/#617: exploration movement is blocked by walls and doors only.
    expect(req.value).toMatchObject({ moveType: 'stride', ignoreOccupancy: true });
    expect(container.querySelector('.pto-marker--selected')?.dataset.moverId).toBe('Pellias');
  });

  it('a destination tap plans the route and AUTO-CONFIRMS it — no confirm gate', () => {
    const { session, container } = mountPane();
    landPartyMap(session);
    withImageRect(container);

    act(() => { tapWorld(PARTY.tokens[0]); });
    const optsTs = lastSent(session, RELAY.MOVEREQ).value.ts;
    act(() => { pushRelayFixture(session, RELAY.MOVEOPTS, { charId: 'Pellias', reqTs: optsTs }); });

    // Tap an empty square well clear of every marker's snap radius.
    act(() => { tapWorld({ x: 1450, y: 950 }, 2); });

    const plan = lastSent(session, RELAY.MOVEPLAN);
    expect(plan).toMatchObject({ characterId: 'Pellias' });
    expect(plan.value.waypoints).toEqual([{ col: 14, row: 9 }]);

    // The planned route arriving is itself the confirmation — the pane sends
    // moveconfirm without any further interaction, and never renders a bar.
    act(() => {
      pushRelayFixture(session, RELAY.MOVEPLANNED, { charId: 'Pellias', reqTs: plan.value.ts });
    });

    const confirm = lastSent(session, RELAY.MOVECONFIRM);
    expect(confirm).toMatchObject({ characterId: 'Pellias' });
    expect(confirm.value.waypoints).toEqual(relayFixtures.moveplanned.value.path);
    expect(confirm.value.actionCost).toBe(0); // exploration has no action economy
    expect(confirm.value.ignoreOccupancy).toBe(true);
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument();
    expect(screen.getByText('Moving…')).toBeInTheDocument();
  });

  it('accrues the walked distance onto the shared exploredist tally', () => {
    const { session, container } = mountPane();
    landPartyMap(session);
    withImageRect(container);

    act(() => { tapWorld(PARTY.tokens[0]); });
    const optsTs = lastSent(session, RELAY.MOVEREQ).value.ts;
    act(() => { pushRelayFixture(session, RELAY.MOVEOPTS, { charId: 'Pellias', reqTs: optsTs }); });
    act(() => { tapWorld({ x: 1450, y: 950 }, 2); });
    const planTs = lastSent(session, RELAY.MOVEPLAN).value.ts;
    act(() => { pushRelayFixture(session, RELAY.MOVEPLANNED, { charId: 'Pellias', reqTs: planTs }); });

    act(() => { pushRelayFixture(session, RELAY.MOVEDONE, { charId: 'Pellias', reqTs: planTs }); });

    const feet = relayFixtures.movedone.value.feetMoved;
    expect(lastSent(session, 'exploredist')).toMatchObject({
      characterId: 'global',
      value: feet,
    });
    expect(screen.getByText(`${feet} ft`)).toBeInTheDocument();
  });

  it('adopts the bridge’s unsolicited party rebroadcast after a move', () => {
    const { session, container } = mountPane();
    landPartyMap(session);
    expect(container.querySelectorAll('.pto-marker')).toHaveLength(2);

    // No request id at all — exactly what the post-movedone broadcast looks
    // like. The pane must still adopt it (that is what refreshes the map).
    act(() => {
      pushRelayFixture(session, 'snapdoneParty', {
        id: 'broadcast-1',
        trigger: 'movedone',
        tokens: [{ moverId: 'Pellias', x: 1250, y: 550 }],
      });
    });

    const markers = [...container.querySelectorAll('.pto-marker')];
    expect(markers).toHaveLength(1);
    expect(markers[0].dataset.moverId).toBe('Pellias');
  });

  it('re-requests the capture on demand, keeping the last frame on screen', () => {
    const { session, container } = mountPane();
    landPartyMap(session);
    const before = session.sent.filter((s) => s.stateType === RELAY.SNAPREQ).length;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh map' }));

    expect(session.sent.filter((s) => s.stateType === RELAY.SNAPREQ)).toHaveLength(before + 1);
    expect(lastSent(session, RELAY.SNAPREQ).value).toMatchObject({ party: true });
    // The map IS the pane — a refresh must never blank it.
    expect(container.querySelector('.msv-img')).toBeInTheDocument();
    expect(screen.getByText('Refreshing map…')).toBeInTheDocument();
  });

  it('says the bridge is required instead of showing a map when Foundry is down', () => {
    const { container } = renderWithProviders(<DockExplorationPane />, {
      content: { character: CHARACTERS },
      session: { state: seededState(), foundryConnected: false },
    });
    expect(
      screen.getByText(`Party map needs the Foundry bridge (protocol ${PARTY_MAP_PROTOCOL}+).`)
    ).toBeInTheDocument();
    expect(container.querySelector('.msv-img')).toBeNull();
  });

  it('says the same below the party-map protocol floor', () => {
    renderWithProviders(<DockExplorationPane />, {
      content: { character: CHARACTERS },
      session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: PARTY_MAP_PROTOCOL - 1 } } } },
    });
    expect(
      screen.getByText(`Party map needs the Foundry bridge (protocol ${PARTY_MAP_PROTOCOL}+).`)
    ).toBeInTheDocument();
  });

  it('gates movement on the exploremove toggle, and writes it from the pane', () => {
    const { session, container } = renderWithProviders(<DockExplorationPane />, {
      content: { character: CHARACTERS },
      session: { state: { global: {
        [RELAY.BRIDGEHELLO]: { protocol: PARTY_MAP_PROTOCOL, module: '0.0.0-test' },
        [RELAY.EXPLOREMOVE]: false,
      } } },
    });
    landPartyMap(session);
    withImageRect(container);

    expect(screen.getByText(/Token movement is off/)).toBeInTheDocument();
    act(() => { tapWorld(PARTY.tokens[0]); });
    expect(lastSent(session, RELAY.MOVEREQ)).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: /Allow token movement/i }));
    expect(lastSent(session, RELAY.EXPLOREMOVE)).toMatchObject({
      characterId: 'global', value: true,
    });
  });

  // Door glyphs (#1809, epic #1804 S5): the recorded dooropts_global fixture
  // carries a regular door (w1), a secret door (w2), and a locked door (w3),
  // all inside the party snapdone's worldRect.
  describe('door glyphs', () => {
    const DOORS = relayFixtures.dooroptsGlobal.value.doors;
    const doorByWallId = (wallId) => DOORS.find((d) => d.wallId === wallId);

    it('asks the bridge for every scene door on entry', () => {
      const { session } = mountPane();
      const req = lastSent(session, RELAY.DOORREQ);
      expect(req).toMatchObject({ characterId: 'global' });
      expect(req.value).toMatchObject({ ts: expect.any(Number) });
    });

    it('renders a glyph for every in-frame door, secret door included', () => {
      const { session, container } = mountPane();
      landPartyMap(session);
      act(() => { pushRelayFixture(session, 'dooroptsGlobal'); });

      const markers = [...container.querySelectorAll('.dgo-marker')];
      expect(markers.map((m) => m.dataset.wallId).sort()).toEqual(['w1', 'w2', 'w3']);
      expect(container.querySelector('[data-wall-id="w2"]')).toHaveClass('dgo-marker--secret');
      expect(container.querySelector('[data-wall-id="w3"]')).toHaveClass('dgo-marker--locked');
    });

    it('a tap on a door toggles it via doorinteract and never plans a move', () => {
      const { session, container } = mountPane();
      landPartyMap(session);
      withImageRect(container);
      act(() => { pushRelayFixture(session, 'dooroptsGlobal'); });

      const w1 = doorByWallId('w1'); // state 0 (closed), well clear of both PC markers
      act(() => { tapWorld({ x: w1.x, y: w1.y }); });

      const interact = lastSent(session, RELAY.DOORINTERACT);
      expect(interact).toMatchObject({ characterId: 'global' });
      expect(interact.value).toMatchObject({ wallId: 'w1', op: 'open' });
      expect(lastSent(session, RELAY.MOVEPLAN)).toBeNull();
      expect(lastSent(session, RELAY.MOVEREQ)).toBeNull(); // no PC was ever selected
    });

    it('a tap on an OPEN door closes it', () => {
      const { session, container } = mountPane();
      landPartyMap(session);
      withImageRect(container);
      act(() => {
        pushRelayFixture(session, 'dooroptsGlobal', {
          doors: [{ wallId: 'w1', state: 1, x: 450, y: 500 }],
        });
      });

      act(() => { tapWorld({ x: 450, y: 500 }); });
      expect(lastSent(session, RELAY.DOORINTERACT).value).toMatchObject({ wallId: 'w1', op: 'close' });
    });

    it('a locked door is display-only — a tap consumes the gesture but sends nothing', () => {
      const { session, container } = mountPane();
      landPartyMap(session);
      withImageRect(container);
      act(() => { pushRelayFixture(session, 'dooroptsGlobal'); });

      const w3 = doorByWallId('w3'); // state 2 (locked)
      act(() => { tapWorld({ x: w3.x, y: w3.y }); });

      expect(lastSent(session, RELAY.DOORINTERACT)).toBeNull();
      // Consumed by the door hit-test, not treated as a destination either.
      expect(lastSent(session, RELAY.MOVEPLAN)).toBeNull();
    });

    it('door hit-testing does not swallow an ordinary PC-selection tap', () => {
      const { session, container } = mountPane();
      landPartyMap(session);
      withImageRect(container);
      act(() => { pushRelayFixture(session, 'dooroptsGlobal'); });

      act(() => { tapWorld(PARTY.tokens[0]); });
      expect(lastSent(session, RELAY.MOVEREQ)).toMatchObject({ characterId: 'Pellias' });
    });
  });
});
