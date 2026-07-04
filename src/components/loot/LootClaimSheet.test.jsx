import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ characters: [{ id: 'a', name: 'Aria' }, { id: 'b', name: 'Vestri' }] }),
}));

const hook = {
  drop: null,
  isOpen: false,
  offline: false,
  shares: { a: 13, b: 12 },
  claimLine: vi.fn(),
};
vi.mock('../../hooks/useLootDrop', () => ({
  useLootDrop: () => hook,
}));

import LootClaimSheet from './LootClaimSheet';

const aria = { id: 'a', name: 'Aria' };

const drop = (over = {}) => ({
  roomName: 'A3. Shrine to Kabriri',
  gold: 25,
  items: [
    { lineId: 'l1', ref: 'rope', name: 'Rope', qty: 1, claims: [] },
    { lineId: 'l2', ref: 'acid-flask', name: 'Acid Flask', qty: 3, claims: [] },
  ],
  ...over,
});

beforeEach(() => {
  hook.drop = null;
  hook.isOpen = false;
  hook.offline = false;
  hook.shares = { a: 13, b: 12 };
  vi.clearAllMocks();
});

describe('LootClaimSheet', () => {
  it('renders nothing when there is no open drop', () => {
    const { container } = render(<LootClaimSheet character={aria} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without a character', () => {
    hook.isOpen = true;
    hook.drop = drop();
    const { container } = render(<LootClaimSheet character={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('claims and releases a single-qty line', () => {
    hook.isOpen = true;
    hook.drop = drop();
    const { rerender } = render(<LootClaimSheet character={aria} />);
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
    expect(hook.claimLine).toHaveBeenCalledWith('l1', 'a', 1);

    // Now Aria holds it → the toggle releases.
    hook.drop = drop({ items: [{ lineId: 'l1', ref: 'rope', name: 'Rope', qty: 1, claims: [{ charId: 'a', qty: 1 }] }] });
    rerender(<LootClaimSheet character={aria} />);
    fireEvent.click(screen.getByRole('button', { name: '✓ Yours' }));
    expect(hook.claimLine).toHaveBeenCalledWith('l1', 'a', 0);
  });

  it('disables a single-qty line claimed by someone else', () => {
    hook.isOpen = true;
    hook.drop = drop({ items: [{ lineId: 'l1', ref: 'rope', name: 'Rope', qty: 1, claims: [{ charId: 'b', qty: 1 }] }] });
    render(<LootClaimSheet character={aria} />);
    const btn = screen.getByRole('button', { name: 'Claimed' });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/also: Vestri/)).toBeInTheDocument();
  });

  it('steps a stack claim up and down', () => {
    hook.isOpen = true;
    hook.drop = drop({
      items: [{ lineId: 'l2', ref: 'acid-flask', name: 'Acid Flask', qty: 3, claims: [{ charId: 'a', qty: 1 }] }],
    });
    render(<LootClaimSheet character={aria} />);
    fireEvent.click(screen.getByRole('button', { name: /Claim one Acid Flask/ }));
    expect(hook.claimLine).toHaveBeenCalledWith('l2', 'a', 2);
    fireEvent.click(screen.getByRole('button', { name: /Release one Acid Flask/ }));
    expect(hook.claimLine).toHaveBeenCalledWith('l2', 'a', 0);
  });

  it('caps the stepper when the stack is exhausted', () => {
    hook.isOpen = true;
    hook.drop = drop({
      items: [{ lineId: 'l2', ref: 'acid-flask', name: 'Acid Flask', qty: 3, claims: [{ charId: 'a', qty: 1 }, { charId: 'b', qty: 2 }] }],
    });
    render(<LootClaimSheet character={aria} />);
    expect(screen.getByRole('button', { name: /Claim one Acid Flask/ })).toBeDisabled();
  });

  it('shows the gold share', () => {
    hook.isOpen = true;
    hook.drop = drop();
    render(<LootClaimSheet character={aria} />);
    expect(screen.getByText('13 gp')).toBeInTheDocument();
  });

  it('pauses claiming and disables controls when offline', () => {
    hook.isOpen = true;
    hook.offline = true;
    hook.drop = drop();
    render(<LootClaimSheet character={aria} />);
    expect(screen.getByText(/Claiming is paused/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeDisabled();
  });
});
