import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useSession } from '../../contexts/SessionContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { dailyPrepPlanFor, performDailyPrep } from '../../utils/dailyPrep';
import { highestCastableRank, chargesFromSlots } from '../../utils/staffPrep';
import { toGameSeconds } from '../../utils/gameTime';
import './DailyPrepModal.css';
import { APP } from '../../sync/keys';

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

  // Staff preparation (#957 S6a) — the held staves and the one prepared today.
  // `character` here is the computed useCharacter model, so `staves` is present;
  // raw-object callers (and the closed modal) simply see none.
  const staves = (isOpen && character?.staves) || [];
  const currentStaffId =
    (isOpen && character ? (getState(character.id, APP.STAFFPREP) || {}).staffId : '') || '';
  const [staffChoice, setStaffChoice] = useState(currentStaffId);
  // Slots expended for extra staff charges (#957 S6b) — rank -> count.
  const [staffSlots, setStaffSlots] = useState({});

  if (!isOpen || !character) return null;

  const staffCharges = highestCastableRank(character);
  const canPrepStaff = staves.length > 0 && staffCharges >= 1;

  // Ranks the caster can expend for extra charges: every rank with slots.
  const slotMax = character.spellcasting?.spell_slots || {};
  const slotRanks = Object.keys(slotMax)
    .filter((k) => Number(k) > 0 && Number(slotMax[k]) > 0)
    .map(Number)
    .sort((a, b) => a - b);
  const bonusCharges = chargesFromSlots(staffSlots);
  const totalCharges = staffCharges + bonusCharges;

  const bumpSlot = (rank, delta) => setStaffSlots((prev) => {
    const cur = Number(prev[rank] || 0);
    const next = Math.max(0, Math.min(cur + delta, Number(slotMax[rank] || 0)));
    return { ...prev, [rank]: next };
  });

  const pickStaff = (value) => {
    setStaffChoice(value);
    if (!value) setStaffSlots({}); // clearing the staff drops any allocation
  };

  const handleConfirm = () => {
    const nowSecs = toGameSeconds({ ...gameDate, ...time });
    const { summary } = performDailyPrep({
      character,
      getState,
      sendUpdate,
      nowSecs,
      eldChoice: plan.hasEld ? eldChoice : undefined,
      staffChoice: canPrepStaff ? staffChoice : undefined,
      staffSlots: canPrepStaff && staffChoice ? staffSlots : undefined,
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

        {canPrepStaff && (
          <div className="dp-staff">
            <label className="dp-staff-label" htmlFor="dp-staff-select">Prepare a staff</label>
            <select
              id="dp-staff-select"
              className="dp-staff-select"
              value={staffChoice}
              onChange={(e) => pickStaff(e.target.value)}
            >
              <option value="">Don&apos;t prepare a staff</option>
              {staves.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {staffChoice && slotRanks.length > 0 && (
              <div className="dp-staff-slots">
                <span className="dp-staff-sublabel">Expend spell slots for extra charges</span>
                {slotRanks.map((r) => (
                  <div className="dp-slot-row" key={r}>
                    <span className="dp-slot-label">Rank {r} <em>(+{r} each)</em></span>
                    <div className="dp-stepper">
                      <button
                        type="button"
                        className="dp-step"
                        aria-label={`Expend one fewer rank ${r} slot`}
                        disabled={Number(staffSlots[r] || 0) <= 0}
                        onClick={() => bumpSlot(r, -1)}
                      >−</button>
                      <span className="dp-step-count">{Number(staffSlots[r] || 0)} / {slotMax[r]}</span>
                      <button
                        type="button"
                        className="dp-step"
                        aria-label={`Expend one more rank ${r} slot`}
                        disabled={Number(staffSlots[r] || 0) >= Number(slotMax[r])}
                        onClick={() => bumpSlot(r, 1)}
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {staffChoice && (
              <p className="dp-staff-hint">
                {bonusCharges > 0
                  ? `Gains ${totalCharges} charges (${staffCharges} base + ${bonusCharges} from slots).`
                  : `Gains ${staffCharges} charge${staffCharges !== 1 ? 's' : ''} (highest rank you can cast).`}
              </p>
            )}
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
