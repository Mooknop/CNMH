import { useState } from 'react';
import { bloodMagicTriggered, bloodMagicOption, BLOOD_MAGIC_OPTIONS } from '../utils/bloodMagic';
import { applyAbility } from '../utils/applyAbility';

/**
 * Blood magic (#227, extracted #1317 D2) — a bloodline-flagged spell — cast
 * directly or as the spell a Spellshape chains into — triggers the bloodline's
 * rider (Imperial: +1 status to AC or saves, caster's pick).
 *
 * Section-hook shape (adapted from the D1 gate pattern): { section,
 * applyOnConfirm }. TWO sources of truth, on purpose: at render time the
 * section gates on the live `chainSpell` state (the spell currently picked in
 * the chained-cast section), but at confirm time the rider re-derives from
 * `chainResults?.spellBloodline` — passed in via ctx — so confirm matches what
 * was actually cast.
 */
export const useBloodMagicSection = ({ character, ability, effectiveVerb, chainSpell }) => {
  // Blood magic (#227) — Imperial: +1 status to AC or saves, caster's pick.
  const [bloodMagicChoice, setBloodMagicChoice] = useState('ac');

  const hasChainSpell = ability?.chain?.into === 'spell';

  // Blood magic (#227): a bloodline-flagged spell — cast directly or as the
  // spell a Spellshape chains into — triggers the bloodline's rider.
  const bloodMagicActive = bloodMagicTriggered(
    character,
    effectiveVerb === 'cast' ? ability : null,
    hasChainSpell ? chainSpell : null
  );

  // Blood magic (#227): the bloodline rider lands on the caster as a catalog
  // effect until the start of their next turn. Re-derived from chainResults
  // (not the live chainSpell state) so confirm matches what was actually cast.
  const applyOnConfirm = ({
    chainResults,
    casterEntryId,
    order,
    encounter,
    characters,
    getState,
    sendUpdate,
    appendLog,
    nowSecs,
  }) => {
    const bloodMagicFires = bloodMagicTriggered(
      character,
      effectiveVerb === 'cast' ? ability : null,
      hasChainSpell && chainResults?.spellBloodline ? { bloodline: true } : null
    );
    if (bloodMagicFires) {
      const bmOption = bloodMagicOption(bloodMagicChoice);
      applyAbility({
        ability: {
          name: `Blood Magic (${character.spellcasting.bloodline.name || 'bloodline'})`,
          effects: [{ effectId: bmOption.effectId, applyTo: 'self', duration: { until: 'caster-turn-start' } }],
        },
        caster: character, casterEntryId, targetCharIds: [], enemyTargetNames: [],
        order, encounter, characters, getState, sendUpdate, appendLog,
        verb: 'gains', nowSecs,
      });
    }
  };

  // Blood magic (#227) — bloodline spell cast: pick the rider
  const section = bloodMagicActive ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">
          Blood Magic{character.spellcasting?.bloodline?.name ? ` (${character.spellcasting.bloodline.name})` : ''}
        </h3>
        <div className="uam-variant-note">{character.spellcasting.bloodline.blood_magic}</div>
        <div className="uam-cost-options" role="radiogroup" aria-label="Blood magic choice">
          {BLOOD_MAGIC_OPTIONS.map((opt) => (
            <label key={opt.id} className="uam-cost-option">
              <input
                type="radio"
                name="blood-magic-choice"
                checked={bloodMagicChoice === opt.id}
                onChange={() => setBloodMagicChoice(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </section>
    </>
  ) : null;

  // `active` mirrors the render-time gate (the section the caster can see) —
  // the flourish resolver (#1347) keys Jade's loud variant off it at confirm.
  return { section, applyOnConfirm, active: bloodMagicActive };
};

export default useBloodMagicSection;
