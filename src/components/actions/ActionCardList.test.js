import React from 'react';
import { render, screen } from '@testing-library/react';
import ActionCardList from './ActionCardList';

jest.mock('../shared/ActionIcon', () => () => <div data-testid="action-icon" />);

jest.mock('../shared/CollapsibleCard', () =>
  function DummyCollapsibleCard({ header, children, style }) {
    return (
      <div data-testid="collapsible-card" style={style}>
        <div data-testid="card-header">{header}</div>
        <div>{children}</div>
      </div>
    );
  }
);

jest.mock('../shared/TraitTag', () => ({ trait }) => <span>{trait}</span>);

const baseItem = {
  name: 'Strike',
  actionCount: 1,
  traits: ['Attack'],
  description: 'A basic attack.',
};

describe('ActionCardList', () => {
  it('renders without crashing with an empty items array', () => {
    expect(() => render(<ActionCardList items={[]} />)).not.toThrow();
  });

  it('shows empty state message when items is empty', () => {
    render(<ActionCardList items={[]} type="action" emptyMessage="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  it('shows default empty message based on type', () => {
    render(<ActionCardList items={[]} type="reaction" />);
    expect(screen.getByText(/No reactions available/)).toBeInTheDocument();
  });

  it('renders a card for each item', () => {
    const items = [baseItem, { ...baseItem, name: 'Stride', traits: ['Move'] }];
    render(<ActionCardList items={items} type="action" themeColor="#fff" />);
    expect(screen.getAllByTestId('collapsible-card')).toHaveLength(2);
  });

  it('renders item names', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    expect(screen.getByText('Strike')).toBeInTheDocument();
  });

  it('renders trait tags', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    expect(screen.getByText('Attack')).toBeInTheDocument();
  });

  it('renders item description', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    expect(screen.getByText('A basic attack.')).toBeInTheDocument();
  });

  it('shows source when provided', () => {
    const item = { ...baseItem, source: 'Power Feat' };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    expect(screen.getByText(/Power Feat/)).toBeInTheDocument();
  });

  it('shows trigger for reaction-type items', () => {
    const reaction = { name: 'Shield Block', trigger: 'You take damage.', traits: [], description: 'Block it.' };
    render(<ActionCardList items={[reaction]} type="reaction" themeColor="#fff" />);
    expect(screen.getByText('You take damage.')).toBeInTheDocument();
  });

  it('renders variable action count text', () => {
    const item = { ...baseItem, actionCount: 1, variableActionCount: { min: 1, max: 3 } };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    expect(screen.getByText(/1 to 3 Actions/)).toBeInTheDocument();
  });

  describe('highlight feature', () => {
    it('renders highlight badge when item.highlight is set', () => {
      const item = { ...baseItem, highlight: 'Master' };
      render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
      expect(screen.getByText(/✦ Master/)).toBeInTheDocument();
    });

    it('renders Legendary badge correctly', () => {
      const item = { ...baseItem, highlight: 'Legendary' };
      render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
      expect(screen.getByText(/✦ Legendary/)).toBeInTheDocument();
    });

    it('renders Expert badge correctly', () => {
      const item = { ...baseItem, highlight: 'Expert' };
      render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
      expect(screen.getByText(/✦ Expert/)).toBeInTheDocument();
    });

    it('does not render a highlight badge when highlight is not set', () => {
      render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
      expect(screen.queryByText(/✦/)).not.toBeInTheDocument();
    });

    it('applies gold border color style when item is highlighted', () => {
      const item = { ...baseItem, highlight: 'Master' };
      render(<ActionCardList items={[item]} type="action" themeColor="#aabbcc" />);
      const card = screen.getByTestId('collapsible-card');
      expect(card.style.borderLeft).toContain('#d4a017');
    });

    it('applies theme color border when item is not highlighted', () => {
      render(<ActionCardList items={[baseItem]} type="action" themeColor="#aabbcc" />);
      const card = screen.getByTestId('collapsible-card');
      expect(card.style.borderLeft).toContain('#aabbcc');
    });
  });
});
