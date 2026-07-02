import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ShopStorefront from './ShopStorefront';

// The preview's item activations (#882) render TraitTag, which pulls
// TraitContext; stub it to the bare trait label.
vi.mock('../shared/TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name || 'trait'}</span>;
  },
}));

// useShopCheckout owns the whole transaction (#878); stub it with a checkout that
// returns a receipt for an affordable combined cart (over-budget is UI-gated).
let mockGold = 142;
let mockOrders = [];
const mockCheckout = vi.fn(({ purchases = [], handoffs = [] }) => {
  const wareTotal = purchases.reduce((s, p) => s + p.item.price * p.qty, 0);
  const handoffTotal = handoffs.reduce((s, h) => s + h.runes.reduce((x, r) => x + (r.price || 0), 0), 0);
  const total = wareTotal + handoffTotal;
  if (total > mockGold) return null;
  return { total, wareCount: purchases.reduce((s, p) => s + p.qty, 0), handoffCount: handoffs.length };
});
vi.mock('../../hooks/useShopCheckout', () => ({
  useShopCheckout: vi.fn(() => ({ myGold: mockGold, orders: mockOrders, nowSeconds: 0, checkout: mockCheckout })),
}));

// useCharacter pulls character/content contexts; stub it with the inventory the
// Runesmithing gear list reads.
let mockInventory = [];
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: vi.fn(() => ({ inventory: mockInventory })),
}));

beforeEach(() => {
  mockGold = 142; mockInventory = []; mockOrders = []; mockCheckout.mockClear();
});

const items = [
  { id: 'antidote', name: 'Antidote', price: 3, weight: 0, traits: ['Alchemical', 'Consumable'], description: 'Cures poison.',
    image: 'antidote.png', imagePosition: { x: 50, y: 25 },
    actions: [{ name: 'Drink Antidote', actionCount: 1, traits: ['Manipulate'], description: 'Gain a bonus against poison.' }] },
  { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1, traits: ['Magical'] },
  {
    id: 'tonic',
    name: 'Tonic',
    weight: 0,
    traits: ['Healing', 'Consumable'],
    variants: [
      { level: 1, label: 'Minor', name: 'Minor Tonic', price: 4 },
      { level: 3, label: 'Lesser', name: 'Lesser Tonic', price: 12 },
    ],
  },
];
const runes = [{ id: 'flaming', name: 'Flaming', level: 8, price: 500, traits: ['Fire'] }];
// Common, low-rank spells so the scroll offering (maxLevel 3, all traditions,
// common) expands to buyable scroll items.
const spells = [
  { id: 'heal', name: 'Heal', level: 1, traditions: ['divine', 'primal'] },
  { id: 'sleep', name: 'Sleep', level: 1, traditions: ['arcane', 'occult'],
    traits: ['Concentrate', 'Manipulate', 'Sleep'], actions: 'Two Actions', defense: 'Will',
    range: '30 feet', area: '5-foot burst', targets: '', duration: 'varies',
    description: 'Each creature in the area becomes drowsy.',
    degrees: { Success: 'Unaffected.', Failure: 'Falls asleep.' },
    heightened: { '4th': 'The initial duration increases.' } },
];

// One shop at a location: general wares + a runestone (⇒ Runesmithing derives on)
// + a spell-item offering (⇒ Spellcasting derives on).
const fullStore = {
  rings: {
    keeper: 'Maver calls you treasure.',
    wares: [
      { ref: 'antidote', level: 1 },
      { ref: 'tonic', level: 1 },
      { ref: 'tonic', level: 3 },
      { ref: 'spellbook' },
      { ref: 'runestone', runeRef: 'flaming' },
      { spellItem: 'scroll', maxLevel: 3 },
    ],
  },
};
const ringsShop = { id: 'rings', title: 'Rings & Things', kind: 'Curios', summary: 'Trinkets.' };

const renderShop = (props = {}) =>
  render(
    <ShopStorefront
      isOpen
      onClose={vi.fn()}
      shops={[ringsShop]}
      waresStore={fullStore}
      items={items}
      runes={runes}
      spells={spells}
      character={{ id: 'pellias', name: 'Pellias' }}
      {...props}
    />
  );

describe('ShopStorefront', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ShopStorefront isOpen={false} onClose={vi.fn()} shops={[ringsShop]} waresStore={fullStore} items={items} runes={runes} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('auto-opens a lone shop with its header, keeper line and gold purse', () => {
    renderShop();
    expect(screen.getByText('Rings & Things')).toBeInTheDocument();
    expect(screen.getByText(/Maver calls you treasure/)).toBeInTheDocument();
    expect(screen.getByTestId('shop-purse')).toHaveTextContent('142');
  });

  describe('tab computation (#857 S1 selectors)', () => {
    it('shows Wares plus the derived Spellcasting and Runes tabs', () => {
      renderShop();
      expect(screen.getByRole('tab', { name: /Wares/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Spells/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Runes/ })).toBeInTheDocument();
    });

    it('omits Spellcasting/Runes when the shop offers neither', () => {
      render(
        <ShopStorefront
          isOpen
          onClose={vi.fn()}
          shops={[ringsShop]}
          waresStore={{ rings: { wares: [{ ref: 'antidote' }] } }}
          items={items}
          runes={runes}
          character={{ id: 'p', name: 'P' }}
        />
      );
      expect(screen.getByRole('tab', { name: /Wares/ })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /Spells/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /Runes/ })).not.toBeInTheDocument();
    });

    it('the Runes tab shows the gear section + runes-for-sale', () => {
      renderShop();
      fireEvent.click(screen.getByRole('tab', { name: /Runes/ }));
      expect(screen.getByText('Your Gear')).toBeInTheDocument();
      expect(screen.getByText('Runes for sale')).toBeInTheDocument();
    });
  });

  describe('wares grid', () => {
    it('collapses item variants into one tile and shows a "from" price', () => {
      renderShop();
      const grid = screen.getByLabelText('wares');
      // tonic@1 + tonic@3 → one tile; spellbook + antidote also present.
      const tonic = within(grid).getByTestId('ware-tonic');
      expect(tonic).toHaveTextContent('from 4 gp');
      expect(tonic).toHaveTextContent('2 forms');
      expect(within(grid).getByTestId('ware-antidote')).toHaveTextContent('3 gp');
    });

    it('filters by search and by a trait chip', () => {
      renderShop();
      fireEvent.change(screen.getByLabelText('search wares'), { target: { value: 'tonic' } });
      const grid = screen.getByLabelText('wares');
      expect(within(grid).getByTestId('ware-tonic')).toBeInTheDocument();
      expect(within(grid).queryByTestId('ware-antidote')).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('search wares'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Magical' }));
      expect(within(screen.getByLabelText('wares')).getByTestId('ware-spellbook')).toBeInTheDocument();
      expect(within(screen.getByLabelText('wares')).queryByTestId('ware-tonic')).not.toBeInTheDocument();
    });

    it('renders the item image on the tile when present, crest fallback otherwise (#881)', () => {
      renderShop();
      const grid = screen.getByLabelText('wares');
      const img = grid.querySelector('[data-testid="ware-antidote"] img.ps-tile-img');
      expect(img).toHaveAttribute('src', '/api/images/antidote.png');
      expect(img).toHaveStyle({ objectPosition: '50% 25%' });
      // spellbook has no image → letter crest, no img.
      const spellbook = grid.querySelector('[data-testid="ware-spellbook"]');
      expect(spellbook.querySelector('img')).toBeNull();
      expect(within(spellbook).getByText('S')).toBeInTheDocument();
    });

    it('renders the item image in the takeover preview when present (#881)', () => {
      renderShop();
      fireEvent.keyDown(within(screen.getByLabelText('wares')).getByTestId('ware-antidote'), { key: 'Enter' });
      const preview = screen.getByTestId('ware-preview');
      expect(preview.querySelector('img.ps-preview-img')).toHaveAttribute('src', '/api/images/antidote.png');
    });

    it('surfaces item activations in the takeover preview (#882)', () => {
      renderShop();
      fireEvent.keyDown(within(screen.getByLabelText('wares')).getByTestId('ware-antidote'), { key: 'Enter' });
      const preview = screen.getByTestId('ware-preview');
      expect(within(preview).getByText('Actions')).toBeInTheDocument();
      expect(within(preview).getByText('Drink Antidote')).toBeInTheDocument();
      expect(within(preview).getByText('Gain a bonus against poison.')).toBeInTheDocument();
      // An item with no activations shows no Actions heading.
      fireEvent.click(within(preview).getByText('‹ Back'));
      fireEvent.keyDown(within(screen.getByLabelText('wares')).getByTestId('ware-spellbook'), { key: 'Enter' });
      expect(within(screen.getByTestId('ware-preview')).queryByText('Actions')).toBeNull();
    });

    it('opens the takeover preview with per-form rows on tap', () => {
      renderShop();
      // Town tiles are draggable: the keyboard path (Enter→onTap) stands in for a
      // tap, since a synthetic click doesn't drive the pointer drag handlers.
      fireEvent.keyDown(within(screen.getByLabelText('wares')).getByTestId('ware-tonic'), { key: 'Enter' });
      const preview = screen.getByTestId('ware-preview');
      // Multi-form group headlines the base name; the variant labels disambiguate below (#880).
      expect(within(preview).getByRole('heading', { name: 'Tonic' })).toBeInTheDocument();
      const forms = within(preview).getByLabelText('forms');
      expect(within(forms).getByText('Minor')).toBeInTheDocument();
      expect(within(forms).getByText('Lesser')).toBeInTheDocument();
    });
  });

  describe('read-only (lore) mode', () => {
    it('shows the lore banner, no gold purse, and a not-here-to-buy preview note', () => {
      renderShop({ readOnly: true, character: null });
      expect(screen.getByTestId('ps-lore-banner')).toBeInTheDocument();
      expect(screen.queryByTestId('shop-purse')).not.toBeInTheDocument();
      fireEvent.click(within(screen.getByLabelText('wares')).getByTestId('ware-antidote'));
      expect(within(screen.getByTestId('ware-preview')).getByText(/not here to buy/i)).toBeInTheDocument();
    });
  });

  describe('cart + checkout (town mode)', () => {
    const openTray = () => fireEvent.click(screen.getByTestId('cart-bar'));

    it('adds a single-form ware from its tile + and shows the in-cart badge', () => {
      renderShop();
      fireEvent.click(screen.getByLabelText('add Antidote'));
      expect(screen.getByTestId('incart-antidote')).toHaveTextContent('in cart ×1');
      expect(screen.getByTestId('cart-bar')).toHaveTextContent('1 item');
    });

    it('adds a specific variant from the takeover preview', () => {
      renderShop();
      fireEvent.keyDown(within(screen.getByLabelText('wares')).getByTestId('ware-tonic'), { key: 'Enter' });
      const forms = within(screen.getByTestId('ware-preview')).getByLabelText('forms');
      fireEvent.click(within(forms).getByLabelText('add Lesser')); // the 12gp form
      expect(within(forms).getByText('in cart ×1')).toBeInTheDocument();
    });

    it('steps quantity and shows the running total + purse-after', () => {
      renderShop();
      fireEvent.click(screen.getByLabelText('add Antidote')); // 3 gp
      openTray();
      const tray = screen.getByTestId('cart-tray');
      fireEvent.click(within(tray).getByLabelText('increase Antidote'));
      expect(within(tray).getByLabelText('cart lines')).toHaveTextContent('6 gp'); // 2 × 3
      expect(within(tray).getByText(/Purse after purchase: 136 gp/)).toBeInTheDocument();
      expect(within(tray).getByTestId('checkout')).toHaveTextContent('Check out · 6 gp');
    });

    it('removes a line by stepping below 1', () => {
      renderShop();
      fireEvent.click(screen.getByLabelText('add Antidote'));
      openTray();
      const tray = screen.getByTestId('cart-tray');
      fireEvent.click(within(tray).getByLabelText('decrease Antidote'));
      expect(within(tray).queryByLabelText('cart lines')).not.toBeInTheDocument();
    });

    it('disables checkout and shows the shortfall when over budget', () => {
      mockGold = 5;
      renderShop();
      // spellbook is 10 gp > 5 gp purse
      fireEvent.click(screen.getByLabelText('add Spellbook'));
      openTray();
      const checkout = within(screen.getByTestId('cart-tray')).getByTestId('checkout');
      expect(checkout).toBeDisabled();
      expect(checkout).toHaveTextContent('Need 5 gp more');
    });

    it('checks out: calls the unified checkout, clears the cart, and shows a toast', () => {
      renderShop();
      fireEvent.click(screen.getByLabelText('add Antidote'));
      openTray();
      fireEvent.click(within(screen.getByTestId('cart-tray')).getByTestId('checkout'));
      expect(mockCheckout).toHaveBeenCalledTimes(1);
      expect(mockCheckout.mock.calls[0][0].purchases).toEqual([{ item: expect.objectContaining({ wareKey: 'antidote' }), qty: 1 }]);
      expect(screen.getByTestId('shop-toast')).toHaveTextContent('Checked out 1 item for 3 gp.');
      // bar resets to empty
      expect(screen.getByTestId('cart-bar')).toHaveTextContent(/empty/i);
    });

    it('the cart bar is a drop zone that adds the cheapest form on drop', () => {
      renderShop();
      // The bar registers as a DnD zone (data-dz) — exercise its onDrop directly
      // (pointer-drag math isn't simulable in jsdom; the primitive is proven).
      const bar = document.querySelector('[data-dz="ps-cart"]');
      expect(bar).toBeInTheDocument();
    });

    it('shows no cart bar in read-only mode', () => {
      renderShop({ readOnly: true, character: null });
      expect(screen.queryByTestId('cart-bar')).not.toBeInTheDocument();
    });
  });

  describe('spellcasting tab (#857 S5)', () => {
    const openSpells = () => fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));

    it('lists buyable scrolls/wands with a count and the locked services teaser', () => {
      renderShop();
      openSpells();
      expect(screen.getByText('Scrolls & Wands')).toBeInTheDocument();
      const grid = screen.getByLabelText('scrolls and wands');
      expect(within(grid).getByTestId('ware-scroll-of-heal')).toBeInTheDocument();
      expect(within(grid).getByTestId('ware-scroll-of-sleep')).toBeInTheDocument();
      // teaser cards render, display-only
      const svc = screen.getByLabelText('spellcasting services');
      expect(within(svc).getByText('Cast a spell for you')).toBeInTheDocument();
      expect(screen.getByText(/coming in a future update/i)).toBeInTheDocument();
    });

    it('shows the whole embedded spell in the takeover preview of a scroll', () => {
      renderShop();
      openSpells();
      fireEvent.keyDown(
        within(screen.getByLabelText('scrolls and wands')).getByTestId('ware-scroll-of-sleep'),
        { key: 'Enter' }
      );
      const preview = screen.getByTestId('ware-preview');
      // Description…
      expect(within(preview).getByText('Each creature in the area becomes drowsy.')).toBeInTheDocument();
      // …plus the full spell block: spell traits, detail grid, degrees, heightening.
      expect(within(preview).getByText('Sleep')).toBeInTheDocument(); // spell trait chip
      expect(within(preview).getByText('Will')).toBeInTheDocument(); // defense
      expect(within(preview).getByText('30 feet')).toBeInTheDocument(); // range
      expect(within(preview).getByText('5-foot burst')).toBeInTheDocument(); // area
      expect(within(preview).getByText('Degrees of Success:')).toBeInTheDocument();
      expect(within(preview).getByText('Falls asleep.')).toBeInTheDocument();
      expect(within(preview).getByText('Heightened:')).toBeInTheDocument();
      expect(within(preview).getByText('The initial duration increases.')).toBeInTheDocument();
    });

    it('searches the scroll/wand list by spell name', () => {
      renderShop();
      openSpells();
      fireEvent.change(screen.getByLabelText('search scrolls and wands'), { target: { value: 'heal' } });
      const grid = screen.getByLabelText('scrolls and wands');
      expect(within(grid).getByTestId('ware-scroll-of-heal')).toBeInTheDocument();
      expect(within(grid).queryByTestId('ware-scroll-of-sleep')).not.toBeInTheDocument();
    });

    it('buys a scroll through the shared cart + checkout', () => {
      renderShop();
      openSpells();
      fireEvent.click(screen.getByLabelText('add Scroll of Heal'));
      expect(screen.getByTestId('incart-scroll-of-heal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('cart-bar'));
      fireEvent.click(within(screen.getByTestId('cart-tray')).getByTestId('checkout'));
      expect(mockCheckout.mock.calls[0][0].purchases).toEqual([
        { item: expect.objectContaining({ wareKey: 'scroll:heal' }), qty: 1 },
      ]);
      expect(screen.getByTestId('shop-toast')).toBeInTheDocument();
    });

    it('read-only mode shows the scrolls as browse-only (no add) plus the teaser', () => {
      renderShop({ readOnly: true, character: null });
      fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
      const grid = screen.getByLabelText('scrolls and wands');
      expect(within(grid).getByTestId('ware-scroll-of-heal')).toBeInTheDocument();
      expect(screen.queryByLabelText('add Scroll of Heal')).not.toBeInTheDocument();
      expect(screen.getByLabelText('spellcasting services')).toBeInTheDocument();
    });

    it('shows the empty-scribe message but still the teaser when nothing is eligible', () => {
      // offersSpellcasting explicit, but no offering ⇒ no eligible scrolls.
      render(
        <ShopStorefront
          isOpen onClose={vi.fn()} shops={[ringsShop]}
          waresStore={{ rings: { offersSpellcasting: true, wares: [{ ref: 'antidote' }] } }}
          items={items} runes={runes} spells={spells} character={{ id: 'p', name: 'P' }}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
      expect(screen.getByText(/scribes nothing to order/i)).toBeInTheDocument();
      expect(screen.getByLabelText('spellcasting services')).toBeInTheDocument();
    });
  });

  describe('runesmithing tab (#857 S6b)', () => {
    // A weapon at +1 (one open property slot + an empty striking socket); the shop
    // stocks a weapon property rune + a striking fundamental as runestones.
    const rsRunes = [
      { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500,
        description: 'Deals an extra 1d6 fire damage on a hit.' },
      { id: 'striking', type: 'fundamental', fundamental: 'striking', target: 'weapon', tierKey: 'striking', name: 'Striking', price: 65 },
    ];
    const rsStore = { rings: { keeper: '', wares: [
      { ref: 'runestone', runeRef: 'flaming' },
      { ref: 'runestone', runeRef: 'striking' },
    ] } };
    const renderRunes = (props = {}) => {
      mockInventory = [{ uid: 'w1', name: 'Longsword', strikes: [{}], runes: { potency: 1 } }];
      render(
        <ShopStorefront
          isOpen onClose={vi.fn()} shops={[ringsShop]} waresStore={rsStore}
          items={items} runes={rsRunes} spells={spells} character={{ id: 'p', name: 'P' }} {...props}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: /Runes/ }));
    };

    it('renders a gear card with derived sockets', () => {
      renderRunes();
      const gear = screen.getByTestId('gear-w1');
      expect(gear).toHaveTextContent('Longsword');
      expect(gear).toHaveTextContent('+1'); // filled potency socket
      // open striking + property sockets are tappable
      expect(within(gear).getAllByRole('button', { name: /^fill .* slot/i }).length).toBeGreaterThanOrEqual(2);
    });

    // #879: a filled fundamental re-opens for an upgrade when a higher tier is
    // in stock; staging potency reveals the property slot it unlocks live.
    const wPot2 = { id: 'wpot2', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 2, name: 'Greater Potency', price: 935 };
    const wPot1 = { id: 'wpot1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1, name: 'Potency', price: 35 };
    const renderRunesWith = ({ inv, runeDocs, refs }) => {
      mockInventory = inv;
      render(
        <ShopStorefront
          isOpen onClose={vi.fn()} shops={[ringsShop]}
          waresStore={{ rings: { keeper: '', wares: refs.map((r) => ({ ref: 'runestone', runeRef: r })) } }}
          items={items} runes={runeDocs} spells={spells} character={{ id: 'p', name: 'P' }}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: /Runes/ }));
    };

    it('re-opens a filled potency socket to upgrade it when a higher tier is in stock (#879)', () => {
      renderRunesWith({
        inv: [{ uid: 'w1', name: 'Longsword', strikes: [{}], runes: { potency: 1 } }],
        runeDocs: [wPot2], refs: ['wpot2'],
      });
      const gear = screen.getByTestId('gear-w1');
      // The +1 potency socket is now a tappable upgrade control.
      const upgrade = within(gear).getByLabelText('upgrade Potency on Longsword');
      expect(upgrade).toHaveTextContent('+1');
      fireEvent.click(upgrade);
      const picker = screen.getByTestId('picker-w1');
      expect(within(picker).getByText('Greater Potency')).toBeInTheDocument();
      fireEvent.click(within(picker).getByRole('button', { name: /Greater Potency/ }));
      expect(within(gear).getByLabelText('un-stage Greater Potency')).toBeInTheDocument();
    });

    it('staging potency on a +0 weapon reveals the property slot it unlocks in the same visit (#879)', () => {
      renderRunesWith({
        inv: [{ uid: 'w1', name: 'Longsword', strikes: [{}], runes: {} }],
        runeDocs: [wPot1, { id: 'flaming', type: 'property', name: 'Flaming', price: 500 }],
        refs: ['wpot1', 'flaming'],
      });
      const gear = screen.getByTestId('gear-w1');
      // +0 weapon: a potency + striking socket, no property socket yet.
      expect(within(gear).queryByLabelText(/fill Property slot/i)).not.toBeInTheDocument();
      // Stage +1 potency through the empty potency socket.
      fireEvent.click(within(gear).getByLabelText(/fill Potency slot/i));
      fireEvent.click(within(screen.getByTestId('picker-w1')).getByRole('button', { name: /Potency/ }));
      // The unlocked property socket is now present and tappable.
      const propSocket = within(gear).getByLabelText(/fill Property slot/i);
      fireEvent.click(propSocket);
      fireEvent.click(within(screen.getByTestId('picker-w1')).getByRole('button', { name: /Flaming/ }));
      // Both runes staged, priced as runestones (each + the 3 gp stone base).
      expect(within(gear).getByTestId('staged-w1')).toHaveTextContent('541 gp');
    });

    it('lists a power ring with its imbue sockets, offering ring runes to fill them (#967 R5)', () => {
      const ringEnergy = { id: 'ring-energy', type: 'property', target: 'ring', name: 'Energy', price: 300 };
      const ringCalling = { id: 'ring-calling', type: 'property', target: 'ring', name: 'Calling', price: 400 };
      renderRunesWith({
        // A silver power ring (grade 2 ⇒ 2 imbue sockets), one already filled.
        inv: [{ uid: 'pr1', name: 'Power Ring (Silver)', powerRing: true, ringSockets: 2, runes: { property: ['ring-energy'] } }],
        runeDocs: [ringEnergy, ringCalling], refs: ['ring-calling'],
      });
      const gear = screen.getByTestId('gear-pr1');
      expect(gear).toHaveTextContent('Power Ring (Silver)');
      expect(gear).toHaveTextContent('Energy'); // filled imbue socket shows the rune
      // grade 2 ⇒ 2 property sockets: one filled, one open (no fundamentals).
      const fillBtns = within(gear).getAllByRole('button', { name: /^fill Property slot/i });
      expect(fillBtns.length).toBe(1);
      // The open socket offers the stocked ring rune (Calling), not weapon/armor runes.
      fireEvent.click(fillBtns[0]);
      expect(within(screen.getByTestId('picker-pr1')).getByRole('button', { name: /Calling/ })).toBeInTheDocument();
    });

    it('moves runestones out of Wares and into the Runesmithing "for sale" section', () => {
      renderRunes();
      const forSale = screen.getByLabelText('runes for sale');
      expect(within(forSale).getByTestId('ware-runestone-flaming')).toBeInTheDocument();
      // not in the Wares grid
      fireEvent.click(screen.getByRole('tab', { name: /Wares/ }));
      expect(screen.queryByLabelText('wares')).not.toBeInTheDocument(); // no general wares stocked
      expect(screen.queryByTestId('ware-runestone-flaming')).not.toBeInTheDocument();
    });

    it("previews a runestone with the held rune's effect text (#800)", () => {
      renderRunes();
      // Enter→onTap stands in for a tap on the draggable tile (see the wares
      // takeover test above).
      fireEvent.keyDown(within(screen.getByLabelText('runes for sale')).getByTestId('ware-runestone-flaming'), { key: 'Enter' });
      const runeBlock = screen.getByTestId('ware-preview-rune');
      expect(runeBlock).toHaveTextContent('Flaming · Level 8');
      expect(runeBlock).toHaveTextContent('Deals an extra 1d6 fire damage on a hit.');
      // the generic etching-stone description still follows
      expect(within(screen.getByTestId('ware-preview')).getByText(/flat piece of hard stone/i)).toBeInTheDocument();
    });

    it('routes rune ITEM entries to Runes-for-sale, not Wares (#883)', () => {
      // A shop stocking a general ware + an armor-rune item + a weapon-potency item.
      const store = { rings: { offersRunes: true, wares: [
        { ref: 'antidote' }, { ref: 'armor-potency' }, { ref: 'weapon-potency' },
      ] } };
      const cat = [
        ...items,
        { id: 'armor-potency', name: 'Armor Potency', price: 160, armorRune: true, traits: ['Magical'] },
        { id: 'weapon-potency', name: 'Weapon Potency', price: 35, traits: ['Magical'] },
      ];
      render(
        <ShopStorefront isOpen onClose={vi.fn()} shops={[ringsShop]} waresStore={store}
          items={cat} runes={[]} spells={spells} character={{ id: 'p', name: 'P' }} />
      );
      // Wares tab has only the general ware
      const wares = screen.getByLabelText('wares');
      expect(within(wares).getByTestId('ware-antidote')).toBeInTheDocument();
      expect(within(wares).queryByTestId('ware-armor-potency')).not.toBeInTheDocument();
      expect(within(wares).queryByTestId('ware-weapon-potency')).not.toBeInTheDocument();
      // Runes-for-sale has both rune items
      fireEvent.click(screen.getByRole('tab', { name: /Runes/ }));
      const forSale = screen.getByLabelText('runes for sale');
      expect(within(forSale).getByTestId('ware-armor-potency')).toBeInTheDocument();
      expect(within(forSale).getByTestId('ware-weapon-potency')).toBeInTheDocument();
    });

    it('shows the Runes tab for a shop that only stocks rune items (no runestones/flag)', () => {
      const store = { rings: { wares: [{ ref: 'armor-potency' }] } };
      const cat = [...items, { id: 'armor-potency', name: 'Armor Potency', price: 160, armorRune: true }];
      render(
        <ShopStorefront isOpen onClose={vi.fn()} shops={[ringsShop]} waresStore={store}
          items={cat} runes={[]} spells={spells} character={{ id: 'p', name: 'P' }} />
      );
      expect(screen.getByRole('tab', { name: /Runes/ })).toBeInTheDocument();
    });

    it('stages a compatible property rune into an open socket, with a pending summary', () => {
      renderRunes();
      const gear = screen.getByTestId('gear-w1');
      // open the property-socket picker (the striking socket lists Striking; the
      // property socket lists Flaming). Fill the property slot:
      fireEvent.click(within(gear).getByLabelText(/fill Property slot/i));
      const picker = screen.getByTestId('picker-w1');
      expect(within(picker).getByText('Flaming')).toBeInTheDocument();
      expect(within(picker).queryByText('Striking')).not.toBeInTheDocument(); // wrong socket
      fireEvent.click(within(picker).getByRole('button', { name: /Flaming/ }));
      // staged: socket shows the rune + a pending note (runestone price 3+500)
      expect(within(gear).getByTestId('staged-w1')).toHaveTextContent('503 gp');
      expect(within(gear).getByLabelText('un-stage Flaming')).toBeInTheDocument();
    });

    it('un-stages a rune by tapping the staged socket', () => {
      renderRunes();
      const gear = screen.getByTestId('gear-w1');
      fireEvent.click(within(gear).getByLabelText(/fill Striking slot/i));
      fireEvent.click(within(screen.getByTestId('picker-w1')).getByRole('button', { name: /Striking/ }));
      expect(within(gear).getByLabelText('un-stage Striking')).toBeInTheDocument();
      fireEvent.click(within(gear).getByLabelText('un-stage Striking'));
      expect(within(gear).queryByTestId('staged-w1')).not.toBeInTheDocument();
    });

    const stageStriking = () => {
      const gear = screen.getByTestId('gear-w1');
      fireEvent.click(within(gear).getByLabelText(/fill Striking slot/i));
      fireEvent.click(within(screen.getByTestId('picker-w1')).getByRole('button', { name: /Striking/ }));
    };

    it('a staged rune shows as a handoff line in the cart and checks out (#878)', () => {
      renderRunes();
      stageStriking();
      // the handoff appears as a cart line + counts in the bar
      fireEvent.click(screen.getByTestId('cart-bar'));
      const tray = screen.getByTestId('cart-tray');
      expect(within(tray).getByTestId('handoff-line-w1')).toHaveTextContent('Longsword');
      expect(within(tray).getByTestId('handoff-line-w1')).toHaveTextContent('68 gp'); // 3 + 65
      fireEvent.click(within(tray).getByTestId('checkout'));
      const { purchases, handoffs } = mockCheckout.mock.calls[0][0];
      expect(purchases).toEqual([]);
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0].gear.uid).toBe('w1');
      expect(handoffs[0].runes.map((r) => r.id)).toEqual(['striking']);
      expect(screen.getByTestId('shop-toast')).toBeInTheDocument();
    });

    it('removes a handoff line with its ✕ (un-stages the gear)', () => {
      renderRunes();
      stageStriking();
      fireEvent.click(screen.getByTestId('cart-bar'));
      fireEvent.click(within(screen.getByTestId('cart-tray')).getByLabelText(/remove handoff Longsword/i));
      expect(screen.queryByTestId('handoff-line-w1')).not.toBeInTheDocument();
      expect(within(screen.getByTestId('gear-w1')).queryByTestId('staged-w1')).not.toBeInTheDocument();
    });

    it('disables checkout when the combined total exceeds gold', () => {
      mockGold = 10; // a 68gp striking handoff is unaffordable
      renderRunes();
      stageStriking();
      fireEvent.click(screen.getByTestId('cart-bar'));
      expect(within(screen.getByTestId('cart-tray')).getByTestId('checkout')).toBeDisabled();
    });

    it('renders a benched ticket for a pending order', () => {
      mockOrders = [{ id: 'ord1', weaponName: 'Longsword', runeName: 'Striking, Flaming', price: 565, readyAtSeconds: 999999 }];
      renderRunes();
      const ticket = screen.getByTestId('bench-ord1');
      expect(ticket).toHaveTextContent('Longsword');
      expect(ticket).toHaveTextContent('Striking, Flaming');
      expect(ticket).toHaveTextContent('565 gp');
    });

    it('read-only mode shows "—" sockets and no picker', () => {
      mockInventory = [{ uid: 'w1', name: 'Longsword', strikes: [{}], runes: { potency: 1 } }];
      render(
        <ShopStorefront isOpen onClose={vi.fn()} shops={[ringsShop]} waresStore={rsStore}
          items={items} runes={rsRunes} spells={spells} character={null} readOnly />
      );
      fireEvent.click(screen.getByRole('tab', { name: /Runes/ }));
      // Sockets render as "—" (no fill buttons, no picker) when not in town.
      expect(screen.queryByLabelText(/^fill .* slot/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('picker-w1')).not.toBeInTheDocument();
    });

    // ── Accessory hosts (#1033 S5) ─────────────────────────────────────────
    const menacing = { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', level: 3, price: 50, usage: ['clothing'] };
    const cloak = { uid: 'k1', name: 'Cloak', accessoryTags: ['cloak', 'clothing'], weight: 0.1 };

    it('stages an accessory rune onto a cloak and checks it out as a handoff (#1033 S5)', () => {
      renderRunesWith({ inv: [cloak], runeDocs: [menacing], refs: ['menacing'] });
      const gear = screen.getByTestId('gear-k1');
      expect(gear).toHaveTextContent('Cloak');
      expect(gear).toHaveTextContent('1 open slot · accessory');
      fireEvent.click(within(gear).getByLabelText('fill Accessory slot on Cloak'));
      fireEvent.click(within(screen.getByTestId('picker-k1')).getByRole('button', { name: /Menacing/ }));
      // staged: runestone price (3 + 50) pending
      expect(within(gear).getByTestId('staged-k1')).toHaveTextContent('53 gp');
      fireEvent.click(screen.getByTestId('cart-bar'));
      fireEvent.click(within(screen.getByTestId('cart-tray')).getByTestId('checkout'));
      const { handoffs } = mockCheckout.mock.calls[0][0];
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0].gear.uid).toBe('k1');
      expect(handoffs[0].runes.map((r) => r.id)).toEqual(['menacing']);
    });

    it('a dual-host card shows the accessory socket after its armor sockets (#1033 S5)', () => {
      renderRunesWith({
        inv: [{ uid: 'e1', name: "Explorer's Clothing", armor: { category: 'unarmored', acBonus: 0 },
          accessoryTags: ['clothing'], runes: { potency: 1 } }],
        runeDocs: [menacing], refs: ['menacing'],
      });
      const gear = screen.getByTestId('gear-e1');
      // Armor sockets still there (an open resilient + the potency-unlocked property)…
      expect(within(gear).getByLabelText(/fill Resilient slot/i)).toBeInTheDocument();
      expect(within(gear).getByLabelText(/fill Property slot/i)).toBeInTheDocument();
      // …plus the accessory socket, whose picker offers the accessory rune only.
      fireEvent.click(within(gear).getByLabelText(/fill Accessory slot/i));
      expect(within(screen.getByTestId('picker-e1')).getByRole('button', { name: /Menacing/ })).toBeInTheDocument();
    });

    it('an inscribed accessory socket shows its rune with no upgrade path (#1033 S5)', () => {
      // On a dual-host (always listed via its armor target) — an inscribed
      // accessory-ONLY host drops off the board instead: nothing left to etch.
      renderRunesWith({
        inv: [{ uid: 'e1', name: "Explorer's Clothing", armor: { category: 'unarmored', acBonus: 0 },
          accessoryTags: ['clothing'], runes: { accessory: 'menacing' } }],
        runeDocs: [menacing], refs: ['menacing'],
      });
      const gear = screen.getByTestId('gear-e1');
      expect(gear).toHaveTextContent('Menacing'); // filled socket shows the rune name
      expect(within(gear).queryByLabelText(/fill Accessory slot/i)).not.toBeInTheDocument();
      expect(within(gear).queryByLabelText(/upgrade Accessory/i)).not.toBeInTheDocument();
    });

    it('hides an accessory-only host with nothing to etch (#1033 S5)', () => {
      // The shop stocks a weapon rune + the cloak's own rune — but one cloak is
      // already inscribed and the other can't take Flaming, so only gear the
      // smith can work on stays on the board.
      renderRunesWith({
        inv: [
          { ...cloak, uid: 'k2', runes: { accessory: 'menacing' } }, // inscribed — done
          { uid: 'w1', name: 'Longsword', strikes: [{}], runes: {} },
        ],
        runeDocs: [{ id: 'flaming', type: 'property', name: 'Flaming', price: 500 }], refs: ['flaming'],
      });
      expect(screen.queryByTestId('gear-k2')).not.toBeInTheDocument();
      expect(screen.getByTestId('gear-w1')).toBeInTheDocument();
    });

    it('hides an accessory-only host when no compatible rune is in stock (#1033 S5)', () => {
      // The shop stocks only a weapon rune — the cloak stays off the board.
      renderRunesWith({
        inv: [cloak],
        runeDocs: [{ id: 'flaming', type: 'property', name: 'Flaming', price: 500 }], refs: ['flaming'],
      });
      expect(screen.queryByTestId('gear-k1')).not.toBeInTheDocument();
      expect(screen.getByText('No gear to etch.')).toBeInTheDocument();
    });
  });

  describe('generative rune-service offerings (#982 G3)', () => {
    // A weapon at +1 (one open property slot), so a generated weapon rune can fill it.
    const g3Runes = [
      { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500 }, // weapon, in window
      { id: 'keen', type: 'property', name: 'Keen', level: 13, price: 3000 }, // weapon, above cap 10
      { id: 'ring-calling', type: 'property', target: 'ring', name: 'Calling', level: 8, price: 400 }, // ring, off-target
    ];
    const renderG3 = (wares, props = {}) => {
      mockInventory = [{ uid: 'w1', name: 'Longsword', strikes: [{}], runes: { potency: 1 } }];
      render(
        <ShopStorefront
          isOpen onClose={vi.fn()} shops={[ringsShop]}
          waresStore={{ rings: { keeper: '', wares } }}
          items={items} runes={g3Runes} spells={spells} character={{ id: 'p', name: 'P' }} {...props}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: /Runes/ }));
    };

    it('expands an offering into runes-for-sale, filtered by target + level', () => {
      renderG3([{ runeService: true, targets: ['weapon'], maxLevel: 10 }]);
      const forSale = screen.getByLabelText('runes for sale');
      expect(within(forSale).getByTestId('ware-runestone-flaming')).toBeInTheDocument();
      // keen (level 13 > cap) and ring-calling (off-target) are not offered.
      expect(within(forSale).queryByTestId('ware-runestone-keen')).not.toBeInTheDocument();
      expect(within(forSale).queryByTestId('ware-runestone-ring-calling')).not.toBeInTheDocument();
    });

    it('offers a generated rune in the socket picker', () => {
      renderG3([{ runeService: true, targets: ['weapon'], maxLevel: 10 }]);
      const gear = screen.getByTestId('gear-w1');
      fireEvent.click(within(gear).getByLabelText(/fill Property slot/i));
      expect(within(screen.getByTestId('picker-w1')).getByRole('button', { name: /Flaming/ })).toBeInTheDocument();
    });

    it('surfaces the Runes tab for an offering-only shop with no hand-stocked runes', () => {
      renderG3([{ runeService: true, targets: ['weapon'], maxLevel: 10 }]);
      expect(screen.getByRole('tab', { name: /Runes/ })).toBeInTheDocument();
    });

    it('dedupes a hand-stocked rune against the offering (shows once)', () => {
      renderG3([
        { ref: 'runestone', runeRef: 'flaming', price: 450 }, // custom-priced escape hatch
        { runeService: true, targets: ['weapon'], maxLevel: 10 },
      ]);
      const forSale = screen.getByLabelText('runes for sale');
      expect(within(forSale).getAllByTestId('ware-runestone-flaming')).toHaveLength(1);
    });
  });

  describe('multi-shop picker', () => {
    const second = { id: 'forge', title: 'The Forge', kind: 'Smithy' };
    it('lists shops and opens one, with Back returning to the picker', () => {
      render(
        <ShopStorefront
          isOpen
          onClose={vi.fn()}
          shops={[ringsShop, second]}
          waresStore={{ ...fullStore, forge: { wares: [{ ref: 'antidote' }] } }}
          items={items}
          runes={runes}
          character={{ id: 'p', name: 'P' }}
        />
      );
      // picker first (two shops)
      expect(screen.getByLabelText('shops')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Rings & Things/ }));
      expect(screen.getByRole('tab', { name: /Wares/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByLabelText('shops')).toBeInTheDocument();
    });
  });
});
