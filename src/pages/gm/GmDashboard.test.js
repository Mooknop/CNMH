import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GmDashboard from './GmDashboard';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ seedDefaults: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { seedDefaults } = require('../../utils/gmApi');

const renderDash = () => render(<MemoryRouter><GmDashboard /></MemoryRouter>);

afterEach(() => jest.restoreAllMocks());

describe('GmDashboard', () => {
  it('warns and offers import when content is on the bundled fallback', () => {
    useContent.mockReturnValue({ source: 'fallback' });
    renderDash();
    expect(screen.getByText(/store is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/Content source:/).textContent).toMatch(/fallback/);
  });

  it('imports defaults and shows the result', async () => {
    useContent.mockReturnValue({ source: 'fallback' });
    seedDefaults.mockResolvedValue({ ok: true, seeded: { quest: 'seeded 5' } });
    renderDash();
    fireEvent.click(screen.getByText(/Import defaults/i));
    await waitFor(() => expect(screen.getByText(/seeded 5/)).toBeInTheDocument());
    expect(seedDefaults).toHaveBeenCalledWith(false);
  });

  it('force reseed asks for confirmation first', async () => {
    useContent.mockReturnValue({ source: 'server' });
    seedDefaults.mockResolvedValue({ ok: true, seeded: {} });
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderDash();
    fireEvent.click(screen.getByText(/Force reseed/i));
    expect(seedDefaults).not.toHaveBeenCalled();

    window.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText(/Force reseed/i));
    await waitFor(() => expect(seedDefaults).toHaveBeenCalledWith(true));
  });

  it('surfaces a failure message', async () => {
    useContent.mockReturnValue({ source: 'fallback' });
    seedDefaults.mockRejectedValue(new Error('boom'));
    renderDash();
    fireEvent.click(screen.getByText(/Import defaults/i));
    await waitFor(() => expect(screen.getByText(/Failed: boom/)).toBeInTheDocument());
  });
});
