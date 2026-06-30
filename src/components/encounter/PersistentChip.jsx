import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useCharacter } from '../../hooks/useCharacter';
import { useResolvedEffects } from '../../hooks/useResolvedEffects';
import { useContent } from '../../contexts/ContentContext';
import {
  PERSISTENT_KEY,
  removeInstance,
  formatClearance,
  persistentVsType,
  recoveryDc,
} from '../../utils/persistentDamage';
import { resistanceFor, weaknessFor, flatCheckEasedFor } from '../../utils/EffectUtils';
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
  // The combatant's resolved effects drive resistance/flat-check easing (#900) —
  // app + Foundry effects + worn gear (#922 S2), against the catalog that
  // carries both the live (DO) effects and the dynamic worn defs. Enemies (no
  // charId) resolve to an empty set ⇒ no resistance.
  const { characters } = useContent();
  const character = entry.charId ? (characters || []).find((c) => c.id === entry.charId) : null;
  const charData = useCharacter(character);
  const { effects, catalog } = useResolvedEffects(entry.charId, charData?.inventory);
  const [open, setOpen] = useState(false);

  const instances = persistentMap?.[entry.entryId] || [];
  if (!instances.length) return null;

  const canClear = isGm || (!!viewerCharId && entry.charId === viewerCharId);

  const clear = (inst, how) => {
    setPersistentMap((m) => removeInstance(m || {}, entry.entryId, inst.id));
    appendLog({ type: 'system', text: formatClearance(entry.name, inst, how) });
  };

  const resistanceOf = (inst) => resistanceFor(effects, persistentVsType(inst), catalog);
  const weaknessOf = (inst) => weaknessFor(effects, persistentVsType(inst), catalog);
  const describe = (inst) => {
    const weak = weaknessOf(inst);
    const res = resistanceOf(inst);
    return `${inst.dice} persistent ${inst.type || 'damage'}${inst.half ? ' (half)' : ''}${
      weak ? ` + weakness ${weak}` : ''
    }${res ? ` − resistance ${res}` : ''}`;
  };
  const summary = instances.map(describe).join(', ');

  // Eased recovery DC if any tracked instance's type is eased (Blood Booster
  // eases both bleed and poison, so a mix is rare); the footer states it.
  const eased = instances.some((inst) => flatCheckEasedFor(effects, persistentVsType(inst), catalog));
  const noteDc = recoveryDc({ easeFlatCheck: eased });

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
          <div className="pdc-note">Damage at end of turn, then DC {noteDc} flat check to end</div>
        </div>
      )}
    </span>
  );
};

export default PersistentChip;
