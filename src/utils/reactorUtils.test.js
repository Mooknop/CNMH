import { describe, it, expect } from 'vitest';
import { turnToken, shouldClearReactors, reactorClearLog } from './reactorUtils';

describe('reactorUtils', () => {
  describe('turnToken', () => {
    it('encodes round:index and tolerates missing fields', () => {
      expect(turnToken({ round: 2, currentTurnIndex: 3 })).toBe('2:3');
      expect(turnToken({})).toBe('0:0');
      expect(turnToken(null)).toBe('0:0');
    });
  });

  describe('shouldClearReactors', () => {
    const base = { prevToken: '1:0', nextToken: '1:1', isGm: true, reactorCount: 1 };

    it('fires when the GM sees a turn change with reactors present', () => {
      expect(shouldClearReactors(base)).toBe(true);
    });

    it('skips the initial observation (no previous token)', () => {
      expect(shouldClearReactors({ ...base, prevToken: null })).toBe(false);
    });

    it('skips when the turn has not changed', () => {
      expect(shouldClearReactors({ ...base, nextToken: '1:0' })).toBe(false);
    });

    it('skips non-GM clients (single writer avoids duplicate log lines)', () => {
      expect(shouldClearReactors({ ...base, isGm: false })).toBe(false);
    });

    it('skips when there is nothing declared to clear', () => {
      expect(shouldClearReactors({ ...base, reactorCount: 0 })).toBe(false);
      expect(shouldClearReactors({ ...base, reactorCount: undefined })).toBe(false);
    });
  });

  describe('reactorClearLog', () => {
    it('names the retired reactions, pluralizing as needed', () => {
      expect(reactorClearLog([{ label: 'Nimble Dodge' }])).toBe(
        'Unresolved reaction cleared: Nimble Dodge'
      );
      expect(reactorClearLog([{ label: 'Nimble Dodge' }, { label: 'Shield Block' }])).toBe(
        'Unresolved reactions cleared: Nimble Dodge, Shield Block'
      );
    });

    it('falls back to a generic line when no labels are present', () => {
      expect(reactorClearLog([])).toBe('Unresolved reaction cleared');
      expect(reactorClearLog([{}])).toBe('Unresolved reaction cleared');
      expect(reactorClearLog(undefined)).toBe('Unresolved reaction cleared');
    });
  });
});
