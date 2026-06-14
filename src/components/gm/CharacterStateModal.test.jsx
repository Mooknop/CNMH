import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
// Shared mock state must be hoisted (vi.mock factories run before imports).
const h = vi.hoisted(() => {
  const sessionStore = {};
  const updates = [];
  const appendEvent = vi.fn();
  // Function identities are stable across renders (the real SessionContext
  // memoises with useCallback); fresh closures would loop useCharacterLiveState.
  const sessionApi = {
    connected: true,
    getAllState: (id) => sessionStore[id],
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
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { year: 4725, month: 0, day: 1 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));

import { useContent } from '../../contexts/ContentContext';
import CharacterStateModal from './CharacterStateModal';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'jade', name: 'Jade', spellcasting: { focus: { max: 3 }, spell_slots: { 1: 3, 2: 2 } } },
  { id: 'pellias', name: 'Pellias' },
];

const select = (id) =>
  fireEvent.change(screen.getByLabelText('select character'), { target: { value: id } });
const lastUpdate = (type) => [...h.updates].reverse().find((u) => u.type === type);
const logText = () => h.appendEvent.mock.calls.map((c) => c[0].text).join(' | ');

beforeEach(() => {
  Object.keys(h.sessionStore).forEach((k) => delete h.sessionStore[k]);
  h.updates.length = 0;
  h.appendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

// ─── read view ───────────────────────────────────────────────
describe('CharacterStateModal — read', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CharacterStateModal isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows grouped state with friendly remaining/max for pools', () => {
    h.sessionStore.jade = { focus: 1, slots: { 1: 1, 2: 0 } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    expect(within(screen.getByTestId('cs-row-focus')).getByText('2/3')).toBeInTheDocument();
    const slots = screen.getByTestId('cs-row-slots');
    expect(within(slots).getByText('2/3')).toBeInTheDocument(); // R1
    expect(within(slots).getByText('2/2')).toBeInTheDocument(); // R2
  });

  it('empty-state message when the PC has no live state', () => {
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('pellias');
    expect(screen.getByText(/no live state recorded/i)).toBeInTheDocument();
  });
});

// ─── edits ───────────────────────────────────────────────────
describe('CharacterStateModal — edits', () => {
  beforeEach(() => { useContent.mockReturnValue({ characters: CHARACTERS }); });

  it('restoring a focus point writes spent and logs remaining/max', () => {
    h.sessionStore.jade = { focus: 1 }; // remaining 2/3
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByLabelText('restore Focus points'));
    expect(lastUpdate('focus').value).toBe(0); // remaining 3 → spent 0
    expect(logText()).toMatch(/Focus points to 3\/3/);
  });

  it('spending a focus point increments spent', () => {
    h.sessionStore.jade = { focus: 1 };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByLabelText('spend Focus points'));
    expect(lastUpdate('focus').value).toBe(2); // remaining 1 → spent 2
  });

  it('toggling an aura on writes active=true and logs', () => {
    h.sessionStore.jade = { aura: { active: false } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByLabelText('toggle Aura'));
    expect(lastUpdate('aura').value.active).toBe(true);
    expect(logText()).toMatch(/turned Aura on/);
  });

  it('clearing a stance writes the idle shape', () => {
    h.sessionStore.jade = { stance: { active: true, name: 'Mountain Stance' } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByLabelText('clear Stance'));
    expect(lastUpdate('stance').value).toEqual({ active: false, name: null, ts: 0 });
  });

  it('removing a condition drops just that item', () => {
    h.sessionStore.jade = { conditions: [{ id: 'frightened', value: 2 }, { id: 'prone' }] };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByLabelText('remove frightened 2'));
    expect(lastUpdate('conditions').value).toEqual([{ id: 'prone' }]);
    expect(logText()).toMatch(/removed frightened 2/);
  });

  it('raw JSON editor saves valid input and rejects invalid', () => {
    h.sessionStore.jade = { somethingNew: { foo: 1 } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    const row = screen.getByTestId('cs-raw-somethingNew');
    const textarea = within(row).getByLabelText('somethingNew raw json');

    // invalid → error, no write
    fireEvent.change(textarea, { target: { value: 'not json' } });
    fireEvent.click(within(row).getByText('Save'));
    expect(within(row).getByRole('alert')).toHaveTextContent(/invalid json/i);
    expect(lastUpdate('somethingNew')).toBeUndefined();

    // valid → writes parsed value
    fireEvent.change(textarea, { target: { value: '{"foo":2}' } });
    fireEvent.click(within(row).getByText('Save'));
    expect(lastUpdate('somethingNew').value).toEqual({ foo: 2 });
  });
});

// ─── presets ─────────────────────────────────────────────────
describe('CharacterStateModal — presets', () => {
  beforeEach(() => { useContent.mockReturnValue({ characters: CHARACTERS }); });

  it('Reset turn writes a fresh turn state with reaction available', () => {
    h.sessionStore.jade = { turnstate: { actionsSpent: 2, reactionSpent: true } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByRole('button', { name: 'Reset turn' }));
    const ts = lastUpdate('turnstate').value;
    expect(ts.actionsSpent).toBe(0);
    expect(ts.reactionAvailable).toBe(true);
    expect(ts.reactionSpent).toBe(false);
    expect(logText()).toMatch(/reset Jade's turn/);
  });

  it('Full restore runs daily prep after confirmation', () => {
    h.sessionStore.jade = { focus: 2, slots: { 1: 1 } };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByRole('button', { name: 'Full restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' })); // confirm
    expect(lastUpdate('focus').value).toBe(0);
    expect(lastUpdate('slots').value).toEqual({ 1: 0 });
    expect(logText()).toMatch(/daily preparations for Jade/);
  });

  it('Clear combat state clears the encounter-scoped keys after confirmation', () => {
    h.sessionStore.jade = {
      stance: { active: true, name: 'X' },
      aura: { active: true },
      huntprey: { targetName: 'Goblin' },
      sustains: [{ spellName: 'Bless' }],
      turnstate: { actionsSpent: 3 },
    };
    render(<CharacterStateModal isOpen onClose={() => {}} />);
    select('jade');
    fireEvent.click(screen.getByRole('button', { name: 'Clear combat state' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' })); // confirm
    expect(lastUpdate('stance').value).toEqual({ active: false, name: null, ts: 0 });
    expect(lastUpdate('aura').value.active).toBe(false);
    expect(lastUpdate('huntprey').value).toBeNull();
    expect(lastUpdate('sustains').value).toEqual([]);
    expect(lastUpdate('turnstate').value.actionsSpent).toBe(0);
    expect(logText()).toMatch(/cleared combat state for Jade/);
  });
});
