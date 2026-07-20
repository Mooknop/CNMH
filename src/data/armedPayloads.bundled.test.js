// Content-integrity gate for armed payloads (#987).
//
// `armedPayloads` declares damage/saves a cast STORES for a later trigger
// instead of resolving immediately. There are two shapes:
//
//   save payload      — has a mappable `defense`; firing builds a normal save
//                       request (Targeting Beacon's explosion).
//   persistent payload — has NO `defense`; the damage simply lands when the
//                       trigger happens, so its dice are authored as persistent
//                       riders and firing records them (Gruesome Marionettist).
//
// Either way the payload must be self-sufficient — an unmappable defense would
// make firing silently produce nothing — and the `trigger` text is the GM's only
// cue for when to fire it, so it is always mandatory.
import { spells } from './index';
import { mapSpellDefense } from '../utils/rollResolution';

const withPayloads = spells.filter((s) => Array.isArray(s.armedPayloads) && s.armedPayloads.length);

describe('armed payloads (#987)', () => {
  it('every authored payload is self-sufficient (id, label, trigger, mappable defense, damageData)', () => {
    expect(withPayloads.length).toBeGreaterThan(0);
    const ids = new Set();
    for (const s of withPayloads) {
      for (const p of s.armedPayloads) {
        expect(typeof p.id).toBe('string');
        expect(p.id.length).toBeGreaterThan(0);
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
        expect(typeof p.label).toBe('string');
        // Without a trigger the GM has no cue for when this should fire.
        expect(typeof p.trigger).toBe('string');
        expect(p.trigger.length).toBeGreaterThan(0);

        if (p.defense) {
          // Save payload: the defense must map, or firing produces nothing.
          expect(mapSpellDefense(p.defense)).toBeTruthy();
          expect(p.damageData?.base).toEqual(expect.any(String));
        } else {
          // Persistent payload: no save, so it must carry persistent riders.
          const riders = p.damageData?.riders || [];
          expect(riders.length).toBeGreaterThan(0);
          for (const r of riders) {
            expect(r.persistent?.dice).toEqual(expect.any(String));
            expect(r.persistent?.type).toEqual(expect.any(String));
          }
        }
      }
    }
  });

  it('area payloads are repeatable — they fire again each time the trigger recurs', () => {
    // Autumn's Howl / Winter's Grasp damage whoever ends a turn in the area, and
    // Cascading Caltrops fires on every entry. A one-shot payload would vanish
    // after the first creature.
    for (const id of ['autumns-howl', 'winters-grasp', 'cascading-caltrops']) {
      const p = spells.find((s) => s.id === id).armedPayloads[0];
      expect(p.repeatable).toBe(true);
      expect(p.trigger).toMatch(/turn|enters/i);
    }
  });

  it("Autumn's Howl ticks persistent piercing with no save", () => {
    const p = spells.find((s) => s.id === 'autumns-howl').armedPayloads[0];
    expect(p.defense).toBeUndefined();          // no save — it just applies
    expect(p.severityFromSave).toBeFalsy();     // severity never varies
    expect(p.damageData.riders[0].persistent).toMatchObject({ dice: '1d6', type: 'piercing' });
    // "+1 per rank" is a FLAT bump to the persistent damage, not another die.
    expect(p.damageData.heightened['+1'].persistent).toBe(1);
    // The cast-time blast is untouched.
    expect(spells.find((s) => s.id === 'autumns-howl').damageData.base).toBe('3d6');
  });

  it("Winter's Grasp ticks flat 8 cold on a basic Fortitude save", () => {
    const p = spells.find((s) => s.id === 'winters-grasp').armedPayloads[0];
    expect(mapSpellDefense(p.defense)).toBe('fortitude'); // NOT the cast's Reflex
    expect(p.damageData).toMatchObject({ base: '8', type: 'cold' });
    expect(p.damageData.heightened['+1'].base).toBe('2');
  });

  it('Cascading Caltrops zeroes a success and splits the Speed penalty by degree', () => {
    const p = spells.find((s) => s.id === 'cascading-caltrops').armedPayloads[0];
    expect(mapSpellDefense(p.defense)).toBe('reflex');
    // "Success: the creature is unaffected" — not the basic-save half.
    expect(p.damageData.degrees).toEqual({ success: 0 });
    const riders = p.damageData.riders;
    expect(riders.find((r) => r.persistent)?.on).toEqual(['failure', 'criticalFailure']);
    // −5 ft on a failure, −10 ft on a crit failure: degree-exclusive riders, the
    // Creeping Cold carve-out shape.
    const speeds = riders.filter((r) => r.condition);
    expect(speeds).toHaveLength(2);
    expect(speeds.find((r) => r.on.includes('failure') && !r.on.includes('criticalFailure')).condition).toMatch(/–5-foot/);
    expect(speeds.find((r) => r.on.includes('criticalFailure')).condition).toMatch(/–10-foot/);
    // The Acrobatics alternative is the creature's choice, so it must be stated.
    expect(p.note).toMatch(/Acrobatics/i);
  });

  it('Gruesome Marionettist arms its bleed on the prohibited action, not at cast', () => {
    const gm = spells.find((s) => s.id === 'gruesome-marionettist');
    // The whole reason this was deferred: a cast-time persistent rider would
    // record the bleed on save resolution and tick it every round regardless of
    // whether the creature ever takes the prohibited action.
    expect(gm.damageData).toBeUndefined();

    expect(gm.armedPayloads).toHaveLength(1);
    const bleed = gm.armedPayloads[0];
    expect(bleed.defense).toBeUndefined(); // no save on firing
    expect(bleed.trigger).toMatch(/prohibited/i);
    // Repeatable: the spell lasts its duration, so it can fire on later turns.
    expect(bleed.repeatable).toBe(true);
    expect(bleed.damageData.riders[0].persistent).toMatchObject({ dice: '5d10', type: 'bleed' });
    expect(bleed.damageData.heightened['+1'].persistent).toBe('1d10');
    // The directed-action immunity is a GM call, so it must be stated.
    expect(bleed.note).toMatch(/directed/i);
    // Its severity DOES vary (half/full/double from the cast save), unlike the
    // area ticks — so the panel must offer the picker.
    expect(bleed.severityFromSave).toBe(true);
  });

  it('Targeting Beacon arms its explosion rather than resolving it at cast', () => {
    const tb = spells.find((s) => s.id === 'targeting-beacon');
    // The whole point: no cast-time damageData, because the beacon only goes off
    // on a LATER hit. Wiring it as damageData would detonate it at cast.
    expect(tb.damageData).toBeUndefined();

    expect(tb.armedPayloads).toHaveLength(1);
    const boom = tb.armedPayloads[0];
    expect(boom.damageData).toMatchObject({ base: '6d6', type: 'fire' });
    expect(boom.damageData.heightened['+1'].base).toBe('2d6');
    expect(mapSpellDefense(boom.defense)).toBe('reflex');
    expect(boom.trigger).toMatch(/hits/i);
    // One-shot: "when the beacon explodes, the spell ends".
    expect(boom.repeatable).toBeFalsy();
  });
});
