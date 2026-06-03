import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GmLayout from './GmLayout';

jest.mock('../../hooks/useGmAuth', () => ({ useGmAuth: jest.fn() }));
jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ seedDefaults: jest.fn() }));
jest.mock('../../components/gm/UsageChip', () => () => null);
const { useGmAuth } = require('../../hooks/useGmAuth');
const { useContent } = require('../../contexts/ContentContext');
const { seedDefaults } = require('../../utils/gmApi');

const renderAt = (path = '/gm') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/gm" element={<GmLayout />}>
          <Route index element={<div data-testid="outlet">DASH</div>} />
          <Route path="quests" element={<div data-testid="outlet">QUESTS</div>} />
          <Route path="reputation" element={<div data-testid="outlet">REP</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

const refresh = jest.fn().mockResolvedValue();

beforeEach(() => {
  refresh.mockClear();
  seedDefaults.mockReset();
  useContent.mockReturnValue({ refresh });
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

  it('always idempotently seeds on entry, then exposes nav + outlet', async () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    seedDefaults.mockResolvedValue({ ok: true });
    renderAt('/gm/reputation');
    expect(screen.getByText(/Initializing campaign store/i)).toBeInTheDocument();
    expect(await screen.findByTestId('outlet')).toHaveTextContent('REP');
    expect(seedDefaults).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText('gm@x.com')).toBeInTheDocument();
    expect(screen.getByText('Reputation').closest('a')).toHaveClass('active');
    expect(screen.getByText('Quests')).toBeInTheDocument();
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
