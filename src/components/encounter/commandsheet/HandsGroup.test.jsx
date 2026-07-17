import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import HandsGroup from './HandsGroup';

// Shared in-memory loadout store so the real useCharacter (effective tree),
// useLoadout (writer) and the group all react together — a faithful
// end-to-end of the live layer without a real WebSocket. (Same harness as the
// retired HandsPanel suite.)
vi.mock('../../../hooks/useSyncedState', () => {
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
import * as sync from '../../../hooks/useSyncedState';

// Action economy + log are commit side-effects — spy them; useEncounter's real
// implementation needs the session/content providers.
const spendActions = vi.fn();
vi.mock('../../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions }),
}));
const appendLog = vi.fn();
vi.mock('../../../hooks/useEncounter', () => ({
  useEncounter: () => ({ appendLog }),
}));

const character = () => ({
  id: 'hero',
  name: 'Hero',
  level: 1,
  abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  inventory: [
    { uid: 'h-0', ref: 'sword', name: 'Longsword', weight: 1, quantity: 1, strikes: { type: 'melee', damage: '1d8 S' } },
    { uid: 'h-1', ref: 'shield', name: 'Steel Shield', weight: 1, quantity: 1, shield: { bonus: 2, hardness: 5 } },
    { uid: 'h-2', ref: 'dagger', name: 'Dagger', weight: 0.1, quantity: 1, strikes: { type: 'melee', damage: '1d4 P' } },
    { uid: 'h-3', ref: 'greatsword', name: 'Greatsword', weight: 2, quantity: 1, usage: 'held in 2 hands', strikes: { type: 'melee', damage: '1d12 S' } },
  ],
  feats: [],
});

beforeEach(() => {
  sync.__reset();
  spendActions.mockClear();
  appendLog.mockClear();
});
afterEach(() => vi.restoreAllMocks());

const row = (uid) => screen.getByTestId(`hands-row-${uid}`);
const openSwap = () => fireEvent.click(screen.getAllByRole('button', { name: /^Swap / })[0]);

describe('HandsGroup (Items-segment hands rows + hand-setter)', () => {
  it('lists held items with their slot and worn items with a Swap button', () => {
    sync.__set('cnmh_loadout_hero', {
      'h-0': { state: 'held1', hand: 1 },
      'h-1': { state: 'held1', hand: 2 },
    });
    render(<HandsGroup character={character()} encounterMode />);
    expect(within(row('h-0')).getByText('In Hand 1')).toBeInTheDocument();
    expect(within(row('h-1')).getByText('In Hand 2')).toBeInTheDocument();
    expect(within(row('h-0')).getByRole('button', { name: 'Sheathe Longsword' })).toBeInTheDocument();
    // Non-weapon gear stows rather than sheathes.
    expect(within(row('h-1')).getByRole('button', { name: 'Stow Steel Shield' })).toBeInTheDocument();
    expect(within(row('h-2')).getByText('Worn')).toBeInTheDocument();
    expect(within(row('h-2')).getByRole('button', { name: 'Swap Dagger' })).toBeInTheDocument();
    // Two-handed worn items carry the 2H badge.
    expect(within(row('h-3')).getByText('2H')).toBeInTheDocument();
  });

  it('renders a two-handed grip as one row marked "In both hands"', () => {
    sync.__set('cnmh_loadout_hero', { 'h-3': { state: 'held2' } });
    render(<HandsGroup character={character()} encounterMode />);
    expect(within(row('h-3')).getByText('In both hands')).toBeInTheDocument();
    expect(screen.getAllByTestId('hands-row-h-3')).toHaveLength(1);
  });

  it('Sheathe commits immediately: back to Worn + 1 Interact + a log line', () => {
    sync.__set('cnmh_loadout_hero', {
      'h-0': { state: 'held1', hand: 1 },
      'h-1': { state: 'held1', hand: 2 },
    });
    render(<HandsGroup character={character()} encounterMode />);
    fireEvent.click(screen.getByRole('button', { name: 'Sheathe Longsword' }));
    const lo = sync.__get('cnmh_loadout_hero');
    expect(lo['h-0']).toMatchObject({ state: 'worn' });
    expect(lo['h-1']).toMatchObject({ state: 'held1', hand: 2 }); // other hand kept
    expect(spendActions).toHaveBeenCalledTimes(1);
    expect(spendActions).toHaveBeenCalledWith(1, 'Interact');
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action',
      charId: 'hero',
      text: expect.stringMatching(/Hero sheathes the Longsword \(1 act\)/),
    }));
  });

  it('outside encounter, Sheathe writes the loadout but spends no action', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsGroup character={character()} encounterMode={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sheathe Longsword' }));
    expect(sync.__get('cnmh_loadout_hero')['h-0']).toMatchObject({ state: 'worn' });
    expect(spendActions).not.toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.not.stringMatching(/1 act/),
    }));
  });

  it('Swap opens the setter seeded with the current hands', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsGroup character={character()} encounterMode />);
    openSwap();
    const setter = screen.getByTestId('hands-setter');
    expect(within(setter).getByRole('button', { name: 'Hand 1: Longsword' })).toBeInTheDocument();
    expect(within(setter).getByRole('button', { name: 'Hand 2: empty' })).toBeInTheDocument();
    // The held item is out of the pool; the other wieldables are placeable.
    expect(within(setter).queryByTestId('hands-place-h-0')).not.toBeInTheDocument();
    expect(within(setter).getByTestId('hands-place-h-1')).toBeInTheDocument();
  });

  it('placing two one-handers then Confirm commits ONE atomic write + ONE action', () => {
    render(<HandsGroup character={character()} encounterMode />);
    openSwap();
    // First empty hand is 1, then 2 auto-advances.
    expect(screen.getByTestId('hands-place-h-0')).toHaveTextContent('Hand 1');
    fireEvent.click(screen.getByTestId('hands-place-h-0'));
    expect(screen.getByTestId('hands-place-h-1')).toHaveTextContent('Hand 2');
    fireEvent.click(screen.getByTestId('hands-place-h-1'));
    fireEvent.click(screen.getByTestId('hands-confirm'));

    const lo = sync.__get('cnmh_loadout_hero');
    expect(lo['h-0']).toMatchObject({ state: 'held1', hand: 1 });
    expect(lo['h-1']).toMatchObject({ state: 'held1', hand: 2 });
    expect(spendActions).toHaveBeenCalledTimes(1);
    expect(spendActions).toHaveBeenCalledWith(1, 'Interact');
    expect(appendLog).toHaveBeenCalledTimes(1);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/grips the Longsword and Steel Shield \(1 act\)/),
    }));
    expect(screen.queryByTestId('hands-setter')).not.toBeInTheDocument();
  });

  it('a two-handed item fills both hands, releasing the previous grip', () => {
    sync.__set('cnmh_loadout_hero', {
      'h-0': { state: 'held1', hand: 1 },
      'h-1': { state: 'held1', hand: 2 },
    });
    render(<HandsGroup character={character()} encounterMode />);
    openSwap();
    expect(screen.getByTestId('hands-place-h-3')).toHaveTextContent('Both hands');
    fireEvent.click(screen.getByTestId('hands-place-h-3'));
    // Both slots now stage the Greatsword; the released items return to the pool.
    expect(screen.getByRole('button', { name: 'Hand 1: Greatsword' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hand 2: Greatsword' })).toBeInTheDocument();
    expect(screen.getByTestId('hands-place-h-0')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hands-confirm'));

    const lo = sync.__get('cnmh_loadout_hero');
    expect(lo['h-3']).toMatchObject({ state: 'held2' });
    expect(lo['h-0']).toMatchObject({ state: 'worn' });
    expect(lo['h-1']).toMatchObject({ state: 'worn' });
    expect(spendActions).toHaveBeenCalledTimes(1); // whole rearrangement = one Interact
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/releases the .*grips the Greatsword in both hands/),
    }));
  });

  it('placing into a tapped occupied hand bumps the occupant back to the pool', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsGroup character={character()} encounterMode />);
    openSwap();
    // Both-full targeting: tap Hand 1 to edit it.
    fireEvent.click(screen.getByRole('button', { name: 'Hand 1: Longsword' }));
    expect(screen.getByTestId('hands-place-h-2')).toHaveTextContent('Hand 1');
    fireEvent.click(screen.getByTestId('hands-place-h-2'));
    expect(screen.getByRole('button', { name: 'Hand 1: Dagger' })).toBeInTheDocument();
    // The bumped Longsword is placeable again.
    expect(screen.getByTestId('hands-place-h-0')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hands-confirm'));
    const lo = sync.__get('cnmh_loadout_hero');
    expect(lo['h-2']).toMatchObject({ state: 'held1', hand: 1 });
    expect(lo['h-0']).toMatchObject({ state: 'worn' });
  });

  it('× releases a hand to the pool; Confirm leaves it empty', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsGroup character={character()} encounterMode />);
    openSwap();
    fireEvent.click(screen.getByTestId('hands-release-1'));
    expect(screen.getByRole('button', { name: 'Hand 1: empty' })).toBeInTheDocument();
    expect(screen.getByTestId('hands-place-h-0')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hands-confirm'));
    expect(sync.__get('cnmh_loadout_hero')['h-0']).toMatchObject({ state: 'worn' });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/releases the Longsword/),
    }));
  });

  it('Cancel discards pending changes; confirming an unchanged setter spends nothing', () => {
    sync.__set('cnmh_loadout_hero', { 'h-0': { state: 'held1', hand: 1 } });
    render(<HandsGroup character={character()} encounterMode />);
    openSwap();
    fireEvent.click(screen.getByTestId('hands-release-1'));
    fireEvent.click(screen.getByTestId('hands-cancel'));
    expect(screen.queryByTestId('hands-setter')).not.toBeInTheDocument();
    expect(sync.__get('cnmh_loadout_hero')['h-0']).toMatchObject({ state: 'held1' });

    openSwap();
    fireEvent.click(screen.getByTestId('hands-confirm'));
    expect(spendActions).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('excludes non-wieldables, containers and body-bound gear from the worn rows', () => {
    const char = character();
    char.inventory.push(
      // Wieldable markers on the container/tattoo prove the dedicated guards
      // fire, not just the wieldability filter.
      { uid: 'h-4', ref: 'pack', name: 'Backpack', weight: 1, quantity: 1, container: { capacity: 4 }, usage: 'held in 1 hand' },
      { uid: 'h-5', ref: 'tattoo', name: 'Warding Tattoo', weight: 0, quantity: 1, traits: ['Tattoo'], strikes: { type: 'melee' } },
      { uid: 'h-6', ref: 'potion', name: 'Healing Potion', weight: 0.1, quantity: 1 }
    );
    render(<HandsGroup character={char} encounterMode />);
    expect(screen.queryByTestId('hands-row-h-4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hands-row-h-5')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hands-row-h-6')).not.toBeInTheDocument();
  });
});
