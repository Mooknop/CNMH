import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReconciliationPanel from './ReconciliationPanel';

// Drive the panel through a mocked hook; the hook itself is tested separately.
let hook;
vi.mock('../../hooks/useReconciliation', () => ({
  useReconciliation: () => hook,
  reconChangeId: (c) => `${c.charId}:${c.overlay}:${c.overlayRef}`,
}));

const change = (overrides = {}) => ({
  charId: 'c1',
  overlay: 'consumed',
  overlayRef: 'Healing Potion',
  label: 'Healing Potion',
  detail: '3 → 1',
  ...overrides,
});

const baseHook = (overrides = {}) => ({
  pendingByChar: [],
  discarded: new Set(),
  toggleDiscard: vi.fn(),
  discardChar: vi.fn(),
  totalActive: 0,
  sync: vi.fn(),
  undo: vi.fn(),
  canUndo: false,
  busy: false,
  lastResult: null,
  ...overrides,
});

describe('ReconciliationPanel', () => {
  it('shows the empty state and a disabled Sync when nothing is pending', () => {
    hook = baseHook();
    render(<ReconciliationPanel />);
    expect(screen.getByTestId('recon-empty')).toBeInTheDocument();
    expect(screen.getByTestId('recon-sync')).toBeDisabled();
    expect(screen.queryByTestId('recon-undo')).not.toBeInTheDocument();
  });

  it('renders pending changes grouped by PC with an enabled Sync', () => {
    hook = baseHook({
      pendingByChar: [{ char: { id: 'c1', name: 'Ashka' }, changes: [change()] }],
      totalActive: 1,
    });
    render(<ReconciliationPanel />);
    expect(screen.getByText('Ashka')).toBeInTheDocument();
    expect(screen.getByText('Healing Potion')).toBeInTheDocument();
    expect(screen.getByText('3 → 1')).toBeInTheDocument();
    const sync = screen.getByTestId('recon-sync');
    expect(sync).toBeEnabled();
    expect(sync).toHaveTextContent('Sync to docs (1)');
  });

  it('wires Sync, per-change Discard, and per-PC Discard all', () => {
    const h = baseHook({
      pendingByChar: [{ char: { id: 'c1', name: 'Ashka' }, changes: [change()] }],
      totalActive: 1,
    });
    hook = h;
    render(<ReconciliationPanel />);
    fireEvent.click(screen.getByTestId('recon-sync'));
    expect(h.sync).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('recon-discard-c1:consumed:Healing Potion'));
    expect(h.toggleDiscard).toHaveBeenCalledWith('c1:consumed:Healing Potion');
    fireEvent.click(screen.getByTestId('recon-discard-char-c1'));
    expect(h.discardChar).toHaveBeenCalledWith('c1');
  });

  it('marks a discarded change and labels its button Restore', () => {
    hook = baseHook({
      pendingByChar: [{ char: { id: 'c1', name: 'Ashka' }, changes: [change()] }],
      discarded: new Set(['c1:consumed:Healing Potion']),
      totalActive: 0,
    });
    render(<ReconciliationPanel />);
    expect(screen.getByTestId('recon-change-c1:consumed:Healing Potion')).toHaveClass('is-discarded');
    expect(screen.getByTestId('recon-discard-c1:consumed:Healing Potion')).toHaveTextContent('Restore');
    expect(screen.getByTestId('recon-sync')).toBeDisabled(); // all discarded
  });

  it('shows Undo after a sync and wires it', () => {
    const h = baseHook({ canUndo: true, lastResult: { synced: ['c1'], failed: [] } });
    hook = h;
    render(<ReconciliationPanel />);
    const undo = screen.getByTestId('recon-undo');
    fireEvent.click(undo);
    expect(h.undo).toHaveBeenCalled();
    expect(screen.getByTestId('recon-result')).toHaveTextContent('Synced 1 character.');
  });

  it('reports failures in the result line', () => {
    hook = baseHook({ lastResult: { synced: [], failed: [{ id: 'c2', error: 'boom' }] } });
    render(<ReconciliationPanel />);
    expect(screen.getByTestId('recon-result')).toHaveTextContent('Failed: c2.');
  });

  it('disables actions while busy', () => {
    hook = baseHook({
      pendingByChar: [{ char: { id: 'c1', name: 'Ashka' }, changes: [change()] }],
      totalActive: 1,
      busy: true,
    });
    render(<ReconciliationPanel />);
    expect(screen.getByTestId('recon-sync')).toBeDisabled();
    expect(screen.getByTestId('recon-sync')).toHaveTextContent('Syncing…');
    expect(screen.getByTestId('recon-discard-char-c1')).toBeDisabled();
  });
});
