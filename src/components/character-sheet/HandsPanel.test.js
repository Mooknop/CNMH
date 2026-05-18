import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import HandsPanel from './HandsPanel';

// Shared in-memory loadout store so the real useCharacter (effective tree) and
// HandsPanel react together — a faithful end-to-end of the live layer without
// a real WebSocket.
jest.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => {
      subs.add(force);
      return () => subs.delete(force);
    }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    default: useSyncedState,
    __reset: () => Object.keys(store).forEach((k) => delete store[k]),
  };
});
const { __reset } = require('../../hooks/useSyncedState');

const character = () => ({
  id: 'hero',
  name: 'Hero',
  level: 1,
  abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  inventory: [
    { uid: 'h-0', ref: 'sword', name: 'Longsword', weight: 1, quantity: 1 },
    {
      uid: 'h-1',
      ref: 'backpack',
      name: 'Backpack',
      weight: 0.1,
      quantity: 1,
      container: {
        capacity: 4,
        ignored: 2,
        contents: [{ uid: 'h-2', ref: 'torch', name: 'Torch', weight: 0.1, quantity: 5 }],
      },
    },
  ],
  feats: [],
});

beforeEach(() => __reset());
afterEach(() => jest.restoreAllMocks());

const badge = (uid) => screen.getByTestId(`hands-${uid}-badge`).textContent;

describe('HandsPanel', () => {
  it('renders the effective tree with derived state badges and empty hands', () => {
    render(<HandsPanel character={character()} />);
    expect(badge('h-0')).toBe('Worn');
    expect(badge('h-1')).toBe('Worn'); // the backpack itself
    expect(badge('h-2')).toBe('Stowed'); // torch inside it
    expect(screen.getByTestId('hands-summary')).toHaveTextContent('Both hands free');
  });

  it('holds an item in two hands and reflects it in the summary', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.change(screen.getByLabelText('hands-h-0-state'), { target: { value: 'held2' } });
    expect(badge('h-0')).toBe('Held in 2 Hands');
    expect(screen.getByTestId('hands-summary')).toHaveTextContent('Longsword (Held in 2 Hands)');
  });

  it('drops an item', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.change(screen.getByLabelText('hands-h-0-state'), { target: { value: 'dropped' } });
    expect(badge('h-0')).toBe('Dropped');
  });

  it('stows a carried item into a container (becomes Stowed under it)', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.change(screen.getByLabelText('hands-h-0-location'), { target: { value: 'h-1' } });
    // sword is now stowed; its row renders with a Retrieve control
    expect(badge('h-0')).toBe('Stowed');
    expect(screen.getByTestId('hands-h-0-retrieve')).toBeInTheDocument();
  });

  it('retrieves a stowed item back onto the person (→ Worn)', () => {
    render(<HandsPanel character={character()} />);
    expect(badge('h-2')).toBe('Stowed');
    fireEvent.click(screen.getByTestId('hands-h-2-retrieve'));
    expect(badge('h-2')).toBe('Worn');
    // it now has a state selector (it is on-person)
    expect(screen.getByLabelText('hands-h-2-state')).toBeInTheDocument();
  });

  it('un-holding returns an item to Worn (not held, not dropped)', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.change(screen.getByLabelText('hands-h-0-state'), { target: { value: 'held1' } });
    expect(badge('h-0')).toBe('Held in 1 Hand');
    fireEvent.change(screen.getByLabelText('hands-h-0-state'), { target: { value: 'worn' } });
    expect(badge('h-0')).toBe('Worn');
  });

  it('Reset to GM loadout clears every live change after confirmation', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.change(screen.getByLabelText('hands-h-0-state'), { target: { value: 'dropped' } });
    expect(badge('h-0')).toBe('Dropped');

    fireEvent.click(screen.getByTestId('hands-reset'));
    expect(
      screen.getByText(/Discard all live hand\/placement changes/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(badge('h-0')).toBe('Worn'); // back to authored
  });

  it('shows informational 1-/2-action guidance', () => {
    render(<HandsPanel character={character()} />);
    expect(screen.getByText(/draw \/ sheathe/i)).toBeInTheDocument();
    expect(screen.getByText(/retrieve from a container/i)).toBeInTheDocument();
  });
});
