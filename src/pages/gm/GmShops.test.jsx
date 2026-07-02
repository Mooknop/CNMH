import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GmShops from './GmShops';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useShops', () => ({ useShops: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';

const items = [
  { id: 'antidote', name: 'Antidote', price: 3, weight: 0, traits: ['Alchemical', 'Healing'] },
  { id: 'spellbook', name: 'Spellbook', price: 10, weight: 1, traits: ['Magical'] },
  // Multi-level item (#797 shape): variants carry their own name/price.
  {
    id: 'tonic',
    name: 'Tonic',
    weight: 0,
    variants: [
      { level: 1, label: 'Minor', name: 'Minor Tonic', price: 4 },
      { level: 3, label: 'Lesser', name: 'Lesser Tonic', price: 12 },
    ],
  },
];

const allLoreEntries = [
  { id: 'town-hall', title: 'Town Hall', category: 'Location' },
  { id: 'bottled-solutions', title: 'Bottled Solutions', category: 'Location', parent: 'sandpoint' },
  { id: 'brodert-quink', title: 'Brodert Quink', category: 'NPC' },
];

const runes = [{ id: 'flaming', name: 'Flaming', level: 8, price: 500 }];

// Spell catalog for the generative scroll/wand offerings (#819). Rarity rides on
// a trait (getItemRarity); a Cantrip is excluded from scroll/wand pricing.
const spells = [
  { id: 'heal', name: 'Heal', level: 1, traditions: ['divine', 'primal'] },
  { id: 'fireball', name: 'Fireball', level: 3, traditions: ['arcane', 'primal'] },
  { id: 'haste', name: 'Haste', level: 3, traditions: ['arcane', 'occult', 'primal'] },
  { id: 'chromatic-wall', name: 'Chromatic Wall', level: 5, traditions: ['arcane', 'occult'], traits: ['Uncommon'] },
  { id: 'shield', name: 'Shield', level: 0, traditions: ['arcane', 'divine', 'occult'], traits: ['Cantrip'] },
];

// Default meta a legacy/blank entry serializes back with. Offers default to
// false: a blank shop stocks no runestones/spell-items, so the derived service
// detection (#857 S1) is false and the first save freezes that explicit.
const META = { keeper: '', open: true, revealed: false, offersSpellcasting: false, offersRunes: false };

let setShop;
let removeShop;
const setup = (shops = {}) => {
  setShop = vi.fn();
  removeShop = vi.fn();
  useContent.mockReturnValue({ allLoreEntries, items, runes, spells });
  useShops.mockReturnValue({ shops, setShop, removeShop });
};

afterEach(() => vi.restoreAllMocks());

// The Command finder has no persistent list: pick a location by searching for it
// and clicking the result option.
const select = (title) => {
  fireEvent.change(screen.getByLabelText('location search'), { target: { value: title } });
  fireEvent.click(screen.getByRole('option', { name: new RegExp(title) }));
};
const lastSave = () => setShop.mock.calls[setShop.mock.calls.length - 1];
const shelf = () => screen.getByLabelText('wares');

describe('GmShops', () => {
  describe('finder', () => {
    it('searches Location entries; NPCs never appear', () => {
      setup();
      render(<GmShops />);
      fireEvent.change(screen.getByLabelText('location search'), { target: { value: 'Brodert' } });
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('location search'), { target: { value: 'Town' } });
      expect(screen.getByRole('option', { name: /Town Hall/ })).toBeInTheDocument();
    });

    it('groups set-up shops first and badges them', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      fireEvent.change(screen.getByLabelText('location search'), { target: { value: 'o' } });
      const results = screen.getByLabelText('search results');
      expect(within(results).getByText('Shops')).toBeInTheDocument();
      expect(within(results).getByRole('option', { name: /Bottled Solutions Shop/ })).toBeInTheDocument();
    });

    it('lists set-up shops as quick-chips and opens one on click', () => {
      setup({ 'bottled-solutions': { wares: [] } });
      render(<GmShops />);
      fireEvent.click(screen.getByRole('button', { name: /Bottled Solutions/ }));
      expect(screen.getByTestId('shop-workspace-bottled-solutions')).toBeInTheDocument();
    });

    it('shows the empty copy when no shops are set up', () => {
      setup();
      render(<GmShops />);
      expect(screen.getByText(/No shops yet/)).toBeInTheDocument();
    });

    it('counts set-up shops in the live pill', () => {
      setup({ 'bottled-solutions': { wares: [] } });
      render(<GmShops />);
      expect(screen.getByText('1 live')).toBeInTheDocument();
    });

    it('⌘K focuses the search input', () => {
      setup();
      render(<GmShops />);
      const input = screen.getByLabelText('location search');
      expect(input).not.toHaveFocus();
      fireEvent.keyDown(window, { key: 'k', metaKey: true });
      expect(input).toHaveFocus();
    });
  });

  describe('not a shop yet', () => {
    it('shows the set-up empty state, not the authoring surface', () => {
      setup();
      render(<GmShops />);
      select('Town Hall');
      expect(screen.getByTestId('shop-setup')).toBeInTheDocument();
      expect(screen.getByText('Not a shop')).toBeInTheDocument();
      expect(screen.queryByLabelText('keeper')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('catalog')).not.toBeInTheDocument();
    });

    it('Set up as shop commits defaults and reveals the two-pane surface', () => {
      setup();
      render(<GmShops />);
      select('Town Hall');
      fireEvent.click(screen.getByRole('button', { name: 'Set up as shop' }));
      expect(setShop).toHaveBeenCalledWith('town-hall', { keeper: '', open: true, revealed: false, wares: [] });
      expect(screen.getByLabelText('keeper')).toBeInTheDocument();
      expect(screen.getByLabelText('catalog')).toBeInTheDocument();
      expect(screen.getByText(/Nothing stocked yet/)).toBeInTheDocument();
      expect(screen.getByText('Shop')).toBeInTheDocument();
    });
  });

  describe('shop meta', () => {
    it('loads keeper/revealed/open from the stored entry', () => {
      setup({ 'bottled-solutions': { keeper: 'Vorl', open: false, revealed: true, wares: [] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(screen.getByLabelText('keeper')).toHaveValue('Vorl');
      expect(screen.getByRole('button', { name: 'Revealed' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('edits meta and publishes it alongside wares', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.change(screen.getByLabelText('keeper'), { target: { value: 'Vorl the brewer' } });
      fireEvent.click(screen.getByRole('button', { name: 'Revealed' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual([
        'bottled-solutions',
        { keeper: 'Vorl the brewer', open: true, revealed: true, offersSpellcasting: false, offersRunes: false, wares: [{ ref: 'antidote' }] },
      ]);
    });
  });

  describe('Save & publish gating', () => {
    it('is disabled (reads "Saved") on a freshly loaded shop and enables on edit', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('price-antidote'), { target: { value: '5' } });
      expect(screen.getByRole('button', { name: 'Save & publish' })).not.toBeDisabled();
    });

    it('flashes a live confirmation after saving', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.change(screen.getByLabelText('price-antidote'), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(screen.getByText('Saved — live for players')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
    });
  });

  describe('catalog pane', () => {
    const open = (shops = { 'town-hall': { wares: [] } }) => {
      setup(shops);
      render(<GmShops />);
      select('Town Hall');
    };

    it('lists items and runes (runes as Runestones)', () => {
      open();
      const cat = screen.getByLabelText('catalog');
      expect(within(cat).getByTestId('cat-antidote')).toBeInTheDocument();
      expect(within(cat).getByTestId('cat-spellbook')).toBeInTheDocument();
      expect(within(cat).getByTestId('cat-runestone@flaming')).toHaveTextContent('Flaming Runestone');
    });

    it('filters by search', () => {
      open();
      fireEvent.change(screen.getByLabelText('catalog search'), { target: { value: 'antid' } });
      const cat = screen.getByLabelText('catalog');
      expect(within(cat).getByTestId('cat-antidote')).toBeInTheDocument();
      expect(within(cat).queryByTestId('cat-spellbook')).not.toBeInTheDocument();
    });

    it('AND-filters by trait chips', () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Magical' }));
      const cat = screen.getByLabelText('catalog');
      expect(within(cat).getByTestId('cat-spellbook')).toBeInTheDocument();
      expect(within(cat).queryByTestId('cat-antidote')).not.toBeInTheDocument();
    });

    it('dims and disables an already-stocked item', () => {
      open({ 'town-hall': { wares: [{ ref: 'antidote' }] } });
      const cat = screen.getByLabelText('catalog');
      expect(within(cat).getByTestId('cat-antidote')).toBeDisabled();
      expect(within(cat).getByTestId('cat-antidote')).toHaveTextContent('In shop');
    });
  });

  describe('stocking', () => {
    it('loads a shop\'s wares into shelf rows with name + price override', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote', price: 8 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(within(shelf()).getByText('Antidote')).toBeInTheDocument();
      expect(within(shelf()).getByLabelText('price-antidote')).toHaveValue(8);
    });

    it('shows the catalog price as the placeholder when no override is set', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(within(shelf()).getByLabelText('price-antidote')).toHaveAttribute('placeholder', '3');
    });

    it('shelves a catalog item and publishes it (no override → no price field)', () => {
      setup({ 'town-hall': { wares: [] } });
      render(<GmShops />);
      select('Town Hall');
      fireEvent.click(screen.getByTestId('cat-spellbook'));
      expect(within(shelf()).getByText('Spellbook')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual(['town-hall', { ...META, wares: [{ ref: 'spellbook' }] }]);
    });

    it('saves a price override and stock as numbers', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.change(screen.getByLabelText('price-antidote'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('stock-antidote'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual([
        'bottled-solutions',
        { ...META, wares: [{ ref: 'antidote', price: 5, stock: 4 }] },
      ]);
    });

    it('loads stored variants into one row: variant checked + variant price placeholder (#889)', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 3 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      // one row for Tonic, the Lesser (L3) variant checked, its price line present.
      expect(within(shelf()).getByText('Tonic')).toBeInTheDocument();
      expect(within(shelf()).getByLabelText('variant-tonic@3')).toBeChecked();
      expect(within(shelf()).getByLabelText('variant-tonic@1')).not.toBeChecked();
      expect(within(shelf()).getByLabelText('price-tonic@3')).toHaveAttribute('placeholder', '12');
    });

    it('selects a variant on a freshly shelved item and saves it with level (#889)', () => {
      setup({ 'town-hall': { wares: [] } });
      render(<GmShops />);
      select('Town Hall');
      fireEvent.click(screen.getByTestId('cat-tonic')); // shelves Tonic, first variant (L1) pre-checked
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual(['town-hall', { ...META, wares: [{ ref: 'tonic', level: 1 }] }]);
    });

    it('picks multiple variants from one row and saves an entry per variant (#889)', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 1 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      // one Tonic row with L1 checked; also check L3 → saves both.
      fireEvent.click(within(shelf()).getByLabelText('variant-tonic@3'));
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual([
        'bottled-solutions',
        { ...META, wares: [{ ref: 'tonic', level: 1 }, { ref: 'tonic', level: 3 }] },
      ]);
    });

    it('unchecking a variant drops it from the saved wares (#889)', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 1 }, { ref: 'tonic', level: 3 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.click(within(shelf()).getByLabelText('variant-tonic@1')); // uncheck Minor
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual(['bottled-solutions', { ...META, wares: [{ ref: 'tonic', level: 3 }] }]);
    });

    it('shelves a rune as a Runestone ware (#801)', () => {
      setup({ 'town-hall': { wares: [] } });
      render(<GmShops />);
      select('Town Hall');
      fireEvent.click(screen.getByTestId('cat-runestone@flaming'));
      expect(within(shelf()).getByText('Flaming Runestone')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual(['town-hall', { ...META, wares: [{ ref: 'runestone', runeRef: 'flaming' }] }]);
    });

    it('loads a runestone ware: rune name + stone+rune price placeholder', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(within(shelf()).getByText('Flaming Runestone')).toBeInTheDocument();
      expect(within(shelf()).getByLabelText('price-runestone@flaming')).toHaveAttribute('placeholder', '503');
    });

    it('removes a ware and publishes the shorter list', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }, { ref: 'spellbook' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.click(screen.getByLabelText('remove-antidote'));
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual(['bottled-solutions', { ...META, wares: [{ ref: 'spellbook' }] }]);
    });

    it('shows the empty-shelf prompt when nothing is stocked', () => {
      setup({ 'town-hall': { wares: [] } });
      render(<GmShops />);
      select('Town Hall');
      expect(screen.getByText(/Nothing stocked yet/)).toBeInTheDocument();
    });
  });

  describe('spellcasting services — by-tradition config (#884)', () => {
    const open = (shops = { 'town-hall': { wares: [] } }) => {
      setup(shops);
      render(<GmShops />);
      select('Town Hall');
    };
    const lastWares = () => lastSave()[1].wares;
    const offers = () => screen.getByTestId('shop-offerings');

    it('shows the not-selling prompt until a kind is enabled', () => {
      open();
      expect(offers()).toBeInTheDocument();
      expect(screen.getByText(/Not selling scrolls or wands/)).toBeInTheDocument();
    });

    it('authors scrolls and persists the minimal spec (defaults omitted)', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([{ spellItem: 'scroll', maxLevel: 3 }]);
    });

    it('one config drives BOTH scrolls and wands', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      fireEvent.click(screen.getByLabelText('spell-kind-wand'));
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { spellItem: 'scroll', maxLevel: 5 },
        { spellItem: 'wand', maxLevel: 5 },
      ]);
    });

    it('shares tradition + rarity subsets and a price modifier across kinds', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-wand'));
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '5' } });
      fireEvent.click(screen.getByLabelText('spell-trad-arcane'));
      fireEvent.click(screen.getByLabelText('spell-trad-occult'));
      fireEvent.click(screen.getByLabelText('spell-rarity-common'));
      fireEvent.click(screen.getByLabelText('spell-rarity-uncommon'));
      fireEvent.change(screen.getByLabelText('spell-pricemod'), { target: { value: '1.2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { spellItem: 'wand', maxLevel: 5, traditions: ['arcane', 'occult'], rarities: ['common', 'uncommon'], priceMod: 1.2 },
      ]);
    });

    it('omits traditions when all four are selected (means all)', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      ['arcane', 'divine', 'occult', 'primal'].forEach((t) =>
        fireEvent.click(screen.getByLabelText(`spell-trad-${t}`))
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([{ spellItem: 'scroll', maxLevel: 1 }]);
    });

    it('summarises coverage per enabled kind with a live count', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '5' } });
      // Scrolls, all traditions, common only, item level ≤ 5 (rank ≤ 3):
      // heal(1), fireball(5), haste(5).
      expect(screen.getByTestId('spell-summary-scroll')).toHaveTextContent(
        'Scrolls · all traditions · common · up to item level 5 · 3 eligible spells'
      );
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '9' } });
      fireEvent.click(screen.getByLabelText('spell-rarity-common'));
      fireEvent.click(screen.getByLabelText('spell-rarity-uncommon'));
      // chromatic-wall (rank 5, uncommon) is scroll item level 9 — now included.
      expect(screen.getByTestId('spell-summary-scroll')).toHaveTextContent(
        'common+uncommon · up to item level 9 · 4 eligible spells'
      );
    });

    it('backfills: collapses stored offerings into the config (#884)', () => {
      open({
        'town-hall': {
          wares: [
            { ref: 'antidote' },
            { spellItem: 'wand', maxLevel: 5, traditions: ['arcane', 'occult'], rarities: ['common', 'uncommon'] },
          ],
        },
      });
      // Flat ware still on the shelf; the wand offering loads into the config.
      expect(within(shelf()).getByText('Antidote')).toBeInTheDocument();
      expect(within(offers()).getByLabelText('spell-kind-wand')).toHaveAttribute('aria-pressed', 'true');
      expect(within(offers()).getByLabelText('spell-kind-scroll')).toHaveAttribute('aria-pressed', 'false');
      expect(within(offers()).getByLabelText('spell-maxlevel')).toHaveValue(5);
      expect(within(offers()).getByLabelText('spell-trad-arcane')).toHaveAttribute('aria-pressed', 'true');
      expect(within(offers()).getByLabelText('spell-trad-divine')).toHaveAttribute('aria-pressed', 'false');
      expect(within(offers()).getByLabelText('spell-rarity-uncommon')).toHaveAttribute('aria-pressed', 'true');
    });

    it('disabling all kinds republishes the flat ware alone', () => {
      open({ 'town-hall': { wares: [{ ref: 'antidote' }, { spellItem: 'scroll', maxLevel: 3 }] } });
      fireEvent.click(screen.getByLabelText('spell-kind-scroll')); // turn scrolls off
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      // The scroll offering made Spellcasting derive ON at mount (#857 S1); the
      // service flag is independent of stocked scrolls, so it persists ON.
      expect(lastSave()).toEqual([
        'town-hall',
        { ...META, offersSpellcasting: true, wares: [{ ref: 'antidote' }] },
      ]);
    });
  });

  describe('runesmithing services (#982 G2)', () => {
    // A property-rune catalog spanning every target axis + rarity.
    const runeSet = [
      { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500 }, // weapon
      { id: 'keen', type: 'property', name: 'Keen', level: 13, price: 3000 }, // weapon, above a cap-10 shop
      { id: 'ready', type: 'property', target: 'armor', name: 'Ready', level: 6, price: 200 }, // armor
      { id: 'ring-calling', type: 'property', target: 'ring', name: 'Calling', level: 8, price: 400 }, // ring
      { id: 'fearsome', type: 'property', name: 'Fearsome', level: 5, price: 160, rarity: 'uncommon' }, // weapon, uncommon
      { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', level: 3, price: 50 }, // accessory (#1033 S4)
      { id: 'called', type: 'property', target: 'accessory', name: 'Called', level: 3, price: 60, rarity: 'uncommon' }, // accessory, uncommon
    ];
    const open = (shops = { 'town-hall': { wares: [] } }) => {
      setup(shops);
      useContent.mockReturnValue({ allLoreEntries, items, runes: runeSet, spells });
      render(<GmShops />);
      select('Town Hall');
    };
    const lastWares = () => lastSave()[1].wares;
    const offers = () => screen.getByTestId('rune-offerings');

    it('shows the not-selling prompt until a target is enabled', () => {
      open();
      expect(offers()).toBeInTheDocument();
      expect(screen.getByText(/Not selling runes/)).toBeInTheDocument();
    });

    it('authors one target and persists the minimal spec (defaults omitted)', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([{ runeService: true, targets: ['weapon'], maxLevel: 10 }]);
    });

    it('collapses a uniform cap to a scalar and omits targets when all four are chosen', () => {
      open();
      ['weapon', 'armor', 'ring', 'accessory'].forEach((t) => fireEvent.click(screen.getByLabelText(`rune-target-${t}`)));
      ['weapon', 'armor', 'ring', 'accessory'].forEach((t) =>
        fireEvent.change(screen.getByLabelText(`rune-maxlevel-${t}`), { target: { value: '12' } })
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([{ runeService: true, maxLevel: 12 }]);
    });

    it('authors an accessory-target offering and summarises its rarity-gated coverage (#1033 S4)', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-accessory'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-accessory'), { target: { value: '12' } });
      // Common only: menacing (called is uncommon).
      expect(screen.getByTestId('rune-summary')).toHaveTextContent(
        'Runes · accessory · common · accessory ≤12 · 1 eligible rune'
      );
      fireEvent.click(screen.getByLabelText('rune-rarity-common'));
      fireEvent.click(screen.getByLabelText('rune-rarity-uncommon'));
      expect(screen.getByTestId('rune-summary')).toHaveTextContent(
        'common+uncommon · accessory ≤12 · 2 eligible runes'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { runeService: true, targets: ['accessory'], maxLevel: 12, rarities: ['common', 'uncommon'] },
      ]);
    });

    it('emits a per-target object maxLevel when caps differ', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.click(screen.getByLabelText('rune-target-ring'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText('rune-maxlevel-ring'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { runeService: true, targets: ['weapon', 'ring'], maxLevel: { weapon: 10, ring: 8 } },
      ]);
    });

    it('persists a rarities subset (common+uncommon)', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '10' } });
      fireEvent.click(screen.getByLabelText('rune-rarity-common'));
      fireEvent.click(screen.getByLabelText('rune-rarity-uncommon'));
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { runeService: true, targets: ['weapon'], maxLevel: 10, rarities: ['common', 'uncommon'] },
      ]);
    });

    it('summarises coverage with a live count that reacts to rarity', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '10' } });
      // weapon property runes ≤10, common only: flaming (keen too high, fearsome uncommon).
      expect(screen.getByTestId('rune-summary')).toHaveTextContent(
        'Runes · weapon · common · weapon ≤10 · 1 eligible rune'
      );
      fireEvent.click(screen.getByLabelText('rune-rarity-common'));
      fireEvent.click(screen.getByLabelText('rune-rarity-uncommon'));
      // fearsome (uncommon, level 5) now included.
      expect(screen.getByTestId('rune-summary')).toHaveTextContent(
        'common+uncommon · weapon ≤10 · 2 eligible runes'
      );
    });

    it('backfills: loads a stored rune-service offering into the config', () => {
      open({
        'town-hall': {
          wares: [
            { ref: 'antidote' },
            { runeService: true, targets: ['weapon', 'ring'], maxLevel: { weapon: 10, ring: 8 }, rarities: ['common', 'uncommon'] },
          ],
        },
      });
      // Flat ware still on the shelf; the rune offering loads into the config.
      expect(within(shelf()).getByText('Antidote')).toBeInTheDocument();
      expect(within(offers()).getByLabelText('rune-target-weapon')).toHaveAttribute('aria-pressed', 'true');
      expect(within(offers()).getByLabelText('rune-target-ring')).toHaveAttribute('aria-pressed', 'true');
      expect(within(offers()).getByLabelText('rune-target-armor')).toHaveAttribute('aria-pressed', 'false');
      expect(within(offers()).getByLabelText('rune-maxlevel-weapon')).toHaveValue(10);
      expect(within(offers()).getByLabelText('rune-maxlevel-ring')).toHaveValue(8);
      expect(within(offers()).getByLabelText('rune-rarity-uncommon')).toHaveAttribute('aria-pressed', 'true');
    });

    it('disabling all targets republishes the flat ware alone', () => {
      open({ 'town-hall': { wares: [{ ref: 'antidote' }, { runeService: true, targets: ['weapon'], maxLevel: 10 }] } });
      fireEvent.click(screen.getByLabelText('rune-target-weapon')); // turn the only target off
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      // The rune offering derived Runesmithing ON at mount (#857 S1); it persists ON.
      expect(lastSave()).toEqual([
        'town-hall',
        { ...META, offersRunes: true, wares: [{ ref: 'antidote' }] },
      ]);
    });
  });

  describe('service offerings (#857 S1)', () => {
    // The Spellcasting/Runesmithing toggles share "Offered"/"None" button text,
    // so scope each lookup to its labelled group.
    const seg = (group, btn) =>
      within(screen.getByRole('group', { name: group })).getByRole('button', { name: btn });

    it('derives the toggles from stock when no explicit flag is stored', () => {
      // A runestone ware ⇒ Runesmithing on; no scroll/wand offering ⇒ Spellcasting off.
      setup({ 'bottled-solutions': { wares: [{ ref: 'runestone', runeRef: 'flaming' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(seg('Runesmithing', 'Offered')).toHaveAttribute('aria-pressed', 'true');
      expect(seg('Spellcasting', 'None')).toHaveAttribute('aria-pressed', 'true');
    });

    it('derives Spellcasting on from a stored spell-item offering', () => {
      setup({ 'bottled-solutions': { wares: [{ spellItem: 'scroll', maxLevel: 3 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(seg('Spellcasting', 'Offered')).toHaveAttribute('aria-pressed', 'true');
    });

    it('honors an explicit flag over the derived stock value', () => {
      // offersRunes:false beats a stocked runestone; offersSpellcasting:true with no offering.
      setup({
        'bottled-solutions': {
          offersRunes: false,
          offersSpellcasting: true,
          wares: [{ ref: 'runestone', runeRef: 'flaming' }],
        },
      });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(seg('Runesmithing', 'None')).toHaveAttribute('aria-pressed', 'true');
      expect(seg('Spellcasting', 'Offered')).toHaveAttribute('aria-pressed', 'true');
    });

    it('toggles and publishes the explicit service flags', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.click(seg('Spellcasting', 'Offered'));
      fireEvent.click(seg('Runesmithing', 'Offered'));
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual([
        'bottled-solutions',
        { ...META, offersSpellcasting: true, offersRunes: true, wares: [{ ref: 'antidote' }] },
      ]);
    });
  });

  describe('navigation', () => {
    it('the back button returns to the finder', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(screen.getByTestId('shop-workspace-bottled-solutions')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByText('Which location are you stocking?')).toBeInTheDocument();
    });

    it('Remove shop deletes the entry and returns to the finder', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'antidote' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.click(screen.getByRole('button', { name: 'Remove shop' }));
      expect(removeShop).toHaveBeenCalledWith('bottled-solutions');
      expect(screen.getByText('Which location are you stocking?')).toBeInTheDocument();
    });
  });
});
