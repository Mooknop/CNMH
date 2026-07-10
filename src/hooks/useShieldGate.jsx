import { useState } from 'react';
import { useShield } from './useShield';

/**
 * Raised-shield gate (#228, extracted #1317 D1) — Devoted Guardian and kin
 * need the shield up; override for table rulings.
 *
 * Uniform gate-hook shape: { gateOk, blocked, override, setOverride, section,
 * applyOnConfirm }. `applyOnConfirm({ addSuffix })` contributes only the
 * override suffix.
 *
 * @param {string} charId
 * @param {Object} ability
 * @param {Array}  inventory - the character's effective inventory (charData.inventory)
 */
export const useShieldGate = ({ charId, ability, inventory }) => {
  const { raised: shieldRaised } = useShield(charId, inventory);
  const [override, setOverride] = useState(false);

  const blocked = ability?.requiresShieldRaised === true && !shieldRaised;
  const gateOk = !blocked || override;

  const applyOnConfirm = ({ addSuffix }) => {
    if (blocked && override) {
      addSuffix(' (override — shield not raised)');
    }
  };

  // Raised-shield gate (#228) — Devoted Guardian needs the shield up.
  const section = blocked ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Shield</h3>
        <div className="uam-cost-empty">
          Your shield is not raised — Raise a Shield first.
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

  return { gateOk, blocked, override, setOverride, section, applyOnConfirm };
};

export default useShieldGate;
