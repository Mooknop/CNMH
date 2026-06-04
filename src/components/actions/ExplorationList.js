import React, { useState } from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import TreatWoundsModal from '../encounter/TreatWoundsModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import { EXPLORATION_ACTIVITIES, CATEGORY_ORDER } from '../../data/explorationActivities';
import './ExplorationList.css';

const profLabel = (rank) => {
  if (rank >= 4) return 'Legendary';
  if (rank >= 3) return 'Master';
  if (rank >= 2) return 'Expert';
  return null;
};

const SectionDivider = ({ label }) => (
  <div className="el-section-divider">
    <span className="el-section-label">{label}</span>
    <div className="el-section-line" />
  </div>
);

const ExplorationList = ({ character, characterColor }) => {
  const themeColor = characterColor || 'var(--color-primary)';
  const characterModel = useCharacter(character);
  const characterKey = character?.id || 'unknown';
  const [activeActivityName, setActiveActivityName] = useLocalStorage(
    `cnmh_exploration_${characterKey}`,
    null
  );
  const [treatWoundsOpen, setTreatWoundsOpen] = useState(false);

  if (!characterModel) return null;

  const { flags, skillProficiencies } = characterModel;

  const isTrained = (skillId) => (skillProficiencies[skillId] || 0) >= 1;

  const withHighlight = (activity) => {
    if (!activity.highlightSkills) return activity;
    const bestRank = Math.max(...activity.highlightSkills.map((s) => skillProficiencies[s] || 0));
    const label = profLabel(bestRank);
    return label ? { ...activity, highlight: label } : activity;
  };

  const activities = EXPLORATION_ACTIVITIES
    .filter((activity) => {
      if (activity.requiresFlag && !flags[activity.requiresFlag]) return false;
      if (activity.requiresAnyFlag && !activity.requiresAnyFlag.some((f) => !!flags[f])) return false;
      if (activity.requiresTrainedInAny && !activity.requiresTrainedInAny.some(isTrained)) return false;
      return true;
    })
    .map(withHighlight);

  const activeActivity = activities.find((a) => a.name === activeActivityName) || null;

  const toggleActive = (name) => {
    setActiveActivityName((prev) => (prev === name ? null : name));
  };

  return (
    <div className="exploration-list" style={{ '--el-theme-color': themeColor }}>
      <h2 className="el-heading">Exploration</h2>

      {activeActivity && (
        <div className="exploration-active-banner">
          <div className="el-banner-top">
            <div className="el-banner-info">
              <div className="el-banner-eyebrow">Active Activity</div>
              <div className="el-banner-name-row">
                <h3 className="el-banner-name">{activeActivity.name}</h3>
                {activeActivity.highlight && (
                  <span className="el-highlight-badge">✦ {activeActivity.highlight}</span>
                )}
              </div>
              {activeActivity.skill && (
                <div className="el-banner-skill">{activeActivity.skill}</div>
              )}
            </div>
            <button className="el-clear-btn" onClick={() => setActiveActivityName(null)}>
              Clear
            </button>
          </div>
          <div className="exploration-traits">
            {activeActivity.traits?.map((trait, i) => <TraitTag key={i} trait={trait} />)}
          </div>
          <div className="el-banner-desc">{activeActivity.description}</div>
        </div>
      )}

      {CATEGORY_ORDER.map((category) => {
        const group = activities.filter((a) => a.category === category);
        if (group.length === 0) return null;

        return (
          <div key={category}>
            <SectionDivider label={category} />
            <div className="el-activity-list">
              {group.map((activity, index) => {
                const isActive = activeActivityName === activity.name;

                const header = (
                  <>
                    <h3 className="el-activity-name">{activity.name}</h3>
                    {activity.highlight && (
                      <span className="el-highlight-badge">✦ {activity.highlight}</span>
                    )}
                    <div className="el-activity-meta">
                      {activity.skill && (
                        <span className="el-activity-skill">{activity.skill}</span>
                      )}
                      <button
                        className={`el-set-active-btn${isActive ? ' el-set-active-btn--on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleActive(activity.name); }}
                      >
                        {isActive ? '✓ Active' : 'Set Active'}
                      </button>
                    </div>
                  </>
                );

                const isTreatWounds = activity.name === 'Treat Wounds';

                return (
                  <CollapsibleCard
                    key={index}
                    className={`exploration-card${isActive ? ' exploration-card--active' : ''}`}
                    header={header}
                    themeColor={activity.highlight ? '#d4a017' : themeColor}
                    initialExpanded={false}
                  >
                    <div className="exploration-traits">
                      {activity.traits?.map((trait, i) => <TraitTag key={i} trait={trait} />)}
                    </div>
                    <div className="exploration-description">{activity.description}</div>
                    {isTreatWounds && (
                      <button
                        className="btn-primary el-treat-btn"
                        onClick={() => setTreatWoundsOpen(true)}
                      >
                        Treat Wounds
                      </button>
                    )}
                  </CollapsibleCard>
                );
              })}
            </div>
          </div>
        );
      })}

      {treatWoundsOpen && (
        <TreatWoundsModal
          isOpen
          onClose={() => setTreatWoundsOpen(false)}
          mode="treat-wounds"
          healer={character}
          themeColor={themeColor}
          actionCost={0}
        />
      )}
    </div>
  );
};

export default ExplorationList;
