import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GmLayout from './GmLayout';

jest.mock('../../hooks/useGmAuth', () => ({ useGmAuth: jest.fn() }));
const { useGmAuth } = require('../../hooks/useGmAuth');

const renderAt = (path = '/gm') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/gm" element={<GmLayout />}>
          <Route index element={<div data-testid="outlet">DASH</div>} />
          <Route path="quests" element={<div data-testid="outlet">QUESTS</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('GmLayout', () => {
  it('shows a checking state while the probe is loading', () => {
    useGmAuth.mockReturnValue({ loading: true, isGm: false, email: null });
    renderAt();
    expect(screen.getByText(/Checking GM access/i)).toBeInTheDocument();
  });

  it('shows a restricted message when not the GM', () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: false, email: null });
    renderAt();
    expect(screen.getByText(/restricted/i)).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('renders nav + outlet for the GM and marks the active link', () => {
    useGmAuth.mockReturnValue({ loading: false, isGm: true, email: 'gm@x.com' });
    renderAt('/gm/quests');
    expect(screen.getByText('gm@x.com')).toBeInTheDocument();
    expect(screen.getByTestId('outlet').textContent).toBe('QUESTS');
    expect(screen.getByText('Quests').closest('a')).toHaveClass('active');
  });
});
