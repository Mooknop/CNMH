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

    it('collapses a uniform cap to a scalar and omits targets when all are chosen', () => {
      open();
      const targets = ['weapon', 'armor', 'shield', 'ring', 'accessory'];
      targets.forEach((t) => fireEvent.click(screen.getByLabelText(`rune-target-${t}`)));
      targets.forEach((t) =>
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

    it('summarises the auto-stocked base gear for a specific-target service (#1044)', () => {
      // A clothing host in the catalog + a clothing-usage accessory rune in the
      // window → one auto-stocked base item.
      setup({ 'town-hall': { wares: [] } });
      useContent.mockReturnValue({
        allLoreEntries,
        items: [...items, { id: 'cloak', name: 'Cloak', price: 0.5, weight: 0.1, accessoryTags: ['cloak', 'clothing'] }],
        runes: [...runeSet, { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', level: 3, price: 50, usage: ['clothing'] }],
        spells,
      });
      render(<GmShops />);
      select('Town Hall');
      fireEvent.click(screen.getByLabelText('rune-target-accessory'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-accessory'), { target: { value: '5' } });
      expect(screen.getByTestId('rune-host-summary')).toHaveTextContent('Also auto-stocks 1 base gear item');
    });

    it('notes the general runesmith exemption when every target is enabled (#1044)', () => {
      open();
      ['weapon', 'armor', 'shield', 'ring', 'accessory'].forEach((t) => fireEvent.click(screen.getByLabelText(`rune-target-${t}`)));
      expect(screen.getByTestId('rune-host-summary')).toHaveTextContent('General runesmith');
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

  describe('sale shelf (#1136)', () => {
    // A weapon host + an in-window weapon rune so a rune roll always lands.
    const longsword = { id: 'longsword', name: 'Longsword', price: 1, strikes: [{ name: 'Longsword', damage: '1d8' }] };
    const flaming = { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500 };
    const saleContent = { allLoreEntries, items: [longsword], runes: [flaming], spells };

    const open = (shops = { 'town-hall': { wares: [] } }, content = saleContent) => {
      setup(shops);
      useContent.mockReturnValue(content);
      render(<GmShops />);
      select('Town Hall');
    };
    const section = () => screen.getByTestId('sale-shelf');
    const lastWares = () => lastSave()[1].wares;
    const lastShelf = () => lastSave()[1].saleShelf;

    it('prompts to enable a service before any sale controls show', () => {
      open();
      expect(within(section()).getByTestId('sale-shelf-noservice')).toBeInTheDocument();
      expect(screen.queryByLabelText('sale-rune-count')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('sale-scroll-packs')).not.toBeInTheDocument();
    });

    it('reveals rune sale controls once a rune target is enabled', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      expect(within(section()).getByLabelText('sale-rune-count')).toBeInTheDocument();
      expect(within(section()).getByLabelText('sale-rune-discount')).toBeInTheDocument();
      expect(screen.queryByLabelText('sale-scroll-packs')).not.toBeInTheDocument();
    });

    it('reveals the scroll-pack control once scrolls are offered', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      expect(within(section()).getByLabelText('sale-scroll-packs')).toBeInTheDocument();
      expect(screen.queryByLabelText('sale-rune-count')).not.toBeInTheDocument();
    });

    it('persists saleCount + a fractional saleDiscount on the rune offering', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '20' } });
      fireEvent.change(screen.getByLabelText('sale-rune-count'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('sale-rune-discount'), { target: { value: '25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 2, saleDiscount: 0.25 },
      ]);
    });

    it('persists salePacks on the scroll offering only', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      fireEvent.click(screen.getByLabelText('spell-kind-wand'));
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('sale-scroll-packs'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { spellItem: 'scroll', maxLevel: 5, salePacks: 3 },
        { spellItem: 'wand', maxLevel: 5 },
      ]);
    });

    it('backfills stored sale config into the controls (fraction → percent)', () => {
      open({
        'town-hall': {
          wares: [
            { runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 2, saleDiscount: 0.2 },
            { spellItem: 'scroll', maxLevel: 5, salePacks: 4 },
          ],
        },
      });
      expect(within(section()).getByLabelText('sale-rune-count')).toHaveValue(2);
      expect(within(section()).getByLabelText('sale-rune-discount')).toHaveValue(20);
      expect(within(section()).getByLabelText('sale-scroll-packs')).toHaveValue(4);
    });

    it('gates the roll button on a configured count', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '20' } });
      expect(screen.getByRole('button', { name: 'Roll sale shelf' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('sale-rune-count'), { target: { value: '2' } });
      expect(screen.getByRole('button', { name: 'Roll sale shelf' })).not.toBeDisabled();
    });

    it('rolls saleCount rune items and publishes them onto the entry', () => {
      open();
      fireEvent.click(screen.getByLabelText('rune-target-weapon'));
      fireEvent.change(screen.getByLabelText('rune-maxlevel-weapon'), { target: { value: '20' } });
      fireEvent.change(screen.getByLabelText('sale-rune-count'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Roll sale shelf' }));
      const shelf = lastShelf();
      expect(shelf).toHaveLength(2);
      shelf.forEach((w) => {
        expect(w.sale).toBe('rune');
        expect(w.ref).toBe('longsword');
        expect(w.saleId).toBeTruthy();
      });
      // The roll publishes the offering config alongside the shelf.
      expect(lastWares()).toEqual([{ runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 2 }]);
    });

    it('rolls salePacks scroll packs', () => {
      open();
      fireEvent.click(screen.getByLabelText('spell-kind-scroll'));
      fireEvent.change(screen.getByLabelText('spell-maxlevel'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('sale-scroll-packs'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Roll sale shelf' }));
      const shelf = lastShelf();
      expect(shelf).toHaveLength(3);
      shelf.forEach((w) => expect(w.sale).toBe('scrollpack'));
    });

    it('previews a stored shelf with a discounted price + struck-through full price, and clears it', () => {
      open({
        'town-hall': {
          wares: [{ runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 1 }],
          saleShelf: [
            { sale: 'rune', saleId: 'w1', ref: 'longsword', runes: { potency: 1, property: ['flaming'] }, fullPrice: 1000, price: 800 },
          ],
        },
      });
      const preview = screen.getByLabelText('sale shelf');
      const item = within(preview).getByTestId('sale-item-sale-w1');
      expect(item).toHaveTextContent('Longsword');
      expect(within(item).getByText('1000 gp')).toBeInTheDocument();
      expect(within(item).getByText('800 gp')).toBeInTheDocument();
      // The reroll label reflects an existing shelf; Clear empties it.
      expect(screen.getByRole('button', { name: 'Reroll sale shelf' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Clear shelf' }));
      expect(lastSave()).toEqual(['town-hall', { saleShelf: [] }]);
    });

    describe('per-item customization', () => {
      const runeWares = [{ runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 2 }];
      const w1 = { sale: 'rune', saleId: 'w1', ref: 'longsword', runes: { potency: 1 }, fullPrice: 100, price: 100 };
      const w2 = { sale: 'rune', saleId: 'w2', ref: 'longsword', runes: { potency: 2 }, fullPrice: 200, price: 200 };

      it('renders per-item edit / reroll / remove controls', () => {
        open({ 'town-hall': { wares: runeWares, saleShelf: [w1] } });
        expect(screen.getByLabelText('sale-edit-w1')).toBeInTheDocument();
        expect(screen.getByLabelText('sale-reroll-w1')).toBeInTheDocument();
        expect(screen.getByLabelText('sale-remove-w1')).toBeInTheDocument();
      });

      it('removes a single item, writing only the shelf', () => {
        open({ 'town-hall': { wares: runeWares, saleShelf: [w1, w2] } });
        fireEvent.click(screen.getByLabelText('sale-remove-w1'));
        expect(lastSave()).toEqual(['town-hall', { saleShelf: [w2] }]);
      });

      it('rerolls a single item in place, keeping its saleId and leaving others alone', () => {
        open({ 'town-hall': { wares: runeWares, saleShelf: [w1, w2] } });
        fireEvent.click(screen.getByLabelText('sale-reroll-w1'));
        const next = lastShelf();
        expect(next).toHaveLength(2);
        expect(next[0].saleId).toBe('w1');
        expect(next[0].sale).toBe('rune');
        expect(next[1]).toEqual(w2);
      });

      it('edits a rune item to a chosen potency + property and rebuilds it at the discount', () => {
        open({
          'town-hall': {
            wares: [{ runeService: true, targets: ['weapon'], maxLevel: 20, saleCount: 1, saleDiscount: 0.5 }],
            saleShelf: [w1],
          },
        });
        fireEvent.click(screen.getByLabelText('sale-edit-w1'));
        expect(screen.getByTestId('sale-editor-w1')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('sale-potency'), { target: { value: '2' } });
        fireEvent.click(screen.getByLabelText('sale-prop-flaming'));
        fireEvent.click(screen.getByLabelText('sale-apply-w1'));
        const next = lastShelf();
        expect(next).toHaveLength(1);
        expect(next[0].saleId).toBe('w1');
        expect(next[0].ref).toBe('longsword');
        expect(next[0].runes.potency).toBe(2);
        expect(next[0].runes.property).toEqual(['flaming']);
        expect(next[0].price).toBe(Math.round(next[0].fullPrice * 0.5));
      });

      it('edits a scroll pack to a chosen rank + spells and rebuilds it', () => {
        open({
          'town-hall': {
            wares: [{ spellItem: 'scroll', maxLevel: 5 }],
            saleShelf: [{ sale: 'scrollpack', saleId: 'p1', rank: 1, scrolls: [{ spellRef: 'heal' }], fullPrice: 16, price: 12 }],
          },
        });
        fireEvent.click(screen.getByLabelText('sale-edit-p1'));
        fireEvent.change(screen.getByLabelText('sale-rank'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('sale-scroll-0'), { target: { value: 'fireball' } });
        fireEvent.change(screen.getByLabelText('sale-scroll-1'), { target: { value: 'haste' } });
        fireEvent.click(screen.getByLabelText('sale-apply-p1'));
        const next = lastShelf();
        expect(next[0].saleId).toBe('p1');
        expect(next[0].rank).toBe(3);
        expect(next[0].scrolls).toHaveLength(4);
        expect(next[0].scrolls[0].spellRef).toBe('fireball');
        expect(next[0].scrolls[1].spellRef).toBe('haste');
      });
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

describe('GmShops — dragonbreath weapons (#1210 M4g)', () => {
  const longsword = { id: 'longsword', name: 'Longsword', price: 1, weight: 1, traits: ['Sword'], strikes: [{ name: 'Longsword', damage: '1d8' }] };
  const open = (shops = { 'town-hall': { wares: [] } }) => {
    setup(shops);
    useContent.mockReturnValue({ allLoreEntries, items: [...items, longsword], runes, spells });
    render(<GmShops />);
    select('Town Hall');
  };
  const lastWares = () => lastSave()[1].wares;
  const section = () => screen.getByTestId('dragonbreath-offerings');

  it('shows the empty prompt until a weapon is added', () => {
    open();
    expect(within(section()).getByTestId('dragonbreath-empty')).toBeInTheDocument();
  });

  it('adds a dragonbreath weapon and persists the { ref, dragonbreath } ware', () => {
    open();
    fireEvent.click(screen.getByTestId('db-add'));
    fireEvent.change(screen.getByLabelText('db-base-0'), { target: { value: 'longsword' } });
    fireEvent.change(screen.getByLabelText('db-tier-0'), { target: { value: 'greater' } });
    fireEvent.change(screen.getByLabelText('db-type-0'), { target: { value: 'Red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    expect(lastWares()).toEqual([{ ref: 'longsword', dragonbreath: { tier: 'greater', dragonType: 'Red' } }]);
  });

  it('carries a price + stock override and shows a live preview name', () => {
    open();
    fireEvent.click(screen.getByTestId('db-add'));
    fireEvent.change(screen.getByLabelText('db-type-0'), { target: { value: 'Mirage' } });
    fireEvent.change(screen.getByLabelText('db-price-0'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('db-stock-0'), { target: { value: '2' } });
    expect(screen.getByTestId('db-row-0')).toHaveTextContent('Mirage Dragonbreath Longsword');
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    expect(lastWares()).toEqual([{ ref: 'longsword', dragonbreath: { tier: 'base', dragonType: 'Mirage' }, price: 500, stock: 2 }]);
  });

  it('round-trips an authored dragonbreath ware into an editable row', () => {
    open({ 'town-hall': { wares: [{ ref: 'longsword', dragonbreath: { tier: 'major', dragonType: 'Gold' } }] } });
    expect(screen.getByLabelText('db-base-0')).toHaveValue('longsword');
    expect(screen.getByLabelText('db-tier-0')).toHaveValue('major');
    expect(screen.getByLabelText('db-type-0')).toHaveValue('Gold');
  });

  it('removes a dragonbreath row', () => {
    open({ 'town-hall': { wares: [{ ref: 'longsword', dragonbreath: { tier: 'base', dragonType: 'Red' } }] } });
    fireEvent.click(screen.getByLabelText('db-remove-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    expect(lastWares()).toEqual([]);
  });
});
