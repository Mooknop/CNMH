import React, { useState } from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import TreatWoundsModal from '../encounter/TreatWoundsModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import { EXPLORATION_ACTIVITIES, CATEGORY_ORDER } from '../../data/explorationActivities';

const HIGHLIGHT_COLOR = '#d4a017';

const SectionDivider = ({ label, themeColor }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0 0.5rem' }}>
    <span style={{ color: themeColor, fontWeight: '700', fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {label}
    </span>
    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }} />
  </div>
);

const profLabel = (rank) => {
  if (rank >= 4) return 'Legendary';
  if (rank >= 3) return 'Master';
  if (rank >= 2) return 'Expert';
  return null;
};

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
    <div className="exploration-list">
      <h2 style={{ color: themeColor }}>Exploration</h2>

      {activeActivity && (
        <div
          className="exploration-active-banner"
          style={{
            border: `2px solid ${themeColor}`,
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.15))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: themeColor, marginBottom: '0.25rem' }}>
                Active Activity
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <h3 style={{ color: themeColor, margin: 0, fontSize: '1.2rem' }}>{activeActivity.name}</h3>
                {activeActivity.highlight && (
                  <span style={{ color: HIGHLIGHT_COLOR, fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    ✦ {activeActivity.highlight}
                  </span>
                )}
              </div>
              {activeActivity.skill && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                  {activeActivity.skill}
                </div>
              )}
            </div>
            <button
              onClick={() => setActiveActivityName(null)}
              style={{
                background: 'none',
                border: `1px solid ${themeColor}`,
                borderRadius: '4px',
                color: themeColor,
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '0.25rem 0.5rem',
                flexShrink: 0,
                marginLeft: '1rem',
              }}
            >
              Clear
            </button>
          </div>
          <div className="exploration-traits" style={{ marginBottom: '0.5rem' }}>
            {activeActivity.traits?.map((trait, i) => <TraitTag key={i} trait={trait} />)}
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>{activeActivity.description}</div>
        </div>
      )}

      {CATEGORY_ORDER.map((category) => {
        const group = activities.filter((a) => a.category === category);
        if (group.length === 0) return null;

        return (
          <div key={category}>
            <SectionDivider label={category} themeColor={themeColor} />
            <div className="cards-grid">
              {group.map((activity, index) => {
                const isActive = activeActivityName === activity.name;
                const cardColor = activity.highlight ? HIGHLIGHT_COLOR : themeColor;

                const header = (
                  <>
                    <h3 style={{ color: themeColor }}>{activity.name}</h3>
                    {activity.highlight && (
                      <span style={{
                        color: HIGHLIGHT_COLOR,
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        marginLeft: '0.4rem',
                      }}>
                        ✦ {activity.highlight}
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                      {activity.skill && (
                        <span className="exploration-skill" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {activity.skill}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleActive(activity.name); }}
                        style={{
                          background: isActive ? themeColor : 'none',
                          border: `1px solid ${themeColor}`,
                          borderRadius: '4px',
                          color: isActive ? 'white' : themeColor,
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          padding: '0.2rem 0.5rem',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
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
                    themeColor={cardColor}
                    initialExpanded={false}
                    style={(activity.highlight || isActive) ? { borderLeft: `4px solid ${cardColor}` } : {}}
                  >
                    <div className="exploration-traits">
                      {activity.traits?.map((trait, i) => <TraitTag key={i} trait={trait} />)}
                    </div>
                    <div className="exploration-description">{activity.description}</div>
                    {isTreatWounds && (
                      <button
                        className="btn-primary"
                        style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}
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
