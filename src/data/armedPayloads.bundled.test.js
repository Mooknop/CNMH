// Content-integrity gate for armed payloads (#987).
//
// `armedPayloads` declares damage/saves a cast STORES for a later trigger
// instead of resolving immediately. ArmedPayloads builds each one into a normal
// save request from a *synthetic* single-save ability, so every payload must be
// self-sufficient: a mappable defense (else firing silently produces nothing)
// and a damageData. The `trigger` text is the GM's only cue for when to fire it,
// so it is mandatory too.
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
        expect(mapSpellDefense(p.defense)).toBeTruthy();
        expect(p.damageData?.base).toEqual(expect.any(String));
      }
    }
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
