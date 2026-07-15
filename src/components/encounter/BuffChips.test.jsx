import React from 'react';
import { render, screen } from '@testing-library/react';

const mockEffects = { effects: [], removeEffect: vi.fn() };
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => mockEffects,
}));

const mockCatalog = { effects: [{ id: 'inspire-courage', name: 'Inspire Courage' }] };
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => mockCatalog,
}));

import BuffChips from './BuffChips';

const pc = { entryId: 'e1', kind: 'pc', name: 'Kohl', charId: 'Kohl' };

describe('BuffChips', () => {
  beforeEach(() => {
    mockEffects.effects = [];
    mockCatalog.effects = [{ id: 'inspire-courage', name: 'Inspire Courage' }];
  });

  it('renders nothing with no chip-worthy effects', () => {
    mockEffects.effects = [{ id: 'x1', effectId: 'heroism-1' }];
    const { container } = render(<BuffChips entry={pc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-pc entries', () => {
    mockEffects.effects = [{ id: 'x1', effectId: 'inspire-courage' }];
    const { container } = render(<BuffChips entry={{ entryId: 'g1', kind: 'enemy', name: 'Goblin' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an Inspired chip while inspire-courage is active', () => {
    mockEffects.effects = [{ id: 'x1', effectId: 'inspire-courage' }];
    render(<BuffChips entry={pc} />);
    const chip = screen.getByLabelText('Kohl has Inspire Courage');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('♪ Inspired');
  });

  it('chips Foundry-sourced anthem entries the same way', () => {
    mockEffects.effects = [
      { id: 'foundry-inspire-courage', effectId: 'inspire-courage', fromFoundry: true },
    ];
    render(<BuffChips entry={pc} />);
    expect(screen.getByLabelText('Kohl has Inspire Courage')).toHaveTextContent('♪ Inspired');
  });

  it('dedupes same-label chips into one', () => {
    mockEffects.effects = [
      { id: 'x1', effectId: 'inspire-courage' },
      { id: 'x2', effectId: 'inspire-courage-2' },
    ];
    render(<BuffChips entry={pc} />);
    expect(screen.getAllByText(/Inspired/)).toHaveLength(1);
  });

  it('honors a content-authored chip field over the registry', () => {
    mockCatalog.effects = [{ id: 'heroism-1', name: 'Heroism', chip: { label: 'Heroic', symbol: '★' } }];
    mockEffects.effects = [{ id: 'x1', effectId: 'heroism-1' }];
    render(<BuffChips entry={pc} />);
    expect(screen.getByLabelText('Kohl has Heroism')).toHaveTextContent('★ Heroic');
  });
});
