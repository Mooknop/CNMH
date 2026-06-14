import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  linkFor: vi.fn(),
  requestMove: vi.fn(),
  confirmMove: vi.fn(),
  cancelMove: vi.fn(),
  lastMovementId: null,
  moveState: null,
}));

vi.mock('../../hooks/useMinionActors', () => ({
  __esModule: true,
  useMinionActors: () => ({ linkFor: h.linkFor, spawn: vi.fn(), links: {} }),
}));

vi.mock('../../hooks/useTokenMovement', () => ({
  __esModule: true,
  useTokenMovement: (id) => {
    h.lastMovementId = id;
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

const { linkFor, requestMove, confirmMove, cancelMove } = h;

beforeEach(() => {
  vi.clearAllMocks();
  h.moveState = {
    stage: null,
    pickerOpts: null,
    isRefreshing: false,
    requestMove,
    requestMoveRefresh: vi.fn(),
    confirmMove,
    cancelMove,
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
});
