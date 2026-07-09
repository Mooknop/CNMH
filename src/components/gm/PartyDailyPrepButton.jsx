import React, { useState } from 'react';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { performDailyPrep } from '../../utils/dailyPrep';
import { toGameSeconds } from '../../utils/gameTime';
import './PartyDailyPrepButton.css';
import { APP } from '../../sync/keys';

/**
 * GM party-wide Daily Preparations. Runs performDailyPrep for every character,
 * carrying each one's existing Eld attunement (no per-character choice prompt),
 * and logs a single summary line so the session log isn't flooded.
 */
const PartyDailyPrepButton = () => {
  const { getState, sendUpdate } = useSession();
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { appendEvent } = useSessionLog();
  const [confirming, setConfirming] = useState(false);

  const runForParty = () => {
    const nowSecs = toGameSeconds({ ...gameDate, ...time });
    (characters || []).forEach((c) => {
      performDailyPrep({
        character: c,
        getState,
        sendUpdate,
        nowSecs,
        eldChoice: getState(c.id, APP.ELDATTUNE) || undefined,
      });
    });
    appendEvent({ type: 'rest', text: 'GM: party made daily preparations' });
    setConfirming(false);
  };

  return (
    <div className="pmc-row party-prep-row">
      <span className="party-prep-hint">Restore daily resources for the whole party.</span>
      <button className="party-prep-btn" onClick={() => setConfirming(true)}>
        Daily Preparations (party)
      </button>

      <ConfirmDialog
        isOpen={confirming}
        title="Party Daily Preparations"
        message="Restore spell slots, focus, staff charges, wand uses and daily abilities for every party member, clear Hunt Prey, and expire until-daily-prep effects. Existing Eld attunements are kept."
        confirmLabel="Prepare party"
        danger={false}
        onConfirm={runForParty}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};

export default PartyDailyPrepButton;
