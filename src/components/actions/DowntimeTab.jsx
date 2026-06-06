import React, { useState } from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import { getHoursForActivity, getRollsForActivity, getDaysCommitted } from '../../utils/downtimeUtils';
import CraftingModal from '../inventory/CraftingModal';
import DowntimeList from './DowntimeList';
import DowntimeCommitBar from './DowntimeCommitBar';
import './DowntimeTab.css';

// Player-facing Downtime view, shown in the mode-aware "play" slot when the GM
// has set the play mode to Downtime. Shows the GM-granted day budget, the
// activity picker, per-activity progress, the commit bar, and the Crafting
// recipe browser (moved here from Inventory).
const DowntimeTab = ({ character, characterColor }) => {
  const { formatGameDate, formatClockTime, getCurrentWeekday } = useGameDate();
  const [block] = useSyncedState('cnmh_downtimeblock_global', null);
  const [downtime] = useSyncedState(`cnmh_downtime_${character?.id || 'unknown'}`, null);
  const charData = useCharacter(character);
  const [isCraftingOpen, setIsCraftingOpen] = useState(false);

  const hasCrafting = (charData?.skillProficiencies?.crafting || 0) > 0;
  const days = block?.active ? block?.days : null;
  const selected = downtime?.selected || [];
  const ledger = downtime?.ledger || [];
  const daysCommitted = getDaysCommitted(ledger);

  // Per-activity progress derived from the committed ledger.
  const activityProgress = selected.map((name) => {
    const def = DOWNTIME_ACTIVITIES.find((a) => a.name === name);
    if (!def) return null;
    if (def.type === 'instant') {
      return { name, type: 'instant', rolls: getRollsForActivity(ledger, name) };
    }
    return {
      name,
      type: 'accumulate',
      hours: getHoursForActivity(ledger, name),
      benchmarkHours: def.benchmarkHours,
    };
  }).filter(Boolean);

  const showProgress = block?.active && ledger.length > 0 && activityProgress.length > 0;

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
        {days != null && daysCommitted > 0 && (
          <p className="dt-days-used">{daysCommitted} of {days} day{days === 1 ? '' : 's'} used</p>
        )}
      </div>

      <DowntimeList character={character} characterColor={characterColor} />

      {showProgress && (
        <div className="dt-progress">
          <span className="dt-progress-heading">Progress</span>
          {activityProgress.map((prog) => (
            <div key={prog.name} className="dt-progress-row">
              <span className="dt-progress-name">{prog.name}</span>
              {prog.type === 'instant' ? (
                <span className="dt-progress-value">
                  {prog.rolls} roll{prog.rolls === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="dt-progress-value">
                  {prog.hours}h / {prog.benchmarkHours}h
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {block?.active && (
        <DowntimeCommitBar character={character} block={block} />
      )}

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
