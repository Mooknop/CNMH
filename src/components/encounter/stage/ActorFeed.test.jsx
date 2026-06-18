import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ActorFeed from './ActorFeed';

describe('ActorFeed', () => {
  it('renders each entry with cost glyph, label, detail and result', () => {
    render(
      <ActorFeed
        feed={[
          { n: 1, cost: 1, label: 'Stride', detail: '25 ft', tone: 'move', state: 'done' },
          { n: 2, cost: 1, label: 'Jaws Strike', detail: 'vs Kestrel', result: 'Hit · 12', tone: 'amber', state: 'done' },
        ]}
      />
    );
    expect(screen.getByText('Stride')).toBeInTheDocument();
    expect(screen.getByText('25 ft')).toBeInTheDocument();
    expect(screen.getByText('Jaws Strike')).toBeInTheDocument();
    expect(screen.getByText('Hit · 12')).toBeInTheDocument();
    expect(screen.getAllByLabelText('1 action')).toHaveLength(2); // ActionSymbol glyphs
  });

  it('maps reaction/free costs to the right glyph', () => {
    render(<ActorFeed feed={[{ n: 1, cost: 'r', label: 'Shield Block', state: 'done' }]} />);
    expect(screen.getByLabelText('reaction')).toBeInTheDocument();
  });

  it('renders a pending entry without a cost glyph', () => {
    render(<ActorFeed feed={[{ n: 3, label: 'Deciding…', detail: '1 action left', state: 'pending' }]} />);
    expect(screen.getByText('Deciding…')).toBeInTheDocument();
    expect(screen.queryByLabelText(/action/)).toBeNull();
  });

  it('threads an inline cue card under the entry that armed it and resolves on press', () => {
    const onReact = vi.fn();
    const opt = { reaction: { name: 'Deflect Projectile' }, castSource: null };
    render(
      <ActorFeed
        feed={[
          { n: 1, cost: 1, label: 'Longbow', state: 'done' },
          { n: 2, cost: 1, label: 'Longsword', state: 'done' },
        ]}
        cues={{ 1: [opt] }}
        onReact={onReact}
      />
    );
    expect(screen.getByText('Trigger met · your reaction')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deflect Projectile' }));
    expect(onReact).toHaveBeenCalledWith(opt);
  });

  it('renders no cue when an entry has no match', () => {
    render(<ActorFeed feed={[{ n: 1, cost: 1, label: 'Longsword', state: 'done' }]} cues={{}} onReact={vi.fn()} />);
    expect(screen.queryByText('Trigger met · your reaction')).toBeNull();
  });
});
