// src/components/actions/ExplorationList.js
import React, { useState } from 'react';
import ActionRow from '../shared/ActionRow';
import ActionDetailModal from '../encounter/ActionDetailModal';
import TreatWoundsModal from '../encounter/TreatWoundsModal';
import RollActivityModal from './RollActivityModal';
import FollowExpertModal from './FollowExpertModal';
import SkillCheckModal from './SkillCheckModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { EXPLORATION_ACTIVITIES, CATEGORY_ORDER } from '../../data/explorationActivities';
import { skillActionsFor, augmentSkillAction } from '../../data/skillActions';
import { activityHighlightLabel } from '../../utils/explorationUtils';
import './ExplorationList.css';

const SKILL_DISPLAY = {
  arcana: 'Arcana', nature: 'Nature', occultism: 'Occultism', religion: 'Religion',
  society: 'Society', crafting: 'Crafting', survival: 'Survival', stealth: 'Stealth',
  deception: 'Deception', diplomacy: 'Diplomacy', intimidation: 'Intimidation',
  medicine: 'Medicine', perception: 'Perception', thievery: 'Thievery',
  acrobatics: 'Acrobatics', athletics: 'Athletics', performance: 'Performance',
};

const PACE_LABEL = {
  half: '½ Speed',
  double: '×2 Speed',
  full: 'Full Speed',
};

const ExplorationList = ({ character, characterColor }) => {
  const themeColor = characterColor || 'var(--color-primary)';
  const characterModel = useCharacter(character);
  const characterKey = character?.id || 'unknown';

  const [activeActivityName, setActiveActivityName] = useSyncedState(
    `cnmh_exploration_${characterKey}`,
    null
  );
  const [followExpertLink] = useSyncedState(`cnmh_followexpert_${characterKey}`, null);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();

  const [openActivity, setOpenActivity]     = useState(null);
  const [rollActivity, setRollActivity]     = useState(null);
  const [followExpertOpen, setFollowExpertOpen] = useState(false);
  const [treatWoundsOpen, setTreatWoundsOpen]   = useState(false);
  const [skillAction, setSkillAction]           = useState(null);

  // Out-of-encounter skill actions (#407) — Track and any future exploration
  // skill checks. Resolved standalone via SkillCheckModal (no action spend).
  const skillActions = skillActionsFor(character, { explorationMode: true });

  if (!characterModel) return null;

  const { flags, skillProficiencies } = characterModel;

  const isTrained = (skillId) => (skillProficiencies[skillId] || 0) >= 1;

  const withHighlight = (activity) => {
    const label = activityHighlightLabel(activity, skillProficiencies);
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

  const toggleActive = (name) =>
    setActiveActivityName((prev) => (prev === name ? null : name));

  return (
    <div className="exploration-list" style={{ '--el-theme-color': themeColor }}>
      <h2 className="el-heading">Exploration</h2>

      {/* Active activity banner */}
      {activeActivity && (
        <div className="exploration-active-banner">
          <div className="el-banner-top">
            <div className="el-banner-info">
              <div className="el-banner-eyebrow">Active Activity</div>
              <div className="el-banner-name-row">
                <span className="el-banner-name">{activeActivity.name}</span>
                {activeActivity.mechanics?.speed && (
                  <span className="el-banner-pace">{PACE_LABEL[activeActivity.mechanics.speed]}</span>
                )}
                {activeActivity.highlight && (
                  <span className="el-highlight-badge">✦ {activeActivity.highlight}</span>
                )}
              </div>
              {activeActivity.skill && (
                <div className="el-banner-skill">{activeActivity.skill}</div>
              )}
            </div>
            <div className="el-banner-buttons">
              {activeActivity.mechanics?.roll && (
                <button className="el-roll-btn" onClick={() => setRollActivity(activeActivity)}>
                  Roll Check
                </button>
              )}
              <button className="el-clear-btn" onClick={() => setActiveActivityName(null)}>
                Clear
              </button>
            </div>
          </div>
          {activeActivity.mechanics?.note && (
            <div className="el-banner-note">{activeActivity.mechanics.note}</div>
          )}
          {activeActivity.name === 'Follow the Expert' && followExpertLink?.skillId && (
            <div className="el-banner-note el-banner-note--accent">
              +2 circumstance to {SKILL_DISPLAY[followExpertLink.skillId] || followExpertLink.skillId}
            </div>
          )}
        </div>
      )}

      {/* Activity rows grouped by category */}
      {CATEGORY_ORDER.map((category) => {
        const group = activities.filter((a) => a.category === category);
        if (group.length === 0) return null;

        return (
          <div key={category}>
            <div className="el-section-divider">
              <span className="el-section-label">{category}</span>
              <div className="el-section-line" />
            </div>
            <div className="el-activity-list">
              {group.map((activity, index) => {
                const isActive = activeActivityName === activity.name;
                const rightLabel = activity.highlight
                  ? `✦ ${activity.highlight}`
                  : activity.skill || null;

                const isTreatWounds   = activity.name === 'Treat Wounds';
                const isFollowExpert  = activity.name === 'Follow the Expert';

                return (
                  <ActionRow
                    key={index}
                    glyph="→"
                    name={activity.name}
                    rightLabel={rightLabel}
                    active={isActive}
                    onClick={() => {
                      if (isTreatWounds) {
                        setTreatWoundsOpen(true);
                      } else if (isFollowExpert) {
                        setFollowExpertOpen(true);
                      } else {
                        setOpenActivity(activity);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Skill actions — standalone exploration checks (Track) */}
      {skillActions.length > 0 && (
        <div>
          <div className="el-section-divider">
            <span className="el-section-label">Skill Actions</span>
            <div className="el-section-line" />
          </div>
          <div className="el-activity-list">
            {skillActions.map((sa) => (
              <ActionRow
                key={sa.id}
                glyph="→"
                name={sa.name}
                rightLabel={SKILL_DISPLAY[sa.skill] || sa.skill}
                onClick={() => setSkillAction(augmentSkillAction(character, sa, { effects, effectCatalog }))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Activity detail modal */}
      {openActivity && (
        <ActionDetailModal
          item={openActivity}
          type="activity"
          isOpen={true}
          onClose={() => setOpenActivity(null)}
          themeColor={themeColor}
          isActive={activeActivityName === openActivity?.name}
          onSetActive={() => toggleActive(openActivity?.name)}
          onRoll={openActivity?.mechanics?.roll ? () => setRollActivity(openActivity) : undefined}
        />
      )}

      {/* Roll check modal */}
      {rollActivity && (
        <RollActivityModal
          isOpen={true}
          onClose={() => setRollActivity(null)}
          activity={rollActivity}
          character={character}
          themeColor={themeColor}
        />
      )}

      {/* Skill check resolver */}
      {skillAction && (
        <SkillCheckModal
          isOpen
          onClose={() => setSkillAction(null)}
          action={skillAction}
          character={character}
          themeColor={themeColor}
        />
      )}

      {/* Follow the Expert picker */}
      <FollowExpertModal
        isOpen={followExpertOpen}
        onClose={() => setFollowExpertOpen(false)}
        follower={character}
        themeColor={themeColor}
      />

      {/* Treat Wounds shortcut */}
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
