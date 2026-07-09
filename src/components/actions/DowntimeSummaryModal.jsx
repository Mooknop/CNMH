import React from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import { getHoursForActivity, getRollsForActivity } from '../../utils/downtimeUtils';
import './DowntimeSummaryModal.css';
import { APP, globalKey } from '../../sync/keys';

// Shown to all players (and the GM) when a downtime period completes. Reads the
// synced cnmh_downtimesummary_global key; renders null when the key is absent.
// The "Got it" button clears the key for everyone.
const DowntimeSummaryModal = () => {
  const [summary, setSummary] = useSyncedState(globalKey(APP.DOWNTIMESUMMARY), null);
  if (!summary) return null;

  const { period, chars = [] } = summary;

  return (
    <div className="dsm-overlay" role="dialog" aria-modal="true" aria-label="Downtime Summary">
      <div className="dsm-modal">
        <h2 className="dsm-title">Downtime Complete</h2>
        {period?.days != null && (
          <p className="dsm-period">
            {period.days} day{period.days === 1 ? '' : 's'} elapsed
          </p>
        )}

        <div className="dsm-chars">
          {chars.map((char) => {
            const ledger = char.ledger || [];
            // Collect every activity name that actually appears in the ledger.
            const activityNames = [
              ...new Set([
                ...ledger.map((e) => e.day),
                ...ledger.map((e) => e.night).filter(Boolean),
              ]),
            ].filter(Boolean);

            return (
              <div key={char.id} className="dsm-char">
                <p className="dsm-char-name">{char.name}</p>
                {activityNames.length === 0 ? (
                  <p className="dsm-no-activity">No activities committed</p>
                ) : (
                  <div className="dsm-activities">
                    {activityNames.map((name) => {
                      const def = DOWNTIME_ACTIVITIES.find((a) => a.name === name);
                      const isInstant = def?.type === 'instant';
                      const rolls = isInstant ? getRollsForActivity(ledger, name) : null;
                      const hours = !isInstant ? getHoursForActivity(ledger, name) : null;
                      return (
                        <div key={name} className="dsm-activity-row">
                          <span className="dsm-activity-name">{name}</span>
                          <span className="dsm-activity-value">
                            {isInstant
                              ? `${rolls} roll${rolls === 1 ? '' : 's'}`
                              : `${hours}h${def?.benchmarkHours ? ` / ${def.benchmarkHours}h` : ''}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="dsm-footer">
          <button className="dsm-close-btn" onClick={() => setSummary(null)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default DowntimeSummaryModal;
