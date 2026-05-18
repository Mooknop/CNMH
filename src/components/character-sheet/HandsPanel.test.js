import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import HandsPanel from './HandsPanel';

// Shared in-memory loadout store so the real useCharacter (effective tree),
// useLoadout (writer) and the panel all react together — a faithful
// end-to-end of the live layer without a real WebSocket.
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
    __set: (k, v) => {
      store[k] = v;
    },
    __get: (k) => store[k],
  };
});
const sync = require('../../hooks/useSyncedState');

const character = () => ({
  id: 'hero',
  name: 'Hero',
  level: 1,
  abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  inventory: [
    { uid: 'h-0', ref: 'sword', name: 'Longsword', weight: 1, quantity: 1 },
    { uid: 'h-1', ref: 'shield', name: 'Shield', weight: 1, quantity: 1 },
    { uid: 'h-2', ref: 'dagger', name: 'Dagger', weight: 0.1, quantity: 1 },
  ],
  feats: [],
});

beforeEach(() => sync.__reset());
afterEach(() => jest.restoreAllMocks());

const slot = (n) => screen.getByTestId(`hands-slot-${n}`).textContent;

describe('HandsPanel (slots + SWAP)', () => {
  it('shows two empty slots and a Swap button when nothing is held', () => {
    render(<HandsPanel character={character()} />);
    expect(slot(1)).toMatch(/Hand 1.*Empty/);
    expect(slot(2)).toMatch(/Hand 2.*Empty/);
    expect(screen.getByTestId('hands-swap')).toBeInTheDocument();
  });

  it('reflects already-held items from the effective tree in the slots', () => {
    sync.__set('cnmh_loadout_hero', {
      'h-0': { state: 'held1', hand: 1 },
      'h-1': { state: 'held1', hand: 2 },
    });
    render(<HandsPanel character={character()} />);
    expect(slot(1)).toMatch(/Longsword/);
    expect(slot(2)).toMatch(/Shield/);
  });

  it('SWAP → assign one item per hand → Confirm puts them in hand', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.click(screen.getByTestId('hands-swap'));
    fireEvent.click(screen.getByLabelText('pick-h-0-h1'));
    fireEvent.click(screen.getByLabelText('pick-h-1-h2'));
    fireEvent.click(screen.getByTestId('hands-confirm'));
    expect(slot(1)).toMatch(/Longsword/);
    expect(slot(2)).toMatch(/Shield/);
    const lo = sync.__get('cnmh_loadout_hero');
    expect(lo['h-0']).toMatchObject({ state: 'held1', hand: 1 });
    expect(lo['h-1']).toMatchObject({ state: 'held1', hand: 2 });
  });

  it('same item for both hands ⇒ Held in 2 Hands (occupies both slots)', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.click(screen.getByTestId('hands-swap'));
    fireEvent.click(screen.getByLabelText('pick-h-0-h1'));
    fireEvent.click(screen.getByLabelText('pick-h-0-h2'));
    fireEvent.click(screen.getByTestId('hands-confirm'));
    expect(slot(1)).toMatch(/Longsword/);
    expect(slot(2)).toMatch(/Longsword/);
    // stored as held2 on the single uid (occupies both hands)
    expect(sync.__get('cnmh_loadout_hero')['h-0']).toMatchObject({ state: 'held2' });
  });

  it('Cancel discards the pending selection', () => {
    render(<HandsPanel character={character()} />);
    fireEvent.click(screen.getByTestId('hands-swap'));
    fireEvent.click(screen.getByLabelText('pick-h-0-h1'));
    fireEvent.click(screen.getByTestId('hands-cancel'));
    expect(slot(1)).toMatch(/Empty/);
    expect(slot(2)).toMatch(/Empty/);
  });

  it('an item bumped out of a hand returns to Worn (re-selectable)', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsPanel character={character()} />);
    expect(slot(1)).toMatch(/Longsword/);
    fireEvent.click(screen.getByTestId('hands-swap'));
    // replace Hand 1 (currently Longsword) with the Dagger
    fireEvent.click(screen.getByLabelText('pick-h-2-h1'));
    fireEvent.click(screen.getByTestId('hands-confirm'));
    expect(slot(1)).toMatch(/Dagger/);
    expect(sync.__get('cnmh_loadout_hero')['h-0']).toMatchObject({ state: 'worn' });
    // Longsword is Worn again, so it reappears as a pickable worn item.
    fireEvent.click(screen.getByTestId('hands-swap'));
    expect(screen.getByLabelText('pick-h-0-h1')).toBeInTheDocument();
  });

  it('Clear empties a pending hand; Confirm leaves that hand empty', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsPanel character={character()} />);
    fireEvent.click(screen.getByTestId('hands-swap'));
    expect(screen.getByTestId('hands-pending-1')).toHaveTextContent('Longsword');
    fireEvent.click(screen.getByTestId('hands-clear-1'));
    expect(screen.getByTestId('hands-pending-1')).toHaveTextContent('Empty');
    fireEvent.click(screen.getByTestId('hands-confirm'));
    expect(slot(1)).toMatch(/Empty/);
  });

  it('no Reset / State / Location controls remain', () => {
    render(<HandsPanel character={character()} />);
    expect(screen.queryByTestId('hands-reset')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reset to GM loadout/i)).not.toBeInTheDocument();
  });
});
