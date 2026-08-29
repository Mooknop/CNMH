import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import ExplorationMove from './ExplorationMove';

const mockPlayMode = {
  mode: 'exploration',
  moveEnabled: true,
};
vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => mockPlayMode,
}));

let mockIsGm = true;
vi.mock('../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

let mockExploreDist = 0;
const mockSetExploreDist = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (key === 'cnmh_exploredist_global') return [mockExploreDist, mockSetExploreDist];
    return [null, vi.fn()];
  },
}));

const mockMovement = {
  stage: null,
  pickerOpts: null,
  isRefreshing: false,
  plannedPath: null,
  requestMove: vi.fn(),
  requestMoveRefresh: vi.fn(),
  confirmMove: vi.fn(),
  cancelMove: vi.fn(),
  planMove: vi.fn(),
  confirmPlannedMove: vi.fn(),
  cancelPlan: vi.fn(),
};
vi.mock('../../hooks/useTokenMovement', () => ({
  useTokenMovement: (charId, opts) => {
    // Capture onMoveDone so tests can simulate the bridge confirming a step.
    mockMovement.lastOpts = opts;
    return mockMovement;
  },
}));

// Bridge protocol gate (#1736 S4): defaults to null (no hello) so every
// existing test in this file stays on the D-pad fallback unchanged; the tap
// flow describe block below flips this to 14.
let mockProtocol = null;
vi.mock('../../hooks/useBridgeStatus', () => ({
  useBridgeStatus: () => ({ protocol: mockProtocol, outdated: false, moduleVersion: null }),
}));

vi.mock('../encounter/MoveGridPicker', () => ({
  default: function DummyMoveGridPicker({ onSelect, onCancel }) {
    return (
      <div data-testid="move-grid-picker">
        <button onClick={() => onSelect({ x: 100, y: 200 })}>Select Square</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }
}));

// Map mode (#1744 S7): mock the shared useMoveMapMode wiring hook + the
// shared MoveMapSurface component exactly like useTokenMovement/
// MoveGridPicker above — its own behavior is covered by
// MoveActionSheet.mapMode.test.jsx / MoveActionSheet.pathpreviewGhosts.test.jsx
// (the real thing needs a live SessionContext/EncounterContext this file's
// minimal useSyncedState mock can't provide). Defaults keep every existing
// test in this file on the grid unchanged.
const mockMapMode = {
  surfacePref: 'grid',
  setSurfacePref: vi.fn(),
  mapEligible: false,
  useMapSurface: false,
  mapStatus: 'idle',
  mapSnapshot: null,
  ghostEntries: [],
};
vi.mock('../../hooks/useMoveMapMode', () => ({
  useMoveMapMode: (opts) => {
    mockMapMode.lastOpts = opts;
    return mockMapMode;
  },
}));

vi.mock('../encounter/MoveMapSurface', () => ({
  default: function DummyMoveMapSurface({ mapEligible, surfacePref, onSurfaceChange, onMapTap, onCancel }) {
    if (!mapEligible) return null;
    return (
      <div data-testid="move-map-surface" role="group" aria-label="Movement surface">
        <button aria-pressed={surfacePref !== 'map'} onClick={() => onSurfaceChange('grid')}>Grid</button>
        <button aria-pressed={surfacePref === 'map'} onClick={() => onSurfaceChange('map')}>Map</button>
        <button onClick={() => onMapTap({ nx: 0.5, ny: 0.5 })}>Tap Map</button>
        <button onClick={onCancel}>Map Cancel</button>
      </div>
    );
  }
}));

// Derived-speed line (SP4 #1223): the real useCharacter can't run under this
// file's minimal useSyncedState mock, so stub the spine output directly.
let mockCharData = null;
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => mockCharData,
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [] }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGm = true;
  mockExploreDist = 0;
  mockSetExploreDist.mockImplementation((updater) => {
    mockExploreDist = typeof updater === 'function' ? updater(mockExploreDist) : updater;
  });
  mockPlayMode.mode = 'exploration';
  mockPlayMode.moveEnabled = true;
  mockMovement.stage = null;
  mockMovement.pickerOpts = null;
  mockMovement.isRefreshing = false;
  mockMovement.plannedPath = null;
  mockProtocol = null;
  mockCharData = null;
  mockMapMode.surfacePref = 'grid';
  mockMapMode.mapEligible = false;
  mockMapMode.useMapSurface = false;
  mockMapMode.mapStatus = 'idle';
  mockMapMode.mapSnapshot = null;
  mockMapMode.ghostEntries = [];
});

describe('ExplorationMove', () => {
  it('renders nothing when mode is not exploration', () => {
    mockPlayMode.mode = 'encounter';
    const { container } = render(<ExplorationMove charId="char-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when moveEnabled is false', () => {
    mockPlayMode.moveEnabled = false;
    const { container } = render(<ExplorationMove charId="char-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('auto-requests the grid on mount when idle (no Move Token button)', () => {
    render(<ExplorationMove charId="char-1" />);
    expect(mockMovement.requestMove).toHaveBeenCalledWith('stride');
    expect(screen.queryByRole('button', { name: 'Move Token' })).not.toBeInTheDocument();
  });

  // #617/#1806: exploration movement always ignores creature occupancy.
  it('always passes ignoreOccupancy: true to useTokenMovement', () => {
    render(<ExplorationMove charId="char-1" />);
    expect(mockMovement.lastOpts).toMatchObject({ ignoreOccupancy: true });
  });

  it('does not auto-request when not in exploration mode', () => {
    mockPlayMode.mode = 'encounter';
    render(<ExplorationMove charId="char-1" />);
    expect(mockMovement.requestMove).not.toHaveBeenCalled();
  });

  it('does not auto-request when movement is disabled', () => {
    mockPlayMode.moveEnabled = false;
    render(<ExplorationMove charId="char-1" />);
    expect(mockMovement.requestMove).not.toHaveBeenCalled();
  });

  it('shows calculating status when stage is awaiting-opts', () => {
    mockMovement.stage = 'awaiting-opts';
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByText(/calculating reachable squares/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Token' })).not.toBeInTheDocument();
  });

  it('shows picker when stage is picking', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], speed: 30, originOccupied: false };
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByTestId('move-grid-picker')).toBeInTheDocument();
  });

  it('calls confirmMove when a square is selected', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], speed: 30, originOccupied: false };
    render(<ExplorationMove charId="char-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Square' }));
    expect(mockMovement.confirmMove).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it('calls cancelMove when Done is clicked', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], speed: 30 };
    render(<ExplorationMove charId="char-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockMovement.cancelMove).toHaveBeenCalled();
  });

  it('accumulates a distance readout across steps and resets on Done', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], speed: 30 };
    render(<ExplorationMove charId="char-1" />);

    // No readout before any step.
    expect(screen.queryByLabelText('Distance walked')).not.toBeInTheDocument();

    // Simulate two confirmed 5-ft steps via the captured onMoveDone.
    act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 5 }));
    act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 5 }));
    expect(screen.getByLabelText('Distance walked')).toHaveTextContent('Moved 10 ft');

    // Each step chains a refresh probe.
    expect(mockMovement.requestMoveRefresh).toHaveBeenCalledWith('stride');

    // Done resets the tally.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Distance walked')).not.toBeInTheDocument();
  });

  it('shows Moving status when stage is awaiting-done', () => {
    mockMovement.stage = 'awaiting-done';
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByText(/moving/i)).toBeInTheDocument();
  });

  it('shows Updating overlay and picker while refreshing with opts', () => {
    mockMovement.stage = 'awaiting-opts';
    mockMovement.isRefreshing = true;
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], speed: 30, originOccupied: false };
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByText(/updating/i)).toBeInTheDocument();
    expect(screen.getByTestId('move-grid-picker')).toBeInTheDocument();
  });

  it('GM: increments cnmh_exploredist_global on each step', () => {
    mockIsGm = true;
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
    render(<ExplorationMove charId="char-1" />);

    act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 10 }));
    act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 5 }));

    expect(mockSetExploreDist).toHaveBeenCalledTimes(2);
    expect(mockExploreDist).toBe(15);
  });

  it('non-GM: does not increment cnmh_exploredist_global', () => {
    mockIsGm = false;
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
    render(<ExplorationMove charId="char-1" />);

    act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 10 }));

    expect(mockSetExploreDist).not.toHaveBeenCalled();
  });

  it('GM: resets cnmh_exploredist_global to 0 on Done', () => {
    mockIsGm = true;
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
    render(<ExplorationMove charId="char-1" />);

    act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 10 }));
    mockSetExploreDist.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockSetExploreDist).toHaveBeenCalledWith(0);
  });

  // SP4 (#1223): derived-speed context line above the pad.
  describe('derived speed line (SP4 #1223)', () => {
    it('shows the spine total with the breakdown tooltip while picking', () => {
      mockCharData = {
        speed: {
          base: 25,
          total: 15,
          derived: true,
          breakdown: [
            { label: 'Base Speed', amount: 25, type: 'base' },
            { label: 'Full Plate', amount: -10, type: 'penalty' },
          ],
        },
      };
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);
      const line = screen.getByLabelText('Derived speed');
      expect(line).toHaveTextContent('Speed 15 ft');
      expect(line).toHaveAttribute('title', 'Base Speed 25, Full Plate -10');
    });

    it('hides the line when the spine has nothing to derive', () => {
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);
      expect(screen.queryByLabelText('Derived speed')).toBeNull();
    });
  });

  // #1736 S4: destination-tap flow on a protocol-14+ bridge — feet-only
  // confirm bar, no action economy, real feetMoved still tallies.
  describe('tap flow (#1736 S4)', () => {
    beforeEach(() => { mockProtocol = 14; });

    it('protocol 13 stays on the D-pad (no confirm bar)', () => {
      mockProtocol = 13;
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);
      expect(screen.getByRole('button', { name: 'Select Square' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Confirm move')).toBeNull();
    });

    it('tapping a cell plans a move instead of confirming a step directly', () => {
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Select Square' }));
      expect(mockMovement.planMove).toHaveBeenCalledWith([{ x: 100, y: 200 }]);
      expect(mockMovement.confirmMove).not.toHaveBeenCalled();
    });

    it('planned stage shows a FEET-ONLY confirm bar (no action count, exploration has no economy)', () => {
      mockMovement.stage = 'planned';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      mockMovement.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 35, clipped: false };
      render(<ExplorationMove charId="char-1" />);

      const bar = screen.getByLabelText('Confirm move');
      expect(bar).toHaveTextContent('35 ft');
      expect(bar).not.toHaveTextContent('action');
    });

    it('Confirm sends confirmPlannedMove with no action cost', () => {
      mockMovement.stage = 'planned';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      mockMovement.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 35, clipped: false };
      render(<ExplorationMove charId="char-1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(mockMovement.confirmPlannedMove).toHaveBeenCalledWith(0);
    });

    it('Cancel on the confirm bar backs out of the plan without leaving movement mode', () => {
      mockMovement.stage = 'planned';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      mockMovement.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 35, clipped: false };
      render(<ExplorationMove charId="char-1" />);

      // Both the (mocked) grid's Done button and the confirm bar's Cancel
      // button render together at 'planned' (same as MoveActionSheet's tap
      // flow) — scope to the confirm bar so this only exercises its Cancel.
      const bar = screen.getByLabelText('Confirm move');
      fireEvent.click(within(bar).getByRole('button', { name: 'Cancel' }));
      expect(mockMovement.cancelPlan).toHaveBeenCalled();
      expect(mockMovement.cancelMove).not.toHaveBeenCalled();
    });

    it('shows the clipped note when the bridge reports the path stopped at a wall', () => {
      mockMovement.stage = 'planned';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      mockMovement.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 5, clipped: true };
      render(<ExplorationMove charId="char-1" />);
      expect(screen.getByText(/Path stops at a wall/)).toBeInTheDocument();
    });

    it('shows range/budget clipped copy on a protocol-23+ (pathfinding) bridge', () => {
      mockProtocol = 23;
      mockMovement.stage = 'planned';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      mockMovement.plannedPath = { path: [{ col: 6, row: 5 }], costFeet: 5, clipped: true };
      render(<ExplorationMove charId="char-1" />);
      expect(screen.getByText(/Out of range — tap again to keep going/)).toBeInTheDocument();
      expect(screen.queryByText(/Path stops at a wall/)).toBeNull();
    });

    it('a completed move still tallies feetMoved into the distance readout and shared tally', () => {
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);

      act(() => mockMovement.lastOpts.onMoveDone({ feetMoved: 35 }));
      expect(screen.getByLabelText('Distance walked')).toHaveTextContent('Moved 35 ft');
      expect(mockExploreDist).toBe(35);
      // Chains a refresh probe exactly like the stepper does.
      expect(mockMovement.requestMoveRefresh).toHaveBeenCalledWith('stride');
    });
  });

  // #1744 S7: map mode rolled out to this surface, mirroring #1743's tap-flow
  // rollout — same shared useMoveMapMode wiring + MoveMapSurface component
  // MoveActionSheet uses, keyed to the PC's own charId, PLAYER-audience ghosts.
  describe('map mode (#1744 S7)', () => {
    beforeEach(() => { mockProtocol = 14; });

    it('wires useMoveMapMode to this charId with player-audience ghosts', () => {
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);

      expect(mockMapMode.lastOpts).toMatchObject({
        moverId: 'char-1', tapFlowEligible: true, protocol: 14, ghostAudience: 'player',
      });
    });

    it('renders no map surface below the map-move protocol floor (mapEligible false)', () => {
      mockMapMode.mapEligible = false;
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);
      expect(screen.queryByTestId('move-map-surface')).toBeNull();
      expect(screen.getByTestId('move-grid-picker')).toBeInTheDocument();
    });

    it('a map tap resolves to the same handleTap/planMove path a grid tap uses', () => {
      mockMapMode.mapEligible = true;
      mockMapMode.mapSnapshot = {
        url: '/api/images/mover.webp',
        capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600, sceneId: 'scene-1' },
        worldRect: { x1: 0, y1: 0, x2: 800, y2: 600 },
        gridSize: 100,
      };
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Tap Map' }));
      // world (400, 300) → cell (4, 3) on a 100 ft grid, identity capture.
      expect(mockMovement.planMove).toHaveBeenCalledWith([{ col: 4, row: 3 }]);
    });

    it('hides the grid once the map surface is ready and showing', () => {
      mockMapMode.mapEligible = true;
      mockMapMode.useMapSurface = true;
      mockMapMode.mapStatus = 'ready';
      mockMapMode.mapSnapshot = { url: '/api/images/mover.webp', gridSize: 100 };
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);

      expect(screen.getByTestId('move-map-surface')).toBeInTheDocument();
      expect(screen.queryByTestId('move-grid-picker')).toBeNull();
    });

    it('the map surface\'s own Cancel control ends the move exactly like Done', () => {
      mockMapMode.mapEligible = true;
      mockMapMode.useMapSurface = true;
      mockMapMode.mapStatus = 'ready';
      mockMapMode.mapSnapshot = { url: '/api/images/mover.webp', gridSize: 100 };
      mockMovement.stage = 'picking';
      mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [] };
      render(<ExplorationMove charId="char-1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Map Cancel' }));
      expect(mockMovement.cancelMove).toHaveBeenCalled();
    });
  });
});
