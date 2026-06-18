// src/components/encounter/stage/ReactorAvatars.jsx
// Players who have declared a reaction (#476) step onto the acting combatant's
// banner as stacked avatars until their reaction resolves. Reuses StagePortrait
// (token art + monogram fallback) so reactors get the same art as the banner;
// the viewer's own PC is accent-outlined.
import React from 'react';
import StagePortrait from './StagePortrait';
import { entryPortrait } from '../../../utils/stagePortrait';

const ReactorAvatars = ({ reactors, characters, selfId }) => {
  if (!reactors || reactors.length === 0) return null;

  return (
    <div className="stage-reactors" aria-label="Reacting players">
      <div className="stage-reactors-stack">
        {reactors.map((r) => {
          const character = (characters || []).find((c) => c && c.id === r.pcId);
          const name = character?.name || r.pcId;
          const art = entryPortrait({ kind: 'pc', charId: r.pcId }, characters);
          return (
            <StagePortrait
              key={r.pcId}
              className={`stage-reactor-avatar${r.pcId === selfId ? ' stage-reactor-avatar--self' : ''}`}
              src={art.src}
              name={name}
              imagePosition={art.imagePosition}
            />
          );
        })}
      </div>
      <span className="stage-reactors-label">reacting</span>
    </div>
  );
};

export default ReactorAvatars;
