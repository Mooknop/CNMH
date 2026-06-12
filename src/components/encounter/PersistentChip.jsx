import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useGmAuth } from '../../hooks/useGmAuth';
import { PERSISTENT_KEY, removeInstance, formatClearance } from '../../utils/persistentDamage';
import './PersistentChip.css';

/**
 * Persistent-damage badge for one combatant (#272). Renders nothing unless
 * cnmh_persistent_global tracks instances for the entry; otherwise a 🩸 chip
 * that opens a popover listing each instance with its clear buttons — the
 * manual surface for "flat check passed" / "healed". The GM can clear anyone;
 * a player can clear their own PC (pass viewerCharId).
 *
 * @param {Object} entry         - Encounter order entry ({ entryId, name, kind, charId? })
 * @param {string} [viewerCharId] - The viewing player's charId (null on GM pages)
 */
const PersistentChip = ({ entry, viewerCharId = null }) => {
  const [persistentMap, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});
  const { appendLog } = useEncounter();
  const { isGm } = useGmAuth();
  const [open, setOpen] = useState(false);

  const instances = persistentMap?.[entry.entryId] || [];
  if (!instances.length) return null;

  const canClear = isGm || (!!viewerCharId && entry.charId === viewerCharId);

  const clear = (inst, how) => {
    setPersistentMap((m) => removeInstance(m || {}, entry.entryId, inst.id));
    appendLog({ type: 'system', text: formatClearance(entry.name, inst, how) });
  };

  const describe = (inst) => `${inst.dice} persistent ${inst.type || 'damage'}${inst.half ? ' (half)' : ''}`;
  const summary = instances.map(describe).join(', ');

  return (
    <span className="pdc-wrap">
      <button
        type="button"
        className="pdc-badge"
        aria-label={`${entry.name}: ${summary}`}
        aria-expanded={open}
        title={summary}
        onClick={() => setOpen((o) => !o)}
      >
        🩸
      </button>
      {open && (
        <div className="pdc-popover" role="dialog" aria-label={`Persistent damage on ${entry.name}`}>
          {instances.map((inst) => (
            <div key={inst.id} className="pdc-row">
              <span className="pdc-desc">
                {describe(inst)}
                {inst.sourceName && <span className="pdc-source"> · {inst.sourceName}</span>}
              </span>
              {canClear && (
                <span className="pdc-actions">
                  <button type="button" className="pdc-clear-btn" onClick={() => clear(inst, 'flat-check')}>
                    Flat check passed
                  </button>
                  <button type="button" className="pdc-clear-btn" onClick={() => clear(inst, 'healed')}>
                    Healed
                  </button>
                </span>
              )}
            </div>
          ))}
          <div className="pdc-note">Damage at end of turn, then DC 15 flat check to end</div>
        </div>
      )}
    </span>
  );
};

export default PersistentChip;
