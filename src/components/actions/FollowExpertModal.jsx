import React, { useContext } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { CharacterContext } from '../../contexts/CharacterContext';
import { EXPLORATION_ACTIVITIES } from '../../data/explorationActivities';
import { getExpertHighlightSkill, skillProficienciesFor } from '../../utils/explorationUtils';
import './FollowExpertModal.css';
import { APP, syncKey } from '../../sync/keys';

const SKILL_DISPLAY = {
  arcana: 'Arcana', nature: 'Nature', occultism: 'Occultism', religion: 'Religion',
  society: 'Society', crafting: 'Crafting', survival: 'Survival', stealth: 'Stealth',
  deception: 'Deception', diplomacy: 'Diplomacy', intimidation: 'Intimidation',
  medicine: 'Medicine', perception: 'Perception', thievery: 'Thievery',
  acrobatics: 'Acrobatics', athletics: 'Athletics', performance: 'Performance',
};

/**
 * Party picker for Follow the Expert. Shows only PCs whose active exploration
 * activity is keyed off a skill they are Expert or higher in (same criterion
 * as the ✦ chip in ExplorationList). The follower may not follow themselves.
 *
 * On selection:
 *   cnmh_followexpert_<followerCharId> = { expertCharId, skillId }
 *   cnmh_exploration_<followerCharId>  = 'Follow the Expert'
 */
const FollowExpertModal = ({ isOpen, onClose, follower, themeColor }) => {
  const { getState, sendUpdate } = useSession();
  const { characters } = useContext(CharacterContext) || {};

  if (!isOpen || !follower) return null;

  // Build list of eligible experts
  const eligible = (characters || [])
    .filter((pc) => pc.id !== follower.id)
    .reduce((acc, pc) => {
      const activityName = getState(pc.id, APP.EXPLORATION);
      if (!activityName) return acc;
      const activity = EXPLORATION_ACTIVITIES.find((a) => a.name === activityName);
      if (!activity) return acc;
      const profs = skillProficienciesFor(pc);
      const skillId = getExpertHighlightSkill(activity, profs);
      if (!skillId) return acc;
      acc.push({ pc, activityName, skillId });
      return acc;
    }, []);

  const handlePick = (expertCharId, skillId) => {
    const key = syncKey(APP.FOLLOWEXPERT, follower.id);
    const payload = { expertCharId, skillId };
    try { window.localStorage.setItem(key, JSON.stringify(payload)); } catch { /* noop */ }
    sendUpdate(follower.id, APP.FOLLOWEXPERT, payload);
    // Also set the activity
    sendUpdate(follower.id, APP.EXPLORATION, 'Follow the Expert');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Follow the Expert"
      themeColor={themeColor}
      maxWidth="380px"
    >
      <div className="fem-body">
        {eligible.length === 0 ? (
          <p className="fem-empty">
            No party member is currently performing an exploration activity with an Expert+ skill.
          </p>
        ) : (
          <>
            <p className="fem-hint">
              Choose a party member whose activity is keyed off a skill they are Expert or higher in.
              You gain a +2 circumstance bonus to that skill while they succeed.
            </p>
            <div className="fem-list">
              {eligible.map(({ pc, activityName, skillId }) => (
                <button
                  key={pc.id}
                  className="fem-option"
                  onClick={() => handlePick(pc.id, skillId)}
                >
                  <span className="fem-name">{pc.name}</span>
                  <span className="fem-detail">
                    {activityName} · {SKILL_DISPLAY[skillId] || skillId}
                    <span className="fem-badge">✦ Expert+</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="fem-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
};

export default FollowExpertModal;
