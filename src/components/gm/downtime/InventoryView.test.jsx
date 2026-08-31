import React from 'react';
import { screen, within, fireEvent } from '@testing-library/react';
import InventoryView from './InventoryView';
import {
  renderWithProviders,
  makeCharacter,
  makeItem,
} from '../../../test/renderWithProviders';

beforeEach(() => window.localStorage.clear());

// ── Catalog ────────────────────────────────────────────────────────────────
const ITEMS = [
  makeItem({ id: 'longsword', name: 'Longsword', weight: 1 }),
  makeItem({ id: 'rope', name: 'Rope', weight: 1 }),
  makeItem({ id: 'anvil', name: 'Anvil', weight: 10 }),
  makeItem({ id: 'boulder', name: 'Boulder', weight: 2 }),
  makeItem({ id: 'potion', name: 'Healing Potion', weight: 0.1, traits: ['Consumable'] }),
  makeItem({ id: 'inktattoo', name: 'Carnasia Tattoo', weight: 0, traits: ['Magical', 'Tattoo'] }),
  makeItem({
    id: 'bagofholding',
    name: 'Bag of Holding',
    weight: 0.1,
    container: { capacity: 4, ignored: 0 },
  }),
];

const entry = (uid, ref, extra = {}) => ({ uid, ref, quantity: 1, ...extra });

// Strength 10 ⇒ Bulk limit 10 for both PCs (no Hefty Hauler).
const pcA = makeCharacter({
  id: 'pc-a',
  name: 'Ashka Gosh',
  class: 'Thaumaturge',
  inventory: [
    entry('a-sword', 'longsword'),
    entry('a-boulder', 'boulder'),
    entry('a-tattoo', 'inktattoo'),
    entry('a-bag', 'bagofholding', {
      container: { contents: [entry('a-rope', 'rope')] },
    }),
  ],
});

const pcB = makeCharacter({
  id: 'pc-b',
  name: 'Blu Kakke',
  class: 'Monk',
  inventory: [entry('b-potion', 'potion', { quantity: 3 })],
});

// A PC already carrying 10 Bulk — one more Bulk-2 item tips past the limit.
const pcHeavy = makeCharacter({
  id: 'pc-h',
  name: 'Hulda Stone',
  class: 'Fighter',
  inventory: [entry('h-anvil', 'anvil')],
});

function renderInventory({ characters = [pcA, pcB], state = {} } = {}) {
  return renderWithProviders(<InventoryView />, {
    content: { character: characters, item: ITEMS },
    session: { state },
  });
}

const writesOf = (session, type) => session.sent.filter((w) => w.stateType === type);
const bar = () => document.querySelector('.dock-dt-inv-bar');

describe('InventoryView — columns', () => {
  it('renders one column per roster PC with its name and real Bulk', () => {
    renderInventory();
    const colA = screen.getByTestId('dock-dt-inv-col-pc-a');
    expect(within(colA).getByText('Ashka Gosh')).toBeInTheDocument();
    // 1 (sword) + 2 (boulder) + 0 (tattoo) + 0.1 (bag) + 1 (rope) = 4.1
    expect(screen.getByTestId('dock-dt-inv-bulk-pc-a')).toHaveTextContent('Bulk 4.1 / 10');
    expect(screen.getByTestId('dock-dt-inv-bulk-pc-b')).toHaveTextContent('Bulk 0.3 / 10');
  });

  it('flags a PC over their Bulk limit', () => {
    renderInventory({
      characters: [makeCharacter({ ...pcHeavy, inventory: [entry('h-anvil', 'anvil', { quantity: 2 })] })],
    });
    expect(screen.getByTestId('dock-dt-inv-bulk-pc-h').className).toMatch(/--over/);
  });

  it('lists real inventory entries, containers and their contents, under Stowed', () => {
    renderInventory();
    const colA = screen.getByTestId('dock-dt-inv-col-pc-a');
    ['Longsword', 'Boulder', 'Bag of Holding', 'Rope'].forEach((name) => {
      expect(within(colA).getByText(name)).toBeInTheDocument();
    });
  });

  it('shows the remaining quantity of a partially burned stack', () => {
    renderInventory({ state: { 'pc-b': { consumed: { 'b-potion': 1 } } } });
    const chip = screen.getByTestId('dock-dt-inv-item-b-potion');
    expect(chip).toHaveTextContent('2');
  });

  it('mirrors the real deriveHands state in the hands strip', () => {
    renderInventory({
      state: { 'pc-a': { loadout: { 'a-sword': { state: 'held1', hand: 2 } } } },
    });
    expect(screen.getByTestId('dock-dt-inv-hand-pc-a-2')).toHaveTextContent('Longsword');
    expect(screen.getByTestId('dock-dt-inv-hand-pc-a-1')).toHaveTextContent('empty');
    // A held item leaves the stowed list.
    const colA = screen.getByTestId('dock-dt-inv-col-pc-a');
    expect(within(colA).queryByTestId('dock-dt-inv-item-a-sword')).not.toBeInTheDocument();
  });
});

describe('InventoryView — selection', () => {
  it('holds an item on tap and releases it on a second tap', () => {
    renderInventory();
    expect(within(bar()).getByText('nothing selected')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    expect(within(bar()).getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByTestId('dock-dt-inv-item-a-sword')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    expect(within(bar()).getByText('nothing selected')).toBeInTheDocument();
  });

  it('clears the selection from the bar Clear button', () => {
    renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(within(bar()).getByText('nothing selected')).toBeInTheDocument();
  });

  it('activates only the OTHER columns destination buttons', () => {
    renderInventory();
    expect(screen.getByTestId('dock-dt-inv-give-pc-b')).toBeDisabled();
    expect(screen.getByTestId('dock-dt-inv-give-pc-b')).toHaveTextContent('Tap an item to move it');

    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    expect(screen.getByTestId('dock-dt-inv-give-pc-b')).toBeEnabled();
    expect(screen.getByTestId('dock-dt-inv-give-pc-b')).toHaveTextContent('Give to Blu');
    // The owner's own column stays inert.
    expect(screen.getByTestId('dock-dt-inv-give-pc-a')).toBeDisabled();
  });

  it('selects a held item straight from the hands strip', () => {
    renderInventory({
      state: { 'pc-a': { loadout: { 'a-sword': { state: 'held1', hand: 1 } } } },
    });
    fireEvent.click(screen.getByTestId('dock-dt-inv-hand-pc-a-1'));
    expect(within(bar()).getByText('Longsword')).toBeInTheDocument();
  });
});

describe('InventoryView — giving', () => {
  it('credits the recipient then debits the giver, both forced', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-b'));

    const credit = writesOf(session, 'acquired')[0];
    const debit = writesOf(session, 'removed')[0];
    expect(credit.characterId).toBe('pc-b');
    expect(credit.value[0]).toMatchObject({ name: 'Longsword' });
    expect(credit.options).toEqual({ force: true });
    expect(debit).toMatchObject({ characterId: 'pc-a', value: ['a-sword'] });
    expect(debit.options).toEqual({ force: true });

    // Credit-before-debit: the recipient is paid first.
    expect(session.sent.indexOf(credit)).toBeLessThan(session.sent.indexOf(debit));
  });

  it('clears the selection and logs the move', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-b'));

    expect(within(bar()).getByText('nothing selected')).toBeInTheDocument();
    const log = writesOf(session, 'sessionlog').at(-1);
    expect(log.value[0].text).toBe('GM moved Longsword from Ashka Gosh to Blu Kakke');
  });

  it('hands over a container with its whole subtree', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-bag'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-b'));

    const credit = writesOf(session, 'acquired')[0];
    expect(credit.value[0].container.contents[0]).toMatchObject({ name: 'Rope' });
    expect(writesOf(session, 'removed')[0].value).toEqual(['a-bag', 'a-rope']);
  });

  it('gives only the un-burned remainder of a consumable stack', () => {
    const { session } = renderInventory({
      characters: [pcB, pcA],
      state: { 'pc-b': { consumed: { 'b-potion': 1 } } },
    });
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-b-potion'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-a'));
    expect(writesOf(session, 'acquired')[0].value[0]).toMatchObject({ quantity: 2 });
  });

  it('refuses a move that would put the recipient over their Bulk limit', () => {
    const { session } = renderInventory({ characters: [pcA, pcHeavy] });
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-boulder'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-h'));

    expect(screen.getByRole('alert')).toHaveTextContent(/Hulda Stone can't take Boulder/);
    expect(writesOf(session, 'acquired')).toHaveLength(0);
    expect(writesOf(session, 'removed')).toHaveLength(0);
    // The selection survives a refusal so the GM can pick another destination.
    expect(within(bar()).getByText('Boulder')).toBeInTheDocument();
  });

  it('refuses body-bound gear inline', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-tattoo'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-b'));

    expect(screen.getByRole('alert')).toHaveTextContent(/tattooed/i);
    expect(writesOf(session, 'acquired')).toHaveLength(0);
  });

  it('refuses an affix-entangled item inline', () => {
    const { session } = renderInventory({
      state: { 'pc-a': { affixed: { 'talisman-1': 'a-sword' } } },
    });
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    fireEvent.click(screen.getByTestId('dock-dt-inv-give-pc-b'));

    expect(screen.getByRole('alert')).toHaveTextContent(/affix/i);
    expect(writesOf(session, 'acquired')).toHaveLength(0);
  });
});

describe('InventoryView — placement', () => {
  it('puts the held item in a free hand', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));
    fireEvent.click(screen.getByRole('button', { name: 'To hand 1' }));

    const write = writesOf(session, 'loadout')[0];
    expect(write).toMatchObject({ characterId: 'pc-a' });
    expect(write.value['a-sword']).toEqual({ state: 'held1', hand: 1, container: null });
    expect(within(bar()).getByText('nothing selected')).toBeInTheDocument();
  });

  it('refuses a hand that is already holding something else', () => {
    const { session } = renderInventory({
      state: { 'pc-a': { loadout: { 'a-sword': { state: 'held1', hand: 1 } } } },
    });
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-boulder'));
    fireEvent.click(screen.getByRole('button', { name: 'To hand 1' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/hand 1 is holding Longsword/);
    expect(writesOf(session, 'loadout')).toHaveLength(0);
  });

  it('refuses to put a container in a hand', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-bag'));
    fireEvent.click(screen.getByRole('button', { name: 'To hand 2' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/container/i);
    expect(writesOf(session, 'loadout')).toHaveLength(0);
  });

  it('offers one Stow button per container the OWNER carries, and stows into it', () => {
    const { session } = renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-sword'));

    fireEvent.click(screen.getByRole('button', { name: 'Stow in Bag of Holding' }));
    const write = writesOf(session, 'loadout')[0];
    expect(write.value['a-sword']).toEqual({ state: 'worn', container: 'a-bag' });
  });

  it('offers no Stow button for a PC with no container', () => {
    renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-b-potion'));
    expect(screen.queryByRole('button', { name: /^Stow in/ })).not.toBeInTheDocument();
  });

  it('does not offer to stow a container inside itself', () => {
    renderInventory();
    fireEvent.click(screen.getByTestId('dock-dt-inv-item-a-bag'));
    expect(screen.queryByRole('button', { name: 'Stow in Bag of Holding' })).not.toBeInTheDocument();
  });
});

describe('InventoryView — no scrolling', () => {
  it('paginates an overlong stowed list instead of growing the column', () => {
    const many = makeCharacter({
      id: 'pc-m',
      name: 'Mule Bearer',
      inventory: Array.from({ length: 15 }, (_, i) => entry(`m-${i}`, 'potion')),
    });
    renderInventory({ characters: [many] });

    const col = screen.getByTestId('dock-dt-inv-col-pc-m');
    expect(col.querySelectorAll('.dock-dt-inv-item')).toHaveLength(12);
    expect(within(col).getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next stowed page for Mule Bearer'));
    expect(col.querySelectorAll('.dock-dt-inv-item')).toHaveLength(3);
    expect(within(col).getByText('2 / 2')).toBeInTheDocument();
  });

  it('shows no pager when everything fits', () => {
    renderInventory();
    expect(screen.queryByLabelText(/stowed page/)).not.toBeInTheDocument();
  });
});
