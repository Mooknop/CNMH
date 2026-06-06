import React from 'react';
import { render, screen } from '@testing-library/react';
import ThaumaturgeImplementsDisplay from './ThaumaturgeImplementsDisplay';

describe('ThaumaturgeImplementsDisplay', () => {
  it('renders nothing when thaumaturge is null', () => {
    const { container } = render(<ThaumaturgeImplementsDisplay thaumaturge={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when passives array is empty', () => {
    const { container } = render(
      <ThaumaturgeImplementsDisplay thaumaturge={{ passives: [] }} />
    );
    expect(container.querySelector('.thaumaturge-section')).toBeNull();
  });

  it('renders Implements heading when passives exist', () => {
    render(
      <ThaumaturgeImplementsDisplay
        thaumaturge={{ passives: [{ name: 'Mirror', description: 'Reflects magic.' }] }}
        themeColor="#aabbcc"
      />
    );
    expect(screen.getByText('Implements')).toBeInTheDocument();
  });

  it('renders each implement name and description', () => {
    render(
      <ThaumaturgeImplementsDisplay
        thaumaturge={{
          passives: [
            { name: 'Lantern', description: 'Reveals hidden.' },
            { name: 'Tome', benefit: 'Grants knowledge.' },
          ],
        }}
      />
    );
    expect(screen.getByText('Lantern')).toBeInTheDocument();
    expect(screen.getByText('Reveals hidden.')).toBeInTheDocument();
    expect(screen.getByText('Tome')).toBeInTheDocument();
    expect(screen.getByText('Grants knowledge.')).toBeInTheDocument();
  });

  it('renders container even when passives defaults are used', () => {
    const { container } = render(
      <ThaumaturgeImplementsDisplay thaumaturge={{}} />
    );
    expect(container.querySelector('.thaumaturge-implements-container')).toBeInTheDocument();
  });
});
