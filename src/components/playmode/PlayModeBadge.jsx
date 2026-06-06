import React from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { PLAY_MODES } from '../../data/playModes';
import './PlayModeBadge.css';

const PlayModeBadge = () => {
  const { mode } = usePlayMode();
  const def = PLAY_MODES[mode] || PLAY_MODES.exploration;

  return (
    <span className={`play-mode-badge play-mode-badge--${mode}`} aria-label={`Play mode: ${def.label}`}>
      <i className={`ti ${def.icon}`} aria-hidden="true" />
      {def.label}
    </span>
  );
};

export default PlayModeBadge;
