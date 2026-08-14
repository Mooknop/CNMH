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

import MinionMove from './MinionMove';

const { linkFor, requestMove, confirmMove, cancelMove, planMove, confirmPlannedMove, cancelPlan } = h;

beforeEach(() => {
  vi.clearAllMocks();
  h.encounter = { active: false, phase: 'idle' };
  h.turnState = { actionsGranted: 0, actionsSpent: 0 };
  h.protocol = null;
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
});
