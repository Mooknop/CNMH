import { useState } from 'react';
import { itemUidOf } from '../utils/affix';
import {
  eligibleCatalystsFor,
  sumCatalystActions,
  catalystSummary,
  catalystAddActions,
} from '../utils/catalyst';

/**
 * Catalysts (#1209, extracted #1317 D2) — held catalysts whose target spell
 * matches this cast are offered as opt-in adds. Selecting one consumes it and
 * folds its extra actions into the cast cost; its rider effect is logged for
 * the GM.
 *
 * Section-hook shape (adapted from the D1 gate pattern): { catalystActionBump,
 * section, applyOnConfirm }. `catalystActionBump` is re-exported for the
 * orchestrator's action spend. `consumed`/`setConsumed` stay in the
 * orchestrator (shared with the chamber cluster) and are passed in.
 * `applyOnConfirm({ appendLog })` owns the consume + rider-log slice.
 */
export const useCatalystSection = ({
  effectiveVerb,
  charData,
  ability,
  character,
  consumed,
  setConsumed,
}) => {
  // Catalyst adds (#1209) — held catalysts the player chooses to fold into this
  // cast (by uid). Eligibility is computed once the cast spell/inventory are known.
  const [catalystIds, setCatalystIds] = useState([]);

  const eligibleCatalysts = effectiveVerb === 'cast'
    ? eligibleCatalystsFor(charData?.inventory, ability?.id, consumed)
    : [];
  const selectedCatalysts = eligibleCatalysts.filter((c) => catalystIds.includes(itemUidOf(c)));
  const catalystActionBump = sumCatalystActions(selectedCatalysts);
  const toggleCatalyst = (uid) =>
    setCatalystIds((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  // Catalysts (#1209): consume each added catalyst (by name, like potions) and
  // log its rider effect. The extra actions fold into the cast spend.
  const applyOnConfirm = ({ appendLog }) => {
    selectedCatalysts.forEach((cat) => {
      setConsumed((cur) => ({ ...(cur || {}), [cat.name]: ((cur || {})[cat.name] || 0) + 1 }));
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name} adds ${cat.name} to ${ability.name} — ${catalystSummary(cat)}`,
      });
    });
  };

  const section = eligibleCatalysts.length > 0 ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Catalysts</h3>
        <div className="uam-cost-options" role="group" aria-label="Catalysts">
          {eligibleCatalysts.map((cat) => {
            const uid = itemUidOf(cat);
            const extra = catalystAddActions(cat);
            return (
              <label key={uid} className="uam-cost-option">
                <input
                  type="checkbox"
                  data-testid={`catalyst-${uid}`}
                  checked={catalystIds.includes(uid)}
                  onChange={() => toggleCatalyst(uid)}
                />
                {cat.name}{extra ? ` (+${extra} action${extra === 1 ? '' : 's'})` : ''}
              </label>
            );
          })}
        </div>
        {selectedCatalysts.map((cat) => (
          <div key={itemUidOf(cat)} className="uam-variant-note">{catalystSummary(cat)}</div>
        ))}
      </section>
    </>
  ) : null;

  return { catalystActionBump, section, applyOnConfirm };
};

export default useCatalystSection;
