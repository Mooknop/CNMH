import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionCardList from './ActionCardList';

// ActionCardList now renders ActionRows; tapping a row opens ActionDetailModal.
// Mock both so we control what's rendered without their full dependency trees.

vi.mock('../shared/ActionRow', () => ({
  default: function DummyActionRow({ name, glyph, rightLabel, active, inactive, onClick }) {
    return (
      <button
        data-testid="action-row"
        data-active={active}
        data-inactive={inactive}
        onClick={onClick}
      >
        {glyph && <span data-testid="row-glyph">{glyph}</span>}
        <span data-testid="row-name">{name}</span>
        {rightLabel && <span data-testid="row-chip">{rightLabel}</span>}
      </button>
    );
  }
}));

vi.mock('../encounter/ActionDetailModal', async () => {
  const { useState } = await vi.importActual('react');
  return {
    default: function DummyActionDetailModal({
      item, type, isOpen, onClose, encounterMode, onUse, isActive, onSetActive,
    }) {
      const [cost, setCost] = useState((item && item.actionCount) || 1);
      if (!item || !isOpen) return null;
      return (
        <div data-testid="action-detail-modal">
          {item.description && <p>{item.description}</p>}
          {item.source && <p>From: {item.source}</p>}
          {(type === 'reaction' || type === 'free-action') && item.trigger && (
            <p>{item.trigger}</p>
          )}
          {item.active === false && <p>Not in hand — hold this item to use it.</p>}
          {item.highlight && <span>✦ {item.highlight}</span>}
          {encounterMode && item.variableActionCount && (
            <select
              aria-label={`Action count for ${item.name}`}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            >
              {[1, 2, 3]
                .filter((n) => n >= item.variableActionCount.min && n <= item.variableActionCount.max)
                .map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {encounterMode && item.active !== false && (
            <button
              onClick={() => {
                const c = type === 'reaction' ? 'reaction'
                  : type === 'free-action' ? 'free'
                  : item.variableActionCount ? cost
                  : (item.actionCount || 1);
                onUse && onUse(item, c);
              }}
            >
              Use {item.name}
            </button>
          )}
          {encounterMode && item.active === false && <span>Hold</span>}
          <button onClick={onClose}>Close</button>
        </div>
      );
    }
  };
});

vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span>{trait}</span> }));

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

  it('renders a row for each item', () => {
    const items = [baseItem, { ...baseItem, name: 'Stride', traits: ['Move'] }];
    render(<ActionCardList items={items} type="action" themeColor="#fff" />);
    expect(screen.getAllByTestId('action-row')).toHaveLength(2);
  });

  it('renders item names in rows', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    expect(screen.getByTestId('row-name')).toHaveTextContent('Strike');
  });

  it('renders first trait as row chip', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    expect(screen.getByTestId('row-chip')).toHaveTextContent('Attack');
  });

  it('opens detail modal when a row is clicked', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    expect(screen.queryByTestId('action-detail-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('action-row'));
    expect(screen.getByTestId('action-detail-modal')).toBeInTheDocument();
  });

  it('closes modal when close button is clicked', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    fireEvent.click(screen.getByTestId('action-row'));
    expect(screen.getByTestId('action-detail-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('action-detail-modal')).not.toBeInTheDocument();
  });

  it('renders item description inside the modal', () => {
    render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
    fireEvent.click(screen.getByTestId('action-row'));
    expect(screen.getByText('A basic attack.')).toBeInTheDocument();
  });

  it('shows source when provided (in modal)', () => {
    const item = { ...baseItem, source: 'Power Feat' };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    fireEvent.click(screen.getByTestId('action-row'));
    expect(screen.getByText(/Power Feat/)).toBeInTheDocument();
  });

  it('shows trigger for reaction-type items (in modal)', () => {
    const reaction = { name: 'Shield Block', trigger: 'You take damage.', traits: [], description: 'Block it.' };
    render(<ActionCardList items={[reaction]} type="reaction" themeColor="#fff" />);
    fireEvent.click(screen.getByTestId('action-row'));
    expect(screen.getByText('You take damage.')).toBeInTheDocument();
  });

  it('renders variable action count item name in row', () => {
    const item = { ...baseItem, name: 'Flexible Strike', variableActionCount: { min: 1, max: 3 } };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    expect(screen.getByTestId('row-name')).toHaveTextContent('Flexible Strike');
  });

  it('shows the not-in-hand hint when an item action is inactive (in modal)', () => {
    const item = { ...baseItem, source: 'Wand', active: false };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    fireEvent.click(screen.getByTestId('action-row'));
    expect(screen.getByText(/Not in hand/)).toBeInTheDocument();
  });

  it('marks inactive rows with the inactive data attribute', () => {
    const item = { ...baseItem, active: false };
    render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
    expect(screen.getByTestId('action-row')).toHaveAttribute('data-inactive', 'true');
  });

  it('does not mark active rows as inactive', () => {
    render(<ActionCardList items={[{ ...baseItem, active: true }]} type="action" themeColor="#fff" />);
    expect(screen.getByTestId('action-row')).toHaveAttribute('data-inactive', 'false');
  });

  describe('encounterMode', () => {
    it('does not show Use button before a row is tapped', () => {
      render(<ActionCardList items={[baseItem]} type="action" encounterMode onUse={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /Use Strike/ })).toBeNull();
    });

    it('shows Use button in encounter mode after tapping row', () => {
      render(<ActionCardList items={[baseItem]} type="action" encounterMode onUse={vi.fn()} />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.getByRole('button', { name: 'Use Strike' })).toBeInTheDocument();
    });

    it('Use button is present for a 3-action item', () => {
      const item = { ...baseItem, name: 'Triple Strike', actionCount: 3 };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={vi.fn()} />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.getByRole('button', { name: 'Use Triple Strike' })).toBeInTheDocument();
    });

    it('calls onUse with item and cost when Use is clicked', () => {
      const onUse = vi.fn();
      render(<ActionCardList items={[baseItem]} type="action" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByTestId('action-row'));
      fireEvent.click(screen.getByRole('button', { name: 'Use Strike' }));
      expect(onUse).toHaveBeenCalledWith(baseItem, 1);
    });

    it('Use button for reaction type passes "reaction" as cost', () => {
      const onUse = vi.fn();
      const reaction = { name: 'Shield Block', traits: [], description: 'Block.' };
      render(<ActionCardList items={[reaction]} type="reaction" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByTestId('action-row'));
      fireEvent.click(screen.getByRole('button', { name: 'Use Shield Block' }));
      expect(onUse).toHaveBeenCalledWith(reaction, 'reaction');
    });

    it('Use button for free-action type passes "free" as cost', () => {
      const onUse = vi.fn();
      const fa = { name: 'Release', traits: [], description: 'Drop something.' };
      render(<ActionCardList items={[fa]} type="free-action" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByTestId('action-row'));
      fireEvent.click(screen.getByRole('button', { name: 'Use Release' }));
      expect(onUse).toHaveBeenCalledWith(fa, 'free');
    });

    it('inactive items show Hold text instead of Use button', () => {
      const item = { ...baseItem, source: 'Wand', active: false };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={vi.fn()} />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.queryByRole('button', { name: /Use Strike/ })).toBeNull();
      expect(screen.getByText('Hold')).toBeInTheDocument();
    });

    it('variable-cost action shows a cost dropdown and Use button', () => {
      const item = { ...baseItem, variableActionCount: { min: 1, max: 3 } };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={vi.fn()} />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.getByRole('combobox', { name: `Action count for ${item.name}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Use Strike' })).toBeInTheDocument();
    });

    it('variable-cost Use calls onUse with selected cost', () => {
      const onUse = vi.fn();
      const item = { ...baseItem, variableActionCount: { min: 1, max: 3 } };
      render(<ActionCardList items={[item]} type="action" encounterMode onUse={onUse} />);
      fireEvent.click(screen.getByTestId('action-row'));
      const select = screen.getByRole('combobox', { name: `Action count for ${item.name}` });
      fireEvent.change(select, { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Use Strike' }));
      expect(onUse).toHaveBeenCalledWith(item, 3);
    });
  });

  describe('highlight feature', () => {
    it('renders highlight badge in modal when item.highlight is set', () => {
      const item = { ...baseItem, highlight: 'Master' };
      render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.getByText(/✦ Master/)).toBeInTheDocument();
    });

    it('renders Legendary badge correctly in modal', () => {
      const item = { ...baseItem, highlight: 'Legendary' };
      render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.getByText(/✦ Legendary/)).toBeInTheDocument();
    });

    it('renders Expert badge correctly in modal', () => {
      const item = { ...baseItem, highlight: 'Expert' };
      render(<ActionCardList items={[item]} type="action" themeColor="#fff" />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.getByText(/✦ Expert/)).toBeInTheDocument();
    });

    it('does not render a highlight badge when highlight is not set', () => {
      render(<ActionCardList items={[baseItem]} type="action" themeColor="#fff" />);
      fireEvent.click(screen.getByTestId('action-row'));
      expect(screen.queryByText(/✦/)).not.toBeInTheDocument();
    });
  });
});
