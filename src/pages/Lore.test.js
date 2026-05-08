import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Lore from './Lore';

const renderLore = () => render(<MemoryRouter><Lore /></MemoryRouter>);

jest.mock('../data', () => ({
  loreEntries: [
    { id: '1', title: 'Absalom', category: 'Cities', content: 'A great city.\nFull of life.' },
    { id: '2', title: 'Korvosa', category: 'Cities', content: 'A governed city.' },
    { id: '3', title: 'Desna', category: 'Deities', content: 'Goddess of travel.' },
  ],
}));

describe('Lore', () => {
  it('renders the page heading', async () => {
    await act(async () => { renderLore(); });
    expect(screen.getByText('Campaign Lore')).toBeInTheDocument();
  });

  it('shows All Lore Entries by default', async () => {
    await act(async () => { renderLore(); });
    expect(screen.getByText('All Lore Entries')).toBeInTheDocument();
    expect(screen.getByText('Absalom')).toBeInTheDocument();
    expect(screen.getByText('Desna')).toBeInTheDocument();
  });

  it('renders category filter buttons', async () => {
    await act(async () => { renderLore(); });
    const citiesBtn = screen.getByRole('button', { name: 'Cities' });
    const deitiesBtn = screen.getByRole('button', { name: 'Deities' });
    expect(citiesBtn).toBeInTheDocument();
    expect(deitiesBtn).toBeInTheDocument();
  });

  it('filters entries when a category button is clicked', async () => {
    await act(async () => { renderLore(); });
    fireEvent.click(screen.getByRole('button', { name: 'Deities' }));
    expect(screen.getByText('Desna')).toBeInTheDocument();
    expect(screen.queryByText('Absalom')).not.toBeInTheDocument();
  });

  it('shows category-specific heading when filtered', async () => {
    await act(async () => { renderLore(); });
    fireEvent.click(screen.getByRole('button', { name: 'Cities' }));
    expect(screen.getByText('Cities Entries')).toBeInTheDocument();
  });

  it('returns to All when All button is clicked', async () => {
    await act(async () => { renderLore(); });
    fireEvent.click(screen.getByRole('button', { name: 'Deities' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('All Lore Entries')).toBeInTheDocument();
    expect(screen.getByText('Absalom')).toBeInTheDocument();
  });

  it('renders multiline content as separate paragraphs', async () => {
    await act(async () => { renderLore(); });
    expect(screen.getByText('A great city.')).toBeInTheDocument();
    expect(screen.getByText('Full of life.')).toBeInTheDocument();
  });
});
