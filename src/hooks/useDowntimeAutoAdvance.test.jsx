import React from 'react';
import { render } from '@testing-library/react';
import { useDowntimeAutoAdvance } from './useDowntimeAutoAdvance';
import { useDowntimePartyReady } from './useDowntimePartyReady';
import { CharacterContext } from '../contexts/CharacterContext';

// Auto-advance extracted from DowntimeControl (#1624) into a shared hook
// (#1856) so both DowntimeControl and the dock's Period view can mount it.
// This suite covers the property DowntimeControl.test.jsx's own per-instance
// re-render check cannot: TWO mounted instances reacting to the same allReady
// flip must still only fire the summary/advance/close/mode-switch once.

const mockSetGmMode = vi.fn();
vi.mock('./usePlayMode', () => ({
  usePlayMode: () => ({ setGmMode: mockSetGmMode }),
}));

const mockAdvanceDays = vi.fn();
const mockGameDate = { day: 5, month: 2, year: 4725 };
vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({ advanceDays: mockAdvanceDays, gameDate: mockGameDate }),
}));

const mockGetState = vi.fn(() => null);
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState }),
}));

vi.mock('./useDowntimePartyReady', () => ({
  useDowntimePartyReady: vi.fn(() => ({ allReady: false, readyCount: 0, total: 0 })),
}));

// Stand-in for useSyncedState that mirrors the one real-semantics property the
// extracted guard leans on: the real hook's setter (`setAndSync`) applies a
// functional updater SYNCHRONOUSLY against the CURRENT shared value (its own
// `latest.current` ref) — not whatever value the calling component's last
// render happened to close over. A plain `vi.fn()` (as DowntimeControl's own
// suite uses) can't exercise that, so this fake keeps a real mutable store and
// applies updates against it the same way.
function makeStore(initial) {
  const store = { ...initial };
  return {
    store,
    useFakeSyncedState: (key, fallback) => {
      if (!(key in store)) store[key] = typeof fallback === 'function' ? fallback() : fallback;
      const setter = (updater) => {
        store[key] = typeof updater === 'function' ? updater(store[key]) : updater;
      };
      return [store[key], setter];
    },
  };
}

let activeStore;
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key, fallback) => activeStore.useFakeSyncedState(key, fallback),
}));

const BLOCK_KEY = 'cnmh_downtimeblock_global';
const SUMMARY_KEY = 'cnmh_downtimesummary_global';

const characters = [{ id: 'c1', name: 'Ashka' }, { id: 'c2', name: 'Izzy' }];

const withChars = (children) => (
  <CharacterContext.Provider value={{ characters }}>{children}</CharacterContext.Provider>
);

const Probe = () => {
  useDowntimeAutoAdvance();
  return null;
};

beforeEach(() => {
  vi.clearAllMocks();
  useDowntimePartyReady.mockReturnValue({ allReady: false, readyCount: 0, total: 0 });
});

describe('useDowntimeAutoAdvance', () => {
  it('does nothing while allReady is false', () => {
    activeStore = makeStore({ [BLOCK_KEY]: { days: 7, active: true, startedAt: mockGameDate } });
    render(withChars(<Probe />));
    expect(mockAdvanceDays).not.toHaveBeenCalled();
    expect(activeStore.store[BLOCK_KEY].active).toBe(true);
  });

  it('does not fire when the block is inactive, even if allReady is true', () => {
    activeStore = makeStore({ [BLOCK_KEY]: { days: 7, active: false, startedAt: mockGameDate } });
    useDowntimePartyReady.mockReturnValue({ allReady: true });
    render(withChars(<Probe />));
    expect(mockAdvanceDays).not.toHaveBeenCalled();
  });

  it('fires summary/advance/close/mode-switch exactly once when allReady flips true', () => {
    activeStore = makeStore({ [BLOCK_KEY]: { days: 7, active: true, startedAt: mockGameDate } });
    const { rerender } = render(withChars(<Probe />));
    expect(mockAdvanceDays).not.toHaveBeenCalled();

    useDowntimePartyReady.mockReturnValue({ allReady: true });
    rerender(withChars(<Probe />));

    expect(mockAdvanceDays).toHaveBeenCalledTimes(1);
    expect(mockAdvanceDays).toHaveBeenCalledWith(7);
    expect(mockSetGmMode).toHaveBeenCalledWith('exploration');
    expect(activeStore.store[BLOCK_KEY].active).toBe(false);
    expect(activeStore.store[SUMMARY_KEY]).toEqual(
      expect.objectContaining({ period: { days: 7, startedAt: mockGameDate } })
    );

    // A re-render with allReady still true must not re-fire (the per-instance
    // ref, unchanged from the original DowntimeControl effect).
    rerender(withChars(<Probe />));
    expect(mockAdvanceDays).toHaveBeenCalledTimes(1);
  });

  // THE property this extraction exists for: DowntimeControl (mounted on
  // /gm) and the dock's Period view (mounted on /gm/dock) are two different
  // routes, but nothing stops both from being open in two tabs/windows at
  // once against the same session — and both would observe the same allReady
  // flip. Modeled here as two hook instances sharing one store, mounted
  // together, so the cross-instance setBlock guard (see the hook's own file
  // header) is actually exercised rather than merely asserted about.
  it('does not double-fire across two instances mounted at once, sharing the same block', () => {
    activeStore = makeStore({ [BLOCK_KEY]: { days: 7, active: true, startedAt: mockGameDate } });
    useDowntimePartyReady.mockReturnValue({ allReady: true });

    const Both = () => withChars(
      <>
        <Probe />
        <Probe />
      </>
    );
    render(<Both />);

    expect(mockAdvanceDays).toHaveBeenCalledTimes(1);
    expect(mockSetGmMode).toHaveBeenCalledTimes(1);
    expect(activeStore.store[BLOCK_KEY].active).toBe(false);
  });

  it('lets a fresh block auto-advance again after a prior one closed', () => {
    activeStore = makeStore({ [BLOCK_KEY]: { days: 7, active: true, startedAt: mockGameDate } });
    useDowntimePartyReady.mockReturnValue({ allReady: true });
    const { rerender } = render(withChars(<Probe />));
    expect(mockAdvanceDays).toHaveBeenCalledTimes(1);

    // Block closes (as the effect itself just did) and a new one starts.
    useDowntimePartyReady.mockReturnValue({ allReady: false });
    activeStore.store[BLOCK_KEY] = { active: false };
    rerender(withChars(<Probe />));

    const freshStart = { day: 12, month: 2, year: 4725 };
    activeStore.store[BLOCK_KEY] = { days: 3, active: true, startedAt: freshStart };
    useDowntimePartyReady.mockReturnValue({ allReady: true });
    rerender(withChars(<Probe />));

    expect(mockAdvanceDays).toHaveBeenCalledTimes(2);
    expect(mockAdvanceDays).toHaveBeenLastCalledWith(3);
  });
});
