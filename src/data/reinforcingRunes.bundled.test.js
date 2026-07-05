// Snapshot integrity gate for the shield reinforcing runes (#1165 S5): the seeded
// rune docs + buyable item must line up with the resolver table (shieldRunes) and
// flow through the socket picker (runeSockets). Runs the REAL utils so authoring
// drift (a wrong tierKey/level/price, a missing tier) is caught here.
import { runes, items } from './index';
import { REINFORCING, REINFORCING_TIERS } from '../utils/shieldRunes';
import { runeTarget } from '../utils/runeClassify';
import { gearTarget, gearSockets, compatibleRunes, applyRune } from '../utils/runeSockets';

const reinforcingDocs = runes.filter(
  (r) => r.type === 'fundamental' && r.fundamental === 'reinforcing'
);
const byTier = new Map(reinforcingDocs.map((r) => [r.tierKey, r]));

describe('seeded reinforcing rune docs', () => {
  it('has exactly one fundamental doc per REINFORCING tier, targeting shields', () => {
    expect(reinforcingDocs).toHaveLength(REINFORCING_TIERS.length);
    REINFORCING_TIERS.forEach((tier) => {
      const doc = byTier.get(tier);
      expect(doc, `missing reinforcing doc for tier ${tier}`).toBeTruthy();
      expect(runeTarget(doc)).toBe('shield');
      expect(doc.tierKey).toBe(tier);
    });
  });

  it('each doc name/level/price matches the resolver table', () => {
    REINFORCING_TIERS.forEach((tier) => {
      const doc = byTier.get(tier);
      const t = REINFORCING[tier];
      expect(doc.name).toBe(t.label);
      expect(doc.level).toBe(t.level);
      expect(doc.price).toBe(t.price);
    });
  });
});

describe('buyable reinforcing item', () => {
  const item = items.find((i) => i.id === 'reinforcing');
  it('exists with a variant per tier, matching the docs level/price', () => {
    expect(item).toBeTruthy();
    expect(item.variants).toHaveLength(REINFORCING_TIERS.length);
    REINFORCING_TIERS.forEach((tier, i) => {
      const v = item.variants[i];
      const t = REINFORCING[tier];
      expect(v.name).toBe(t.label);
      expect(v.level).toBe(t.level);
      expect(v.price).toBe(t.price);
    });
  });
});

describe('end-to-end: the seeded docs etch onto a shield', () => {
  const shield = { uid: 's1', name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10, bonus: 2 }, runes: {} };

  it('the reinforcing socket offers every seeded reinforcing doc on an empty shield', () => {
    expect(gearTarget(shield)).toBe('shield');
    expect(gearSockets(shield).some((s) => s.type === 'reinforcing')).toBe(true);
    const offered = compatibleRunes(shield, 'reinforcing', reinforcingDocs).map((r) => r.tierKey).sort();
    expect(offered).toEqual([...REINFORCING_TIERS].sort());
  });

  it('applying the moderate doc sets runes.reinforcing; only higher grades then qualify', () => {
    const etched = applyRune(shield, byTier.get('moderate'));
    expect(etched.runes).toEqual({ reinforcing: 'moderate' });
    const next = compatibleRunes(etched, 'reinforcing', reinforcingDocs).map((r) => r.tierKey).sort();
    expect(next).toEqual(['greater', 'major', 'supreme']);
  });
});
