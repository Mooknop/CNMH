import { render, screen, fireEvent, act, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  linkFor: vi.fn(),
  requestMove: vi.fn(),
  confirmMove: vi.fn(),
  cancelMove: vi.fn(),
  planMove: vi.fn(),
  confirmPlannedMove: vi.fn(),
  cancelPlan: vi.fn(),
  spendActions: vi.fn(),
  refundActions: vi.fn(),
  lastMovementId: null,
  lastMoveOpts: null,
  moveState: null,
  encounter: { active: false, phase: 'idle' },
  turnState: { actionsGranted: 0, actionsSpent: 0 },
  protocol: null,
  setSurfacePref: vi.fn(),
  lastMapModeOpts: null,
  mapMode: {
    surfacePref: 'grid',
    mapEligible: false,
    useMapSurface: false,
    mapStatus: 'idle',
    mapSnapshot: null,
    ghostEntries: [],
  },
}));

vi.mock('../../hooks/useMinionActors', () => ({
  __esModule: true,
  useMinionActors: () => ({ linkFor: h.linkFor, spawn: vi.fn(), links: {} }),
}));

vi.mock('../../hooks/useEncounter', () => ({
  __esModule: true,
  useEncounter: () => ({ encounter: h.encounter, appendLog: vi.fn() }),
}));

vi.mock('../../hooks/useTurnState', () => ({
  __esModule: true,
  useTurnState: () => ({
    turnState: h.turnState,
    spendActions: h.spendActions,
    refundActions: h.refundActions,
  }),
}));

// Bridge protocol gate (#1736 S4): defaults to null (no hello) so every
// existing test in this file stays on the D-pad fallback unchanged; the tap
// flow describe block below flips this to 14.
vi.mock('../../hooks/useBridgeStatus', () => ({
  __esModule: true,
  useBridgeStatus: () => ({ protocol: h.protocol, outdated: false, moduleVersion: null }),
}));

vi.mock('../../hooks/useTokenMovement', () => ({
  __esModule: true,
  useTokenMovement: (id, opts) => {
    h.lastMovementId = id;
    h.lastMoveOpts = opts;
    return h.moveState;
  },
}));

// Stub the grid so we can assert the select/cancel wiring without rendering it.
vi.mock('./MoveGridPicker', () => ({
  __esModule: true,
  default: ({ onSelect, onCancel }) => (
    <div>
      <button onClick={() => onSelect({ col: 6, row: 5 })}>pick-cell</button>
      <button onClick={onCancel}>done-pad</button>
    </div>
  ),
}));

// Map mode (#1744 S7): mock the shared useMoveMapMode wiring hook + the
// shared MoveMapSurface component exactly like useTokenMovement/
// MoveGridPicker above — its own behavior is covered by
// MoveActionSheet.mapMode.test.jsx / MoveActionSheet.pathpreviewGhosts.test.jsx.
vi.mock('../../hooks/useMoveMapMode', () => ({
  __esModule: true,
  useMoveMapMode: (opts) => {
    h.lastMapModeOpts = opts;
    return { ...h.mapMode, setSurfacePref: h.setSurfacePref };
  },
}));

vi.mock('./MoveMapSurface', () => ({
  __esModule: true,
  default: ({ mapEligible, surfacePref, onSurfaceChange, onMapTap, onCancel }) => {
    if (!mapEligible) return null;
    return (
      <div data-testid="move-map-surface">
        <button aria-pressed={surfacePref !== 'map'} onClick={() => onSurfaceChange('grid')}>Grid</button>
        <button aria-pressed={surfacePref === 'map'} onClick={() => onSurfaceChange('map')}>Map</button>
        <button onClick={() => onMapTap({ nx: 0.5, ny: 0.5 })}>Tap Map</button>
        <button onClick={onCancel}>Map Cancel</button>
      </div>
    );
  },
}));

import MinionMove from './MinionMove';

const { linkFor, requestMove, confirmMove, cancelMove, planMove, confirmPlannedMove, cancelPlan } = h;

beforeEach(() => {
  vi.clearAllMocks();
  h.encounter = { active: false, phase: 'idle' };
  h.turnState = { actionsGranted: 0, actionsSpent: 0 };
  h.protocol = null;
  h.mapMode = {
    surfacePref: 'grid',
    mapEligible: false,
    useMapSurface: false,
    mapStatus: 'idle',
    mapSnapshot: null,
    ghostEntries: [],
  };
  h.moveState = {
    stage: null,
    pickerOpts: null,
    isRefreshing: false,
    plannedPath: null,
    requestMove,
    requestMoveRefresh: vi.fn(),
    confirmMove,
    cancelMove,
    planMove,
    confirmPlannedMove,
    cancelPlan,
  };
});

describe('MinionMove', () => {
  it('renders nothing when the minion has no Foundry link', () => {
    linkFor.mockReturnValue(null);
    const { container } = render(<MinionMove ownerId="Ashka" role="companion" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the minion is linked but not on the scene', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: false });
    const { container } = render(<MinionMove ownerId="Ashka" role="companion" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keys movement to the minion <owner>-<role> id', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    render(<MinionMove ownerId="Ashka" role="companion" />);
    expect(h.lastMovementId).toBe('Ashka-companion');
  });

  // #617/#1806: minion exploration movement ignores creature occupancy, same
  // as ExplorationMove — but ONLY out of combat, since minions also move
  // in-encounter where the #456 occupancy rules still apply.
  it('passes ignoreOccupancy: true out of encounter (exploration)', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    h.encounter = { active: false, phase: 'idle' };
    render(<MinionMove ownerId="Ashka" role="companion" />);
    expect(h.lastMoveOpts).toMatchObject({ ignoreOccupancy: true });
  });

  it('passes ignoreOccupancy: false while an encounter is active', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    h.encounter = { active: true, phase: 'in-progress' };
    render(<MinionMove ownerId="Ashka" role="companion" />);
    expect(h.lastMoveOpts).toMatchObject({ ignoreOccupancy: false });
  });

  it('opens the pad on the Move button when linked + on scene', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    render(<MinionMove ownerId="Ashka" role="companion" />);

    const btn = screen.getByRole('button', { name: /move zevira/i });
    fireEvent.click(btn);
    expect(requestMove).toHaveBeenCalledWith('stride');
  });

  it('confirms a step from the picker while picking', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    h.moveState.stage = 'picking';
    h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
    render(<MinionMove ownerId="Ashka" role="companion" />);

    fireEvent.click(screen.getByText('pick-cell'));
    expect(confirmMove).toHaveBeenCalledWith({ col: 6, row: 5 });

    fireEvent.click(screen.getByText('done-pad'));
    expect(cancelMove).toHaveBeenCalled();
  });

  // ── Granted-action accounting (#391) ─────────────────────────────────────
  it('charges a Stride against the granted pool on the first step in encounter', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    h.encounter = { active: true, phase: 'in-progress' };
    h.turnState = { actionsGranted: 2, actionsSpent: 0 };
    h.moveState.stage = 'picking';
    h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
    render(<MinionMove ownerId="Ashka" role="companion" />);

    act(() => h.lastMoveOpts.onMoveDone({ feetMoved: 5 }));
    expect(h.spendActions).toHaveBeenCalledWith(1, 'Stride');
  });

  it('does not charge actions for movement out of encounter', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    h.moveState.stage = 'picking';
    h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
    render(<MinionMove ownerId="Ashka" role="companion" />);

    act(() => h.lastMoveOpts.onMoveDone({ feetMoved: 5 }));
    expect(h.spendActions).not.toHaveBeenCalled();
    expect(h.moveState.requestMoveRefresh).toHaveBeenCalledWith('stride');
  });

  it('disables the Move button when the granted pool is empty in encounter', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    h.encounter = { active: true, phase: 'in-progress' };
    h.turnState = { actionsGranted: 0, actionsSpent: 0 };
    render(<MinionMove ownerId="Ashka" role="companion" />);
    expect(screen.getByRole('button', { name: /move zevira/i })).toBeDisabled();
  });

  // #1736 S4: destination-tap flow on a protocol-14+ bridge, action-priced
  // at Confirm against the minion's granted pool.
  describe('tap flow (#1736 S4)', () => {
    beforeEach(() => { h.protocol = 14; });

    it('protocol 13 stays on the D-pad (no confirm bar)', () => {
      h.protocol = 13;
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);
      expect(screen.getByText('pick-cell')).toBeInTheDocument();
      expect(screen.queryByLabelText('Confirm move')).toBeNull();
    });

    it('tapping a cell plans a move instead of confirming a step directly', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByText('pick-cell'));
      expect(planMove).toHaveBeenCalledWith([{ col: 6, row: 5 }]);
      expect(confirmMove).not.toHaveBeenCalled();
    });

    it('planned stage prices the route against Speed and shows the action count in encounter', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.encounter = { active: true, phase: 'in-progress' };
      h.turnState = { actionsGranted: 3, actionsSpent: 0 };
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 30, clipped: false };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      const bar = screen.getByLabelText('Confirm move');
      expect(bar).toHaveTextContent('30 ft — 1 action');
    });

    it('planned stage is feet-only (no action count) out of encounter', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 30, clipped: false };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      const bar = screen.getByLabelText('Confirm move');
      expect(bar).toHaveTextContent('30 ft');
      expect(bar).not.toHaveTextContent('action');
    });

    it('disables Confirm when the priced route costs more actions than the granted pool has left', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.encounter = { active: true, phase: 'in-progress' };
      h.turnState = { actionsGranted: 1, actionsSpent: 0 };
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 7, row: 5 }], costFeet: 60, clipped: false };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      expect(screen.getByText('Not enough granted actions left.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    });

    it('shows the clipped note when the bridge reports the path stopped at a wall', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 5, clipped: true };
      render(<MinionMove ownerId="Ashka" role="companion" />);
      expect(screen.getByText(/Path stops at a wall/)).toBeInTheDocument();
    });

    it('shows range/budget clipped copy on a protocol-23+ (pathfinding) bridge', () => {
      h.protocol = 23;
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 5, clipped: true };
      render(<MinionMove ownerId="Ashka" role="companion" />);
      expect(screen.getByText(/Out of range — tap again to keep going/)).toBeInTheDocument();
      expect(screen.queryByText(/Path stops at a wall/)).toBeNull();
    });

    it('Cancel on the confirm bar backs out of the plan without leaving movement mode', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 30, clipped: false };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      const bar = screen.getByLabelText('Confirm move');
      fireEvent.click(within(bar).getByRole('button', { name: 'Cancel' }));
      expect(cancelPlan).toHaveBeenCalled();
      expect(cancelMove).not.toHaveBeenCalled();
    });

    it('Confirm charges the granted pool for the priced route and sends the waypoints', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.encounter = { active: true, phase: 'in-progress' };
      h.turnState = { actionsGranted: 3, actionsSpent: 0 };
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 30, clipped: false };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(h.spendActions).toHaveBeenCalledWith(1, 'Stride');
      expect(confirmPlannedMove).toHaveBeenCalledWith(1);
    });

    it('out of encounter, Confirm sends the plan with no action charge', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 30, clipped: false };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(h.spendActions).not.toHaveBeenCalled();
      expect(confirmPlannedMove).toHaveBeenCalledWith(0);
    });

    it('refunds the over-charge when Foundry legally stops the planned move short', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.encounter = { active: true, phase: 'in-progress' };
      h.turnState = { actionsGranted: 3, actionsSpent: 0 };
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      // 60 ft at Speed 30 prices as 2 actions.
      h.moveState.plannedPath = { path: [{ col: 11, row: 5 }], costFeet: 60, clipped: false };
      const { rerender } = render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(h.spendActions).toHaveBeenCalledWith(2, 'Stride');

      // A real spendActions triggers a state update + rerender before the
      // async movedone round-trip lands; drive that explicitly since the
      // mock doesn't reflect its own charge back into turnState.
      h.turnState = { actionsGranted: 3, actionsSpent: 2 };
      rerender(<MinionMove ownerId="Ashka" role="companion" />);

      // A wall legally stops the move at 30 ft (1 action's worth) — refund 1.
      act(() => h.lastMoveOpts.onMoveDone({ feetMoved: 30 }));
      expect(h.refundActions).toHaveBeenCalledWith(1, 'Stride');
      expect(cancelMove).not.toHaveBeenCalled();
      expect(h.moveState.requestMoveRefresh).toHaveBeenCalledWith('stride');
    });

    it('closes the pad once the granted pool is fully spent after a planned Stride', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.encounter = { active: true, phase: 'in-progress' };
      h.turnState = { actionsGranted: 2, actionsSpent: 0 };
      h.moveState.stage = 'planned';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 };
      h.moveState.plannedPath = { path: [{ col: 11, row: 5 }], costFeet: 60, clipped: false };
      const { rerender } = render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(h.spendActions).toHaveBeenCalledWith(2, 'Stride');

      h.turnState = { actionsGranted: 2, actionsSpent: 2 };
      rerender(<MinionMove ownerId="Ashka" role="companion" />);

      act(() => h.lastMoveOpts.onMoveDone({ feetMoved: 60 }));
      expect(h.refundActions).not.toHaveBeenCalled();
      expect(cancelMove).toHaveBeenCalled();
    });
  });

  // #1744 S7: map mode rolled out to this surface, mirroring #1743's tap-flow
  // rollout — same shared useMoveMapMode wiring + MoveMapSurface component
  // MoveActionSheet uses, keyed to the minion's `<ownerId>-<role>` id,
  // PLAYER-audience ghosts. Granted-pool pricing/confirm logic is untouched —
  // a map tap feeds the identical handleTap/planMove path a grid tap does.
  describe('map mode (#1744 S7)', () => {
    beforeEach(() => { h.protocol = 14; });

    it('wires useMoveMapMode to the minion <owner>-<role> id with player-audience ghosts', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      expect(h.lastMapModeOpts).toMatchObject({
        moverId: 'Ashka-companion', tapFlowEligible: true, protocol: 14, ghostAudience: 'player',
      });
    });

    it('renders no map surface below the map-move protocol floor (mapEligible false)', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);
      expect(screen.queryByTestId('move-map-surface')).toBeNull();
      expect(screen.getByText('pick-cell')).toBeInTheDocument();
    });

    it('a map tap resolves to the same handleTap/planMove path a grid tap uses', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.mapMode.mapEligible = true;
      h.mapMode.mapSnapshot = {
        url: '/api/images/mover.webp',
        capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600, sceneId: 'scene-1' },
        worldRect: { x1: 0, y1: 0, x2: 800, y2: 600 },
        gridSize: 100,
      };
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByRole('button', { name: 'Tap Map' }));
      // world (400, 300) → cell (4, 3) on a 100 ft grid, identity capture.
      expect(planMove).toHaveBeenCalledWith([{ col: 4, row: 3 }]);
    });

    it('hides the grid once the map surface is ready and showing', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.mapMode.mapEligible = true;
      h.mapMode.useMapSurface = true;
      h.mapMode.mapStatus = 'ready';
      h.mapMode.mapSnapshot = { url: '/api/images/mover.webp', gridSize: 100 };
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      expect(screen.getByTestId('move-map-surface')).toBeInTheDocument();
      expect(screen.queryByText('pick-cell')).toBeNull();
    });

    it('the map surface\'s own Done control ends the move exactly like the grid\'s', () => {
      linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
      h.mapMode.mapEligible = true;
      h.mapMode.useMapSurface = true;
      h.mapMode.mapStatus = 'ready';
      h.mapMode.mapSnapshot = { url: '/api/images/mover.webp', gridSize: 100 };
      h.moveState.stage = 'picking';
      h.moveState.pickerOpts = { origin: { col: 5, row: 5 }, reachable: [], blocked: [] };
      render(<MinionMove ownerId="Ashka" role="companion" />);

      fireEvent.click(screen.getByRole('button', { name: 'Map Cancel' }));
      expect(cancelMove).toHaveBeenCalled();
    });
  });
});
