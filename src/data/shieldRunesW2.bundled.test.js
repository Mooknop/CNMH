// Snapshot integrity gate for the G4 wave-2 (Class C reactive/conditional) shield
// property runes (#1196 G4, #1200): every authored rune is a well-formed shield
// property rune, reaction runes carry a Trigger in their actuated block, and the
// off-engine resolutions say "GM". Runs the REAL socket/spell-cast utils.
import { runes } from './index';
import { runeTarget } from '../utils/runeClassify';
import { actuatedCastsSpell } from '../utils/runeSpellCast';

const byId = (id) => runes.find((r) => r.id === id);

const WAVE2 = [
  'protecting', 'thirsting', 'greater-thirsting', 'major-thirsting',
  'taunting', 'greater-taunting', 'hungering',
  'reflecting', 'greater-reflecting', 'major-reflecting',
  'seeing', 'greater-seeing', 'major-seeing', 'spellguarding',
  'jinxed', 'greater-jinxed', 'projecting', 'confounding',
  'glyphed-lesser', 'glyphed', 'greater-glyphed', 'major-glyphed', 'true-glyphed',
  'reverberating', 'greater-reverberating', 'major-reverberating', 'resuscitating',
];

// Runes with a reaction/triggered activation — the actuated description must
// carry a Trigger clause (the "correct trigger/frequency" bar).
const TRIGGERED = ['protecting', 'reflecting', 'greater-reflecting', 'major-reflecting',
  'jinxed', 'greater-jinxed', 'confounding', 'resuscitating'];

describe('seeded Class C shield runes (G4 W2)', () => {
  it('all 27 wave-2 ids resolve', () => {
    const missing = WAVE2.filter((id) => !byId(id));
    expect(missing, `missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(WAVE2)('%s is a well-formed shield property rune', (id) => {
    const r = byId(id);
    expect(r.type).toBe('property');
    expect(r.target).toBe('shield');
    expect(runeTarget(r)).toBe('shield');
    expect(typeof r.level).toBe('number');
    expect(typeof r.price).toBe('number');
    expect(r.description.length).toBeGreaterThan(20);
  });

  it('activated runes carry a well-formed actuated block', () => {
    const activated = WAVE2.map(byId).filter((r) => r.actuated);
    expect(activated.length).toBeGreaterThan(12);
    for (const r of activated) {
      expect(typeof r.actuated.name).toBe('string');
      expect(typeof r.actuated.frequency).toBe('string');
      expect(Array.isArray(r.actuated.traits)).toBe(true);
      expect(r.actuated.description.length).toBeGreaterThan(10);
      // These are content-only reactive runes — none auto-cast a spellRef.
      expect(actuatedCastsSpell(r.actuated)).toBe(false);
    }
  });

  it('reaction runes name their Trigger in the activation', () => {
    for (const id of TRIGGERED) {
      expect(byId(id).actuated.description, `${id} trigger`).toMatch(/Trigger/);
    }
  });

  it('off-engine resolutions say the GM resolves them (no silent rules text)', () => {
    for (const id of ['reflecting', 'jinxed', 'confounding']) {
      expect(byId(id).actuated.description).toMatch(/GM/);
    }
  });

  it('Confounding surfaces the confuse save DC (29)', () => {
    expect(byId('confounding').actuated.dc).toBe(29);
  });

  it('grade lines price/level increase with grade', () => {
    expect(byId('greater-reflecting').level).toBeGreaterThan(byId('reflecting').level);
    expect(byId('major-thirsting').price).toBeGreaterThan(byId('greater-thirsting').price);
    expect(byId('true-glyphed').level).toBe(20);
  });
});
