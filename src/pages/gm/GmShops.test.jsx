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

    it('loads a pinned variant: variant name, selected level, variant price placeholder', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 3 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      expect(within(shelf()).getByText('Lesser Tonic')).toBeInTheDocument();
      expect(within(shelf()).getByLabelText('level-tonic@3')).toHaveValue('3');
      expect(within(shelf()).getByLabelText('price-tonic@3')).toHaveAttribute('placeholder', '12');
    });

    it('pins a variant level on an unleveled row and saves it with level', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'tonic' }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      fireEvent.change(screen.getByLabelText('level-tonic'), { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual(['bottled-solutions', { ...META, wares: [{ ref: 'tonic', level: 1 }] }]);
    });

    it('stocks two variants of one item as distinct rows', () => {
      setup({ 'bottled-solutions': { wares: [{ ref: 'tonic', level: 1 }] } });
      render(<GmShops />);
      select('Bottled Solutions');
      // The base 'tonic' key is free (only tonic@1 stocked), so the catalog row
      // is clickable → adds a second, unleveled row; pin it to level 3.
      fireEvent.click(screen.getByTestId('cat-tonic'));
      fireEvent.change(screen.getByLabelText('level-tonic'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastSave()).toEqual([
        'bottled-solutions',
        { ...META, wares: [{ ref: 'tonic', level: 1 }, { ref: 'tonic', level: 3 }] },
      ]);
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

  describe('spell-item offerings (#819)', () => {
    const open = (shops = { 'town-hall': { wares: [] } }) => {
      setup(shops);
      render(<GmShops />);
      select('Town Hall');
    };
    const addOffering = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Add spell-item offering' }));
    const lastWares = () => lastSave()[1].wares;

    it('shows the empty offerings prompt until one is added', () => {
      open();
      expect(screen.getByTestId('shop-offerings')).toBeInTheDocument();
      expect(screen.getByText(/No scroll or wand offerings/)).toBeInTheDocument();
    });

    it('authors an offering and persists the minimal spec (defaults omitted)', () => {
      open();
      addOffering();
      fireEvent.change(screen.getByLabelText('offering-maxrank-0'), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([{ spellItem: 'scroll', maxRank: 3 }]);
    });

    it('persists tradition + rarity subsets and a price modifier', () => {
      open();
      addOffering();
      fireEvent.change(screen.getByLabelText('offering-kind-0'), { target: { value: 'wand' } });
      fireEvent.change(screen.getByLabelText('offering-maxrank-0'), { target: { value: '5' } });
      fireEvent.click(screen.getByLabelText('offering-0-trad-arcane'));
      fireEvent.click(screen.getByLabelText('offering-0-trad-occult'));
      fireEvent.click(screen.getByLabelText('offering-0-rarity-common'));
      fireEvent.click(screen.getByLabelText('offering-0-rarity-uncommon'));
      fireEvent.change(screen.getByLabelText('offering-pricemod-0'), { target: { value: '1.2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([
        { spellItem: 'wand', maxRank: 5, traditions: ['arcane', 'occult'], rarities: ['common', 'uncommon'], priceMod: 1.2 },
      ]);
    });

    it('omits traditions when all four are selected (means all)', () => {
      open();
      addOffering();
      ['arcane', 'divine', 'occult', 'primal'].forEach((t) =>
        fireEvent.click(screen.getByLabelText(`offering-0-trad-${t}`))
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      expect(lastWares()).toEqual([{ spellItem: 'scroll', maxRank: 1 }]);
    });

    it('summarises coverage with a live eligible-spell count', () => {
      open();
      addOffering();
      fireEvent.change(screen.getByLabelText('offering-maxrank-0'), { target: { value: '3' } });
      // Scrolls, all traditions, common only, rank ≤ 3: heal, fireball, haste.
      expect(screen.getByTestId('offering-summary-0')).toHaveTextContent(
        'Scrolls · all traditions · common · up to rank 3 · 3 eligible spells'
      );
      // Raise the cap and opt into common+uncommon → the rank-5 uncommon spell
      // joins (an explicit rarity set replaces the common-only default, so common
      // must be re-selected to keep it).
      fireEvent.change(screen.getByLabelText('offering-maxrank-0'), { target: { value: '5' } });
      fireEvent.click(screen.getByLabelText('offering-0-rarity-common'));
      fireEvent.click(screen.getByLabelText('offering-0-rarity-uncommon'));
      expect(screen.getByTestId('offering-summary-0')).toHaveTextContent(
        'common+uncommon · up to rank 5 · 4 eligible spells'
      );
    });

    it('loads stored offerings alongside flat wares, leaving flat rows intact', () => {
      open({
        'town-hall': {
          wares: [
            { ref: 'antidote' },
            { spellItem: 'wand', maxRank: 5, traditions: ['arcane', 'occult'], rarities: ['common', 'uncommon'] },
          ],
        },
      });
      // Flat ware still on the shelf; spell-item ware is not a broken shelf row.
      expect(within(shelf()).getByText('Antidote')).toBeInTheDocument();
      const offers = screen.getByLabelText('spell-item offerings');
      expect(within(offers).getByLabelText('offering-kind-0')).toHaveValue('wand');
      expect(within(offers).getByLabelText('offering-maxrank-0')).toHaveValue(5);
      expect(within(offers).getByLabelText('offering-0-trad-arcane')).toHaveAttribute('aria-pressed', 'true');
      expect(within(offers).getByLabelText('offering-0-trad-divine')).toHaveAttribute('aria-pressed', 'false');
      expect(within(offers).getByLabelText('offering-0-rarity-uncommon')).toHaveAttribute('aria-pressed', 'true');
    });

    it('removes an offering and republishes the flat ware alone', () => {
      open({
        'town-hall': {
          wares: [{ ref: 'antidote' }, { spellItem: 'scroll', maxRank: 3 }],
        },
      });
      fireEvent.click(screen.getByLabelText('remove-offering-0'));
      fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
      // The scroll offering made Spellcasting derive ON at mount (#857 S1); the
      // service flag is independent of whether any scroll stays stocked (a
      // spellcasting shop can show just the locked teaser), so it persists ON.
      expect(lastSave()).toEqual([
        'town-hall',
        { ...META, offersSpellcasting: true, wares: [{ ref: 'antidote' }] },
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
      setup({ 'bottled-solutions': { wares: [{ spellItem: 'scroll', maxRank: 3 }] } });
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
