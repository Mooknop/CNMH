import React from 'react';
import { screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { useTemplatePlacementSection } from './useTemplatePlacementSection';
import { RELAY } from '../sync/keys';

const ORDER = [
  { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre' },
];

// Caster at (0,0); goblin 2 east (10 ft); ogre 8 east (40 ft).
const POSITIONS = {
  gridSize: 100,
  positions: {
    'e-pellias': { col: 0, row: 0 },
    'e-gob': { col: 2, row: 0 },
    'e-ogre': { col: 8, row: 0 },
  },
};

// Identity capture: a tap's normalized position maps straight to world pixels,
// so world (200,0) ÷ gridSize 100 = cell (2,0) — the goblin's square.
const CAPTURE = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: 'scene-1',
};

const Probe = ({ ability, adoptTargets }) => {
  const { section, applyOnConfirm, hasArea } = useTemplatePlacementSection({
    ability,
    order: ORDER,
    casterEntryId: 'e-pellias',
    positionsState: POSITIONS,
    adoptTargets,
  });
  return (
    <div>
      <span data-testid="has-area">{String(hasArea)}</span>
      <button onClick={applyOnConfirm}>confirm</button>
      {section}
    </div>
  );
};

const mount = (ability, { protocol = 13, adoptTargets = vi.fn() } = {}) => {
  const utils = renderWithProviders(<Probe ability={ability} adoptTargets={adoptTargets} />, {
    session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol } } } },
  });
  return { ...utils, adoptTargets };
};

const sentOf = (session, key) => session.sent.filter((m) => m.stateType === key).at(-1);

// Open the map and answer the capture with an identity-matrix snapshot.
const placeMap = async (session) => {
  fireEvent.click(screen.getByRole('button', { name: 'Place on the map' }));
  const req = sentOf(session, RELAY.SNAPREQ);
  await act(async () => {
    session.push('global', RELAY.SNAPDONE, {
      id: req.value.id, ok: true, url: '/api/images/snap.webp',
      capture: CAPTURE, worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
      gridSize: 100, ts: Date.now(),
    });
  });
};

// Tap at a normalized point on the snapshot.
const tapAt = (nx, ny) => {
  const img = document.querySelector('.msv-img');
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  const frame = screen.getByTestId('map-snapshot-frame');
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: nx * 1000, clientY: ny * 1000 });
  fireEvent.pointerUp(frame, { pointerId: 1, clientX: nx * 1000, clientY: ny * 1000 });
};

describe('useTemplatePlacementSection (#1573 B3)', () => {
  it('a placed burst computes its occupants from real token positions', async () => {
    const { session, adoptTargets } = mount({ name: 'Fireball', area: '20-foot burst' });
    await placeMap(session);

    // Tap the goblin's square: world (200,0) → nearest grid intersection
    // (200,0) (#1751 OQ-1 — a burst originates at an intersection, not a
    // cell). Goblin is 0 ft from that corner; the caster's cell shares the
    // corner's opposite edge, so it measures 5 ft (edge-to-point, not
    // center-to-center — this is 10 ft under the old cell-floor convention).
    // Both are inside the 20-ft burst; the ogre at 30 ft is not — and the
    // caster IS listed, because a burst catches whoever stands in it.
    tapAt(0.2, 0);
    const occupants = screen.getByTestId('area-occupants');
    expect(occupants).toHaveTextContent('Goblin (0 ft)');
    expect(occupants).toHaveTextContent('Pellias (5 ft)');
    expect(occupants).not.toHaveTextContent('Ogre');

    fireEvent.click(screen.getByRole('button', { name: /Target these/ }));
    expect(adoptTargets).toHaveBeenCalledWith(['e-gob', 'e-pellias']);
    expect(screen.getByRole('button', { name: 'Targets set ✓' })).toBeDisabled();
  });

  it('snaps a tap to the nearest grid intersection before measuring or placing (#1751 OQ-1)', async () => {
    const { session } = mount({ name: 'Fireball', area: '20-foot burst' });
    await placeMap(session);

    // world (240, 40) is off the grid lines — snaps to intersection (200, 0),
    // the same point the previous test tapped directly.
    tapAt(0.24, 0.04);
    expect(screen.getByTestId('area-occupants')).toHaveTextContent('Goblin (0 ft)');

    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    expect(sentOf(session, RELAY.TEMPLATEPLACE).value).toMatchObject({ x: 200, y: 0 });
  });

  it('an emanation needs no placement and reports occupants immediately', () => {
    mount({ name: 'Gust of Wind', area: '30-foot emanation' });

    expect(screen.getByText(/Centred on you/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place on the map' })).not.toBeInTheDocument();
    // From the caster: goblin 10 ft, ogre 40 ft — both inside 30? Ogre is 40, out.
    const occupants = screen.getByTestId('area-occupants');
    expect(occupants).toHaveTextContent('Goblin (10 ft)');
    expect(occupants).not.toHaveTextContent('Ogre');
  });

  it('a cone marks an aim point but leaves occupancy to the GM', async () => {
    const { session } = mount({ name: 'Burning Hands', area: '15-foot cone' });
    await placeMap(session);
    tapAt(0.2, 0);

    expect(screen.getByText(/needs a facing, so the GM calls who is caught/)).toBeInTheDocument();
    expect(screen.queryByTestId('area-occupants')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Target these/ })).not.toBeInTheDocument();
  });

  it('confirm draws the real template where the area landed and logs it (#1573 B4)', async () => {
    const { session } = mount({ name: 'Fireball', area: '20-foot burst' });
    await placeMap(session);
    tapAt(0.2, 0);

    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    const tpl = sentOf(session, RELAY.TEMPLATEPLACE);
    expect(tpl.characterId).toBe('global');
    expect(tpl.value).toMatchObject({
      shape: 'burst', feet: 20, x: 200, y: 0, sceneId: 'scene-1', name: 'Fireball',
    });
    // The bridge pings the centre itself, so the app doesn't double up.
    expect(sentOf(session, RELAY.PINGPOINT)).toBeUndefined();

    const enc = sentOf(session, RELAY.ENCOUNTER);
    const logged = (enc.value.log || []).at(-1);
    expect(logged.text).toBe('Fireball placed (20-foot burst) — 2 creatures in the area');
  });

  it('an emanation draws its outline from the caster square, with no map opened', () => {
    const { session } = mount({ name: 'Gust of Wind', area: '30-foot emanation' });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    // Caster cell (0,0) on a 100px grid → the square's centre.
    expect(sentOf(session, RELAY.TEMPLATEPLACE).value).toMatchObject({
      shape: 'emanation', feet: 30, x: 50, y: 50,
    });
  });

  it('a protocol-12 bridge falls back to B2’s bare ping', async () => {
    const { session } = mount({ name: 'Fireball', area: '20-foot burst' }, { protocol: 12 });
    await placeMap(session);
    tapAt(0.2, 0);
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    expect(sentOf(session, RELAY.TEMPLATEPLACE)).toBeUndefined();
    expect(sentOf(session, RELAY.PINGPOINT).value).toMatchObject({ x: 200, y: 0 });
  });

  it('a cone never asks for a template — only a ping', async () => {
    const { session } = mount({ name: 'Burning Hands', area: '15-foot cone' });
    await placeMap(session);
    tapAt(0.2, 0);
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));

    expect(sentOf(session, RELAY.TEMPLATEPLACE)).toBeUndefined();
    expect(sentOf(session, RELAY.PINGPOINT).value).toMatchObject({ x: 200, y: 0 });
  });

  it('confirm is inert when nothing was placed — the cast is unaffected', () => {
    const { session } = mount({ name: 'Fireball', area: '20-foot burst' });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    expect(sentOf(session, RELAY.PINGPOINT)).toBeUndefined();
    expect(sentOf(session, RELAY.TEMPLATEPLACE)).toBeUndefined();
  });

  it('a spell with no area renders no section at all', () => {
    mount({ name: 'Magic Missile' });
    expect(screen.getByTestId('has-area')).toHaveTextContent('false');
    expect(screen.queryByTestId('area-placement-section')).not.toBeInTheDocument();
  });

  it('a burst shows the area label but no placement UI without a bridge (#1751 OQ-6)', () => {
    mount({ name: 'Fireball', area: '20-foot burst' }, { protocol: 10 });
    // The section itself survives — only the capture-dependent UI is gone.
    expect(screen.getByTestId('area-placement-section')).toBeInTheDocument();
    expect(screen.getByText('Area — 20-foot burst')).toBeInTheDocument();
    expect(screen.getByText(/No live map available/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place on the map' })).not.toBeInTheDocument();
    // No tap ever happened, so there's nothing to report occupancy for.
    expect(screen.queryByTestId('area-occupants')).not.toBeInTheDocument();
  });

  it('an emanation keeps its occupant list and area label without a bridge (#1751 OQ-6)', () => {
    mount({ name: 'Gust of Wind', area: '30-foot emanation' }, { protocol: 10 });
    expect(screen.getByText('Area — 30-foot emanation')).toBeInTheDocument();
    expect(screen.getByText(/Centred on you/)).toBeInTheDocument();
    // The emanation occupant list is pure `positions` math and needs no
    // capture at all — it must not disappear just because the bridge can't.
    expect(screen.getByTestId('area-occupants')).toHaveTextContent('Goblin (10 ft)');
  });

  it('says so when token positions are unavailable instead of guessing', async () => {
    const utils = renderWithProviders(
      <PositionlessProbe />,
      { session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 12 } } } } }
    );
    await placeMap(utils.session);
    tapAt(0.2, 0);
    expect(screen.getByTestId('area-occupants'))
      .toHaveTextContent('Token positions unavailable');
  });

  it('a 2x2 caster\'s emanation covers more squares — token-size-aware (#1751 OQ-1)', () => {
    renderWithProviders(
      <BigCasterProbe />,
      { session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 13 } } } } }
    );
    // The caster's 2x2 rectangle is (0,0)-(1,1) in cells; the goblin at (2,0)
    // is adjacent to its east edge — 5 ft, not the 10 ft a 1x1 caster (the
    // POSITIONS fixture above) would measure from its single anchor cell.
    expect(screen.getByTestId('area-occupants')).toHaveTextContent('Goblin (5 ft)');
  });

  it('draws a 2x2 emanation\'s outline centred on the whole rectangle, not the anchor cell', () => {
    const { session } = renderWithProviders(
      <BigCasterProbe />,
      { session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 13 } } } } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    // Rectangle (0,0)-(1,1) on a 100px grid centers at (100,100), not the
    // 1x1 caster's (50,50) (see the "caster square" test above).
    expect(sentOf(session, RELAY.TEMPLATEPLACE).value).toMatchObject({
      shape: 'emanation', feet: 30, x: 100, y: 100,
    });
  });
});

// A probe with no positions payload at all (bridge connected, no combat).
const PositionlessProbe = () => {
  const { section } = useTemplatePlacementSection({
    ability: { name: 'Fireball', area: '20-foot burst' },
    order: ORDER,
    casterEntryId: 'e-pellias',
    positionsState: null,
    adoptTargets: () => {},
  });
  return <div>{section}</div>;
};

// A probe whose caster occupies a 2x2 rectangle (#1751 OQ-1 size-awareness).
const BIG_CASTER_POSITIONS = {
  gridSize: 100,
  positions: {
    'e-pellias': { col: 0, row: 0, width: 2, height: 2 },
    'e-gob': { col: 2, row: 0 },
    'e-ogre': { col: 8, row: 0 },
  },
};

const BigCasterProbe = () => {
  const { section, applyOnConfirm } = useTemplatePlacementSection({
    ability: { name: 'Gust of Wind', area: '30-foot emanation' },
    order: ORDER,
    casterEntryId: 'e-pellias',
    positionsState: BIG_CASTER_POSITIONS,
    adoptTargets: () => {},
  });
  return (
    <div>
      <button onClick={applyOnConfirm}>confirm</button>
      {section}
    </div>
  );
};
