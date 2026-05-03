import {
  formatBulk,
  calculateItemsBulk,
  calculateContainerBulk,
  isContainer,
  formatDecimal,
  getBulkStatus,
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
});
