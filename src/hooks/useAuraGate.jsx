import { useState } from 'react';
import { useAura } from './useAura';
import { activatesAura, requiresAura, isOverflow } from '../utils/kineticAura';

/**
 * Kinetic aura gate (#228, extracted #1317 D1) — impulses need the aura up;
 * override for table rulings. Channel Elements itself activates (no Impulse
 * trait), so it never blocks.
 *
 * Uniform gate-hook shape: { gateOk, blocked, override, setOverride, section,
 * applyOnConfirm }. `applyOnConfirm({ addSuffix, appendLog })` owns the
 * activate/deactivate side effects and the override suffix.
 */
export const useAuraGate = ({ charId, ability, character }) => {
  const aura = useAura(charId);
  const [override, setOverride] = useState(false);

  // Impulses are unusable while the aura is down.
  const blocked = requiresAura(ability) && !aura.active;
  const gateOk = !blocked || override;

  // Kinetic aura (#228): activating abilities switch it on; overflow
  // impulses burn it out on use.
  const applyOnConfirm = ({ addSuffix, appendLog }) => {
    if (activatesAura(ability) && !aura.active) {
      aura.activate();
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s kinetic aura activates`,
      });
    } else if (isOverflow(ability) && aura.active) {
      aura.deactivate();
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s kinetic aura deactivates (overflow)`,
      });
    }
    if (blocked && override) {
      addSuffix(' (override — aura inactive)');
    }
  };

  // Kinetic aura gate (#228) — impulses blocked while the aura is down.
  const section = blocked ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Kinetic Aura</h3>
        <div className="uam-cost-empty">
          Kinetic aura is not active — use Channel Elements first.
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

export default useAuraGate;
