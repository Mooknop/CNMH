import { describe, it, expect } from 'vitest';
import { buildReadied, readiedAbility, readiedExpireLog } from './readiedAction';

describe('readiedAction', () => {
  describe('buildReadied', () => {
    it('normalizes a declaration (trimming) and stamps a time', () => {
      const out = buildReadied({ actionName: '  Strike ', trigger: '  enemy in reach  ', round: 3 });
      expect(out).toMatchObject({ actionName: 'Strike', trigger: 'enemy in reach', round: 3 });
      expect(typeof out.ts).toBe('number');
    });

    it('defaults trigger to empty and round to null', () => {
      expect(buildReadied({ actionName: 'Raise a Shield' })).toMatchObject({
        actionName: 'Raise a Shield',
        trigger: '',
        round: null,
      });
    });

    it('returns null when there is no action name', () => {
      expect(buildReadied({ actionName: '   ' })).toBeNull();
      expect(buildReadied({})).toBeNull();
      expect(buildReadied()).toBeNull();
    });
  });

  describe('readiedAbility', () => {
    it('shapes a readied declaration as a reaction-cost ability', () => {
      const ability = readiedAbility({ actionName: 'Strike', trigger: 'enemy in reach' });
      expect(ability).toMatchObject({
        name: 'Strike',
        actions: 'Reaction',
        trigger: 'enemy in reach',
        description: 'enemy in reach',
        readied: true,
      });
    });

    it('returns null for an empty/absent declaration', () => {
      expect(readiedAbility(null)).toBeNull();
      expect(readiedAbility({})).toBeNull();
    });
  });

  it('readiedExpireLog names the lapsed action and the character', () => {
    expect(readiedExpireLog({ actionName: 'Strike' }, 'Kestrel')).toBe(
      "Kestrel's readied action (Strike) expired"
    );
  });
});
