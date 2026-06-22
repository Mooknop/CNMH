import { renderHook } from '@testing-library/react';

// Session stub: a flat state map keyed `${id}:${type}` plus spies for the
// recipient write and the connectivity flags the offline gate reads.
let stateMap = {};
let session = {};
const mockGetState = vi.fn();
const mockSendUpdate = vi.fn();

vi.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => session,
}));

// Roster for doc-gold fallbacks (#670).
let charactersFixture = [];
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: charactersFixture }),
}));

// useSyncedState only ever fronts the giver's own gold key here. Back it with a
// mutable value + a setter spy that records what the debit wrote.
let giverGold = 0;
const mockSetMyGold = vi.fn();
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [giverGold, mockSetMyGold],
}));

import { useGiveGold } from './useGiveGold';

beforeEach(() => {
  stateMap = {};
  giverGold = 0;
  charactersFixture = [{ id: 'a' }, { id: 'b' }];
  vi.clearAllMocks();
  mockGetState.mockImplementation((id, type) => stateMap[`${id}:${type}`]);
  session = {
    getState: mockGetState,
    sendUpdate: mockSendUpdate,
    connected: true,
    foundryConnected: true,
  };
});

describe('useGiveGold', () => {
  it('exposes the giver live balance', () => {
    giverGold = 42;
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.myGold).toBe(42);
  });

  it('credits the recipient and debits the giver on a valid transfer', () => {
    giverGold = 50;
    stateMap = { 'b:gold': 10 };
    const { result } = renderHook(() => useGiveGold('a'));

    const ok = result.current.give('b', 15);

    expect(ok).toBe(true);
    expect(mockSendUpdate).toHaveBeenCalledWith('b', 'gold', 25); // 10 + 15
    expect(mockSetMyGold).toHaveBeenCalledWith(35); // 50 - 15
  });

  it('credits the recipient BEFORE debiting the giver', () => {
    giverGold = 50;
    const { result } = renderHook(() => useGiveGold('a'));

    result.current.give('b', 5);

    const creditOrder = mockSendUpdate.mock.invocationCallOrder[0];
    const debitOrder = mockSetMyGold.mock.invocationCallOrder[0];
    expect(creditOrder).toBeLessThan(debitOrder);
  });

  it('treats a recipient with no prior gold and no doc gold as zero', () => {
    giverGold = 20;
    const { result } = renderHook(() => useGiveGold('a'));
    result.current.give('b', 8);
    expect(mockSendUpdate).toHaveBeenCalledWith('b', 'gold', 8);
  });

  it('credits an unset recipient from their doc gold (#670)', () => {
    giverGold = 50;
    charactersFixture = [{ id: 'a' }, { id: 'b', gold: 30 }]; // no overlay for b
    const { result } = renderHook(() => useGiveGold('a'));
    result.current.give('b', 5);
    expect(mockSendUpdate).toHaveBeenCalledWith('b', 'gold', 35); // 30 doc + 5
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['more than the balance', 100],
  ])('rejects %s amounts without writing', (_label, amount) => {
    giverGold = 30;
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.give('b', amount)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
    expect(mockSetMyGold).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric amount', () => {
    giverGold = 30;
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.give('b', 'lots')).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('rejects sending to yourself', () => {
    giverGold = 30;
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.give('a', 5)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('rejects when there is no recipient', () => {
    giverGold = 30;
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.give('', 5)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('freezes the transfer in the offline sandbox (DO up, Foundry down)', () => {
    giverGold = 30;
    session = { ...session, connected: true, foundryConnected: false };
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.give('b', 5)).toBe(false);
    expect(mockSendUpdate).not.toHaveBeenCalled();
    expect(mockSetMyGold).not.toHaveBeenCalled();
  });

  it('allows the transfer when fully offline (pure local, never connected)', () => {
    giverGold = 30;
    session = { ...session, connected: false, foundryConnected: false };
    const { result } = renderHook(() => useGiveGold('a'));
    expect(result.current.give('b', 5)).toBe(true);
    expect(mockSendUpdate).toHaveBeenCalled();
  });
});
