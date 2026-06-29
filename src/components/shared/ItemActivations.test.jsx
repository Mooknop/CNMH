import React from 'react';
import { render, screen } from '@testing-library/react';
import ItemActivations from './ItemActivations';

// TraitTag pulls TraitContext; stub it to the bare trait label (as ItemModal's
// own tests do).
vi.mock('./TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name || 'trait'}</span>;
  },
}));

describe('ItemActivations', () => {
  it('renders nothing when the item has no activations', () => {
    const { container } = render(<ItemActivations item={{ name: 'Plain' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a null item', () => {
    const { container } = render(<ItemActivations item={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the Actions section with name, action icons, traits, and description', () => {
    render(
      <ItemActivations
        item={{ actions: [{ name: 'Drink', actionCount: 1, traits: ['Manipulate'], description: 'Quaff it.' }] }}
      />
    );
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Drink')).toBeInTheDocument();
    expect(screen.getByText('Quaff it.')).toBeInTheDocument();
    expect(screen.getByText('Manipulate')).toBeInTheDocument();
  });

  it('renders Reactions with their trigger', () => {
    render(
      <ItemActivations item={{ reactions: [{ name: 'Parry', trigger: 'Enemy attacks.', description: 'Block.' }] }} />
    );
    expect(screen.getByText('Reactions')).toBeInTheDocument();
    expect(screen.getByText('Parry')).toBeInTheDocument();
    expect(screen.getByText('Enemy attacks.')).toBeInTheDocument();
  });

  it('renders Free Actions', () => {
    render(<ItemActivations item={{ freeActions: [{ name: 'Quick Draw', description: 'Draw.' }] }} />);
    expect(screen.getByText('Free Actions')).toBeInTheDocument();
    expect(screen.getByText('Quick Draw')).toBeInTheDocument();
  });
});
