import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import GmLayout from './GmLayout';

vi.mock('../../hooks/useGmAuth', () => ({ useGmAuth: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/usePlayMode', () => ({ usePlayMode: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ seedDefaults: vi.fn() }));
vi.mock('../../components/gm/UsageChip', () => ({ default: () => null }));
import { useGmAuth } from '../../hooks/useGmAuth';
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { seedDefaults } from '../../utils/gmApi';

const renderAt = (path = '/gm') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/gm" element={<GmLayout />}>
          <Route index element={<div data-testid="outlet">DASH</div>} />
          <Route path="dock" element={<div data-testid="outlet">DOCK</div>} />
          <Route path="world/quests" element={<div data-testid="outlet">QUESTS</div>} />
          <Route path="world/reputation" element={<div data-testid="outlet">REP</div>} />
          <Route path="catalog/items" element={<div data-testid="outlet">ITEMS</div>} />
          <Route path="characters" element={<div data-testid="outlet">CHARS</div>} />
          <Route path="quests" element={<Navigate to="/gm/world/quests" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const refresh = vi.fn().mockResolvedValue();

beforeEach(() => {
  refresh.mockClear();
  seedDefaults.mockReset();
  useContent.mockReturnValue({ refresh });
  usePlayMode.mockReturnValue({ mode: 'exploration' });
});

describe('GmLayout', () => {
  it('shows a checking state while the probe is loading', () => {
    useGmAuth.mockReturnValue({ loading: true, isGm: false, email: null });
    renderAt();
    expect(screen.getByText(/Checking GM access/i)).toBeInTheDocument();
  });

  it('shows a restricted message when not the GM and never seeds', () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: false, email: null });
    renderAt();
    expect(screen.getByText(/restricted/i)).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    expect(seedDefaults).not.toHaveBeenCalled();
  });

  it('always idempotently seeds on entry, then exposes the top nav + outlet', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    renderAt('/gm');
    expect(screen.getByText(/Initializing campaign store/i)).toBeInTheDocument();
    expect(await screen.findByTestId('outlet')).toHaveTextContent('DASH');
    expect(seedDefaults).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText('gm@x.com')).toBeInTheDocument();
    // Dashboard is the active area on /gm.
    expect(screen.getByText('Dashboard').closest('a')).toHaveClass('active');
    expect(screen.getByText('World').closest('a')).not.toHaveClass('active');
  });

  it('opens the World subrail and marks the active section', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    useContent.mockReturnValue({
      refresh,
      quests: [{ id: 'a' }, { id: 'b' }],
      reputation: { Factions: [{ id: 'f' }] },
      allLoreEntries: [],
    });
    renderAt('/gm/world/reputation');
    expect(await screen.findByTestId('outlet')).toHaveTextContent('REP');
    // Top-nav World is active; subrail Reputation is active.
    expect(screen.getByText('World').closest('a')).toHaveClass('active');
    expect(screen.getByText('Reputation').closest('a')).toHaveClass('active');
    expect(screen.getByText('Quests').closest('a')).not.toHaveClass('active');
    // Count chips reflect real collection sizes (quests=2, reputation=1).
    expect(screen.getByText('Quests').closest('a')).toHaveTextContent('2');
    expect(screen.getByText('Reputation').closest('a')).toHaveTextContent('1');
  });

  it('renders /gm/dock chromeless — no GM top bar or subrail (#1556 S1)', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    renderAt('/gm/dock');
    expect(await screen.findByTestId('outlet')).toHaveTextContent('DOCK');
    // Battle mode hides the whole GM chrome; the dock's own top bar carries
    // the close affordance back to /gm.
    expect(screen.queryByText('GM Tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Dock')).not.toBeInTheDocument();
    expect(screen.queryByText('Quests')).not.toBeInTheDocument();
  });

  it('does not render a subrail on top-level areas', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    renderAt('/gm/characters');
    expect(await screen.findByTestId('outlet')).toHaveTextContent('CHARS');
    expect(screen.getByText('Characters').closest('a')).toHaveClass('active');
    expect(screen.queryByText('Quests')).not.toBeInTheDocument();
  });

  it('redirects an old flat path to its new home', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    renderAt('/gm/quests');
    expect(await screen.findByTestId('outlet')).toHaveTextContent('QUESTS');
    expect(screen.getByText('World').closest('a')).toHaveClass('active');
  });

  it('reflects the live play mode in the top-bar flag', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    usePlayMode.mockReturnValue({ mode: 'encounter' });
    renderAt('/gm');
    await screen.findByTestId('outlet');
    expect(screen.getByText('Encounter')).toBeInTheDocument();
  });

  it('blocks the editors and offers retry when seeding fails', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce({ ok: true });
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/initialize/i);
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(seedDefaults).toHaveBeenCalledTimes(2));
  });
});
