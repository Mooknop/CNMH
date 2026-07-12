import { describe, it, expect } from 'vitest';
import {
  isAugmentation, augTargets, hostMatchesAugTarget, augmentationUsageAllows,
  augmentationOf, hasAugmentation, augmentationFits, canAugment,
  applyAugmentation, clearAugmentation,
  isGmAdjudicatedAugmentation, GM_ADJUDICATED_AUGMENTS,
  augmentationArmorDeltas,
} from './augmentations';

const mirror = { id: 'mirror', type: 'augmentation', augTarget: ['shield'], name: 'Mirror', price: 1 };
// A shield augmentation whose size gate is medium/heavy only.
const harness = {
  id: 'shield-harness', type: 'augmentation', augTarget: ['shield'], name: 'Shield Harness',
  usage: 'applied to a medium or heavy shield', shieldCategories: ['medium', 'heavy'],
};

const lightShield = { id: 'targe', name: 'Targe', shield: { bonus: 1 }, weight: 0.1 };
const heavyShield = { id: 'scutum', name: 'Scutum', shield: { bonus: 2 }, weight: 4 };
const sword = { id: 'sword', name: 'Longsword', strikes: [{ name: 'Longsword' }] };

describe('augmentation classification', () => {
  it('recognizes augmentation docs', () => {
    expect(isAugmentation(mirror)).toBe(true);
    expect(isAugmentation(sword)).toBe(false);
    expect(isAugmentation(null)).toBe(false);
  });

  it('normalizes augTarget to a lowercase array', () => {
    expect(augTargets(mirror)).toEqual(['shield']);
    expect(augTargets({ augTarget: 'Weapon' })).toEqual(['weapon']);
    expect(augTargets({ augTarget: ['Armor', 'Weapon'] })).toEqual(['armor', 'weapon']);
    expect(augTargets({})).toEqual([]);
  });

  it('matches host type against the augmentation target', () => {
    expect(hostMatchesAugTarget(lightShield, mirror)).toBe(true);
    expect(hostMatchesAugTarget(sword, mirror)).toBe(false);
    expect(hostMatchesAugTarget(sword, { augTarget: ['weapon'] })).toBe(true);
  });
});

describe('augmentationUsageAllows (shield size gate)', () => {
  it('passes unrestricted shield augmentations', () => {
    expect(augmentationUsageAllows(lightShield, mirror)).toBe(true);
    expect(augmentationUsageAllows(heavyShield, mirror)).toBe(true);
  });

  it('enforces the size gate on restricted augmentations', () => {
    expect(augmentationUsageAllows(lightShield, harness)).toBe(false); // light not admitted
    expect(augmentationUsageAllows(heavyShield, harness)).toBe(true);
  });

  it('never blocks non-shield hosts', () => {
    expect(augmentationUsageAllows(sword, harness)).toBe(true);
  });
});

describe('canAugment matrix', () => {
  it('rejects a wrong-target host', () => {
    expect(canAugment(sword, mirror)).toBe(false);
  });

  it('rejects a host failing the usage gate', () => {
    expect(canAugment(lightShield, harness)).toBe(false);
    expect(canAugment(heavyShield, harness)).toBe(true);
  });

  it('rejects a host whose slot is already occupied', () => {
    const augmented = { ...lightShield, augmentation: { ref: 'coat-of-arms' } };
    expect(hasAugmentation(augmented)).toBe(true);
    expect(canAugment(augmented, mirror)).toBe(false);
    // …but augmentationFits still admits it (swap path).
    expect(augmentationFits(augmented, mirror)).toBe(true);
  });

  it('accepts a fitting augmentation onto an empty slot', () => {
    expect(canAugment(lightShield, mirror)).toBe(true);
  });
});

describe('apply / clear entry shapes', () => {
  it('applyAugmentation writes the binding with a fresh uid, dropping transient fields', () => {
    const host = { ...lightShield, uid: 'u1', state: 'held1', hand: 1 };
    const next = applyAugmentation(host, mirror);
    expect(next.augmentation).toEqual({ ref: 'mirror' });
    expect(next.uid).toBeDefined();
    expect(next.uid).not.toBe('u1');
    expect(next).not.toHaveProperty('state');
    expect(next).not.toHaveProperty('hand');
    expect(next.name).toBe('Targe');
  });

  it('carries a choice onto the binding when given', () => {
    const next = applyAugmentation(lightShield, { ...mirror, id: 'ancestral-predator' }, { choice: 'Dragon' });
    expect(next.augmentation).toEqual({ ref: 'ancestral-predator', choice: 'Dragon' });
  });

  it('swap overwrites the existing binding (destroys the old)', () => {
    const augmented = { ...lightShield, uid: 'u1', augmentation: { ref: 'coat-of-arms' } };
    const next = applyAugmentation(augmented, mirror);
    expect(next.augmentation).toEqual({ ref: 'mirror' });
  });

  it('returns null when the augmentation does not fit', () => {
    expect(applyAugmentation(sword, mirror)).toBeNull();
    expect(applyAugmentation(lightShield, harness)).toBeNull();
    expect(applyAugmentation(lightShield, sword)).toBeNull(); // not an augmentation
  });

  it('clearAugmentation removes the binding with a fresh uid', () => {
    const augmented = { ...lightShield, uid: 'u1', augmentation: { ref: 'mirror' } };
    const next = clearAugmentation(augmented);
    expect(next).not.toHaveProperty('augmentation');
    expect(next.uid).not.toBe('u1');
    expect(augmentationOf(next)).toBeNull();
  });

  it('clearAugmentation returns null when there is nothing to remove', () => {
    expect(clearAugmentation(lightShield)).toBeNull();
  });
});

describe('isGmAdjudicatedAugmentation (#1411 C/E)', () => {
  it('flags the enemy-side and consumable augmentations', () => {
    for (const id of ['twining-chains', 'burnished-plating', 'improved-mirror', 'weapon-siphon', 'injection-reservoir']) {
      expect(GM_ADJUDICATED_AUGMENTS.has(id)).toBe(true);
      expect(isGmAdjudicatedAugmentation(id)).toBe(true);
    }
  });

  it('accepts an id string, a resolved doc, or a { ref } binding', () => {
    expect(isGmAdjudicatedAugmentation({ id: 'twining-chains', name: 'Twining Chains' })).toBe(true);
    expect(isGmAdjudicatedAugmentation({ ref: 'weapon-siphon' })).toBe(true);
  });

  it('does not flag a wired or structural augmentation', () => {
    expect(isGmAdjudicatedAugmentation('eyecatcher')).toBe(false); // wired (skill bonus)
    expect(isGmAdjudicatedAugmentation('throwing-shield')).toBe(false); // wired (derived strike)
    expect(isGmAdjudicatedAugmentation('shield-sheath')).toBe(false); // structural note
    expect(isGmAdjudicatedAugmentation(null)).toBe(false);
    expect(isGmAdjudicatedAugmentation({})).toBe(false);
  });
});

describe('augmentationArmorDeltas (#1411 armor penalties)', () => {
  it('returns the armor-stat deltas for an augmented host', () => {
    expect(augmentationArmorDeltas({ armor: {}, augmentation: { id: 'subtle-armor' } })).toEqual({ strength: 2, bulk: 1 });
    expect(augmentationArmorDeltas({ augmentation: { ref: 'reinforced-surcoat' } })).toEqual({ speedPenalty: 5 });
    expect(augmentationArmorDeltas({ augmentation: { id: 'parade-armor' } })).toEqual({ bulk: 1 });
  });

  it('returns {} for a host with no armor augmentation', () => {
    expect(augmentationArmorDeltas({ augmentation: { id: 'eyecatcher' } })).toEqual({}); // weapon aug, no armor delta
    expect(augmentationArmorDeltas({ name: 'Rope' })).toEqual({});
    expect(augmentationArmorDeltas(null)).toEqual({});
  });
});
