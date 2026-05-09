import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoreTopic from './LoreTopic';

jest.mock('../data', () => ({
  loreEntries: [
    {
      id: 'aroden',
      title: 'Aroden',
      category: 'History',
      content: 'A great god.\nHe died mysteriously.',
      related: ['absalom'],
      tags: [],
    },
    {
      id: 'absalom',
      title: 'Absalom',
      category: 'Locations',
      content: 'A great city.',
      related: [],
      tags: [],
    },
  ],
}));

const renderTopic = (id) =>
  render(
    <MemoryRouter initialEntries={[`/lore/${id}`]}>
      <Routes>
        <Route path="/lore/:id" element={<LoreTopic />} />
      </Routes>
    </MemoryRouter>
  );

describe('LoreTopic', () => {
  it('shows a not-found message for an unknown id', () => {
    renderTopic('nonexistent');
    expect(screen.getByText('Entry Not Found')).toBeInTheDocument();
    expect(screen.getByText(/No lore entry exists with id/)).toBeInTheDocument();
  });

  it('renders a back link on the not-found page', () => {
    renderTopic('nonexistent');
    expect(screen.getByText('← Back to Lore Library')).toBeInTheDocument();
  });

  it('renders the entry title and category when found', () => {
    renderTopic('aroden');
    expect(screen.getByText('Aroden')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders multi-line content as separate paragraphs', () => {
    renderTopic('aroden');
    expect(screen.getByText('A great god.')).toBeInTheDocument();
    expect(screen.getByText('He died mysteriously.')).toBeInTheDocument();
  });

  it('renders the Related Topics section when relations exist', () => {
    renderTopic('aroden');
    expect(screen.getByText('Related Topics')).toBeInTheDocument();
    expect(screen.getByText('Absalom')).toBeInTheDocument();
    expect(screen.getByText('Locations')).toBeInTheDocument();
  });

  it('does not render the Related Topics section when entry has no relations', () => {
    renderTopic('absalom');
    expect(screen.queryByText('Related Topics')).not.toBeInTheDocument();
  });

  it('renders the back link on a found entry page', () => {
    renderTopic('aroden');
    expect(screen.getByText('← Back to Lore Library')).toBeInTheDocument();
  });
});
