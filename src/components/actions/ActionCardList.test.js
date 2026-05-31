import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionCardList from './ActionCardList';

jest.mock('../shared/ActionIcon', () => () => <div data-testid="action-icon" />);

jest.mock('../shared/CollapsibleCard', () =>
  function DummyCollapsibleCard({ header, headerRight, children, style }) {
    return (
      <div data-testid="collapsible-card" style={style}>
        <div data-testid="card-header">{header}</div>
        {headerRight && <div data-testid="card-header-right">{headerRight}</div>}
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

  it('renders variable action count item name', () => {
    const item = { ...baseItem, name: 'Flexible Strike', actionCount: 1, variableActionCount: { min: 1, max: 3 } };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    expect(screen.getByText('Flexible Strike')).toBeInTheDocument();
  });

  it('shows the not-in-hand hint when an item action is inactive', () => {
    const item = { ...baseItem, source: 'Wand', active: false };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    expect(screen.getByText(/Not in hand/)).toBeInTheDocument();
  });

  it('does not show the hint for active or non-item actions', () => {
    render(<ActionCardList items={[{ ...baseItem, active: true }]} type="action" themeColor="#fff" />);
    expect(screen.queryByText(/Not in hand/)).not.toBeInTheDocument();
  });

  describe('encounterMode', () => {
    it('does not show Use button when encounterMode is false', () => {
      render(<ActionCardList items={[baseItem]} type="action" encounterMode={false} onUse={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /Use Strike/ })).toBeNull();
    });

    it('shows Use button in encounter mode', () => {
      render(<ActionCardList items={[baseItem]} type="action" encounterMode onUse={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Use Strike' })).toBeInTheDocument();
    });

    it('Use button is present for a 3-action item', () => {
      const item = { ...baseItem, name: 'Triple Strike', actionCount: 3 };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Use Triple Strike' })).toBeInTheDocument();
    });

    it('calls onUse with item and cost when Use is clicked', () => {
      const onUse = jest.fn();
      render(<ActionCardList items={[baseItem]} type="action" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByRole('button', { name: 'Use Strike' }));
      expect(onUse).toHaveBeenCalledWith(baseItem, 1);
    });

    it('Use button for reaction type passes "reaction" as cost', () => {
      const onUse = jest.fn();
      const reaction = { name: 'Shield Block', traits: [], description: 'Block.' };
      render(<ActionCardList items={[reaction]} type="reaction" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByRole('button', { name: 'Use Shield Block' }));
      expect(onUse).toHaveBeenCalledWith(reaction, 'reaction');
    });

    it('Use button for free-action type passes "free" as cost', () => {
      const onUse = jest.fn();
      const fa = { name: 'Release', traits: [], description: 'Drop something.' };
      render(<ActionCardList items={[fa]} type="free-action" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByRole('button', { name: 'Use Release' }));
      expect(onUse).toHaveBeenCalledWith(fa, 'free');
    });

    it('inactive items show a disabled Hold chip instead of Use', () => {
      const item = { ...baseItem, source: 'Wand', active: false };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /Use Strike/ })).toBeNull();
      expect(screen.getByText('Hold')).toBeInTheDocument();
    });

    it('variable-cost action shows a cost dropdown and Use button', () => {
      const item = { ...baseItem, variableActionCount: { min: 1, max: 3 } };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={jest.fn()} />);
      expect(screen.getByRole('combobox', { name: `Action count for ${item.name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Use Strike' })).toBeInTheDocument();
    });

    it('variable-cost Use calls onUse with selected cost', () => {
      const onUse = jest.fn();
      const item = { ...baseItem, variableActionCount: { min: 1, max: 3 } };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={onUse} />);
      const select = screen.getByRole('combobox', { name: `Action count for ${item.name}` });
      fireEvent.change(select, { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Use Strike' }));
      expect(onUse).toHaveBeenCalledWith(item, 3);
    });
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
