import React, { useState } from 'react';
import ActionRow from '../shared/ActionRow';
import ActionDetailModal from '../encounter/ActionDetailModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import { activityHighlightLabel } from '../../utils/explorationUtils';
import './DowntimeList.css';

// Multi-select downtime activity picker. Unlike exploration (one active pick),
// a character can pursue several downtime activities in parallel across the
// block, so tapping a row toggles its membership in the synced `selected` list.
// Hour accumulation / commit accounting lands in a later slice; this slice only
// records which activities the player intends to work on.
const TYPE_LABEL = { instant: 'Full day', accumulate: 'Accumulates' };

const DowntimeList = ({ character, characterColor }) => {
  const themeColor = characterColor || 'var(--color-primary)';
  const characterModel = useCharacter(character);
  const characterKey = character?.id || 'unknown';

  const [downtime, setDowntime] = useSyncedState(`cnmh_downtime_${characterKey}`, null);
  const selected = downtime?.selected || [];

  const [openActivity, setOpenActivity] = useState(null);

  if (!characterModel) return null;

  const { flags, skillProficiencies } = characterModel;
  const isTrained = (skillId) => (skillProficiencies[skillId] || 0) >= 1;

  const withHighlight = (activity) => {
    const label = activityHighlightLabel(activity, skillProficiencies);
    return label ? { ...activity, highlight: label } : activity;
  };

  const activities = DOWNTIME_ACTIVITIES
    .filter((activity) => {
      if (activity.requiresFlag && !flags[activity.requiresFlag]) return false;
      if (activity.requiresAnyFlag && !activity.requiresAnyFlag.some((f) => !!flags[f])) return false;
      if (activity.requiresTrainedInAny && !activity.requiresTrainedInAny.some(isTrained)) return false;
      return true;
    })
    .map(withHighlight);

  const isSelected = (name) => selected.includes(name);

  const toggleSelected = (name) =>
    setDowntime((prev) => {
      const prevSel = prev?.selected || [];
      const nextSel = prevSel.includes(name)
        ? prevSel.filter((n) => n !== name)
        : [...prevSel, name];
      return { ...(prev || {}), selected: nextSel };
    });

  return (
    <div className="dt-list" style={{ '--dt-theme-color': themeColor }}>
      <h2 className="dt-list-heading">Activities</h2>

      {selected.length > 0 && (
        <div className="dt-selected-banner">
          <div className="dt-selected-eyebrow">Pursuing this downtime</div>
          <div className="dt-selected-chips">
            {selected.map((name) => (
              <span key={name} className="dt-selected-chip">{name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="dt-activity-list">
        {activities.map((activity, index) => {
          const rightLabel = activity.highlight
            ? `✦ ${activity.highlight}`
            : TYPE_LABEL[activity.type];

          return (
            <ActionRow
              key={index}
              glyph="→"
              name={activity.name}
              rightLabel={rightLabel}
              active={isSelected(activity.name)}
              onClick={() => setOpenActivity(activity)}
            />
          );
        })}
      </div>

      {openActivity && (
        <ActionDetailModal
          item={openActivity}
          type="activity"
          isOpen={true}
          onClose={() => setOpenActivity(null)}
          themeColor={themeColor}
          isActive={isSelected(openActivity?.name)}
          onSetActive={() => toggleSelected(openActivity?.name)}
        />
      )}
    </div>
  );
};

export default DowntimeList;
