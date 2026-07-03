import React from 'react';
import { render, screen } from '@testing-library/react';
import RuneMechanics from './RuneMechanics';

// TraitTag pulls TraitContext; stub it to the bare label.
vi.mock('./TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name || 'trait'}</span>;
  },
}));

// Paired-shaped accessory rune: flavor-only description + an actuated
// activation that IS the entire effect — the case #1055 S1 exists for.
const paired = {
  id: 'paired',
  type: 'property',
  target: 'accessory',
  name: 'Paired',
  rarity: 'uncommon',
  usage: ['pocketed'],
  description: 'These runes always come in pairs.',
  actuated: {
    cost: 'none',
    name: 'Paired Exchange',
    actionCount: 1,
    frequency: 'once per day',
    traits: ['Command'],
    description: 'Items in the pockets trade places via teleportation.',
  },
};

describe('RuneMechanics (#1055 S1)', () => {
  it('renders nothing for a missing rune', () => {
    const { container } = render(<RuneMechanics rune={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the whole effect of an actuated accessory rune, not just flavor', () => {
    render(<RuneMechanics rune={paired} />);
    expect(screen.getByText('These runes always come in pairs.')).toBeInTheDocument();
    expect(screen.getByText('Etches onto pocketed items')).toBeInTheDocument();
    expect(screen.getByText('uncommon')).toBeInTheDocument();
    const card = screen.getByTestId('rune-mech-actuated');
    expect(card).toHaveTextContent('Paired Exchange');
    expect(card).toHaveTextContent('Frequency once per day');
    expect(card).toHaveTextContent('Items in the pockets trade places via teleportation.');
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Command');
    // an accessory rune always states the inscription rule
    expect(screen.getByText(/holds at most one accessory rune/)).toBeInTheDocument();
  });

  it('renders modifiers as prose and riders as notes', () => {
    render(
      <RuneMechanics
        rune={{
          target: 'accessory',
          usage: ['clothing'],
          modifiers: [{ stat: 'intimidation', kind: 'item', amount: 1 }],
          riders: [{ id: 'r1', text: 'Bonus applies only to Coerce.' }],
        }}
      />
    );
    expect(screen.getByText('+1 item bonus to Intimidation')).toBeInTheDocument();
    expect(screen.getByText('Bonus applies only to Coerce.')).toBeInTheDocument();
  });

  it('renders rune activation lists through ItemActivations', () => {
    render(
      <RuneMechanics
        rune={{
          target: 'accessory',
          usage: ['shield'],
          freeActions: [{ name: "Dragon's Breath", description: 'Widen the next matching spell.' }],
        }}
      />
    );
    expect(screen.getByText("Dragon's Breath")).toBeInTheDocument();
    expect(screen.getByText('Widen the next matching spell.')).toBeInTheDocument();
  });

  it('shows onBlock alone but suppresses it when the actuated card already covers it', () => {
    const onBlock = 'Free action (once per hour): 4d4 force damage to the attacker.';
    const { rerender } = render(<RuneMechanics rune={{ target: 'accessory', usage: ['shield'], onBlock }} />);
    expect(screen.getByText(new RegExp('4d4 force damage'))).toBeInTheDocument();
    rerender(
      <RuneMechanics
        rune={{ target: 'accessory', usage: ['shield'], onBlock, actuated: { name: 'Retaliation', description: 'Unleash force damage.' } }}
      />
    );
    expect(screen.queryByText(new RegExp('4d4 force damage'))).not.toBeInTheDocument();
    expect(screen.getByTestId('rune-mech-actuated')).toHaveTextContent('Retaliation');
  });

  it('stays lean for a plain weapon property rune: description only, no rarity pill, no accessory note', () => {
    render(<RuneMechanics rune={{ id: 'flaming', name: 'Flaming', description: 'Deals an extra 1d6 fire damage.' }} />);
    expect(screen.getByText('Deals an extra 1d6 fire damage.')).toBeInTheDocument();
    expect(screen.getByText('Etches onto weapons')).toBeInTheDocument();
    expect(screen.queryByText(/holds at most one accessory rune/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('rune-mech-actuated')).not.toBeInTheDocument();
  });
});
