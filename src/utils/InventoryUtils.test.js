import {
  formatBulk,
  calculateItemsBulk,
  calculateContainerBulk,
  isContainer,
  formatDecimal,
  getBulkStatus,
  normalizeShield,
  isShieldBroken,
  isConsumable,
  remainingQuantity,
  applyConsumedOverlay,
  flattenInventory,
  isInvestable,
  isItemMagical,
  isPowerRing,
  wouldBreakPowerRingLimit,
  ARMOR_CATEGORIES,
  isArmor,
  normalizeArmor,
  baseSpellItemArt,
} from './InventoryUtils';

describe('InventoryUtils', () => {
  describe('formatBulk', () => {
    it('should format negligible bulk as —', () => {
      expect(formatBulk(0)).toBe('—');
    });

    it('should format light bulk as L', () => {
      expect(formatBulk(0.1)).toBe('L');
      expect(formatBulk(0.5)).toBe('L');
      expect(formatBulk(0.9)).toBe('L');
    });

    it('should format regular bulk as number', () => {
      expect(formatBulk(1)).toBe('1');
      expect(formatBulk(2)).toBe('2');
      expect(formatBulk(1.5)).toBe('1.5');
      expect(formatBulk(3.75)).toBe('3.8');
    });

    it('should handle edge cases', () => {
      expect(formatBulk(0.05)).toBe('L');
      expect(formatBulk(0.99)).toBe('L');
    });
  });

  describe('calculateItemsBulk', () => {
    it('should return 0 for empty or invalid input', () => {
      expect(calculateItemsBulk(null)).toBe(0);
      expect(calculateItemsBulk(undefined)).toBe(0);
      expect(calculateItemsBulk([])).toBe(0);
    });

    it('should calculate bulk for simple items without containers', () => {
      const items = [
        { weight: 1, quantity: 1 },
        { weight: 2, quantity: 1 },
        { weight: 0.5, quantity: 2 }
      ];
      expect(calculateItemsBulk(items)).toBe(4); // 1 + 2 + 0.5*2
    });

    it('should calculate bulk correctly with quantities', () => {
      const items = [
        { weight: 1, quantity: 3 },
        { weight: 2, quantity: 2 }
      ];
      expect(calculateItemsBulk(items)).toBe(7); // 1*3 + 2*2
    });

    it('should handle items without weight or quantity', () => {
      const items = [
        { quantity: 1 },
        { weight: 1 },
        {}
      ];
      expect(calculateItemsBulk(items)).toBe(1);
    });

    it('should calculate bulk for containers with contents', () => {
      const items = [
        {
          weight: 1,
          quantity: 1,
          container: {
            contents: [
              { weight: 0.5, quantity: 1 },
              { weight: 0.5, quantity: 1 }
            ],
            ignored: 0
          }
        }
      ];
      expect(calculateItemsBulk(items)).toBe(2); // 1 + (0.5 + 0.5)
    });

    it('should respect ignored bulk property for containers', () => {
      const items = [
        {
          weight: 1,
          quantity: 1,
          container: {
            contents: [
              { weight: 5, quantity: 1 }
            ],
            ignored: 4
          }
        }
      ];
      expect(calculateItemsBulk(items)).toBe(2); // 1 + (5 - 4)
    });

    it('should handle nested containers', () => {
      const items = [
        {
          weight: 1,
          container: {
            contents: [
              {
                weight: 1,
                container: {
                  contents: [
                    { weight: 1, quantity: 1 }
                  ],
                  ignored: 0
                }
              }
            ],
            ignored: 0
          }
        }
      ];
      expect(calculateItemsBulk(items)).toBe(3); // 1 + 1 + 1
    });

    // Slice 2: a dropped entry (and anything inside it) stops counting.
    it('excludes a dropped top-level item from carried bulk', () => {
      const items = [
        { weight: 2, quantity: 1, state: 'worn' },
        { weight: 3, quantity: 1, state: 'dropped' },
        { weight: 1, quantity: 2, state: 'held1' },
      ];
      expect(calculateItemsBulk(items)).toBe(4); // 2 + (skip 3) + 1*2
    });

    it('excludes a dropped container together with its whole subtree', () => {
      const items = [
        {
          weight: 1,
          state: 'dropped',
          container: { ignored: 0, contents: [{ weight: 5, quantity: 1, state: 'stowed' }] },
        },
        { weight: 2, quantity: 1, state: 'worn' },
      ];
      expect(calculateItemsBulk(items)).toBe(2); // whole dropped backpack ignored
    });

    it('counts worn/held/stowed exactly as before (state is otherwise inert)', () => {
      const withState = [
        { weight: 1, quantity: 1, state: 'held2' },
        {
          weight: 1,
          state: 'worn',
          container: { ignored: 2, contents: [{ weight: 1, quantity: 5, state: 'stowed' }] },
        },
      ];
      const withoutState = [
        { weight: 1, quantity: 1 },
        { weight: 1, container: { ignored: 2, contents: [{ weight: 1, quantity: 5 }] } },
      ];
      expect(calculateItemsBulk(withState)).toBe(calculateItemsBulk(withoutState));
    });
  });

  describe('calculateContainerBulk', () => {
    it('should return zeros for null or empty containers', () => {
      expect(calculateContainerBulk(null)).toEqual({
        contentsBulk: 0,
        capacity: 0,
        percentFull: 0
      });

      expect(calculateContainerBulk({})).toEqual({
        contentsBulk: 0,
        capacity: 0,
        percentFull: 0
      });
    });

    it('should calculate container bulk correctly', () => {
      const container = {
        contents: [
          { weight: 1, quantity: 1 },
          { weight: 2, quantity: 1 }
        ],
        capacity: 10
      };
      const result = calculateContainerBulk(container);
      expect(result.contentsBulk).toBe(3);
      expect(result.capacity).toBe(10);
      expect(result.percentFull).toBe(30);
    });

    it('should cap percentFull at 100', () => {
      const container = {
        contents: [
          { weight: 10, quantity: 1 }
        ],
        capacity: 5
      };
      const result = calculateContainerBulk(container);
      expect(result.percentFull).toBe(100);
    });

    it('should handle containers with zero capacity', () => {
      const container = {
        contents: [
          { weight: 1, quantity: 1 }
        ],
        capacity: 0
      };
      const result = calculateContainerBulk(container);
      expect(result.percentFull).toBe(0);
    });
  });

  describe('isContainer', () => {
    it('should return true for items with container property', () => {
      expect(isContainer({ container: { contents: [] } })).toBe(true);
      expect(isContainer({ name: 'Bag', container: {} })).toBe(true);
    });

    it('should return false for non-container items', () => {
      expect(isContainer({ name: 'Sword' })).toBe(false);
      expect(isContainer({})).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isContainer(null)).toBe(false);
      expect(isContainer(undefined)).toBe(false);
    });
  });

  describe('formatDecimal', () => {
    it('should format numbers correctly', () => {
      expect(formatDecimal(1.0)).toBe('1');
      expect(formatDecimal(1.5)).toBe('1.5');
      expect(formatDecimal(2.25)).toBe('2.3');
      expect(formatDecimal(3.999)).toBe('4');
    });

    it('should handle string inputs', () => {
      expect(formatDecimal('2.0')).toBe('2');
      expect(formatDecimal('2.5')).toBe('2.5');
    });
  });

  describe('getBulkStatus', () => {
    it('should calculate bulk percentage correctly', () => {
      const result = getBulkStatus(5, 10, 7);
      expect(result.percentage).toBe(50);
    });

    it('should identify encumbered status correctly', () => {
      const result = getBulkStatus(8, 10, 7);
      expect(result.isEncumbered).toBe(true);
      expect(result.isOverencumbered).toBe(false);
    });

    it('should identify overencumbered status correctly', () => {
      const result = getBulkStatus(12, 10, 7);
      expect(result.isEncumbered).toBe(false);
      expect(result.isOverencumbered).toBe(true);
    });

    it('should identify not encumbered status correctly', () => {
      const result = getBulkStatus(5, 10, 7);
      expect(result.isEncumbered).toBe(false);
      expect(result.isOverencumbered).toBe(false);
    });

    it('should handle zero bulk limit', () => {
      const result = getBulkStatus(5, 0, 0);
      expect(result.percentage).toBe(0);
      expect(result.isEncumbered).toBe(false);
      expect(result.isOverencumbered).toBe(true);
    });

    it('should handle bulk at threshold exactly', () => {
      const result = getBulkStatus(7, 10, 7);
      expect(result.isEncumbered).toBe(false);
      expect(result.isOverencumbered).toBe(false);
    });

    it('should handle bulk above threshold', () => {
      const result = getBulkStatus(7.1, 10, 7);
      expect(result.isEncumbered).toBe(true);
    });
  });

  describe('normalizeShield', () => {
    const canonical = { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 };

    it('returns null for a non-shield', () => {
      expect(normalizeShield(null)).toBeNull();
      expect(normalizeShield(undefined)).toBeNull();
      expect(normalizeShield('nope')).toBeNull();
    });

    it('maps legacy { health, breakThreshold } to canonical', () => {
      const legacy = { bonus: 2, hardness: 5, health: 20, breakThreshold: 10 };
      expect(normalizeShield(legacy)).toEqual(canonical);
    });

    it('maps the ItemModal { broken_threshold } spelling to canonical', () => {
      const legacy = { bonus: 2, hardness: 5, hp: 20, broken_threshold: 10 };
      expect(normalizeShield(legacy)).toEqual(canonical);
    });

    it('is idempotent on already-canonical data', () => {
      expect(normalizeShield(canonical)).toEqual(canonical);
    });

    it('legacy and canonical shapes normalize equal', () => {
      const legacy = { health: 20, breakThreshold: 10, hardness: 5, bonus: 2 };
      expect(normalizeShield(legacy)).toEqual(normalizeShield(canonical));
    });

    it('preserves extra fields and only emits keys that are present', () => {
      const out = normalizeShield({ health: 64, breakThreshold: 32, speedPenalty: 5 });
      expect(out).toEqual({ hp: 64, brokenThreshold: 32, speedPenalty: 5 });
    });

    it('drops legacy keys (no stale duplicates left behind)', () => {
      const out = normalizeShield({ health: 20, breakThreshold: 10, hardness: 5, bonus: 2 });
      expect(out).not.toHaveProperty('health');
      expect(out).not.toHaveProperty('breakThreshold');
      expect(out).not.toHaveProperty('broken_threshold');
    });
  });

  describe('ARMOR_CATEGORIES', () => {
    it('is the four PF2e proficiency categories', () => {
      expect(ARMOR_CATEGORIES).toEqual(['unarmored', 'light', 'medium', 'heavy']);
    });
  });

  describe('isArmor', () => {
    it('is true only for items carrying an armor object', () => {
      expect(isArmor({ armor: { category: 'heavy' } })).toBe(true);
      expect(isArmor({ name: 'Dagger' })).toBe(false);
      expect(isArmor({ armor: null })).toBe(false);
      expect(isArmor(null)).toBe(false);
    });
  });

  describe('normalizeArmor', () => {
    it('returns null for a non-armor block', () => {
      expect(normalizeArmor(null)).toBeNull();
      expect(normalizeArmor(undefined)).toBeNull();
      expect(normalizeArmor('nope')).toBeNull();
    });

    it('keeps the canonical fields and preserves extras', () => {
      const armor = { category: 'heavy', acBonus: 6, dexCap: 0, strength: 18, group: 'plate', x: 1 };
      expect(normalizeArmor(armor)).toEqual(armor);
    });

    it('is idempotent', () => {
      const armor = { category: 'light', acBonus: 1, dexCap: 4 };
      expect(normalizeArmor(normalizeArmor(armor))).toEqual(armor);
    });

    it('omits keys that are absent (absent ≠ zero) and treats null dexCap as uncapped', () => {
      const out = normalizeArmor({ category: 'unarmored', acBonus: 0, dexCap: null });
      expect(out).toEqual({ category: 'unarmored', acBonus: 0 });
      expect(out).not.toHaveProperty('dexCap');
    });
  });

  describe('isConsumable', () => {
    it('is true for scrolls (implicit)', () => {
      expect(isConsumable({ scroll: { name: 'Heal' } })).toBe(true);
    });

    it('is true for items with consumable metadata (#217)', () => {
      expect(isConsumable({ consumable: { kind: 'healing' } })).toBe(true);
      expect(isConsumable({ consumable: { kind: 'effect', effectId: 'x' } })).toBe(true);
    });

    it('is false for plain items and null', () => {
      expect(isConsumable({ name: 'Sword' })).toBe(false);
      expect(isConsumable(null)).toBe(false);
    });
  });

  describe('isInvestable', () => {
    it('is true only when the Invested trait is present (case-insensitive)', () => {
      expect(isInvestable({ traits: ['Magical', 'Invested'] })).toBe(true);
      expect(isInvestable({ traits: ['invested'] })).toBe(true);
    });

    it('is false without the Invested trait, for containers, and for null', () => {
      expect(isInvestable({ traits: ['Magical'] })).toBe(false);
      expect(isInvestable({ name: 'Rope' })).toBe(false);
      expect(isInvestable({ traits: ['Invested'], container: { contents: [] } })).toBe(false);
      expect(isInvestable(null)).toBe(false);
    });

    it('an inscribed accessory rune makes the host investable — even a container (#1033)', () => {
      expect(isInvestable({ name: 'Cloak', runes: { accessory: 'menacing' } })).toBe(true);
      expect(isInvestable({ name: 'Satchel', container: { contents: [] }, runes: { accessory: 'preserving' } })).toBe(true);
      // weapon/armor runes alone grant nothing — the slot must be filled
      expect(isInvestable({ name: 'Longsword', runes: { potency: 1 } })).toBe(false);
      expect(isInvestable({ name: 'Cloak', runes: [] })).toBe(false);
    });

    it('an inscribed accessory rune also reads as magical (#1033)', () => {
      expect(isItemMagical({ name: 'Cloak', runes: { accessory: 'menacing' } })).toBe(true);
      expect(isItemMagical({ name: 'Cloak', runes: { potency: 1 } })).toBe(false);
    });
  });

  describe('isPowerRing / wouldBreakPowerRingLimit (#967 R6)', () => {
    const ring = (uid) => ({ uid, name: 'Power Ring', powerRing: true, traits: ['Invested', 'Magical'] });
    const notRing = (uid) => ({ uid, name: 'Ring of Wizardry', traits: ['Invested', 'Magical'] });

    it('isPowerRing keys off the powerRing marker', () => {
      expect(isPowerRing(ring('r1'))).toBe(true);
      expect(isPowerRing(notRing('x'))).toBe(false);
      expect(isPowerRing(null)).toBe(false);
    });

    it('blocks a second power ring when a different one is already invested', () => {
      expect(wouldBreakPowerRingLimit(ring('r2'), [ring('r1')])).toBe(true);
      expect(wouldBreakPowerRingLimit(ring('r2'), [notRing('a'), ring('r1')])).toBe(true);
    });

    it('allows a power ring when none (or only non-rings) are invested', () => {
      expect(wouldBreakPowerRingLimit(ring('r1'), [])).toBe(false);
      expect(wouldBreakPowerRingLimit(ring('r1'), [notRing('a'), notRing('b')])).toBe(false);
    });

    it('does not conflict with itself, and never blocks a non-power-ring', () => {
      expect(wouldBreakPowerRingLimit(ring('r1'), [ring('r1')])).toBe(false); // same ring
      expect(wouldBreakPowerRingLimit(notRing('x'), [ring('r1')])).toBe(false); // not a ring
    });
  });

  describe('remainingQuantity', () => {
    const potion = { name: 'Minor Healing Potion', quantity: 3, consumable: { kind: 'healing' } };

    it('subtracts the consumed-overlay count for consumables', () => {
      expect(remainingQuantity(potion, { 'Minor Healing Potion': 2 })).toBe(1);
    });

    it('floors at zero', () => {
      expect(remainingQuantity(potion, { 'Minor Healing Potion': 5 })).toBe(0);
    });

    it('ignores the overlay for non-consumables', () => {
      expect(remainingQuantity({ name: 'Sword', quantity: 1 }, { Sword: 1 })).toBe(1);
    });
  });

  describe('flattenInventory', () => {
    it('flattens container contents alongside top-level items (container kept)', () => {
      const inv = [
        { id: 'sword', name: 'Sword' },
        { id: 'pack', name: 'Backpack', container: { contents: [{ id: 'rope', name: 'Rope' }, { id: 'oil', name: 'Oil' }] } },
      ];
      expect(flattenInventory(inv).map((i) => i.id)).toEqual(['sword', 'pack', 'rope', 'oil']);
    });

    it('tolerates non-arrays and missing contents', () => {
      expect(flattenInventory(null)).toEqual([]);
      expect(flattenInventory([{ id: 'a', container: {} }]).map((i) => i.id)).toEqual(['a']);
    });
  });

  describe('applyConsumedOverlay', () => {
    const potion = { name: 'Minor Healing Potion', quantity: 3, consumable: { kind: 'healing' } };
    const sword = { name: 'Sword', quantity: 1 };

    it('stamps the remaining quantity on a partially-used consumable', () => {
      const out = applyConsumedOverlay([potion, sword], { 'Minor Healing Potion': 2 });
      expect(out).toHaveLength(2);
      expect(out.find((i) => i.name === 'Minor Healing Potion').quantity).toBe(1);
      expect(out.find((i) => i.name === 'Sword').quantity).toBe(1);
    });

    it('drops a fully-consumed consumable', () => {
      const out = applyConsumedOverlay([potion, sword], { 'Minor Healing Potion': 3 });
      expect(out.map((i) => i.name)).toEqual(['Sword']);
    });

    it('passes non-consumables through untouched and tolerates a missing overlay', () => {
      expect(applyConsumedOverlay([sword])).toEqual([sword]);
      expect(applyConsumedOverlay(null, {})).toEqual([]);
    });
  });

  describe('isShieldBroken', () => {
    it('is false for a non-shield', () => {
      expect(isShieldBroken(null)).toBe(false);
    });

    it('is false when HP is above the broken threshold', () => {
      expect(isShieldBroken({ hp: 20, brokenThreshold: 10 })).toBe(false);
    });

    it('is true when HP is at or below the broken threshold', () => {
      expect(isShieldBroken({ hp: 10, brokenThreshold: 10 })).toBe(true);
      expect(isShieldBroken({ health: 5, breakThreshold: 10 })).toBe(true);
    });

    it('honors an explicit broken flag', () => {
      expect(isShieldBroken({ hp: 99, brokenThreshold: 10, broken: true })).toBe(true);
    });

    it('is false when HP/threshold are unknown', () => {
      expect(isShieldBroken({ bonus: 2, hardness: 5 })).toBe(false);
    });
  });

  describe('baseSpellItemArt (#936)', () => {
    const catalogMap = new Map([
      ['magic-scroll', { id: 'magic-scroll', name: 'Magic Scroll', image: 'img_scroll.jpg', imagePosition: { x: 5, y: 5 } }],
      ['magic-wand', { id: 'magic-wand', name: 'Magic Wand', image: 'img_wand.jpg' }],
      ['magic-staff', { id: 'magic-staff', name: 'Magic Staff' }], // no image
    ]);

    it('returns the base item art for a kind', () => {
      expect(baseSpellItemArt('scroll', catalogMap)).toEqual({ image: 'img_scroll.jpg', imagePosition: { x: 5, y: 5 } });
      expect(baseSpellItemArt('wand', catalogMap)).toEqual({ image: 'img_wand.jpg', imagePosition: undefined });
    });

    it('returns null when the base item, its image, the kind, or the map is absent', () => {
      expect(baseSpellItemArt('scroll', new Map())).toBeNull(); // no base item
      expect(baseSpellItemArt('staff', new Map([['magic-staff', { id: 'magic-staff' }]]))).toBeNull(); // unknown kind
      expect(baseSpellItemArt('wand', new Map([['magic-wand', { id: 'magic-wand' }]]))).toBeNull(); // base has no image
      expect(baseSpellItemArt('scroll', null)).toBeNull();
      expect(baseSpellItemArt('scroll', undefined)).toBeNull();
    });
  });
});
