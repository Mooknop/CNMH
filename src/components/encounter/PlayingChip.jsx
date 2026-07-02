import React from 'react';
import { usePlaying } from '../../hooks/usePlaying';
import './PlayingChip.css';

/**
 * 'While playing' badge for one PC in the order strip (#935). A child component
 * (the AuraChip/OmenChip/StanceChip pattern) so each entry holds its own synced
 * subscription to cnmh_playing_<charId>; renders nothing while the performance
 * is down, so the bard can see at a glance whether they need to re-up.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const PlayingChip = ({ entry }) => {
  const { playing } = usePlaying(entry?.charId);

  if (entry?.kind !== 'pc' || !playing) return null;

  return (
    <span
      className="ttp-playing-chip"
      title="Playing (Composition sustained)"
      aria-label={`${entry.name} is playing`}
    >
      ♪♫
    </span>
  );
};

export default PlayingChip;
