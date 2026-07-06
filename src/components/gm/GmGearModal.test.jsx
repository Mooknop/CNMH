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
  // A weapon already carrying +1 potency: one open property socket + an
  // upgradable potency socket, for exercising the rune board.
  runed: [
    { uid: 'rw', name: 'Rune Blade', strikes: [{ damage: '1d8' }], runes: { potency: 1 } },
  ],
  jade: [],
};

// Minimal rune catalog: a weapon property rune + a +2 weapon potency fundamental.
const RUNES = [
  { id: 'flaming', type: 'property', name: 'Flaming', level: 8, target: 'weapon' },
  { id: 'weapon-potency-2', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 2, name: '+2 Weapon Potency', level: 10 },
];
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { ...c, inventory: INV[c.id] || [] } : null),
}));

import { useContent } from '../../contexts/ContentContext';
import GmGearModal from './GmGearModal';

const CHARACTERS = [
  { id: 'pellias', name: 'Pellias' },
  { id: 'runed', name: 'Runed' },
  { id: 'jade', name: 'Jade' },
];
const select = (id) => fireEvent.change(screen.getByLabelText('select character'), { target: { value: id } });
const lastUpdate = (type) => [...h.updates].reverse().find((u) => u.type === type);
const logText = () => h.appendEvent.mock.calls.map((c) => c[0].text).join(' | ');
const open = () => render(<GmGearModal isOpen onClose={vi.fn()} />);

beforeEach(() => {
  Object.keys(h.sessionStore).forEach((k) => delete h.sessionStore[k]);
  h.updates.length = 0;
  h.appendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS, runes: RUNES });
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

  it('shows an empty note when the character has no gear', () => {
    open();
    select('jade');
    expect(screen.getByText(/no talismans, shield attachments, or runable gear/i)).toBeInTheDocument();
  });

  it('lists runable inventory with a sockets board', () => {
    open();
    select('runed');
    expect(screen.getByRole('heading', { name: 'Runes' })).toBeInTheDocument();
    expect(screen.getByTestId('rune-item-Rune Blade')).toBeInTheDocument();
    // +1 potency shows in the potency socket; the striking socket is empty.
    expect(within(screen.getByTestId('rune-socket-Rune Blade-potency')).getByText(/\+1/)).toBeInTheDocument();
  });

  it('etches a property rune instantly: mints acquired, masks the original, logs', () => {
    open();
    select('runed');
    fireEvent.change(screen.getByLabelText('property rune for Rune Blade'), { target: { value: 'flaming' } });

    const acq = lastUpdate('acquired').value;
    expect(acq).toHaveLength(1);
    expect(acq[0].uid).not.toBe('rw');
    expect(acq[0].runes.property).toContain('flaming');
    expect(lastUpdate('removed').value).toContain('rw'); // authored original masked
    expect(logText()).toContain('GM: Runed — etched Flaming onto Rune Blade');
  });

  it('upgrades a filled fundamental socket from the picker', () => {
    open();
    select('runed');
    fireEvent.change(screen.getByLabelText('potency rune for Rune Blade'), { target: { value: 'weapon-potency-2' } });
    expect(lastUpdate('acquired').value[0].runes.potency).toBe(2);
    expect(logText()).toContain('etched +2 Weapon Potency onto Rune Blade');
  });

  it('clears a filled socket, dropping its runes', () => {
    open();
    select('runed');
    fireEvent.click(screen.getByLabelText('clear potency on Rune Blade'));
    const acq = lastUpdate('acquired').value;
    expect(acq[0].runes.potency).toBeUndefined();
    expect(lastUpdate('removed').value).toContain('rw');
    expect(logText()).toContain('cleared the potency rune from Rune Blade');
  });
});
