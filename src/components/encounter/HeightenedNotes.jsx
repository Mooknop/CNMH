// HeightenedNotes — the heightened-effect text that applies at a chosen cast
// rank (#235). Shared by the direct cast path (UseAbilityModal casting-cost
// section) and chained casts (ChainedSpellSection). Renders nothing at native
// rank, so non-signature spells and cantrips are unaffected.

import React from 'react';
import { heightenedEntriesFor } from '../../utils/spellHeighten';

const HeightenedNotes = ({ spell, castRank }) => {
  const entries = heightenedEntriesFor(spell, castRank);
  if (entries.length === 0) return null;
  return (
    <div className="uam-heightened">
      <span className="uam-heightened-label">Heightened (rank {castRank}):</span>
      {entries.map((e) => (
        <div key={e.key} className="uam-heightened-entry">
          <span className="uam-heightened-key">{e.key}:</span> {e.text}
          {e.times > 1 ? ` (×${e.times})` : ''}
        </div>
      ))}
    </div>
  );
};

export default HeightenedNotes;
