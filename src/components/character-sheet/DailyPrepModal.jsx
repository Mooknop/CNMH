import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { dailyPrepPlanFor, performDailyPrep } from '../../utils/dailyPrep';
import { toGameSeconds } from '../../utils/gameTime';
import './DailyPrepModal.css';

/**
 * Daily Preparations flow for a single character. Shows what will be restored,
 * offers the Eld attunement choice (Izzy), then runs performDailyPrep and logs
 * a one-line summary to the session log.
 */
const DailyPrepModal = ({ isOpen, onClose, character, themeColor }) => {
  const { getState, sendUpdate } = useSession();
  const { gameDate, time } = useGameDate();
  const { appendEvent } = useSessionLog();

  const plan = isOpen && character
    ? dailyPrepPlanFor(character, getState)
    : { resets: [], hasEld: false, eldSources: [], currentEldSource: null };

  const [eldChoice, setEldChoice] = useState(plan.currentEldSource || '');

  if (!isOpen || !character) return null;

  const handleConfirm = () => {
    const nowSecs = toGameSeconds({ ...gameDate, ...time });
    const { summary } = performDailyPrep({
      character,
      getState,
      sendUpdate,
      nowSecs,
      eldChoice: plan.hasEld ? eldChoice : undefined,
    });
    appendEvent({ type: 'rest', text: `${character.name} made daily preparations — ${summary}` });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Daily Preparations"
      themeColor={themeColor}
      maxWidth="440px"
    >
      <div className="dp-body">
        {plan.resets.length > 0 ? (
          <>
            <p className="dp-intro">This will restore:</p>
            <ul className="dp-reset-list">
              {plan.resets.map((r) => (
                <li key={r.type} className="dp-reset-item">{r.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="dp-intro">All daily resources are already full.</p>
        )}

        {plan.hasEld && (
          <div className="dp-eld">
            <label className="dp-eld-label" htmlFor="dp-eld-select">Eld attunement</label>
            <select
              id="dp-eld-select"
              className="dp-eld-select"
              value={eldChoice}
              onChange={(e) => setEldChoice(e.target.value)}
            >
              {plan.eldSources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="dp-actions">
          <button className="dp-cancel" onClick={onClose}>Cancel</button>
          <button className="dp-confirm" onClick={handleConfirm}>Prepare</button>
        </div>
      </div>
    </Modal>
  );
};

export default DailyPrepModal;
