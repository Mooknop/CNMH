import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionDetailModal from './ActionDetailModal';

vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        <button onClick={onClose}>×</button>
        {children}
      </div>
    );
  }
}));

vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span data-testid="trait">{trait}</span> }));

vi.mock('../shared/ActionIcon', () => ({
  default: function DummyActionIcon({ actionText }) {
    return <span data-testid="action-icon">{actionText}</span>;
  }
}));

vi.mock('../shared/UseActionChip', () => ({
  default: function DummyUseActionChip({ name, cost, onUse, inactive }) {
    return (
      <button
        data-testid="use-action-chip"
        data-inactive={inactive}
        onClick={() => onUse && onUse(cost)}
      >
        Use {name}
      </button>
    );
  }
}));

const baseItem = {
  name: 'Strike',
  actionCount: 1,
  traits: ['Attack'],
  description: 'A basic attack.',
};

describe('ActionDetailModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ActionDetailModal item={baseItem} isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when item is null', () => {
    const { container } = render(
      <ActionDetailModal item={null} isOpen onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the item name as modal title', () => {
    render(<ActionDetailModal item={baseItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Strike' })).toBeInTheDocument();
  });

  it('renders trait chips', () => {
    render(<ActionDetailModal item={baseItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('trait')).toHaveTextContent('Attack');
  });

  it('does not render trait section when traits array is empty', () => {
    const item = { ...baseItem, traits: [] };
    render(<ActionDetailModal item={item} isOpen onClose={vi.fn()} />);
    expect(screen.queryByTestId('trait')).not.toBeInTheDocument();
  });

  it('renders action cost via ActionIcon for non-activity types', () => {
    render(<ActionDetailModal item={baseItem} type="action" isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('action-icon')).toBeInTheDocument();
  });

  it('does not render action cost for activity type', () => {
    const activity = { name: 'Scout', description: 'Scouting.', traits: [] };
    render(<ActionDetailModal item={activity} type="activity" isOpen onClose={vi.fn()} />);
    expect(screen.queryByTestId('action-icon')).not.toBeInTheDocument();
  });

  it('renders skill row for activity type when skill is present', () => {
    const activity = { name: 'Avoid Notice', skill: 'Stealth', description: 'Sneak.', traits: [] };
    render(<ActionDetailModal item={activity} type="activity" isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Stealth')).toBeInTheDocument();
  });

  it('renders Reaction action text for reaction type', () => {
    const reaction = { name: 'Shield Block', traits: [], description: 'Block.' };
    render(<ActionDetailModal item={reaction} type="reaction" isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('action-icon')).toHaveTextContent('Reaction');
  });

  it('renders Free Action text for free-action type', () => {
    const fa = { name: 'Release', traits: [], description: 'Drop.' };
    render(<ActionDetailModal item={fa} type="free-action" isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('action-icon')).toHaveTextContent('Free Action');
  });

  it('renders trigger box for reaction type with trigger', () => {
    const reaction = { name: 'Shield Block', trigger: 'You take damage.', traits: [], description: 'Block.' };
    render(<ActionDetailModal item={reaction} type="reaction" isOpen onClose={vi.fn()} />);
    expect(screen.getByText('You take damage.')).toBeInTheDocument();
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });

  it('does not render trigger box for non-reaction types', () => {
    const item = { ...baseItem, trigger: 'Ignored trigger' };
    render(<ActionDetailModal item={item} type="action" isOpen onClose={vi.fn()} />);
    expect(screen.queryByText('Ignored trigger')).not.toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<ActionDetailModal item={baseItem} isOpen onClose={vi.fn()} />);
    expect(screen.getByText('A basic attack.')).toBeInTheDocument();
  });

  it('renders degrees of success when present', () => {
    const item = {
      ...baseItem,
      degrees: { 'Critical Success': 'Double damage.', 'Failure': 'Miss.' },
    };
    render(<ActionDetailModal item={item} type="action" isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
    expect(screen.getByText('Double damage.')).toBeInTheDocument();
    expect(screen.getByText('Failure')).toBeInTheDocument();
  });

  it('does not render degrees section when degrees is empty', () => {
    const item = { ...baseItem, degrees: {} };
    render(<ActionDetailModal item={item} type="action" isOpen onClose={vi.fn()} />);
    expect(screen.queryByText('Degrees of Success')).not.toBeInTheDocument();
  });

  it('renders source attribution when present', () => {
    const item = { ...baseItem, source: 'Fighter Class' };
    render(<ActionDetailModal item={item} isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/Fighter Class/)).toBeInTheDocument();
  });

  it('renders inactive hint when item.active is false', () => {
    const item = { ...baseItem, active: false };
    render(<ActionDetailModal item={item} isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/Not in hand/)).toBeInTheDocument();
  });

  it('does not render inactive hint when item.active is true', () => {
    const item = { ...baseItem, active: true };
    render(<ActionDetailModal item={item} isOpen onClose={vi.fn()} />);
    expect(screen.queryByText(/Not in hand/)).not.toBeInTheDocument();
  });

  describe('encounterMode', () => {
    it('shows UseActionChip in encounter mode for non-activity', () => {
      render(
        <ActionDetailModal item={baseItem} type="action" isOpen encounterMode onUse={vi.fn()} onClose={vi.fn()} />
      );
      expect(screen.getByTestId('use-action-chip')).toBeInTheDocument();
    });

    it('does not show UseActionChip when encounterMode is false', () => {
      render(
        <ActionDetailModal item={baseItem} type="action" isOpen encounterMode={false} onUse={vi.fn()} onClose={vi.fn()} />
      );
      expect(screen.queryByTestId('use-action-chip')).not.toBeInTheDocument();
    });

    it('does not show UseActionChip for activity type', () => {
      const activity = { name: 'Scout', description: 'Scouting.', traits: [] };
      render(
        <ActionDetailModal item={activity} type="activity" isOpen encounterMode onUse={vi.fn()} onClose={vi.fn()} />
      );
      expect(screen.queryByTestId('use-action-chip')).not.toBeInTheDocument();
    });

    it('calls onUse and onClose when UseActionChip is clicked', () => {
      const onUse = vi.fn();
      const onClose = vi.fn();
      render(
        <ActionDetailModal item={baseItem} type="action" isOpen encounterMode onUse={onUse} onClose={onClose} />
      );
      fireEvent.click(screen.getByTestId('use-action-chip'));
      expect(onUse).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('activity type', () => {
    const activity = { name: 'Avoid Notice', description: 'Sneak.', traits: [] };

    it('shows Set as active button for activity type', () => {
      const onSetActive = vi.fn();
      render(
        <ActionDetailModal item={activity} type="activity" isOpen onClose={vi.fn()} onSetActive={onSetActive} isActive={false} />
      );
      expect(screen.getByRole('button', { name: /Set as active/ })).toBeInTheDocument();
    });

    it('shows Active — Clear label when isActive is true', () => {
      render(
        <ActionDetailModal item={activity} type="activity" isOpen onClose={vi.fn()} onSetActive={vi.fn()} isActive />
      );
      expect(screen.getByRole('button', { name: /Active — Clear/ })).toBeInTheDocument();
    });

    it('calls onSetActive and onClose when Set as active is clicked', () => {
      const onSetActive = vi.fn();
      const onClose = vi.fn();
      render(
        <ActionDetailModal item={activity} type="activity" isOpen onClose={onClose} onSetActive={onSetActive} isActive={false} />
      );
      fireEvent.click(screen.getByRole('button', { name: /Set as active/ }));
      expect(onSetActive).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('does not show Set as active button when onSetActive is not provided', () => {
      render(
        <ActionDetailModal item={activity} type="activity" isOpen onClose={vi.fn()} />
      );
      expect(screen.queryByRole('button', { name: /Set as active/ })).not.toBeInTheDocument();
    });

    it('shows Roll Check button when activity has a roll and onRoll is provided', () => {
      const rollActivity = { name: 'Coerce', traits: [], description: 'Coerce.', mechanics: { roll: { type: 'skill', skill: 'intimidation' } } };
      const onRoll = vi.fn();
      render(
        <ActionDetailModal item={rollActivity} type="activity" isOpen onClose={vi.fn()} onRoll={onRoll} />
      );
      expect(screen.getByRole('button', { name: 'Roll Check' })).toBeInTheDocument();
    });

    it('calls onRoll and onClose when Roll Check is clicked', () => {
      const rollActivity = { name: 'Coerce', traits: [], description: 'Coerce.', mechanics: { roll: { type: 'skill', skill: 'intimidation' } } };
      const onRoll = vi.fn();
      const onClose = vi.fn();
      render(
        <ActionDetailModal item={rollActivity} type="activity" isOpen onClose={onClose} onRoll={onRoll} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Roll Check' }));
      expect(onRoll).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('does not show Roll Check button when activity has no roll', () => {
      render(
        <ActionDetailModal item={activity} type="activity" isOpen onClose={vi.fn()} onRoll={vi.fn()} />
      );
      expect(screen.queryByRole('button', { name: 'Roll Check' })).not.toBeInTheDocument();
    });
  });

  it('renders variable action text when variableActionCount is provided', () => {
    const item = { ...baseItem, variableActionCount: { min: 1, max: 3 } };
    render(<ActionDetailModal item={item} type="action" isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('action-icon')).toHaveTextContent(/1 to 3/);
  });

  describe('rune source breakdown (#608)', () => {
    it('renders the Runes line for a strike carrying a runeBreakdown', () => {
      const item = {
        ...baseItem,
        source: '+1 Striking Pick',
        runeBreakdown: { potencyBonus: 1, extraDice: 1, strikingLabel: 'Striking', properties: ['Vitalizing'] },
      };
      render(<ActionDetailModal item={item} type="action" isOpen onClose={vi.fn()} />);
      expect(screen.getByTestId('adm-runes')).toHaveTextContent('Runes: +1 potency · +1 die (Striking) · Vitalizing');
    });

    it('omits the Runes line for a strike with no runeBreakdown', () => {
      render(<ActionDetailModal item={baseItem} type="action" isOpen onClose={vi.fn()} />);
      expect(screen.queryByTestId('adm-runes')).not.toBeInTheDocument();
    });
  });
});
