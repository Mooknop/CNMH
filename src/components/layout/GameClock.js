import React from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import './GameClock.css';

// Compact, read-only date + time readout for the navbar. The underlying clock
// is synced (cnmh_clock_global), so every player and the GM see the same value.
// Advancing time happens elsewhere (GM controls per play mode).
const GameClock = () => {
  const { getCurrentWeekday, formatGameDate, formatClockTime } = useGameDate();

  return (
    <div
      className="game-clock"
      title={`${getCurrentWeekday()}, ${formatGameDate()} — ${formatClockTime()}`}
    >
      <span className="game-clock-time">{formatClockTime()}</span>
      <span className="game-clock-date">{formatGameDate()}</span>
    </div>
  );
};

export default GameClock;
