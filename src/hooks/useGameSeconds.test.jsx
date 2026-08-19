import React from 'react';
import { renderHook } from '@testing-library/react';
import { GameDateContext } from '../contexts/GameDateContext';
import { toGameSeconds } from '../utils/gameTime';
import { useGameSeconds } from './useGameSeconds';

describe('useGameSeconds', () => {
  it('returns null outside a GameDateProvider instead of throwing', () => {
    const { result } = renderHook(() => useGameSeconds());
    expect(result.current).toBeNull();
  });

  it('reads the clock as absolute game seconds when a provider is present', () => {
    const clock = { day: 5, month: 2, year: 4725, hour: 8, minute: 30, second: 0 };
    const wrapper = ({ children }) => (
      <GameDateContext.Provider
        value={{ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 30, second: 0 } }}
      >
        {children}
      </GameDateContext.Provider>
    );
    const { result } = renderHook(() => useGameSeconds(), { wrapper });
    expect(result.current).toBe(toGameSeconds(clock));
  });
});
