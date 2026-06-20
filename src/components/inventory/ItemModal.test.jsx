import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ItemModal from './ItemModal';

vi.mock('../shared/TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name || 'trait'}</span>;
  }
}));

vi.mock('../../utils/InventoryUtils', async () => ({
  ...(await vi.importActual('../../utils/InventoryUtils')),
  formatBulk: (b) => (b === 0 ? '—' : String(b)),
}));

const mockLoadout = {
  drop: vi.fn(),
  pickUp: vi.fn(),
  stow: vi.fn(),
  unhand: vi.fn(),
  retrieve: vi.fn(),
  moveToContainer: vi.fn(),
};
vi.mock('../../hooks/useLoadout', () => ({
  __esModule: true,
  useLoadout: () => mockLoadout,
}));

// useCharacter only feeds the container list for stow/move targets here.
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: c.__inventory || [] } : null),
}));

// Item-target effects (#339) + affix + consumed (#254) overlays — key-dispatched.
let mockItemEffects = [];
let mockAffixed = {};
let mockConsumed = {};
const mockSetItemEffects = vi.fn((next) => {
  mockItemEffects = typeof next === 'function' ? next(mockItemEffects) : next;
});
const mockSetAffixed = vi.fn((next) => {
  mockAffixed = typeof next === 'function' ? next(mockAffixed) : next;
});
const mockSetConsumed = vi.fn((next) => {
  mockConsumed = typeof next === 'function' ? next(mockConsumed) : next;
});
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_affixed_')) return [mockAffixed, mockSetAffixed];
    if (String(key).startsWith('cnmh_consumed_')) return [mockConsumed, mockSetConsumed];
    return [mockItemEffects, mockSetItemEffects];
  },
}));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

beforeEach(() => {
  mockItemEffects = [];
  mockAffixed = {};
  mockConsumed = {};
  mockSetItemEffects.mockClear();
  mockSetAffixed.mockClear();
  mockSetConsumed.mockClear();
  mockAppendEvent.mockClear();
});

const baseItem = {
  name: 'Iron Sword',
  quantity: 1,
  weight: 1,
};

describe('ItemModal', () => {
  it('renders null when isOpen is false', () => {
    const { container } = render(
      <ItemModal isOpen={false} onClose={vi.fn()} item={baseItem} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null when item is null', () => {
    const { container } = render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null when both isOpen is false and item is null', () => {
    const { container } = render(
      <ItemModal isOpen={false} onClose={vi.fn()} item={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders item name when open with a basic item', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.getByText('Iron Sword')).toBeInTheDocument();
  });

  it('renders quantity fallback of 1 when item.quantity is absent', () => {
    const item = { name: 'Dagger', weight: 0 };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders provided quantity', () => {
    const item = { ...baseItem, quantity: 3 };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // --- traits ---
  it('renders traits when item.traits is non-empty', () => {
    const item = { ...baseItem, traits: ['Magical', 'Finesse'] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const tags = screen.getAllByTestId('trait-tag');
    expect(tags).toHaveLength(2);
    expect(tags[0]).toHaveTextContent('Magical');
    expect(tags[1]).toHaveTextContent('Finesse');
  });

  it('does not render traits section when item.traits is empty array', () => {
    const item = { ...baseItem, traits: [] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('does not render traits section when item.traits is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  // --- price ---
  it('renders price when item.price is present', () => {
    const item = { ...baseItem, price: 15 };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('15 gp')).toBeInTheDocument();
  });

  it('does not render price when item.price is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByText(/gp/)).toBeNull();
  });

  // --- shield ---
  it('renders shield section when item.shield is present', () => {
    const item = { ...baseItem, shield: {} };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Shield Properties')).toBeInTheDocument();
  });

  it('does not render shield section when item.shield is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByText('Shield Properties')).toBeNull();
  });

  it('renders AC Bonus when item.shield.bonus is present', () => {
    const item = { ...baseItem, shield: { bonus: 2 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('AC Bonus')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('does not render AC Bonus when item.shield.bonus is absent', () => {
    const item = { ...baseItem, shield: { hardness: 3 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('AC Bonus')).toBeNull();
  });

  it('renders Hardness when item.shield.hardness is defined', () => {
    const item = { ...baseItem, shield: { hardness: 5 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Hardness')).toBeInTheDocument();
  });

  it('does not render Hardness when item.shield.hardness is absent', () => {
    const item = { ...baseItem, shield: { bonus: 2 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Hardness')).toBeNull();
  });

  it('renders Hit Points when item.shield.hp is defined', () => {
    const item = { ...baseItem, shield: { hp: 20 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Hit Points')).toBeInTheDocument();
  });

  it('does not render Hit Points when item.shield.hp is absent', () => {
    const item = { ...baseItem, shield: { bonus: 2 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Hit Points')).toBeNull();
  });

  it('renders Broken Threshold when item.shield.broken_threshold is defined', () => {
    const item = { ...baseItem, shield: { broken_threshold: 10 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Broken Threshold')).toBeInTheDocument();
  });

  it('does not render Broken Threshold when item.shield.broken_threshold is absent', () => {
    const item = { ...baseItem, shield: { bonus: 2 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Broken Threshold')).toBeNull();
  });

  // --- description ---
  it('renders description when item.description is present', () => {
    const item = { ...baseItem, description: 'A fine blade.' };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('A fine blade.')).toBeInTheDocument();
  });

  it('does not render description when item.description is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByText('Description')).toBeNull();
  });

  // --- actions ---
  it('renders actions section when item.actions is non-empty', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', description: 'Make a Strike.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Slash')).toBeInTheDocument();
    expect(screen.getByText('Make a Strike.')).toBeInTheDocument();
  });

  it('does not render actions section when item.actions is empty', () => {
    const item = { ...baseItem, actions: [] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Actions')).toBeNull();
  });

  it('renders action icons when action.actionCount is present', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', actionCount: 2, description: 'Strike.' }],
    };
    const { container } = render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={item} />
    );
    const icons = container.querySelectorAll('.action-icon');
    expect(icons).toHaveLength(2);
  });

  it('does not render action icons when action.actionCount is absent', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', description: 'Strike.' }],
    };
    const { container } = render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={item} />
    );
    expect(container.querySelectorAll('.action-icon')).toHaveLength(0);
  });

  it('renders action traits when action.traits is non-empty', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', traits: ['Attack'], description: 'Strike.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Attack');
  });

  it('does not render action traits section when action.traits is empty', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', traits: [], description: 'Strike.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  // --- reactions ---
  it('renders reactions section when item.reactions is non-empty', () => {
    const item = {
      ...baseItem,
      reactions: [{ name: 'Parry', description: 'React to attack.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Reactions')).toBeInTheDocument();
    expect(screen.getByText('Parry')).toBeInTheDocument();
  });

  it('does not render reactions section when item.reactions is empty', () => {
    const item = { ...baseItem, reactions: [] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Reactions')).toBeNull();
  });

  it('renders reaction trigger when present', () => {
    const item = {
      ...baseItem,
      reactions: [{ name: 'Parry', trigger: 'Enemy attacks.', description: 'Block.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Enemy attacks.')).toBeInTheDocument();
  });

  it('does not render reaction trigger when absent', () => {
    const item = {
      ...baseItem,
      reactions: [{ name: 'Parry', description: 'Block.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Trigger')).toBeNull();
  });

  it('renders reaction traits when present', () => {
    const item = {
      ...baseItem,
      reactions: [{ name: 'Parry', traits: ['Concentrate'], description: 'Block.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Concentrate');
  });

  it('does not render reaction traits section when reaction.traits is empty', () => {
    const item = {
      ...baseItem,
      reactions: [{ name: 'Parry', traits: [], description: 'Block.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  // --- freeActions ---
  it('renders free actions section when item.freeActions is non-empty', () => {
    const item = {
      ...baseItem,
      freeActions: [{ name: 'Quick Draw', description: 'Draw a weapon.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Free Actions')).toBeInTheDocument();
    expect(screen.getByText('Quick Draw')).toBeInTheDocument();
  });

  it('does not render free actions section when item.freeActions is empty', () => {
    const item = { ...baseItem, freeActions: [] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Free Actions')).toBeNull();
  });

  it('renders free action trigger when present', () => {
    const item = {
      ...baseItem,
      freeActions: [{ name: 'Quick Draw', trigger: 'Your turn starts.', description: 'Draw.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Your turn starts.')).toBeInTheDocument();
  });

  it('does not render free action trigger when absent', () => {
    const item = {
      ...baseItem,
      freeActions: [{ name: 'Quick Draw', description: 'Draw.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText('Trigger')).toBeNull();
  });

  it('renders free action traits when present', () => {
    const item = {
      ...baseItem,
      freeActions: [{ name: 'Quick Draw', traits: ['Manipulate'], description: 'Draw.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Manipulate');
  });

  it('does not render free action traits section when freeAction.traits is empty', () => {
    const item = {
      ...baseItem,
      freeActions: [{ name: 'Quick Draw', traits: [], description: 'Draw.' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  // --- strikes (object form) ---
  it('renders strikes section when item.strikes is an object', () => {
    const item = {
      ...baseItem,
      strikes: { bonus: '+5', type: 'Melee', damage: '1d8+3' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Strikes')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('Melee')).toBeInTheDocument();
    expect(screen.getByText('1d8+3')).toBeInTheDocument();
  });

  it('renders strikes section when item.strikes is an array', () => {
    const item = {
      ...baseItem,
      strikes: [{ bonus: '+7', type: 'Ranged', damage: '1d6' }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Strikes')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument();
    expect(screen.getByText('Ranged')).toBeInTheDocument();
    expect(screen.getByText('1d6')).toBeInTheDocument();
  });

  it('renders additional strikes when array has length > 1', () => {
    const item = {
      ...baseItem,
      strikes: [
        { bonus: '+7', type: 'Ranged', damage: '1d6' },
        { name: 'Bite', damage: '1d4', type: 'Melee' },
      ],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Additional Strikes')).toBeInTheDocument();
    expect(screen.getByText(/Bite/)).toBeInTheDocument();
  });

  it('renders strike range when present on additional strike', () => {
    const item = {
      ...baseItem,
      strikes: [
        { bonus: '+7', type: 'Ranged', damage: '1d6' },
        { name: 'Arrow', damage: '1d8', type: 'Ranged', range: '100 ft.' },
      ],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('(Range: 100 ft.)')).toBeInTheDocument();
  });

  it('does not render range when strike.range is absent', () => {
    const item = {
      ...baseItem,
      strikes: [
        { bonus: '+7', type: 'Ranged', damage: '1d6' },
        { name: 'Bite', damage: '1d4', type: 'Melee' },
      ],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByText(/Range:/)).toBeNull();
  });

  it('renders strike traits for object-form strikes', () => {
    const item = {
      ...baseItem,
      strikes: { bonus: '+5', type: 'Melee', damage: '1d8', traits: ['Finesse'] },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Finesse');
  });

  it('renders strike traits for array-form strikes', () => {
    const item = {
      ...baseItem,
      strikes: [{ bonus: '+5', type: 'Melee', damage: '1d8', traits: ['Agile'] }],
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Agile');
  });

  it('does not render strike traits section when traits are absent (object)', () => {
    const item = { ...baseItem, strikes: { bonus: '+5', type: 'Melee', damage: '1d8' } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('does not render strike traits section when traits are absent (array)', () => {
    const item = { ...baseItem, strikes: [{ bonus: '+5', type: 'Melee', damage: '1d8' }] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('renders "-" for bonus when strikes.bonus is absent (object)', () => {
    const item = { ...baseItem, strikes: { type: 'Melee', damage: '1d8' } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getAllByText('-')).toHaveLength(1);
  });

  // --- scroll ---
  it('renders scroll section when item.scroll is present', () => {
    const item = {
      ...baseItem,
      scroll: { name: 'Fireball', level: 3, description: 'Boom.' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Scroll Spell')).toBeInTheDocument();
    expect(screen.getByText('Fireball')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();
  });

  it('does not render scroll section when item.scroll is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByText('Scroll Spell')).toBeNull();
  });

  it('renders scroll traits when item.scroll.traits is non-empty', () => {
    const item = {
      ...baseItem,
      scroll: { name: 'Fireball', level: 3, traits: ['Fire', 'Evocation'], description: '' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const tags = screen.getAllByTestId('trait-tag');
    expect(tags[0]).toHaveTextContent('Fire');
    expect(tags[1]).toHaveTextContent('Evocation');
  });

  it('does not render scroll traits section when item.scroll.traits is empty', () => {
    const item = {
      ...baseItem,
      scroll: { name: 'Fireball', level: 3, traits: [], description: '' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('does not render scroll traits section when item.scroll.traits is absent', () => {
    const item = {
      ...baseItem,
      scroll: { name: 'Fireball', level: 3, description: '' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  // --- wand ---
  it('renders wand section when item.wand is present', () => {
    const item = {
      ...baseItem,
      wand: { name: 'Magic Missile', level: 1, description: 'Pew pew.' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Wand Spell')).toBeInTheDocument();
    expect(screen.getByText('Magic Missile')).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
  });

  it('does not render wand section when item.wand is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByText('Wand Spell')).toBeNull();
  });

  it('renders wand traits when item.wand.traits is non-empty', () => {
    const item = {
      ...baseItem,
      wand: { name: 'Magic Missile', level: 1, traits: ['Force'], description: '' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('trait-tag')).toHaveTextContent('Force');
  });

  it('does not render wand traits section when item.wand.traits is empty', () => {
    const item = {
      ...baseItem,
      wand: { name: 'Magic Missile', level: 1, traits: [], description: '' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('does not render wand traits section when item.wand.traits is absent', () => {
    const item = {
      ...baseItem,
      wand: { name: 'Magic Missile', level: 1, description: '' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  // --- theming ---
  it('uses characterColor when provided', () => {
    const { container } = render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} characterColor="#ff0000" />
    );
    const modalContainer = container.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('#ff0000');
    expect(container.querySelector('.modal-header--themed')).toBeInTheDocument();
  });

  it('uses default color when characterColor is absent', () => {
    const { container } = render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />
    );
    const modalContainer = container.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('var(--color-primary)');
  });

  // --- close behaviour ---
  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ItemModal isOpen={true} onClose={onClose} item={baseItem} />
    );
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ItemModal isOpen={true} onClose={onClose} item={baseItem} />
    );
    fireEvent.click(container.querySelector('.modal-container'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ItemModal isOpen={true} onClose={onClose} item={baseItem} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Slice 4: effective ownership state shown in the detail grid
  it('shows the item state when present', () => {
    render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={{ ...baseItem, state: 'held1' }} />
    );
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Held in 1 Hand')).toBeInTheDocument();
  });

  it('omits the State row when no state is set', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByText('State')).not.toBeInTheDocument();
  });

  it('renders entity image when item.image is set', () => {
    const item = { ...baseItem, image: 'img_sword.jpg' };
    const { container } = render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const img = container.querySelector('.entity-image');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/images/img_sword.jpg');
  });

  it('does not render entity image when item.image is absent', () => {
    const { container } = render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(container.querySelector('.entity-image')).toBeNull();
  });

  it('applies object-position style when item.imagePosition is set', () => {
    const item = { ...baseItem, image: 'img_sword.jpg', imagePosition: { x: 25, y: 80 } };
    const { container } = render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const img = container.querySelector('.entity-image');
    expect(img.style.objectPosition).toBe('25% 80%');
  });
});

describe('ItemModal — Use button (#217)', () => {
  const potion = {
    uid: 'p1',
    name: 'Minor Healing Potion',
    quantity: 2,
    state: 'worn',
    traits: ['Consumable', 'Potion'],
    consumable: { kind: 'healing' },
  };

  it('renders the trait-derived verb and wires onUse + close', () => {
    const onUse = vi.fn();
    const onClose = vi.fn();
    render(<ItemModal isOpen onClose={onClose} item={potion} onUse={onUse} />);
    const btn = screen.getByTestId('item-action-use');
    expect(btn).toHaveTextContent('Drink');
    fireEvent.click(btn);
    expect(onUse).toHaveBeenCalledWith(potion);
    expect(onClose).toHaveBeenCalled();
  });

  it('is absent without an onUse prop (e.g. PartyWealth)', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={potion} />);
    expect(screen.queryByTestId('item-action-use')).not.toBeInTheDocument();
  });

  it('is absent for items without consumable metadata', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={baseItem} onUse={vi.fn()} />);
    expect(screen.queryByTestId('item-action-use')).not.toBeInTheDocument();
  });

  it('is absent when no copies remain', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={{ ...potion, quantity: 0 }} onUse={vi.fn()} />);
    expect(screen.queryByTestId('item-action-use')).not.toBeInTheDocument();
  });
});

describe('ItemModal — loadout action footer', () => {
  const backpack = { uid: 'bp', name: 'Backpack', container: { capacity: 4, contents: [] } };
  const pouch = { uid: 'po', name: 'Pouch', container: { capacity: 1, contents: [] } };
  const character = { id: 'hero', __inventory: [backpack, pouch] };

  const open = (item, char = character) =>
    render(<ItemModal isOpen onClose={vi.fn()} item={item} character={char} />);

  beforeEach(() => {
    Object.values(mockLoadout).forEach((fn) => fn.mockClear());
  });

  it('renders no action footer when the item has no uid', () => {
    open({ name: 'Loose Coin', state: 'worn' });
    expect(screen.queryByText('Drop')).not.toBeInTheDocument();
  });

  it('worn item shows Drop + Stow in each container and wires them', () => {
    open({ uid: 'i1', name: 'Cloak', state: 'worn' });
    fireEvent.click(screen.getByTestId('item-action-drop'));
    expect(mockLoadout.drop).toHaveBeenCalledWith('i1');
    fireEvent.click(screen.getByText('Stow in Backpack'));
    expect(mockLoadout.stow).toHaveBeenCalledWith('i1', 'bp');
    expect(screen.getByText('Stow in Pouch')).toBeInTheDocument();
  });

  it('a worn container item can be dropped but not stowed into a container', () => {
    open({ uid: 'bp', name: 'Backpack', state: 'worn', container: { capacity: 4, contents: [] } });
    expect(screen.getByTestId('item-action-drop')).toBeInTheDocument();
    expect(screen.queryByText(/Stow in/)).not.toBeInTheDocument();
  });

  it('dropped item shows Pick up', () => {
    open({ uid: 'i2', name: 'Armor', state: 'dropped' });
    fireEvent.click(screen.getByTestId('item-action-pickup'));
    expect(mockLoadout.pickUp).toHaveBeenCalledWith('i2');
  });

  it('held item shows Unhand and Release', () => {
    open({ uid: 'i3', name: 'Sword', state: 'held2' });
    fireEvent.click(screen.getByTestId('item-action-unhand'));
    expect(mockLoadout.unhand).toHaveBeenCalledWith('i3');
    fireEvent.click(screen.getByTestId('item-action-release'));
    expect(mockLoadout.drop).toHaveBeenCalledWith('i3');
  });

  it('stowed item shows Retrieve + Move to other containers (excluding its parent)', () => {
    const stowed = { uid: 'i4', name: 'Torch', state: 'stowed' };
    const bpWithTorch = { ...backpack, container: { capacity: 4, contents: [stowed] } };
    open(stowed, { id: 'hero', __inventory: [bpWithTorch, pouch] });
    fireEvent.click(screen.getByTestId('item-action-retrieve'));
    expect(mockLoadout.retrieve).toHaveBeenCalledWith('i4');
    // Parent (Backpack) is excluded; only Pouch is offered.
    expect(screen.queryByText('Move to Backpack')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Move to Pouch'));
    expect(mockLoadout.moveToContainer).toHaveBeenCalledWith('i4', 'po');
  });
});

describe('ItemModal — active item-target effects (#339)', () => {
  const character = { id: 'hero' };
  const plate = { id: 'plate-1', name: 'Full Plate', weight: 4 };
  const open = (item = plate, char = character) =>
    render(<ItemModal isOpen onClose={vi.fn()} item={item} character={char} />);

  it('shows no Active Effects section when the item has none', () => {
    mockItemEffects = [{ id: 'e1', itemId: 'other', label: 'Weightless' }];
    open();
    expect(screen.queryByText('Active Effects')).not.toBeInTheDocument();
  });

  it('lists the effects recorded against this item with their source', () => {
    mockItemEffects = [
      { id: 'e1', itemId: 'plate-1', label: 'Acid-protected', source: 'Anticorrosion Oil' },
    ];
    open();
    expect(screen.getByText('Active Effects')).toBeInTheDocument();
    expect(screen.getByText(/Acid-protected/)).toBeInTheDocument();
    expect(screen.getByText(/Anticorrosion Oil/)).toBeInTheDocument();
  });

  it('removes an effect from the overlay on the × button', () => {
    mockItemEffects = [
      { id: 'e1', itemId: 'plate-1', label: 'Acid-protected', source: 'Anticorrosion Oil' },
      { id: 'e2', itemId: 'plate-1', label: 'Weightless', source: 'Oil of Weightlessness' },
    ];
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Acid-protected' }));
    expect(mockSetItemEffects).toHaveBeenCalledTimes(1);
    expect(mockItemEffects.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('ItemModal — talisman affixing (#254/#339)', () => {
  const wolfFang = { uid: 't1', name: 'Wolf Fang', traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'weapon' } };
  const sword = { uid: 'w1', name: 'Longsword', strikes: [{ damage: '1d8' }] };
  const plate = { uid: 'a1', name: 'Full Plate', armor: { ac: 6 } };
  // useCharacter mock returns { inventory: char.__inventory }.
  const character = { id: 'hero', name: 'Ashka', __inventory: [wolfFang, sword, plate] };
  const open = (item = wolfFang, char = character) =>
    render(<ItemModal isOpen onClose={vi.fn()} item={item} character={char} />);

  it('shows no Affix section for a non-talisman item', () => {
    open(sword);
    expect(screen.queryByText('Affix')).not.toBeInTheDocument();
  });

  it('offers only type-matching hosts (weapons for Wolf Fang) and affixes on pick', () => {
    open();
    expect(screen.getByRole('button', { name: 'Longsword' })).toBeInTheDocument();
    // Armor is not a valid host for a weapon talisman.
    expect(screen.queryByRole('button', { name: 'Full Plate' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
    expect(mockAffixed).toEqual({ t1: 'w1' });
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka affixed Wolf Fang to Longsword (10-minute activity)',
    }));
  });

  it('when affixed, shows the host and unaffixes', () => {
    mockAffixed = { t1: 'w1' };
    open();
    expect(screen.getByText(/Affixed to/)).toHaveTextContent('Longsword');
    fireEvent.click(screen.getByTestId('item-action-unaffix'));
    expect(mockAffixed).toEqual({});
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka removed Wolf Fang from Longsword',
    }));
  });

  it('activates an affixed talisman: consumes it (unaffix + consumed++) and logs', () => {
    const wolfFangActive = {
      ...wolfFang,
      talisman: { affixTo: 'weapon', activation: { cost: 'free', trigger: 'You successfully Trip a creature', effect: { kind: 'damage', amount: 'str-mod', damageType: 'bludgeoning', onManeuver: 'trip' } } },
    };
    const char = { id: 'hero', name: 'Ashka', __inventory: [wolfFangActive, sword, plate] };
    mockAffixed = { t1: 'w1' };
    render(<ItemModal isOpen onClose={vi.fn()} item={wolfFangActive} character={char} />);

    fireEvent.click(screen.getByTestId('item-action-activate'));
    expect(mockConsumed).toEqual({ 'Wolf Fang': 1 });
    expect(mockAffixed).toEqual({}); // unaffixed on activation
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('activated Wolf Fang'),
    }));
  });

  it('shows no Activate button when the talisman has no activation block', () => {
    mockAffixed = { t1: 'w1' };
    open(); // base wolfFang has no activation
    expect(screen.queryByTestId('item-action-activate')).not.toBeInTheDocument();
  });
});
