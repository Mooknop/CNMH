import { renderHook, act } from '@testing-library/react';

let stateMap = {};
let subscribers = [];
const mockGetState = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('../contexts/SessionContext', () => ({
  __esModule: true,
  useSession: () => ({ getState: mockGetState, subscribe: mockSubscribe }),
}));

import { usePartyGold } from './usePartyGold';

beforeEach(() => {
  stateMap = {};
  subscribers = [];
  window.localStorage.clear();
  mockGetState.mockImplementation((id, type) => stateMap[`${id}:${type}`]);
  mockSubscribe.mockImplementation((id, type, cb) => {
    subscribers.push({ id, type, cb });
    return () => {
      subscribers = subscribers.filter((s) => s.cb !== cb);
    };
  });
});

describe('usePartyGold', () => {
  it('totals zero for an empty / undefined party', () => {
    const { result } = renderHook(() => usePartyGold([]));
    expect(result.current.total).toBe(0);
  });

  it('seeds each character from the server gold state and sums them', () => {
    stateMap = { 'a:gold': 30, 'b:gold': 12 };
    const { result } = renderHook(() => usePartyGold([{ id: 'a' }, { id: 'b' }]));
    expect(result.current.goldById).toEqual({ a: 30, b: 12 });
    expect(result.current.total).toBe(42);
  });

  it('falls back to localStorage when the server has no value', () => {
    window.localStorage.setItem('cnmh_gold_a', JSON.stringify(25));
    const { result } = renderHook(() => usePartyGold([{ id: 'a' }]));
    expect(result.current.total).toBe(25);
  });

  it('defaults a character with no stored gold to 0', () => {
    const { result } = renderHook(() => usePartyGold([{ id: 'a' }]));
    expect(result.current.goldById.a).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it('subscribes to each character gold key', () => {
    renderHook(() => usePartyGold([{ id: 'a' }, { id: 'b' }]));
    expect(mockSubscribe).toHaveBeenCalledWith('a', 'gold', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('b', 'gold', expect.any(Function));
  });

  it('recomputes the total when a subscribed gold value changes', () => {
    stateMap = { 'a:gold': 10 };
    const { result } = renderHook(() => usePartyGold([{ id: 'a' }]));
    expect(result.current.total).toBe(10);

    act(() => {
      subscribers.forEach((s) => s.cb(75));
    });

    expect(result.current.total).toBe(75);
  });
});
