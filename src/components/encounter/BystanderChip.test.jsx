import React from 'react';
import { render, screen } from '@testing-library/react';

const mockBystander = { active: false, mod: null };
vi.mock('../../hooks/useBystander', () => ({
  useBystander: () => mockBystander,
}));

import BystanderChip from './BystanderChip';

const pc = { entryId: 'e1', kind: 'pc', name: 'Izzy', charId: 'IzzyUncut' };

describe('BystanderChip', () => {
  beforeEach(() => {
    mockBystander.active = false;
    mockBystander.mod = null;
  });

  it('renders nothing when not declared', () => {
    const { container } = render(<BystanderChip entry={pc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-pc entries', () => {
    mockBystander.active = true;
    const { container } = render(
      <BystanderChip entry={{ entryId: 'g1', kind: 'enemy', name: 'Goblin' }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the badge when declared', () => {
    mockBystander.active = true;
    mockBystander.mod = 'deception';
    render(<BystanderChip entry={pc} />);
    expect(screen.getByLabelText('Izzy declared Harmless Bystander')).toBeInTheDocument();
  });
});
