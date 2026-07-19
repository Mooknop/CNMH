// Content-integrity gate for the variable-damage-type spells (#987): Reverberating
// Pain [NS] and Shadow's Betrayal [NS] deal a player-chosen damage type. Rather
// than a bespoke engine feature, the choice reuses `riderChoice` — each option
// carries `{ damage: { type } }`, which flows in as the `damageOverride` that
// buildDamageProfile already understands (#268). This asserts the authored
// content produces the right dice + chosen type end-to-end and never regresses
// into netting a base type or losing the picker.
import { spells } from './index';
import { buildDamageProfile } from '../utils/damage';

const spell = (id) => spells.find((s) => s.id === id);
const character = { id: 'c', level: 1, abilities: {} };

// Simulate UseAbilityModal: damageOverride = selectedRider?.damage. The picker
// defaults to the first option, so that's what an un-touched cast resolves to.
const profileForOption = (s, optIndex) =>
  buildDamageProfile(s, character, {
    castRank: s.baseLevel,
    damageOverride: s.riderChoice.options[optIndex].damage,
  });

describe('variable damage type spells (#987)', () => {
  it.each([
    ['reverberating-pain', '2d6', 'basic Will', 10],
    ['shadows-betrayal', '2d8', 'AC', 8],
  ])('%s: typeless damageData + a full riderChoice type picker', (id, base, defense, optCount) => {
    const s = spell(id);
    expect(s).toBeTruthy();
    expect(s.damageData.base).toBe(base);
    expect(s.damageData.type).toBeUndefined(); // type is chosen, not fixed
    expect(s.defense).toBe(defense);
    expect(s.riderChoice.options).toHaveLength(optCount);
    // Every option is a pure type override — dice come from damageData, so no
    // option carries its own base/heightened.
    for (const opt of s.riderChoice.options) {
      expect(opt.damage).toEqual({ type: opt.id });
      expect(opt.label).toEqual(expect.any(String));
    }
  });

  it('Shadow\'s Betrayal carries the Attack trait so it resolves as a spell attack', () => {
    // Without the Attack trait, rollResolution never reaches actor-roll AC and
    // the damage step (effectiveDefense === "ac") never renders (buzzsaw precedent).
    expect(spell('shadows-betrayal').traits).toContain('Attack');
  });

  it('the chosen option drives typeLabel while the dice stay from damageData', () => {
    const rp = spell('reverberating-pain');
    const acid = profileForOption(rp, 0); // first option = acid
    expect(acid.typeLabel).toBe('acid');
    expect(acid.expression).toBe('2d6');
    const fireIdx = rp.riderChoice.options.findIndex((o) => o.id === 'fire');
    expect(profileForOption(rp, fireIdx).typeLabel).toBe('fire');

    const sb = profileForOption(spell('shadows-betrayal'), 0); // first = bludgeoning
    expect(sb.typeLabel).toBe('bludgeoning');
    expect(sb.expression).toBe('2d8');
  });
});
