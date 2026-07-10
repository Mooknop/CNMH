import { useState } from 'react';
import { useOmen } from './useOmen';

/**
 * Harrow omen gate (#227, extracted #1317 D1) — omen-bound abilities (Avoid
 * Dire Fate, Harrow Casting) need an active omen; using a clearsOmen ability
 * spends it.
 *
 * Uniform gate-hook shape: { gateOk, blocked, override, setOverride, section,
 * applyOnConfirm } plus the live `omen` object re-exported for the modal's
 * omen summary line and the Harrow-Casting narrative block (which stay in the
 * orchestrator — this hook is the GATE only).
 */
export const useOmenGate = ({ charId, ability, character }) => {
  const omen = useOmen(charId);
  const [override, setOverride] = useState(false);

  // Omen-bound abilities need an active omen.
  const blocked = ability?.requiresOmen === true && !omen.suit;
  const gateOk = !blocked || override;

  const applyOnConfirm = ({ addSuffix, appendLog }) => {
    if (blocked && override) {
      addSuffix(' (override — no active omen)');
    }
    // Harrow omen (#227): clearsOmen abilities spend the active omen.
    if (ability.clearsOmen === true && omen.suit) {
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s harrow omen (${omen.suit}) is spent (${ability.name})`,
      });
      omen.clear();
    }
  };

  // Harrow omen gate (#227) — omen-bound abilities need an active omen.
  const section = blocked ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Harrow Omen</h3>
        <div className="uam-cost-empty">
          No active harrow omen — draw an omen from your deck first.
        </div>
        <label className="uam-cost-override">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          Override (GM ruling) — use anyway
        </label>
      </section>
    </>
  ) : null;

  return { gateOk, blocked, override, setOverride, section, applyOnConfirm, omen };
};

export default useOmenGate;
