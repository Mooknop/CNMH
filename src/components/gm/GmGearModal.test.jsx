import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

const h = vi.hoisted(() => {
  const sessionStore = {};
  const updates = [];
  const appendEvent = vi.fn();
  const sessionApi = {
    connected: true,
    getState: (id, type) => sessionStore[id]?.[type],
    sendUpdate: (id, type, value) => {
      if (!sessionStore[id]) sessionStore[id] = {};
      sessionStore[id][type] = value;
      updates.push({ id, type, value });
    },
    subscribe: () => () => {},
  };
  return { sessionStore, updates, appendEvent, sessionApi };
});

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/SessionContext', () => ({ useSession: () => h.sessionApi }));
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: h.appendEvent, log: [] }),
}));
// useCharacter resolves the selected character's inventory from a fixture map.
const INV = {
  pellias: [
    { uid: 'w1', name: 'Longsword', strikes: [{ damage: '1d8' }] },
    { uid: 's1', name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10 } },
    { uid: 't1', name: 'Wolf Fang', traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'weapon' } },
    { uid: 'spk', name: 'Shield Spikes', attachment: { to: 'shield' }, strikes: [{ damage: '1d6' }] },
  ],
  jade: [],
};
vi.mock('../../hooks/useCharacter', () => ({
  default: (c) => (c ? { ...c, inventory: INV[c.id] || [] } : null),
}));

import { useContent } from '../../contexts/ContentContext';
import GmGearModal from './GmGearModal';

const CHARACTERS = [{ id: 'pellias', name: 'Pellias' }, { id: 'jade', name: 'Jade' }];
const select = (id) => fireEvent.change(screen.getByLabelText('select character'), { target: { value: id } });
const lastUpdate = (type) => [...h.updates].reverse().find((u) => u.type === type);
const logText = () => h.appendEvent.mock.calls.map((c) => c[0].text).join(' | ');
const open = () => render(<GmGearModal isOpen onClose={vi.fn()} />);

beforeEach(() => {
  Object.keys(h.sessionStore).forEach((k) => delete h.sessionStore[k]);
  h.updates.length = 0;
  h.appendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
});
afterEach(() => vi.restoreAllMocks());

describe('GmGearModal', () => {
  it('lists a character\'s talismans and shield attachments', () => {
    open();
    select('pellias');
    expect(screen.getByRole('heading', { name: 'Talismans' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shield Attachments' })).toBeInTheDocument();
    expect(screen.getByLabelText('host for Wolf Fang')).toBeInTheDocument();
    expect(screen.getByLabelText('host for Shield Spikes')).toBeInTheDocument();
  });

  it('affixes a talisman only to type-matching hosts, instantly, and logs it', () => {
    open();
    select('pellias');
    const sel = screen.getByLabelText('host for Wolf Fang');
    // affixTo:'weapon' → Longsword offered, the shield is not.
    expect(within(sel).getByRole('option', { name: 'Longsword' })).toBeInTheDocument();
    expect(within(sel).queryByRole('option', { name: 'Steel Shield' })).not.toBeInTheDocument();

    fireEvent.change(sel, { target: { value: 'w1' } });
    expect(lastUpdate('affixed').value).toEqual({ t1: 'w1' });
    expect(logText()).toContain('GM: Pellias — affixed Wolf Fang to Longsword');
  });

  it('attaches a shield attachment to a shield host, instantly, and logs it', () => {
    open();
    select('pellias');
    const sel = screen.getByLabelText('host for Shield Spikes');
    expect(within(sel).getByRole('option', { name: 'Steel Shield' })).toBeInTheDocument();
    fireEvent.change(sel, { target: { value: 's1' } });
    expect(lastUpdate('attached').value).toEqual({ spk: 's1' });
    expect(logText()).toContain('GM: Pellias — attached Shield Spikes to Steel Shield');
  });

  it('unbinds when set back to none, seeding from the live overlay', () => {
    h.sessionStore.pellias = { attached: { spk: 's1' } };
    open();
    select('pellias');
    const sel = screen.getByLabelText('host for Shield Spikes');
    expect(sel).toHaveValue('s1'); // reflects the live binding
    fireEvent.change(sel, { target: { value: '' } });
    expect(lastUpdate('attached').value).toEqual({});
    expect(logText()).toContain('removed Shield Spikes from its shield');
  });

  it('shows an empty note when the character has no talismans or attachments', () => {
    open();
    select('jade');
    expect(screen.getByText(/no talismans or shield attachments/i)).toBeInTheDocument();
  });
});
