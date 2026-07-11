import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FeatsList from './FeatsList';

describe('FeatsList (feat ladder)', () => {
  const mockCharacter = {
    level: 4,
    ancestry: 'Fetchling',
    class: 'Thaumaturge',
    feats: [
      { id: '1', name: 'Power Attack', level: 1, description: 'Deal extra damage.', source: 'Core Rulebook' },
      { id: '2', name: 'Weapon Focus', level: 2, description: 'Bonus to attack rolls.' },
      { id: '3', name: 'Shadow Sight', level: 1, description: 'See in the dark.', source: 'Fetchling' },
      { id: '4', name: 'Quick Repair', level: 2, description: 'Repair items fast.', source: 'Skill' },
    ],
  };

  it('renders without crashing', () => {
    expect(() => render(<FeatsList character={mockCharacter} />)).not.toThrow();
  });

  it('groups feats into level rungs along the ladder', () => {
    const { container } = render(<FeatsList character={mockCharacter} />);
    const rungs = container.querySelectorAll('.frung');
    // Levels 1 and 2 hold feats; level 4 (character level, no feat) is the open slot.
    expect(rungs).toHaveLength(3);
    expect(screen.getByLabelText('Level 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Level 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Level 4')).toBeInTheDocument();
  });

  it('displays feat names as headings', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByRole('heading', { name: 'Power Attack' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weapon Focus' })).toBeInTheDocument();
  });

  it('derives category chips from the feat source', () => {
    const { container } = render(<FeatsList character={mockCharacter} />);
    // Core Rulebook → class bucket; Fetchling (= ancestry) → ancestry;
    // Skill → skill; missing source → general.
    expect(container.querySelectorAll('.fcat--class')).toHaveLength(1);
    expect(container.querySelectorAll('.fcat--ancestry')).toHaveLength(1);
    expect(container.querySelectorAll('.fcat--skill')).toHaveLength(1);
    expect(container.querySelectorAll('.fcat--general')).toHaveLength(1);
  });

  it('expands a feat node to show its description', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.queryByText('Deal extra damage.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Power Attack/ }));
    expect(screen.getByText('Deal extra damage.')).toBeInTheDocument();
    // Collapses again on a second press.
    fireEvent.click(screen.getByRole('button', { name: /Power Attack/ }));
    expect(screen.queryByText('Deal extra damage.')).toBeNull();
  });

  it('displays feat source when provided', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByText('Core Rulebook')).toBeInTheDocument();
  });

  it('filter chips narrow the ladder by category', () => {
    const { container } = render(<FeatsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skill' }));
    expect(screen.getByRole('heading', { name: 'Quick Repair' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Power Attack' })).toBeNull();
    // Filtered views never show the open slot.
    expect(container.querySelector('.fnode--open')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('heading', { name: 'Power Attack' })).toBeInTheDocument();
  });

  it('shows an empty note when a filter matches nothing', () => {
    const noAncestry = {
      ...mockCharacter,
      feats: mockCharacter.feats.filter((f) => f.source !== 'Fetchling'),
    };
    render(<FeatsList character={noAncestry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ancestry' }));
    expect(screen.getByText('No ancestry feats.')).toBeInTheDocument();
  });

  it('shows the open slot at the character level when it has no feat', () => {
    render(<FeatsList character={mockCharacter} />);
    expect(screen.getByText(/Open slot — pick a level 4 feat/)).toBeInTheDocument();
  });

  it('shows no open slot when the current level already has a feat', () => {
    const leveled = {
      ...mockCharacter,
      feats: [...mockCharacter.feats, { id: '5', name: 'Capstone', level: 4, description: 'x' }],
    };
    const { container } = render(<FeatsList character={leveled} />);
    expect(container.querySelector('.fnode--open')).toBeNull();
  });

  it('shows empty state when no feats', () => {
    render(<FeatsList character={{ feats: [] }} />);
    expect(screen.getByText('No feats or abilities.')).toBeInTheDocument();
  });

  it('handles missing feats array gracefully', () => {
    render(<FeatsList character={{}} />);
    expect(screen.getByText('No feats or abilities.')).toBeInTheDocument();
  });

  it('sorts rungs by level ascending', () => {
    const unsortedCharacter = {
      level: 5,
      feats: [
        { id: '2', name: 'High Level', level: 5, description: 'desc' },
        { id: '1', name: 'Low Level', level: 1, description: 'desc' },
      ],
    };
    const { container } = render(<FeatsList character={unsortedCharacter} />);
    const names = [...container.querySelectorAll('.fname')].map((n) => n.textContent);
    expect(names).toEqual(['Low Level', 'High Level']);
  });
});
