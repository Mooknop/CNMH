// Content-integrity gate for secondary damage profiles (#987).
//
// `secondaryProfiles` declares extra damage zones with their own target set and
// save (Propagating Arc's splash). useSecondaryProfiles builds one save request
// per zone from a *synthetic* single-save ability, so each profile must carry
// everything that ability needs on its own: a mappable defense and a damageData.
import { spells } from './index';
import { mapSpellDefense } from '../utils/rollResolution';

const withSecondary = spells.filter((s) => Array.isArray(s.secondaryProfiles) && s.secondaryProfiles.length);

describe('secondary damage profiles (#987)', () => {
  it('every authored profile is self-sufficient (id, label, mappable defense, damageData)', () => {
    expect(withSecondary.length).toBeGreaterThan(0);
    const ids = new Set();
    for (const s of withSecondary) {
      for (const p of s.secondaryProfiles) {
        expect(typeof p.id).toBe('string');
        expect(p.id.length).toBeGreaterThan(0);
        expect(ids.has(p.id)).toBe(false); // ids key per-zone state — must be unique
        ids.add(p.id);
        expect(typeof p.label).toBe('string');
        // A zone that can't map its defense would silently emit no save request.
        expect(mapSpellDefense(p.defense)).toBeTruthy();
        expect(p.damageData?.base).toEqual(expect.any(String));
      }
    }
  });

  it('Propagating Arc splashes 2d6 electricity on a separate basic Reflex save', () => {
    const arc = spells.find((s) => s.id === 'propagating-arc');
    // Primary zone is untouched.
    expect(arc.damageData.base).toBe('2d12');
    expect(arc.defense).toBe('basic Reflex');

    expect(arc.secondaryProfiles).toHaveLength(1);
    const splash = arc.secondaryProfiles[0];
    expect(splash.damageData.base).toBe('2d6');
    expect(splash.damageData.type).toBe('electricity');
    expect(splash.damageData.heightened['+1'].base).toBe('1d6');
    expect(mapSpellDefense(splash.defense)).toBe('reflex');
    // The "only if the target failed" / 10–20 ft half-damage band are GM calls,
    // so they must be stated on the zone rather than silently dropped.
    expect(splash.note).toMatch(/fail/i);
    expect(splash.note).toMatch(/half/i);
  });
});
