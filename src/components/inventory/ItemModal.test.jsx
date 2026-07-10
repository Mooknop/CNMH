import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

// useCharacter feeds the container list for stow/move targets and (for weapons)
// the stats strike resolution needs. Spread the passed character so tests can
// supply abilities/proficiencies/level.
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { ...c, inventory: c.__inventory || [] } : null),
}));

// Item-target effects (#339) + affix + consumed (#254) overlays — key-dispatched.
let mockItemEffects = [];
let mockAffixed = {};
let mockAttached = {};
let mockConsumed = {};
let mockRuneConfig = {};
const mockSetRuneConfig = vi.fn((next) => {
  mockRuneConfig = typeof next === 'function' ? next(mockRuneConfig) : next;
});
const mockSetItemEffects = vi.fn((next) => {
  mockItemEffects = typeof next === 'function' ? next(mockItemEffects) : next;
});
const mockSetAffixed = vi.fn((next) => {
  mockAffixed = typeof next === 'function' ? next(mockAffixed) : next;
});
const mockSetConsumed = vi.fn((next) => {
  mockConsumed = typeof next === 'function' ? next(mockConsumed) : next;
});
const mockSetAttached = vi.fn((next) => {
  mockAttached = typeof next === 'function' ? next(mockAttached) : next;
});
let mockAbsorbed = {};
const mockSetAbsorbed = vi.fn((next) => {
  mockAbsorbed = typeof next === 'function' ? next(mockAbsorbed) : next;
});
let mockInvested = {};
const mockSetInvested = vi.fn((next) => {
  mockInvested = typeof next === 'function' ? next(mockInvested) : next;
});
let mockEffects = [];
const mockSetEffects = vi.fn((next) => {
  mockEffects = typeof next === 'function' ? next(mockEffects) : next;
});
let mockItemModes = {};
const mockSetItemModes = vi.fn((next) => {
  mockItemModes = typeof next === 'function' ? next(mockItemModes) : next;
});
// Encounter state (#1213) — whetstone expiry branches on encounter.active.
let mockEncounter = null;
const mockSetEncounter = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_encounter_')) return [mockEncounter, mockSetEncounter];
    if (String(key).startsWith('cnmh_affixed_')) return [mockAffixed, mockSetAffixed];
    if (String(key).startsWith('cnmh_attached_')) return [mockAttached, mockSetAttached];
    if (String(key).startsWith('cnmh_absorbed_')) return [mockAbsorbed, mockSetAbsorbed];
    if (String(key).startsWith('cnmh_consumed_')) return [mockConsumed, mockSetConsumed];
    if (String(key).startsWith('cnmh_invested_')) return [mockInvested, mockSetInvested];
    if (String(key).startsWith('cnmh_runeconfig_')) return [mockRuneConfig, mockSetRuneConfig];
    if (String(key).startsWith('cnmh_effects_')) return [mockEffects, mockSetEffects];
    if (String(key).startsWith('cnmh_itemmode_')) return [mockItemModes, mockSetItemModes];
    return [mockItemEffects, mockSetItemEffects];
  },
}));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

// Give-item flow (#656): the hook is exercised in useGiveItem.test.jsx; here we
// just drive the modal's gating + wiring. Play mode controls visibility; the
// roster supplies recipients.
const mockGive = vi.fn(() => true);
const mockGiveConsumable = vi.fn(() => true);
vi.mock('../../hooks/useGiveItem', () => ({
  useGiveItem: () => ({ give: mockGive, giveConsumable: mockGiveConsumable }),
}));
let mockMode = 'exploration';
vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => ({ mode: mockMode }),
}));
let mockCharacters = [];
let mockSpells = [];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters, spells: mockSpells }),
}));

// CastSpellModal (#1055 S3) is a heavy encounter component; stub it so the
// ItemModal test drives only the rune-cast wiring (open state + spell handed in).
vi.mock('../encounter/CastSpellModal', () => ({
  default: ({ isOpen, spell, castSource }) =>
    isOpen ? (
      <div data-testid="cast-spell-modal" data-source={castSource}>
        casting {spell?.name} · rank {spell?.level} · dc {spell?.roll?.bonus} · id {spell?.id}
      </div>
    ) : null,
}));

// Game clock (once/day gate) — a stub is enough; freq math is tested elsewhere.
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: {}, time: {} }),
}));

// Actuated-activation state machine (#957 S4) is unit-tested in
// useItemActivation.test.jsx; here we drive the modal's rendering + wiring off a
// controllable stub.
let mockItemAct;
const makeItemAct = (over = {}) => ({
  actuated: null,
  minRank: 2,
  gate: { available: true },
  broken: false,
  repairable: false,
  slotOptions: [{ rank: 2, remaining: 1, label: 'Rank 2 slot (1 left)' }],
  activation: { canActivate: false, activate: vi.fn(() => ({ ok: true, rank: 2, label: 'rank 2 slot' })), disabledReason: null },
  overload: { canOverload: false, overload: vi.fn(() => ({ ok: true, rank: 2, label: 'rank 2 slot', roll: 11, dc: 10, success: true })) },
  repair: { repairable: false, minRankSlotAvailable: true, withAction: vi.fn(() => ({ ok: true })), withSlot: vi.fn(() => ({ ok: true, rank: 2, label: 'rank 2 slot' })) },
  ...over,
});
vi.mock('../../hooks/useItemActivation', () => ({
  useItemActivation: () => mockItemAct,
}));

beforeEach(() => {
  mockItemEffects = [];
  mockAffixed = {};
  mockAttached = {};
  mockAbsorbed = {};
  mockSetAttached.mockClear();
  mockSetAbsorbed.mockClear();
  mockConsumed = {};
  mockInvested = {};
  mockRuneConfig = {};
  mockEffects = [];
  mockItemModes = {};
  mockEncounter = null;
  mockSetItemModes.mockClear();
  mockSetItemEffects.mockClear();
  mockSetAffixed.mockClear();
  mockSetConsumed.mockClear();
  mockSetInvested.mockClear();
  mockSetRuneConfig.mockClear();
  mockSetEffects.mockClear();
  mockAppendEvent.mockClear();
  mockGive.mockClear();
  mockGive.mockReturnValue(true);
  mockGiveConsumable.mockClear();
  mockGiveConsumable.mockReturnValue(true);
  mockMode = 'exploration';
  mockCharacters = [];
  mockSpells = [];
  mockItemAct = makeItemAct();
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

  // --- scroll / wand derived display (#812 S3) ---
  it('shows the derived "Scroll of X" name + item level/price for a nameless scroll', () => {
    const item = {
      // name omitted: the modal derives it from the resolved scroll block
      level: 9,
      price: 150,
      weight: 0.1,
      scroll: { name: 'Heal', level: 1, rank: 5, traits: ['Healing'] },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Scroll of Heal (Rank 5)')).toBeInTheDocument();
    expect(screen.getByText('150 gp')).toBeInTheDocument();
    // item-level detail row reflects the derived level
    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    // the spell section shows the cast rank, not the spell's base level
    expect(screen.getByText('Rank 5')).toBeInTheDocument();
  });

  it('shows the derived "Wand of X" name for a nameless wand', () => {
    const item = {
      level: 3,
      price: 60,
      weight: 0.1,
      wand: { name: 'Heal', level: 1, traits: ['Healing'] },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByText('Wand of Heal')).toBeInTheDocument();
    expect(screen.getByText('60 gp')).toBeInTheDocument();
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

  // Take Cover +4 rider (#1196 G1) — data-driven off shield.takeCoverBonus.
  it('surfaces the Take Cover rider when shield.takeCoverBonus is set', () => {
    const item = { ...baseItem, shield: { bonus: 2, takeCoverBonus: 4 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const note = screen.getByTestId('shield-take-cover');
    expect(note).toHaveTextContent('Take Cover');
    expect(note).toHaveTextContent('+4');
  });

  it('omits the Take Cover rider when shield.takeCoverBonus is absent', () => {
    const item = { ...baseItem, shield: { bonus: 2 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('shield-take-cover')).toBeNull();
  });

  // Deflecting note (#1196 G1) — shown when the shield carries the trait.
  it('surfaces the Deflecting note when the item has the Deflecting trait', () => {
    const item = { ...baseItem, shield: { bonus: 2 }, traits: ['Deflecting'] };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('shield-deflecting')).toHaveTextContent('+2 Hardness');
  });

  it('omits the Deflecting note without the trait', () => {
    const item = { ...baseItem, shield: { bonus: 2 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('shield-deflecting')).toBeNull();
  });

  // Shield property-rune activations (#1196 G3/G4) — each actuated rune surfaces
  // an activation card that fires the gate + logs.
  it('surfaces, activates, and logs a shield property-rune activation', () => {
    mockItemAct = makeItemAct({ activation: { canActivate: true, activate: vi.fn(() => ({ ok: true })), disabledReason: null } });
    const item = {
      ...baseItem, name: 'Kite Shield', shield: { bonus: 2 },
      runes: { reinforcing: 'moderate', property: [
        { id: 'reflecting', type: 'property', name: 'Reflecting', actuated: {
          cost: 'none', name: 'Reflecting', frequency: 'once per day', traits: ['Command'],
          description: 'Trigger You are hit by a ranged weapon attack; Effect … The GM resolves the redirected attack.',
        } },
      ] },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getByTestId('shield-rune-activation-reflecting')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('shield-rune-activate-reflecting'));
    expect(mockItemAct.activation.activate).toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Reflecting') }),
    );
  });

  it('shows no shield-rune activation section for a shield with only passive runes', () => {
    const item = { ...baseItem, name: 'Kite Shield', shield: { bonus: 2 },
      runes: { reinforcing: 'moderate', property: [{ id: 'energy-resistant', type: 'property', name: 'Energy-Resistant', choice: 'fire' }] } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('shield-rune-activations')).toBeNull();
  });

  // Rune-granted traits (#1196 G3) — a shield shows its effective traits.
  it('shows a rune-granted trait chip (Feather → Finesse) alongside base traits', () => {
    const item = {
      ...baseItem, name: 'Kite Shield', traits: ['Deflecting'], shield: { bonus: 2 },
      runes: { reinforcing: 'minor', property: [{ id: 'feather', type: 'property', name: 'Feather' }] },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const traits = document.querySelector('.item-traits');
    expect(traits).toHaveTextContent('Deflecting');
    expect(traits).toHaveTextContent('Finesse'); // granted by the Feather rune
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

  // --- reinforcing rune (#1165 S4) ---
  it('shows resolved Hardness/HP/BT, the reinforcing-tier line, and the Remaster name for a reinforced shield', () => {
    const item = {
      name: 'Steel Shield',
      shield: { hardness: 5, health: 20, breakThreshold: 10, bonus: 2 },
      runes: { reinforcing: 'lesser' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    // Additive-with-cap over the steel base → H8 / HP72 / BT36.
    const grid = screen.getByText('Hardness').closest('.item-detail-grid');
    expect(within(grid).getByText('8')).toBeInTheDocument();   // hardness
    expect(within(grid).getByText('72')).toBeInTheDocument();  // hp
    expect(within(grid).getByText('36')).toBeInTheDocument();  // broken threshold
    expect(screen.getByTestId('shield-rune-tier')).toHaveTextContent('Lesser Reinforcing');
    expect(screen.getByText('Lesser Reinforcing Steel Shield')).toBeInTheDocument();
  });

  it('does not show a reinforcing-tier line for a plain (non-reinforced) shield', () => {
    const item = { ...baseItem, name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('shield-rune-tier')).toBeNull();
    // Base values pass through unchanged.
    const grid = screen.getByText('Hardness').closest('.item-detail-grid');
    expect(within(grid).getByText('5')).toBeInTheDocument();
  });

  // --- shield property runes (#1196 G3) ---
  it('lists each etched shield property rune (name + flavor), with the chosen type', () => {
    const item = {
      name: 'Kite Shield',
      shield: { hardness: 4, health: 12, breakThreshold: 6, bonus: 2 },
      runes: {
        reinforcing: 'lesser',
        property: [
          { id: 'darkness', name: 'Darkness', description: '+1 item bonus to Stealth while wielding.' },
          { id: 'energy-resistant', name: 'Energy-Resistant', choice: 'fire', description: 'Resist the chosen energy type.' },
        ],
      },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const runes = screen.getByTestId('shield-property-runes');
    expect(within(runes).getByText('Darkness')).toBeInTheDocument();
    expect(within(runes).getByText('+1 item bonus to Stealth while wielding.')).toBeInTheDocument();
    // Choice-bearing rune shows its chosen type.
    expect(within(runes).getByText('Energy-Resistant (fire)')).toBeInTheDocument();
  });

  it('does not render the property-rune list for a shield with no property runes', () => {
    const item = { ...baseItem, name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.queryByTestId('shield-property-runes')).toBeNull();
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

  it('renders the action-cost glyph when action.actionCount is present', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', actionCount: 2, description: 'Strike.' }],
    };
    render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={item} />
    );
    // Rendered by ActionSymbol in the genuine PF2e action font: one glyph span
    // carrying the '2' character, labelled for accessibility.
    const glyph = document.querySelector('.action-count .pf2e-action-glyph');
    expect(glyph).toBeInTheDocument();
    expect(glyph).toHaveTextContent('2');
    expect(glyph).toHaveAttribute('aria-label', '2 actions');
  });

  it('does not render an action-cost glyph when action.actionCount is absent', () => {
    const item = {
      ...baseItem,
      actions: [{ name: 'Slash', description: 'Strike.' }],
    };
    render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={item} />
    );
    expect(document.querySelectorAll('.action-count .pf2e-action-glyph')).toHaveLength(0);
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

  it('renders "-" for bonus when strikes.bonus is absent and no character is given', () => {
    const item = { ...baseItem, strikes: { type: 'Melee', damage: '1d8' } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(screen.getAllByText('-')).toHaveLength(1);
  });

  it('computes the attack bonus and Str-laden damage from the character when no bonus is authored', () => {
    const character = {
      id: 'c1',
      level: 3,
      abilities: { strength: 18, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      proficiencies: { weapons: { simple: { proficiency: 1 }, martial: { proficiency: 1 } } },
    };
    const item = { ...baseItem, strikes: { proficiency: 'simple', type: 'melee', damage: '1d8' } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} character={character} />);
    // Str +4 + simple trained(2) + level 3 = +9; damage gains Str
    expect(screen.getByText('+9')).toBeInTheDocument();
    expect(screen.getByText('1d8+4')).toBeInTheDocument();
  });

  it('uses the spell attack modifier for a spellAttackOrMartial weapon (Flawless Hammer)', () => {
    const character = {
      id: 'jade',
      level: 5,
      abilities: { strength: 14, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 20 },
      proficiencies: { weapons: { simple: { proficiency: 1 }, martial: { proficiency: 1 } } },
      spellcasting: { ability: 'charisma', proficiency: 2 },
    };
    const item = {
      ...baseItem,
      name: "Xanderghul's Flawless Hammer",
      strikes: { proficiency: 'simple', type: 'melee', damage: '1d12', attackStat: 'spellAttackOrMartial' },
    };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} character={character} />);
    // spell attack: Cha +5 + expert(4) + level 5 = +14 (beats martial +9)
    expect(screen.getByText('+14')).toBeInTheDocument();
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
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
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
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
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
    render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} characterColor="#ff0000" />
    );
    const modalContainer = document.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('#ff0000');
    // The loot card hides the shared header, so the theme rides on the
    // container custom property rather than a themed header bar.
    expect(document.querySelector('.modal--loot')).toBeInTheDocument();
  });

  it('uses default color when characterColor is absent', () => {
    render(
      <ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />
    );
    const modalContainer = document.querySelector('.modal-container');
    expect(modalContainer.style.getPropertyValue('--color-theme')).toBe('var(--color-primary)');
  });

  // --- close behaviour ---
  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <ItemModal isOpen={true} onClose={onClose} item={baseItem} />
    );
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when modal body is clicked', () => {
    const onClose = vi.fn();
    render(
      <ItemModal isOpen={true} onClose={onClose} item={baseItem} />
    );
    fireEvent.click(document.querySelector('.modal-container'));
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

  it('renders the hero art image when item.image is set', () => {
    const item = { ...baseItem, image: 'img_sword.jpg' };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const img = document.querySelector('.loot-art img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/images/img_sword.jpg');
    // The monospace code placeholder is suppressed once real art is present.
    expect(document.querySelector('.loot-code')).toBeNull();
  });

  it('falls back to the itemCode placeholder when item.image is absent', () => {
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={baseItem} />);
    expect(document.querySelector('.loot-art img')).toBeNull();
    expect(document.querySelector('.loot-code')).not.toBeNull();
  });

  it('applies object-position style to the hero art when item.imagePosition is set', () => {
    const item = { ...baseItem, image: 'img_sword.jpg', imagePosition: { x: 25, y: 80 } };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const img = document.querySelector('.loot-art img');
    expect(img.style.objectPosition).toBe('25% 80%');
  });

  // --- Thassilonian rune mark ---
  it('an imageless rune-marked item shows the rune as the hero art', () => {
    const item = { ...baseItem, thassilonianRune: 'lust' };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    const rune = document.querySelector('.loot-rune-art svg.thassilonian-rune');
    expect(rune).not.toBeNull();
    expect(rune).toHaveAttribute('data-rune', 'lust');
    expect(rune).toHaveClass('rune-tint');
    expect(document.querySelector('.loot-code')).toBeNull();
    expect(document.querySelector('.loot-rune-badge')).toBeNull();
  });

  it('a rune-marked item with real art keeps the art and adds the rune badge', () => {
    const item = { ...baseItem, image: 'img_hammer.jpg', thassilonianRune: 'pride' };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(document.querySelector('.loot-art img')).not.toBeNull();
    const badge = document.querySelector('.loot-rune-badge');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('data-rune', 'pride');
    expect(badge).toHaveClass('rune-tint');
    expect(badge.querySelector('svg.thassilonian-rune')).not.toBeNull();
  });

  it('an unknown rune name renders neither rune art nor badge', () => {
    const item = { ...baseItem, thassilonianRune: 'avarice' };
    render(<ItemModal isOpen={true} onClose={vi.fn()} item={item} />);
    expect(document.querySelector('.loot-rune-art')).toBeNull();
    expect(document.querySelector('.loot-code')).not.toBeNull();
  });

  // --- runestone (#800) ---
  it('renders a runestone: held rune + inert reminder, no Use button', () => {
    const runestone = {
      name: 'Flaming Runestone',
      quantity: 1,
      weight: 0.1,
      price: 503,
      traits: ['Consumable', 'Magical', 'Fire'],
      runestone: { runeRef: 'flaming', rune: { id: 'flaming', name: 'Flaming', level: 8, description: 'Burns the target.' } },
    };
    render(<ItemModal isOpen onClose={vi.fn()} item={runestone} onUse={vi.fn()} />);
    const section = screen.getByTestId('item-modal-runestone');
    expect(section).toHaveTextContent('Flaming');
    expect(section).toHaveTextContent('Level 8');
    expect(section).toHaveTextContent('Grants no effect while unattached');
    expect(screen.getByText('Common · Runestone', { exact: false })).toBeInTheDocument();
    // A runestone carries no `consumable` block → no Use/Drink action.
    expect(screen.queryByTestId('item-action-use')).not.toBeInTheDocument();
  });

  it('renders an empty runestone (no rune held)', () => {
    const blank = { name: 'Runestone', quantity: 1, weight: 0.1, price: 3, runestone: { runeRef: null, rune: null } };
    render(<ItemModal isOpen onClose={vi.fn()} item={blank} />);
    expect(screen.getByTestId('item-modal-runestone')).toHaveTextContent('empty etching stone');
  });

  // #1055 S1 — a held accessory rune's runestone shows its FULL effect (usage
  // tags + actuated activation), not just the flavor description.
  it("renders a runestone with the rune's full mechanics (#1055 S1)", () => {
    const runestone = {
      name: 'Paired Runestone', quantity: 1, weight: 0.1, price: 153, traits: ['Consumable', 'Magical'],
      runestone: {
        runeRef: 'paired',
        rune: {
          id: 'paired', type: 'property', target: 'accessory', name: 'Paired', level: 5,
          rarity: 'uncommon', usage: ['pocketed'],
          description: 'These runes always come in pairs.',
          actuated: { cost: 'none', name: 'Paired Exchange', actionCount: 1, frequency: 'once per day',
            traits: ['Command'], description: 'Items in the pockets trade places via teleportation.' },
        },
      },
    };
    render(<ItemModal isOpen onClose={vi.fn()} item={runestone} />);
    const section = screen.getByTestId('item-modal-runestone');
    expect(section).toHaveTextContent('Etches onto pocketed items');
    expect(section).toHaveTextContent('Paired Exchange');
    expect(section).toHaveTextContent('Frequency once per day');
    expect(section).toHaveTextContent('Items in the pockets trade places via teleportation.');
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

  it('offers a Breathe button that routes a dragonbreath weapon to onUse (#1210 M4e)', () => {
    const onUse = vi.fn();
    const weapon = { uid: 'db', name: 'Longsword', strikes: [{}], dragonbreath: { tier: 'base', dragonType: 'Red' } };
    render(<ItemModal isOpen onClose={vi.fn()} item={weapon} onUse={onUse} />);
    const btn = screen.getByTestId('item-action-use');
    expect(btn).toHaveTextContent('Breathe');
    fireEvent.click(btn);
    expect(onUse).toHaveBeenCalledWith(weapon);
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

  it('nests an affixed talisman on its HOST card (not just the talisman card)', () => {
    mockAffixed = { t1: 'w1' };
    open(sword); // the host weapon
    const section = screen.getByTestId('hosted-talismans');
    expect(section).toHaveTextContent('Wolf Fang');
    expect(screen.getByTestId('hosted-unaffix-t1')).toBeInTheDocument();
  });

  it('removes a talisman from the host card, unaffixing it', () => {
    mockAffixed = { t1: 'w1' };
    open(sword);
    fireEvent.click(screen.getByTestId('hosted-unaffix-t1'));
    expect(mockAffixed).toEqual({});
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka removed Wolf Fang from Longsword',
    }));
  });

  it('activates an affixed talisman from the host card', () => {
    const wolfFangActive = {
      ...wolfFang,
      talisman: { affixTo: 'weapon', activation: { cost: 'free', trigger: 'You successfully Trip a creature', effect: { kind: 'damage', amount: 'str-mod', damageType: 'bludgeoning', onManeuver: 'trip' } } },
    };
    const char = { id: 'hero', name: 'Ashka', __inventory: [wolfFangActive, sword, plate] };
    mockAffixed = { t1: 'w1' };
    render(<ItemModal isOpen onClose={vi.fn()} item={sword} character={char} />);

    fireEvent.click(screen.getByTestId('hosted-activate-t1'));
    expect(mockConsumed).toEqual({ 'Wolf Fang': 1 });
    expect(mockAffixed).toEqual({}); // consumed → unaffixed
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('activated Wolf Fang'),
    }));
  });

  it('shows no hosted-talismans section on a host with none affixed', () => {
    mockAffixed = {};
    open(sword);
    expect(screen.queryByTestId('hosted-talismans')).not.toBeInTheDocument();
  });
});

describe('ItemModal — shield attachment (#1165 Track 2)', () => {
  const spikes = { uid: 'spk', name: 'Shield Spikes', attachment: { to: 'shield' }, runes: { potency: 1 }, strikes: [{ type: 'melee', damage: '1d6', damageType: 'piercing' }] };
  const steel = { uid: 's1', name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10, bonus: 2 } };
  const sword = { uid: 'w1', name: 'Longsword', strikes: [{ damage: '1d8' }] };
  const character = { id: 'pel', name: 'Pellias', __inventory: [spikes, steel, sword] };
  const open = (item, char = character) => render(<ItemModal isOpen onClose={vi.fn()} item={item} character={char} />);

  beforeEach(() => { mockAttached = {}; });

  it('shows no Attach section for a non-attachment item', () => {
    open(sword);
    expect(screen.queryByTestId('item-attach')).not.toBeInTheDocument();
  });

  it('offers only shields as hosts and attaches on pick (10-min activity, logged)', () => {
    open(spikes);
    expect(screen.getByTestId('item-attach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Steel Shield' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Longsword' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Steel Shield' }));
    expect(mockAttached).toEqual({ spk: 's1' });
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Pellias attached Shield Spikes to Steel Shield (10-minute activity)',
    }));
  });

  it('when attached, shows the host shield and Remove detaches', () => {
    mockAttached = { spk: 's1' };
    open(spikes);
    expect(screen.getByText(/Attached to/)).toHaveTextContent('Steel Shield');
    fireEvent.click(screen.getByTestId('item-action-detach'));
    expect(mockAttached).toEqual({});
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('removed Shield Spikes from its shield'),
    }));
  });

  it('the host shield modal lists its bound attachment with a Remove control', () => {
    mockAttached = { spk: 's1' };
    open(steel);
    const box = screen.getByTestId('shield-attachments');
    expect(box).toHaveTextContent('Shield Spikes');
    fireEvent.click(within(box).getByRole('button', { name: 'Remove' }));
    expect(mockAttached).toEqual({});
  });
});

describe('ItemModal weapon runes (#548 Slice 3c)', () => {
  const runedAxe = {
    name: 'Greataxe',
    weight: 2,
    runes: {
      potency: 2,
      striking: 'greater',
      property: [{ id: 'vitalizing', name: 'Vitalizing', description: '1d6 persistent vitality vs undead.' }],
    },
  };

  it('titles the modal with the full derived runed name', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={runedAxe} />);
    expect(screen.getByText('+2 Greater Striking Vitalizing Greataxe')).toBeInTheDocument();
  });

  it('shows a Runes section with the tier summary and each property rune', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={runedAxe} />);
    const runes = screen.getByTestId('item-modal-runes');
    expect(runes).toHaveTextContent('+2 Greater Striking');
    expect(runes).toHaveTextContent('Vitalizing');
    expect(runes).toHaveTextContent('1d6 persistent vitality vs undead.');
  });

  it('omits the Runes section for a non-runed item', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={{ name: 'Rope', weight: 1 }} />);
    expect(screen.queryByTestId('item-modal-runes')).not.toBeInTheDocument();
  });
});

describe('ItemModal accessory rune (#1033 S1)', () => {
  const menacingCloak = {
    name: 'Cloak',
    weight: 0.1,
    price: 2,
    traits: ['Homemade'],
    accessoryTags: ['clothing'],
    runes: {
      accessory: {
        id: 'menacing', name: 'Menacing', type: 'property', target: 'accessory',
        level: 3, price: 50, usage: ['clothing'],
        description: 'Sinister sigils shift across the garment.',
        riders: [{ id: 'menacing-reminder', text: 'Foes find you unsettling.' }],
      },
    },
  };

  it('titles the modal with the rune-prefixed name and sums the price', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={menacingCloak} />);
    expect(screen.getByText('Menacing Cloak')).toBeInTheDocument();
    expect(screen.getByText('52 gp')).toBeInTheDocument();
  });

  it('grants derived Magical + Invested trait chips on top of authored traits', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={menacingCloak} />);
    const chips = screen.getAllByTestId('trait-tag').map((el) => el.textContent);
    expect(chips).toEqual(expect.arrayContaining(['Homemade', 'Magical', 'Invested']));
  });

  it('shows an Accessory Rune section with name, level, flavor, and riders', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={menacingCloak} />);
    const section = screen.getByTestId('item-modal-accessory-rune');
    expect(section).toHaveTextContent('Menacing');
    expect(section).toHaveTextContent('Level 3');
    expect(section).toHaveTextContent('Sinister sigils shift across the garment.');
    expect(section).toHaveTextContent('Foes find you unsettling.');
  });

  it('renders dual-host names: accessory prefix wraps the armor-derived name', () => {
    const explorers = {
      name: "Explorer's Clothing",
      weight: 0.1,
      armor: { category: 'unarmored', acBonus: 0 },
      accessoryTags: ['clothing'],
      runes: { potency: 1, accessory: menacingCloak.runes.accessory },
    };
    render(<ItemModal isOpen onClose={vi.fn()} item={explorers} />);
    expect(screen.getByText("Menacing +1 Explorer's Clothing")).toBeInTheDocument();
  });

  it('omits the section when the slot holds an unresolved string ref', () => {
    render(
      <ItemModal isOpen onClose={vi.fn()} item={{ name: 'Cloak', weight: 0.1, runes: { accessory: 'menacing' } }} />
    );
    expect(screen.queryByTestId('item-modal-accessory-rune')).not.toBeInTheDocument();
    expect(screen.getByText('Cloak')).toBeInTheDocument();
  });
});

// #656 — give a plain worn/stowed item to another PC, out of combat only.
describe('ItemModal — give to another PC (#656)', () => {
  const giver = { id: 'a', name: 'Ashka' };
  const wornItem = { name: 'Iron Sword', uid: 'u1', state: 'worn', weight: 1, quantity: 1 };

  const renderGive = (item = wornItem, props = {}) =>
    render(<ItemModal isOpen onClose={vi.fn()} item={item} character={giver} {...props} />);

  beforeEach(() => {
    mockCharacters = [
      { id: 'a', name: 'Ashka' },
      { id: 'b', name: 'Pellias' },
      { id: 'c', name: 'Jade' },
    ];
  });

  it('lists every party member except the giver as a recipient', () => {
    renderGive();
    expect(screen.getByTestId('item-give')).toBeInTheDocument();
    expect(screen.getByTestId('give-item-b')).toHaveTextContent('Pellias');
    expect(screen.getByTestId('give-item-c')).toHaveTextContent('Jade');
    expect(screen.queryByTestId('give-item-a')).not.toBeInTheDocument();
  });

  it('gives, logs, and closes on tapping a recipient', () => {
    const onClose = vi.fn();
    renderGive(wornItem, { onClose });
    fireEvent.click(screen.getByTestId('give-item-c'));
    expect(mockGive).toHaveBeenCalledWith('c', wornItem);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action', text: 'Ashka gave Iron Sword to Jade' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('does not log when the hook rejects the transfer', () => {
    mockGive.mockReturnValue(false);
    renderGive();
    fireEvent.click(screen.getByTestId('give-item-b'));
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('gives a stowed item', () => {
    renderGive({ ...wornItem, state: 'stowed' });
    expect(screen.getByTestId('item-give')).toBeInTheDocument();
  });

  it('hides the section in encounter mode', () => {
    mockMode = 'encounter';
    renderGive();
    expect(screen.queryByTestId('item-give')).not.toBeInTheDocument();
  });

  it('hides the section for a held item', () => {
    renderGive({ ...wornItem, state: 'held1' });
    expect(screen.queryByTestId('item-give')).not.toBeInTheDocument();
  });

  it('gives a container (with its contents) via the whole-item path', () => {
    const pack = {
      ...wornItem,
      name: 'Backpack',
      container: { capacity: 4, contents: [{ uid: 'c1', name: 'Rope', weight: 1 }] },
    };
    renderGive(pack);
    expect(screen.getByTestId('item-give')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('give-item-b'));
    expect(mockGive).toHaveBeenCalledWith('b', pack);
    expect(mockGiveConsumable).not.toHaveBeenCalled();
  });

  it('hides the section for an item hosting an affixed talisman', () => {
    mockAffixed = { t9: 'u1' }; // a talisman affixed to this item's uid
    renderGive();
    expect(screen.queryByTestId('item-give')).not.toBeInTheDocument();
  });

  it('hides the section when the giver is the only party member', () => {
    mockCharacters = [{ id: 'a', name: 'Ashka' }];
    renderGive();
    expect(screen.queryByTestId('item-give')).not.toBeInTheDocument();
  });
});

// #657 — consumable stack-splitting.
describe('ItemModal — give a consumable stack (#657)', () => {
  const giver = { id: 'a', name: 'Ashka' };
  const potion = {
    name: 'Healing Potion',
    uid: 'p1',
    state: 'worn',
    weight: 0.1,
    quantity: 3,
    consumable: { kind: 'healing' },
  };

  const renderGive = (item = potion, props = {}) =>
    render(<ItemModal isOpen onClose={vi.fn()} item={item} character={giver} {...props} />);

  beforeEach(() => {
    mockCharacters = [
      { id: 'a', name: 'Ashka' },
      { id: 'b', name: 'Pellias' },
    ];
  });

  it('offers a quantity picker for a stack of more than one', () => {
    renderGive();
    expect(screen.getByLabelText('Quantity to give')).toBeInTheDocument();
    expect(screen.getByText('of 3')).toBeInTheDocument();
  });

  it('gives the chosen count through giveConsumable and logs the amount', () => {
    renderGive();
    fireEvent.change(screen.getByLabelText('Quantity to give'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('give-item-b'));
    expect(mockGiveConsumable).toHaveBeenCalledWith('b', potion, 2);
    expect(mockGive).not.toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Ashka gave 2 Healing Potion to Pellias' }),
    );
  });

  it('clamps the count to the remaining quantity', () => {
    renderGive();
    fireEvent.change(screen.getByLabelText('Quantity to give'), { target: { value: '99' } });
    fireEvent.click(screen.getByTestId('give-item-b'));
    expect(mockGiveConsumable).toHaveBeenCalledWith('b', potion, 3);
  });

  it('defaults to giving one and omits the count from the log', () => {
    renderGive();
    fireEvent.click(screen.getByTestId('give-item-b'));
    expect(mockGiveConsumable).toHaveBeenCalledWith('b', potion, 1);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Ashka gave Healing Potion to Pellias' }),
    );
  });

  it('shows no quantity picker for a single consumable', () => {
    renderGive({ ...potion, quantity: 1 });
    expect(screen.getByTestId('item-give')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity to give')).not.toBeInTheDocument();
  });

  it('does not log when giveConsumable rejects', () => {
    mockGiveConsumable.mockReturnValue(false);
    renderGive();
    fireEvent.click(screen.getByTestId('give-item-b'));
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

// Attunement is slot-driven (drag into the Attuned area) — the modal carries no
// Attune/Remove button, only an Invested status chip.
describe('ItemModal — attunement (#invest)', () => {
  const investable = { uid: 'amu', name: "Mother's Amulet", weight: 0.1, traits: ['Magical', 'Invested'] };

  it('never renders an Attune / Remove attunement button', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={investable} />);
    expect(screen.queryByTestId('item-action-attune')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-action-unattune')).not.toBeInTheDocument();
  });

  it('shows the Invested chip when the item is in an invested slot', () => {
    mockInvested = { amu: true };
    render(<ItemModal isOpen onClose={vi.fn()} item={investable} />);
    expect(screen.getByTestId('item-invested-chip')).toBeInTheDocument();
    // …and still no button.
    expect(screen.queryByTestId('item-action-unattune')).not.toBeInTheDocument();
  });

  it('shows no Invested chip when the item is not invested', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={investable} />);
    expect(screen.queryByTestId('item-invested-chip')).not.toBeInTheDocument();
  });

  // ── Actuated activation (#957 S4) ──
  const scepter = {
    uid: 'sc1',
    name: 'Scepter of Energy Ablation',
    weight: 1,
    actuated: { name: 'Energy Abjection', minRank: 2, description: 'A ward against energy.' },
  };

  it('renders no actuated surface for a plain item', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={baseItem} />);
    expect(screen.queryByTestId('item-actuated')).not.toBeInTheDocument();
  });

  it('renders the actuated ability and an Activate button when available', () => {
    mockItemAct = makeItemAct({ activation: { ...makeItemAct().activation, canActivate: true } });
    render(<ItemModal isOpen onClose={vi.fn()} item={scepter} />);
    expect(screen.getByTestId('item-actuated')).toBeInTheDocument();
    expect(screen.getByText('Energy Abjection')).toBeInTheDocument();
    expect(screen.getByTestId('actuated-activate-rank-2')).toBeInTheDocument();
  });

  it('activating spends the slot, logs, and closes', () => {
    const onClose = vi.fn();
    mockItemAct = makeItemAct({ activation: { ...makeItemAct().activation, canActivate: true } });
    render(<ItemModal isOpen onClose={onClose} item={scepter} character={{ id: 'wiz', name: 'Wizzo' }} />);
    fireEvent.click(screen.getByTestId('actuated-activate-rank-2'));
    expect(mockItemAct.activation.activate).toHaveBeenCalledWith(2);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Energy Abjection'),
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers Overload once the daily use is spent', () => {
    const onClose = vi.fn();
    mockItemAct = makeItemAct({ gate: { available: false }, overload: { ...makeItemAct().overload, canOverload: true } });
    render(<ItemModal isOpen onClose={onClose} item={scepter} character={{ id: 'wiz', name: 'Wizzo' }} />);
    fireEvent.click(screen.getByTestId('actuated-overload-rank-2'));
    expect(mockItemAct.overload.overload).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a Broken tag with the repair lock hint before daily prep', () => {
    mockItemAct = makeItemAct({ broken: true, repairable: false });
    render(<ItemModal isOpen onClose={vi.fn()} item={scepter} />);
    expect(screen.getByTestId('item-actuated-broken')).toBeInTheDocument();
    expect(screen.getByTestId('actuated-repair-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('actuated-repair-action')).not.toBeInTheDocument();
  });

  it('offers Repair action + slot once unlocked, and repairs on click', () => {
    const onClose = vi.fn();
    mockItemAct = makeItemAct({ broken: true, repairable: true });
    render(<ItemModal isOpen onClose={onClose} item={scepter} character={{ id: 'wiz', name: 'Wizzo' }} />);
    expect(screen.getByTestId('actuated-repair-slot')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('actuated-repair-action'));
    expect(mockItemAct.repair.withAction).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // ── Cost-free activation card (#1033 S2) — accessory-rune actuated ──
  const callActuated = { name: 'Call Item', frequency: 'once per hour', actionCount: 1, cost: 'none' };
  const whistle = { uid: 'k1', name: 'Whistle', weight: 0 };
  const freeAct = (over = {}) =>
    makeItemAct({ actuated: callActuated, cost: 'none', slotOptions: [], ...over });

  it('renders the free activation card: Activation heading, frequency line, no slot wording', () => {
    mockItemAct = freeAct({ activation: { ...makeItemAct().activation, canActivate: true } });
    render(<ItemModal isOpen onClose={vi.fn()} item={whistle} />);
    const card = screen.getByTestId('item-actuated');
    expect(card).toHaveTextContent('Activation');
    expect(card).toHaveTextContent('Call Item');
    expect(card).toHaveTextContent('Frequency: once per hour');
    expect(card).not.toHaveTextContent('sacrifice a spell slot');
  });

  it('activating a free card records, logs without a slot label, and closes', () => {
    const onClose = vi.fn();
    mockItemAct = freeAct({ activation: { ...makeItemAct().activation, canActivate: true, activate: vi.fn(() => ({ ok: true })) } });
    render(<ItemModal isOpen onClose={onClose} item={whistle} character={{ id: 'wiz', name: 'Wizzo' }} />);
    fireEvent.click(screen.getByTestId('actuated-activate-free'));
    expect(mockItemAct.activation.activate).toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Wizzo activated Whistle — Call Item',
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a spent free activation shows the frequency lock hint — never the Overload rail', () => {
    mockItemAct = freeAct({ gate: { available: false } });
    render(<ItemModal isOpen onClose={vi.fn()} item={whistle} />);
    expect(screen.getByTestId('actuated-unavailable')).toHaveTextContent('once per hour');
    expect(screen.queryByText(/Overload/)).not.toBeInTheDocument();
  });

  // ── Actuated self-effect (#1055 S5) — Trackless (Greater) emanation ──
  const tracklessActuated = {
    name: 'Trackless Emanation', frequency: 'once per day', actionCount: 2, cost: 'none',
    effect: { effectId: 'trackless-emanation', duration: { minutes: 480 } },
  };
  const tracklessBoots = { uid: 'boots1', name: 'Trackless Boots', weight: 0 };

  it('applies the actuated self-effect on activation (dismissible emanation)', () => {
    mockItemAct = freeAct({ actuated: tracklessActuated, activation: { ...makeItemAct().activation, canActivate: true, activate: vi.fn(() => ({ ok: true })) } });
    render(<ItemModal isOpen onClose={vi.fn()} item={tracklessBoots} character={{ id: 'rog', name: 'Rogue' }} />);
    fireEvent.click(screen.getByTestId('actuated-activate-free'));
    expect(mockSetEffects).toHaveBeenCalled();
    expect(mockEffects).toHaveLength(1);
    expect(mockEffects[0]).toMatchObject({ effectId: 'trackless-emanation', appliedBy: 'rog', source: 'Trackless Emanation' });
  });

  it('does not write an effect when the actuated block declares none', () => {
    mockItemAct = freeAct({ activation: { ...makeItemAct().activation, canActivate: true, activate: vi.fn(() => ({ ok: true })) } });
    render(<ItemModal isOpen onClose={vi.fn()} item={whistle} character={{ id: 'wiz', name: 'Wizzo' }} />);
    fireEvent.click(screen.getByTestId('actuated-activate-free'));
    expect(mockSetEffects).not.toHaveBeenCalled();
  });

  // ── Rune-granted spell cast (#1055 S3) — Menacing (Greater) casts fear ──
  const fearDoc = { id: 'fear', name: 'Fear', level: 1, defense: 'Will', degrees: { Failure: 'Frightened 2.' } };
  const menacingActuated = {
    cost: 'none', name: 'Fear', actionCount: 2, frequency: 'once per day',
    traits: ['Concentrate', 'Manipulate'],
    description: 'The rune casts a 3rd-rank fear spell (DC 25).',
    spellRef: 'fear', castRank: 3, dc: 25,
  };
  const menacingCloak = { uid: 'cloak1', name: "Explorer's Clothing", weight: 1 };
  const spellAct = (over = {}) =>
    makeItemAct({ actuated: menacingActuated, cost: 'none', slotOptions: [],
      activation: { ...makeItemAct().activation, canActivate: true }, ...over });

  it('labels the activate button "Cast <spell>" for a spellRef actuation', () => {
    mockSpells = [fearDoc];
    mockItemAct = spellAct();
    render(<ItemModal isOpen onClose={vi.fn()} item={menacingCloak} character={{ id: 'p', name: 'P' }} />);
    expect(screen.getByTestId('actuated-cast-spell')).toHaveTextContent('Cast Fear');
    expect(screen.queryByTestId('actuated-activate-free')).not.toBeInTheDocument();
  });

  it('opens the cast flow with a fixed-rank, fixed-DC, no-slot innate spell — without a direct itemAct spend', () => {
    mockSpells = [fearDoc];
    const activate = vi.fn(() => ({ ok: true }));
    mockItemAct = spellAct({ activation: { ...makeItemAct().activation, canActivate: true, activate } });
    render(<ItemModal isOpen onClose={vi.fn()} item={menacingCloak} character={{ id: 'p', name: 'P' }} />);
    expect(screen.queryByTestId('cast-spell-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('actuated-cast-spell'));
    const modal = screen.getByTestId('cast-spell-modal');
    expect(modal).toHaveAttribute('data-source', 'innate');
    // fixed rank 3, fixed DC 25, shared frequency key — the cast flow records
    // the once/day use itself, so the card must not double-spend via itemAct.
    expect(modal).toHaveTextContent('rank 3');
    expect(modal).toHaveTextContent('dc 25');
    expect(modal).toHaveTextContent('id cloak1:actuated');
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back to the plain Activate flow when the spellRef can not be resolved', () => {
    mockSpells = []; // fear not in catalog
    mockItemAct = spellAct();
    render(<ItemModal isOpen onClose={vi.fn()} item={menacingCloak} character={{ id: 'p', name: 'P' }} />);
    // no resolved spell → generic free-activation button, not a cast button
    expect(screen.queryByTestId('actuated-cast-spell')).not.toBeInTheDocument();
    expect(screen.getByTestId('actuated-activate-free')).toBeInTheDocument();
  });
});

// ── Dragon's Breath etch-time dragon picker (#1055 S4) ──
describe('ItemModal — accessory-rune dragon-type picker', () => {
  const dragonChoice = {
    key: 'dragonType', label: 'Depicted dragon',
    options: [
      { value: 'fire', label: 'Fire' },
      { value: 'cold', label: 'Cold' },
      { value: 'acid', label: 'Acid' },
    ],
  };
  const dbRune = { id: 'dragons-breath-3', name: "Dragon's Breath (3rd-Rank Spell)", level: 8, dragonChoice };
  const cape = (over = {}) => ({ uid: 'cape1', name: 'Dueling Cape', traits: [], runes: { accessory: dbRune }, ...over });
  const char = { id: 'p', name: 'P' };

  it('renders the dragon picker for a rune carrying a dragonChoice, defaulting to the first option', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={cape()} character={char} />);
    const select = screen.getByLabelText('Depicted dragon');
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('fire');
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Fire', 'Cold', 'Acid']);
  });

  it('reflects a previously chosen dragon type from the overlay', () => {
    mockRuneConfig = { cape1: { dragonType: 'cold' } };
    render(<ItemModal isOpen onClose={vi.fn()} item={cape()} character={char} />);
    expect(screen.getByLabelText('Depicted dragon').value).toBe('cold');
  });

  it('defaults to the dragon type baked in at etch (#1059) when no overlay override exists', () => {
    const baked = cape({ runes: { accessory: dbRune, accessoryConfig: { dragonType: 'acid' } } });
    render(<ItemModal isOpen onClose={vi.fn()} item={baked} character={char} />);
    expect(screen.getByLabelText('Depicted dragon').value).toBe('acid');
  });

  it('the overlay override wins over the baked-in etch config (#1059)', () => {
    mockRuneConfig = { cape1: { dragonType: 'fire' } };
    const baked = cape({ runes: { accessory: dbRune, accessoryConfig: { dragonType: 'acid' } } });
    render(<ItemModal isOpen onClose={vi.fn()} item={baked} character={char} />);
    expect(screen.getByLabelText('Depicted dragon').value).toBe('fire');
  });

  it('writes the chosen dragon type to the overlay keyed by item uid', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={cape()} character={char} />);
    fireEvent.change(screen.getByLabelText('Depicted dragon'), { target: { value: 'acid' } });
    expect(mockSetRuneConfig).toHaveBeenCalled();
    expect(mockRuneConfig).toEqual({ cape1: { dragonType: 'acid' } });
  });

  it('shows no picker for an accessory rune without a dragonChoice', () => {
    const plainRune = { id: 'menacing-greater', name: 'Menacing (Greater)' };
    render(<ItemModal isOpen onClose={vi.fn()} item={cape({ runes: { accessory: plainRune } })} character={char} />);
    expect(screen.queryByTestId('accessory-rune-choice')).not.toBeInTheDocument();
  });
});

describe('ItemModal — item-mode toggle (#1093)', () => {
  const char = { id: 'hero', name: 'Hero' };
  const gloomBlade = (over = {}) => ({
    uid: 'gloom-1',
    name: 'Gloom Blade',
    quantity: 1,
    weight: 0.1,
    activeModeId: 'dim',
    modes: {
      label: 'Light',
      default: 'dim',
      options: [
        { id: 'bright', label: 'Bright light', overrides: { runes: { potency: 1 } } },
        { id: 'dim', label: 'Dim / darkness', overrides: { runes: { potency: 2, striking: 'striking' } } },
      ],
    },
    ...over,
  });

  it('renders the segmented toggle with the active mode pressed', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={gloomBlade()} character={char} />);
    expect(screen.getByTestId('item-modes')).toBeInTheDocument();
    expect(screen.getByTestId('item-mode-dim')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('item-mode-bright')).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes the overlay and session-logs on switch', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={gloomBlade()} character={char} />);
    fireEvent.click(screen.getByTestId('item-mode-bright'));
    expect(mockItemModes).toEqual({ 'gloom-1': 'bright' });
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('switched Gloom Blade (Light) to Bright light') })
    );
  });

  it('re-clicking the active mode is a no-op', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={gloomBlade()} character={char} />);
    fireEvent.click(screen.getByTestId('item-mode-dim'));
    expect(mockSetItemModes).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('falls back to overlay/default resolution when activeModeId is unstamped', () => {
    mockItemModes = { 'gloom-1': 'bright' };
    render(<ItemModal isOpen onClose={vi.fn()} item={gloomBlade({ activeModeId: undefined })} character={char} />);
    expect(screen.getByTestId('item-mode-bright')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no toggle for mode-less items', () => {
    render(<ItemModal isOpen onClose={vi.fn()} item={{ name: 'Rope', quantity: 1, weight: 0.1 }} character={char} />);
    expect(screen.queryByTestId('item-modes')).not.toBeInTheDocument();
  });
});

describe('ItemModal — spellgun host (Arcane Duelist\'s Gloves, #1208)', () => {
  const glove = () => ({ uid: 'g1', name: "Arcane Duelist's Gloves", spellgunHost: { capacity: 1 }, usage: 'worn gloves', quantity: 1 });
  const gun = (uid = 'gun1', name = 'Howl of Winter (Greater)') =>
    ({ uid, name, quantity: 1, traits: ['Attack', 'Consumable', 'Spellgun'], spellgun: { against: 'ac', damageType: 'cold', rangeIncrement: 30, actionCount: 2 }, dice: '12d6' });
  const petra = (inv) => ({ id: 'petra', name: 'Petra', __inventory: inv });

  it('renders absorbed spellguns nested on the glove card, with capacity', () => {
    mockAbsorbed = { gun1: 'g1' };
    const g = glove();
    const onUse = vi.fn();
    render(<ItemModal isOpen onClose={vi.fn()} item={g} character={petra([g, gun()])} onUse={onUse} />);
    const section = screen.getByTestId('absorbed-spellguns');
    expect(within(section).getByText('1 / 1')).toBeInTheDocument();
    expect(within(section).getByText(/Howl of Winter \(Greater\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('absorbed-fire-gun1'));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ uid: 'gun1' }));
  });

  it('offers an absorb picker on a spellgun and binds it to the chosen glove', () => {
    mockAbsorbed = {};
    const g = glove();
    const s = gun();
    render(<ItemModal isOpen onClose={vi.fn()} item={s} character={petra([g, s])} />);
    expect(screen.getByTestId('item-absorb')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('absorb-host-g1'));
    expect(mockAbsorbed).toEqual({ gun1: 'g1' });
  });

  it('shows Retrieve when the spellgun is already absorbed, and clears the binding', () => {
    mockAbsorbed = { gun1: 'g1' };
    const g = glove();
    const s = gun();
    render(<ItemModal isOpen onClose={vi.fn()} item={s} character={petra([g, s])} />);
    expect(screen.getByText(/Absorbed into/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('item-action-retrieve-absorbed'));
    expect(mockAbsorbed).toEqual({});
  });

  it('hides the absorb picker when every glove is at capacity', () => {
    mockAbsorbed = { gun1: 'g1' }; // capacity-1 glove already full
    const g = glove();
    const s2 = gun('gun2', 'Verdant Bola');
    render(<ItemModal isOpen onClose={vi.fn()} item={s2} character={petra([g, gun(), s2])} />);
    expect(screen.queryByTestId('item-absorb')).not.toBeInTheDocument();
  });
});

describe('ItemModal — whetstone application (#1213)', () => {
  const stone = (over = {}) => ({
    uid: 'ws1', name: 'Morph Jewel', quantity: 1,
    traits: ['Consumable', 'Magical', 'Whetstone'],
    whetstone: { reminder: 'Change the damage type.', ...over.whetstone },
    ...over,
  });
  const sword = { uid: 'w1', name: 'Longsword', strikes: [{ damage: '1d8', type: 'melee' }] };
  const bow = { uid: 'w2', name: 'Shortbow', strikes: [{ damage: '1d6', type: 'ranged', range: 60 }] };
  const plate = { uid: 'a1', name: 'Full Plate', armor: { ac: 6 } };
  const hero = (inv) => ({ id: 'hero', name: 'Ashka', __inventory: inv });
  const open = (item, inv = [item, sword, bow, plate]) =>
    render(<ItemModal isOpen onClose={vi.fn()} item={item} character={hero(inv)} />);

  it('shows no apply section for a non-whetstone item', () => {
    open({ uid: 'p1', name: 'Potion', quantity: 1, consumable: { kind: 'healing' } });
    expect(screen.queryByTestId('item-whetstone')).not.toBeInTheDocument();
  });

  it('offers weapons only (not armor) and applies: consume + effect entry, one write each', () => {
    const s = stone();
    open(s);
    const section = screen.getByTestId('item-whetstone');
    expect(within(section).getByRole('button', { name: 'Longsword' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Full Plate' })).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: 'Longsword' }));
    expect(mockConsumed).toEqual({ 'Morph Jewel': 1 });
    expect(mockEffects).toHaveLength(1);
    const entry = mockEffects[0];
    expect(entry.whetstone).toMatchObject({
      itemName: 'Morph Jewel', weaponUid: 'w1', weaponName: 'Longsword', duration: 'minute',
      reminder: 'Change the damage type.',
    });
    expect(entry.name).toBe('Morph Jewel (Longsword)');
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Ashka applied Morph Jewel to Longsword (Interact, 1 minute)'),
    }));
  });

  it('replaces an existing whetstone effect on the same weapon in the same write', () => {
    mockEffects = [{
      id: 'old', name: 'Hand of Mercy (Longsword)',
      whetstone: { itemName: 'Hand of Mercy', weaponUid: 'w1', weaponName: 'Longsword', duration: 'minute' },
    }];
    const s = stone();
    open(s);
    const section = screen.getByTestId('item-whetstone');
    const btn = within(section).getByRole('button', { name: /Longsword \(replaces Hand of Mercy\)/ });
    fireEvent.click(btn);
    expect(mockEffects).toHaveLength(1);
    expect(mockEffects[0].whetstone.itemName).toBe('Morph Jewel');
  });

  it('filters to ranged weapons when targets is ranged', () => {
    const s = stone({ whetstone: { targets: 'ranged' } });
    open(s);
    const section = screen.getByTestId('item-whetstone');
    expect(within(section).getByRole('button', { name: 'Shortbow' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Longsword' })).not.toBeInTheDocument();
  });

  it('gates apply on the apply-time choice when the item declares one', () => {
    const s = stone({ whetstone: { choice: { label: 'Damage type', options: ['bludgeoning', 'piercing'] } } });
    open(s);
    const section = screen.getByTestId('item-whetstone');
    const swordBtn = within(section).getByRole('button', { name: 'Longsword' });
    expect(swordBtn).toBeDisabled();
    fireEvent.click(screen.getByTestId('whetstone-choice-piercing'));
    expect(within(section).getByRole('button', { name: 'Longsword' })).toBeEnabled();
    fireEvent.click(within(section).getByRole('button', { name: 'Longsword' }));
    expect(mockEffects[0].whetstone.choice).toBe('piercing');
  });

  it('uses round-ticked expiry in an active encounter (1 min = 10 rounds) and clock expiry otherwise', () => {
    mockEncounter = {
      active: true, round: 3,
      order: [{ entryId: 'e1', kind: 'pc', charId: 'hero' }],
    };
    open(stone());
    fireEvent.click(within(screen.getByTestId('item-whetstone')).getByRole('button', { name: 'Longsword' }));
    expect(mockEffects[0].expireAt).toEqual({ round: 13, entryId: 'e1', boundary: 'turn-end' });
    expect(mockEffects[0].expireAtSecs).toBeUndefined();
  });

  it('adds the regrip reminder to the log for a two-handed weapon', () => {
    const greatsword = { uid: 'w3', name: 'Greatsword', state: 'held2', strikes: [{ damage: '1d12', type: 'melee' }] };
    const s = stone();
    open(s, [s, greatsword]);
    fireEvent.click(within(screen.getByTestId('item-whetstone')).getByRole('button', { name: 'Greatsword' }));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('regrip'),
    }));
  });

  it('nests the active whetstone on the WEAPON card with reminder + Remove', () => {
    mockEffects = [{
      id: 'fx1', name: 'Morph Jewel (Longsword)',
      whetstone: { itemName: 'Morph Jewel', weaponUid: 'w1', weaponName: 'Longsword', duration: 'minute', reminder: 'Change the damage type.' },
    }];
    open(sword, [stone(), sword]);
    const section = screen.getByTestId('hosted-whetstone');
    expect(section).toHaveTextContent('Morph Jewel');
    expect(section).toHaveTextContent('Change the damage type.');
    fireEvent.click(screen.getByTestId('hosted-whetstone-remove'));
    expect(mockEffects).toEqual([]);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka removed Morph Jewel from Longsword',
    }));
  });

  it('hides the apply section when the stack is used up', () => {
    open(stone({ quantity: 0 }));
    expect(screen.queryByTestId('item-whetstone')).not.toBeInTheDocument();
  });
});
