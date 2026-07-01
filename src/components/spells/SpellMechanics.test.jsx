import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellMechanics from './SpellMechanics';

vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span data-testid="trait">{trait}</span> }));
vi.mock('../shared/ActionSymbol', () => ({ default: ({ cost }) => <span data-testid="action">{cost}</span> }));

const fullSpell = {
  name: 'Agonizing Relocation',
  traits: ['Uncommon', 'Concentrate', 'Manipulate'],
  actions: 'Two Actions',
  defense: 'Fortitude',
  range: '30 feet',
  area: '20-foot burst',
  targets: '1 foe',
  duration: 'sustained',
  trigger: 'a creature moves',
  description: 'You create a connection…',
  degrees: { 'Critical Success': 'Unaffected.', Failure: 'Takes damage.' },
  heightened: { '4th': 'More damage.', '6th': 'Even more.' },
};

describe('SpellMechanics', () => {
  it('renders nothing without a spell', () => {
    const { container } = render(<SpellMechanics spell={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders trait chips', () => {
    render(<SpellMechanics spell={fullSpell} />);
    expect(screen.getAllByTestId('trait')).toHaveLength(3);
  });

  it('renders the full detail grid', () => {
    render(<SpellMechanics spell={fullSpell} />);
    expect(screen.getByTestId('action')).toHaveTextContent('Two Actions');
    expect(screen.getByText('Fortitude')).toBeInTheDocument();
    expect(screen.getByText('30 feet')).toBeInTheDocument();
    expect(screen.getByText('20-foot burst')).toBeInTheDocument();
    expect(screen.getByText('1 foe')).toBeInTheDocument();
    expect(screen.getByText('sustained')).toBeInTheDocument();
  });

  it('renders trigger, description, degrees of success, and heightening entries', () => {
    render(<SpellMechanics spell={fullSpell} />);
    expect(screen.getByText('a creature moves')).toBeInTheDocument();
    expect(screen.getByText('You create a connection…')).toBeInTheDocument();
    expect(screen.getByText('Degrees of Success:')).toBeInTheDocument();
    expect(screen.getByText('Critical Success:')).toBeInTheDocument();
    expect(screen.getByText('Takes damage.')).toBeInTheDocument();
    expect(screen.getByText('Heightened:')).toBeInTheDocument();
    expect(screen.getByText('4th:')).toBeInTheDocument();
    expect(screen.getByText('Even more.')).toBeInTheDocument();
  });

  it('omits absent sections', () => {
    render(<SpellMechanics spell={{ name: 'Plain', description: 'Just text.' }} />);
    expect(screen.queryByTestId('trait')).not.toBeInTheDocument();
    expect(screen.queryByText('Degrees of Success:')).not.toBeInTheDocument();
    expect(screen.queryByText('Heightened:')).not.toBeInTheDocument();
    expect(screen.getByText('Just text.')).toBeInTheDocument();
  });
});
