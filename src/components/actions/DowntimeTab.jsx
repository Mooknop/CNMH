import React, { useState } from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import CraftingModal from '../inventory/CraftingModal';
import DowntimeList from './DowntimeList';
import './DowntimeTab.css';

// Player-facing Downtime view, shown in the mode-aware "play" slot when the GM
// has set the play mode to Downtime. Reads the GM-owned downtime block
// (`cnmh_downtimeblock_global`) for the granted day budget, lets the player pick
// the activities they'll pursue, and hosts the Crafting recipe browser (moved
// here from Inventory). Commit/accumulation accounting arrives in a later slice.
const DowntimeTab = ({ character, characterColor }) => {
  const { formatGameDate, formatClockTime, getCurrentWeekday } = useGameDate();
  const [block] = useSyncedState('cnmh_downtimeblock_global', null);
  const charData = useCharacter(character);
  const [isCraftingOpen, setIsCraftingOpen] = useState(false);

  const hasCrafting = (charData?.skillProficiencies?.crafting || 0) > 0;
  const days = block?.active ? block?.days : null;

  return (
    <div className="dt-wrap">
      <div className="dt-header">
        <div className="dt-header-top">
          <span className="dt-label">Downtime</span>
          {days != null ? (
            <span className="dt-budget">{days} day{days === 1 ? '' : 's'} available</span>
          ) : (
            <span className="dt-budget dt-budget--unset">Not started</span>
          )}
        </div>
        <p className="dt-date">{getCurrentWeekday()}, {formatGameDate()}</p>
        <p className="dt-time">{formatClockTime()}</p>
        {days == null && (
          <p className="dt-hint">The GM hasn&rsquo;t started a downtime period yet.</p>
        )}
      </div>

      <DowntimeList character={character} characterColor={characterColor} />

      {hasCrafting && (
        <div className="dt-crafting-row">
          <button
            className="dt-crafting-btn"
            onClick={() => setIsCraftingOpen(true)}
          >
            <span role="img" aria-label="Crafting">🔨</span>
            Crafting Recipes
          </button>
        </div>
      )}

      <CraftingModal
        isOpen={isCraftingOpen}
        onClose={() => setIsCraftingOpen(false)}
        character={character}
        characterColor={characterColor}
      />
    </div>
  );
};

export default DowntimeTab;
