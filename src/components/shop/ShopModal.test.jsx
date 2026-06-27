import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShopModal from './ShopModal';

// Render the modal body inline so we don't fight the real Modal's portal/focus.
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, title, children }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

// The wares detail view reuses the inventory ItemModal — stub it.
vi.mock('../inventory/ItemModal', () => ({
  default: ({ isOpen, item }) =>
    isOpen ? <div data-testid="item-modal">{item?.name}</div> : null,
}));

// Buyer gold + purchase commit come from useBuyItems; gold defaults plenty,
// overridable per test. `buy` is a spy that returns a receipt unless overridden.
let myGold = 100;
let mockBuy = vi.fn(() => ({ total: 8, count: 1 }));
vi.mock('../../hooks/useBuyItems', () => ({
  useBuyItems: () => ({ myGold, buy: mockBuy }),
}));

// Rune work orders (#802): etch is a spy returning a fresh order. useCharacter
// supplies the buyer's weapons for the etch picker (from character.__inventory).
let mockEtch = vi.fn(() => ({ id: 'order-1' }));
vi.mock('../../hooks/useRuneWork', () => ({
  useRuneWork: () => ({ orders: [], etch: mockEtch, collect: vi.fn(), nowSeconds: 0, locationId: '' }),
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { ...c, inventory: c.__inventory || [] } : null),
}));

const shops = [
  { id: 'bottled-solutions', title: 'Bottled Solutions', summary: 'A cluttered alchemist.' },
  { id: 'curious-goblin', title: 'The Curious Goblin', summary: 'A bookshop.' },
];

const items = [
  { id: 'antidote', name: 'Antidote', price: 3, weight: 0 },
  { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1 },
];

const waresStore = {
  'bottled-solutions': { wares: [{ ref: 'antidote', price: 8 }, { ref: 'spellbook', stock: 2 }] },
  'curious-goblin': { wares: [] },
};

const renderModal = (props = {}) =>
  render(
    <ShopModal
      isOpen
      onClose={() => {}}
      shops={shops}
      waresStore={waresStore}
      items={items}
      character={{ id: 'char-1', name: 'Pellias' }}
      {...props}
    />
  );

// Draggable ware tiles open the detail modal on tap or keyboard activation
// (Enter/Space). The pointer-drag gesture itself is pointer-only and covered by
// e2e; here we exercise the same onTap via the keyboard path.
const activateTile = (el) => fireEvent.keyDown(el, { key: 'Enter' });

const openBottledSolutions = () => fireEvent.click(screen.getByText('Bottled Solutions'));

beforeEach(() => {
  myGold = 100;
  mockBuy = vi.fn(() => ({ total: 8, count: 1 }));
  mockEtch = vi.fn(() => ({ id: 'order-1' }));
});

describe('ShopModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists a card per shop with title and summary', () => {
    renderModal();
    expect(screen.getByText('Bottled Solutions')).toBeInTheDocument();
    expect(screen.getByText('A cluttered alchemist.')).toBeInTheDocument();
    expect(screen.getByText('The Curious Goblin')).toBeInTheDocument();
  });

  it('shows an empty state when there are no shops', () => {
    renderModal({ shops: [] });
    expect(screen.getByText('There are no shops here.')).toBeInTheDocument();
  });

  it('lists the shop wares with resolved price (override + catalog) and stock', () => {
    renderModal();
    openBottledSolutions();
    expect(screen.getByTestId('shop-window-bottled-solutions')).toBeInTheDocument();
    expect(screen.getByTestId('ware-antidote')).toHaveTextContent('Antidote');
    expect(screen.getByTestId('ware-antidote')).toHaveTextContent('8 gp');   // override
    expect(screen.getByTestId('ware-spellbook')).toHaveTextContent('10 gp'); // catalog
    expect(screen.getByTestId('ware-spellbook')).toHaveTextContent('2 in stock');
  });

  it('stocks two variants of one item as distinct tiles and buys them separately (#798)', () => {
    const tonic = {
      id: 'tonic',
      name: 'Tonic',
      weight: 0,
      variants: [
        { level: 1, label: 'Minor', name: 'Minor Tonic', price: 4 },
        { level: 3, label: 'Lesser', name: 'Lesser Tonic', price: 12 },
      ],
    };
    render(
      <ShopModal
        isOpen
        onClose={() => {}}
        shops={[{ id: 'apothecary', title: 'Apothecary' }]}
        waresStore={{ apothecary: { wares: [{ ref: 'tonic', level: 1 }, { ref: 'tonic', level: 3 }] } }}
        items={[tonic]}
        character={{ id: 'char-1', name: 'Pellias' }}
      />
    );
    fireEvent.click(screen.getByText('Apothecary'));

    // Two distinct tiles keyed by ref@level, not a single colliding 'ware-tonic'.
    expect(screen.getByTestId('ware-tonic@1')).toHaveTextContent('Minor Tonic');
    expect(screen.getByTestId('ware-tonic@3')).toHaveTextContent('Lesser Tonic');

    fireEvent.click(screen.getByLabelText('add tonic@1'));
    fireEvent.click(screen.getByLabelText('add tonic@3'));
    expect(screen.getByTestId('cart-total')).toHaveTextContent('16 gp');

    fireEvent.click(screen.getByRole('button', { name: /confirm purchase/i }));
    const [purchases] = mockBuy.mock.calls[0];
    expect(purchases.map((p) => p.item.name)).toEqual(['Minor Tonic', 'Lesser Tonic']);
    expect(purchases.map((p) => p.qty)).toEqual([1, 1]);
  });

  it('stocks and buys a rune as a Runestone (#801)', () => {
    myGold = 1000; // afford the 503 gp runestone
    const runes = [{ id: 'flaming', name: 'Flaming', level: 8, price: 500 }];
    render(
      <ShopModal
        isOpen
        onClose={() => {}}
        shops={[{ id: 'etcher', title: 'The Etcher' }]}
        waresStore={{ etcher: { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } }}
        items={[]}
        runes={runes}
        character={{ id: 'char-1', name: 'Pellias' }}
      />
    );
    fireEvent.click(screen.getByText('The Etcher'));
    expect(screen.getByTestId('ware-runestone@flaming')).toHaveTextContent('Flaming Runestone');
    expect(screen.getByTestId('ware-runestone@flaming')).toHaveTextContent('503 gp'); // 3 + 500

    fireEvent.click(screen.getByLabelText('add runestone@flaming'));
    fireEvent.click(screen.getByRole('button', { name: /confirm purchase/i }));
    const [purchases] = mockBuy.mock.calls[0];
    expect(purchases[0].item).toMatchObject({ name: 'Flaming Runestone', runestone: { runeRef: 'flaming' } });
  });

  it('etches a rune onto a chosen weapon, creating a work order (#802)', () => {
    const runes = [{ id: 'flaming', name: 'Flaming', price: 500 }];
    render(
      <ShopModal
        isOpen
        onClose={() => {}}
        shops={[{ id: 'etcher', title: 'The Etcher' }]}
        waresStore={{ etcher: { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } }}
        items={[]}
        runes={runes}
        character={{
          id: 'char-1',
          name: 'Pellias',
          __inventory: [
            // A +1 weapon with a free property slot can be etched.
            { uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' }, runes: { potency: 1 } },
            { uid: 'p1', name: 'Potion' },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByText('The Etcher'));
    fireEvent.click(screen.getByLabelText('etch runestone@flaming'));
    // Weapon picker lists the weapon (with slot count), not the potion.
    expect(screen.getByTestId('etch-weapon-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('etch-weapon-p1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('etch-weapon-w1'));
    expect(mockEtch).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'w1' }),
      expect.objectContaining({ id: 'flaming' }),
      'The Etcher'
    );
    expect(screen.getByTestId('shop-receipt')).toHaveTextContent('Left Longsword to be etched with Flaming');
  });

  it('steers to a Runestone when no weapon has a free property slot (#804)', () => {
    const runes = [{ id: 'flaming', name: 'Flaming', price: 500 }];
    render(
      <ShopModal
        isOpen
        onClose={() => {}}
        shops={[{ id: 'etcher', title: 'The Etcher' }]}
        waresStore={{ etcher: { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } }}
        items={[]}
        runes={runes}
        character={{
          id: 'char-1',
          name: 'Pellias',
          __inventory: [
            // Potency-0 (no slots) and a full +1 weapon — neither is etchable.
            { uid: 'w1', name: 'Club', strikes: { damage: '1d6' } },
            { uid: 'w2', name: 'Pick', strikes: { damage: '1d6' }, runes: { potency: 1, property: ['frost'] } },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByText('The Etcher'));
    fireEvent.click(screen.getByLabelText('etch runestone@flaming'));
    expect(screen.getByTestId('shop-etch-no-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('etch-weapon-w1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('etch-weapon-w2')).not.toBeInTheDocument();
  });

  it('read-only: browses wares but hides Add/Etch and the cart (#shops-from-lore)', () => {
    const runes = [{ id: 'flaming', name: 'Flaming', price: 500 }];
    render(
      <ShopModal
        isOpen
        onClose={() => {}}
        readOnly
        shops={[{ id: 'etcher', title: 'The Etcher' }]}
        waresStore={{ etcher: { wares: [{ ref: 'antidote', price: 8 }, { ref: 'runestone', runeRef: 'flaming' }] } }}
        items={[{ id: 'antidote', name: 'Antidote', price: 3 }]}
        runes={runes}
        character={null}
      />
    );
    fireEvent.click(screen.getByText('The Etcher'));
    // Wares still browse-able...
    expect(screen.getByTestId('ware-antidote')).toBeInTheDocument();
    expect(screen.getByTestId('shop-readonly')).toBeInTheDocument();
    // ...but no buy affordances or cart.
    expect(screen.queryByLabelText('add antidote')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('etch runestone@flaming')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shop-cart')).not.toBeInTheDocument();
  });

  it('shows an empty-wares state for a shop with nothing for sale', () => {
    renderModal();
    fireEvent.click(screen.getByText('The Curious Goblin'));
    expect(screen.getByText('This shop has nothing for sale right now.')).toBeInTheDocument();
  });

  it('opens the item detail (ItemModal) when a ware is activated', () => {
    renderModal();
    openBottledSolutions();
    activateTile(screen.getByTestId('ware-antidote'));
    const detail = screen.getByTestId('item-modal');
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent('Antidote');
  });

  describe('cart', () => {
    it('starts empty with a disabled Confirm', () => {
      renderModal();
      openBottledSolutions();
      expect(screen.getByText(/Drag items here/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
    });

    it('adds a ware to the cart via the Add button and totals it', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByLabelText('quantity antidote')).toHaveTextContent('1');
      expect(screen.getByTestId('cart-total')).toHaveTextContent('8 gp');
    });

    it('increments the same ware instead of duplicating the line', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByLabelText('quantity antidote')).toHaveTextContent('2');
      expect(screen.getByTestId('cart-total')).toHaveTextContent('16 gp');
    });

    it('enables Confirm when affordable', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByRole('button', { name: 'Confirm purchase' })).not.toBeDisabled();
    });

    it('blocks Confirm and warns when the cart exceeds the buyer gold', () => {
      myGold = 5;
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote')); // 8 gp > 5
      expect(screen.getByText('Not enough gold.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
    });

    it('clears the cart when switching shops', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.getByLabelText('quantity antidote')).toBeInTheDocument();
      fireEvent.click(screen.getByText('← All shops'));
      openBottledSolutions();
      expect(screen.queryByLabelText('quantity antidote')).not.toBeInTheDocument();
      expect(screen.getByText(/Drag items here/)).toBeInTheDocument();
    });
  });

  describe('confirm purchase', () => {
    it('commits the full resolved wares (× qty) with the shop name', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(mockBuy).toHaveBeenCalledWith(
        [{ item: expect.objectContaining({ id: 'antidote', price: 8 }), qty: 2 }],
        'Bottled Solutions',
      );
    });

    it('clears the cart and shows a receipt on success', () => {
      mockBuy = vi.fn(() => ({ total: 16, count: 2 }));
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(screen.queryByLabelText('quantity antidote')).not.toBeInTheDocument();
      expect(screen.getByTestId('shop-receipt')).toHaveTextContent('Purchased 2 items for 16 gp.');
    });

    it('keeps the cart and shows no receipt when the buy is rejected', () => {
      mockBuy = vi.fn(() => null);
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(screen.getByLabelText('quantity antidote')).toBeInTheDocument();
      expect(screen.queryByTestId('shop-receipt')).not.toBeInTheDocument();
    });

    it('dismisses a prior receipt when a new ware is added', () => {
      renderModal();
      openBottledSolutions();
      fireEvent.click(screen.getByLabelText('add antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
      expect(screen.getByTestId('shop-receipt')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('add antidote'));
      expect(screen.queryByTestId('shop-receipt')).not.toBeInTheDocument();
    });
  });

  describe('closed shop (#822 S2)', () => {
    const closedShops = [{ id: 'bottled-solutions', title: 'Bottled Solutions', summary: 'A cluttered alchemist.' }];
    const closedStore = {
      'bottled-solutions': { open: false, wares: [{ ref: 'antidote', price: 8 }] },
    };
    const renderClosed = () =>
      render(
        <ShopModal
          isOpen
          onClose={() => {}}
          shops={closedShops}
          waresStore={closedStore}
          items={items}
          character={{ id: 'char-1', name: 'Pellias' }}
        />
      );

    it('tags a closed shop in the carousel', () => {
      renderClosed();
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });

    it('shows a not-trading notice instead of wares and blocks buying', () => {
      renderClosed();
      openBottledSolutions();
      expect(screen.getByTestId('shop-closed')).toHaveTextContent("isn’t trading right now");
      expect(screen.queryByTestId('ware-antidote')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('add antidote')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm purchase' })).not.toBeInTheDocument();
    });

    it('leaves an open (legacy, no open field) shop trading normally', () => {
      renderModal(); // waresStore entries have no `open` field
      openBottledSolutions();
      expect(screen.queryByTestId('shop-closed')).not.toBeInTheDocument();
      expect(screen.getByTestId('ware-antidote')).toBeInTheDocument();
    });
  });

  describe('Spellcasting Services tab (#820)', () => {
    const spells = [
      { id: 'heal', name: 'Heal', level: 1, traditions: ['divine', 'primal'] },
      { id: 'fireball', name: 'Fireball', level: 3, traditions: ['arcane', 'primal'] },
      { id: 'haste', name: 'Haste', level: 3, traditions: ['arcane', 'occult', 'primal'] },
      { id: 'chromatic-wall', name: 'Chromatic Wall', level: 5, traditions: ['arcane', 'occult'], traits: ['Uncommon'] },
      { id: 'shield', name: 'Shield', level: 0, traditions: ['arcane', 'divine', 'occult'], traits: ['Cantrip'] },
    ];
    const oneShop = [{ id: 'bottled-solutions', title: 'Bottled Solutions' }];
    const renderWith = (wares, props = {}) =>
      render(
        <ShopModal
          isOpen
          onClose={() => {}}
          shops={oneShop}
          waresStore={{ 'bottled-solutions': { wares } }}
          items={items}
          spells={spells}
          character={{ id: 'char-1', name: 'Pellias' }}
          {...props}
        />
      );

    it('hides the tab chrome when the shop has no spell-item offering', () => {
      renderWith([{ ref: 'antidote', price: 8 }]);
      openBottledSolutions();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.getByTestId('ware-antidote')).toBeInTheDocument();
    });

    it('shows both tabs when the shop has a spell-item offering', () => {
      renderWith([{ ref: 'antidote', price: 8 }, { spellItem: 'scroll', maxRank: 3 }]);
      openBottledSolutions();
      expect(screen.getByRole('tab', { name: 'Wares' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Spellcasting Services' })).toBeInTheDocument();
      // Wares tab is the default body.
      expect(screen.getByTestId('ware-antidote')).toBeInTheDocument();
      expect(screen.queryByTestId('shop-spellservices')).not.toBeInTheDocument();
    });

    it('switches the body to the offerings when the Spellcasting Services tab is picked', () => {
      renderWith([{ ref: 'antidote', price: 8 }, { spellItem: 'scroll', maxRank: 3 }]);
      openBottledSolutions();
      fireEvent.click(screen.getByRole('tab', { name: 'Spellcasting Services' }));
      expect(screen.getByTestId('shop-spellservices')).toBeInTheDocument();
      expect(screen.queryByTestId('ware-antidote')).not.toBeInTheDocument();
      // Back to wares.
      fireEvent.click(screen.getByRole('tab', { name: 'Wares' }));
      expect(screen.getByTestId('ware-antidote')).toBeInTheDocument();
      expect(screen.queryByTestId('shop-spellservices')).not.toBeInTheDocument();
    });

    it('renders a read-only coverage summary with the live eligible count', () => {
      renderWith([{ spellItem: 'scroll', maxRank: 3 }]);
      openBottledSolutions();
      fireEvent.click(screen.getByRole('tab', { name: 'Spellcasting Services' }));
      // Scrolls, all traditions, common only, rank ≤ 3: heal, fireball, haste.
      expect(screen.getByLabelText('spellcasting services')).toHaveTextContent(
        'Scrolls · all traditions · common · up to rank 3 · 3 eligible spells'
      );
      // No buy affordance yet — the picker is S9.
      expect(screen.queryByLabelText(/^add scroll/)).not.toBeInTheDocument();
    });

    it('reflects tradition + rarity filters in the summary count', () => {
      renderWith([
        { spellItem: 'wand', maxRank: 5, traditions: ['arcane', 'occult'], rarities: ['common', 'uncommon'] },
      ]);
      openBottledSolutions();
      fireEvent.click(screen.getByRole('tab', { name: 'Spellcasting Services' }));
      // Wands, arcane/occult, common+uncommon, rank ≤ 5: fireball, haste, chromatic-wall.
      expect(screen.getByLabelText('spellcasting services')).toHaveTextContent(
        'Wands · arcane/occult · common+uncommon · up to rank 5 · 3 eligible spells'
      );
    });

    it('still offers the tab for a spell-only shop, with an empty Wares body', () => {
      renderWith([{ spellItem: 'scroll', maxRank: 3 }]);
      openBottledSolutions();
      expect(screen.getByRole('tab', { name: 'Spellcasting Services' })).toBeInTheDocument();
      expect(screen.getByText('This shop has nothing for sale right now.')).toBeInTheDocument();
    });
  });

  it('returns to the carousel from the shop window', () => {
    renderModal();
    fireEvent.click(screen.getByText('The Curious Goblin'));
    fireEvent.click(screen.getByText('← All shops'));
    expect(screen.getByText('Bottled Solutions')).toBeInTheDocument();
    expect(screen.getByText('The Curious Goblin')).toBeInTheDocument();
    expect(screen.queryByText('This shop has nothing for sale right now.')).not.toBeInTheDocument();
  });
});
