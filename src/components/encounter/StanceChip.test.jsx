import React from 'react';
import { render, screen } from '@testing-library/react';

const mockStance = { active: false, stanceName: null };
vi.mock('../../hooks/useStance', () => ({
  useStance: () => mockStance,
}));

import StanceChip from './StanceChip';

const pc = { entryId: 'e1', kind: 'pc', name: 'Blu', charId: 'Blu-Kakke' };

describe('StanceChip', () => {
  beforeEach(() => {
    mockStance.active = false;
    mockStance.stanceName = null;
  });

  it('renders nothing when no stance is active', () => {
    const { container } = render(<StanceChip entry={pc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-pc entries', () => {
    mockStance.active = true;
    mockStance.stanceName = 'Dragon Stance';
    const { container } = render(<StanceChip entry={{ entryId: 'g1', kind: 'enemy', name: 'Goblin' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the glyph and names the stance when active', () => {
    mockStance.active = true;
    mockStance.stanceName = 'Dragon Stance';
    render(<StanceChip entry={pc} />);
    expect(screen.getByLabelText('Blu is in Dragon Stance')).toBeInTheDocument();
  });
});
