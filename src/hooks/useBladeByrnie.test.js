import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return { __esModule: true, useSyncedState: (key, init) => ReactLib.useState(init) };
});

import { useBladeByrnie } from './useBladeByrnie';

const setup = () => renderHook(() => useBladeByrnie('hero'));

describe('useBladeByrnie', () => {
  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.active).toBe(false);
    expect(result.current.hand).toBeNull();
  });

  it('activate draws the dagger into a hand', () => {
    const { result } = setup();
    act(() => result.current.activate(1));
    expect(result.current.active).toBe(true);
    expect(result.current.hand).toBe(1);
  });

  it('returnToArmor clears the overlay', () => {
    const { result } = setup();
    act(() => result.current.activate());
    act(() => result.current.returnToArmor());
    expect(result.current.active).toBe(false);
  });
});
