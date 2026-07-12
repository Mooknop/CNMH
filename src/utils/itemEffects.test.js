import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  itemEffectsKey,
  itemKeyOf,
  itemEffectsFor,
  itemEffectLabel,
  stampItemEffects,
  applyItemEffect,
  removeItemEffect,
  pruneExpiredItemEffects,
  restoreItemHpOverlay,
} from './itemEffects';

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* noop */ }
});

describe('itemEffects (#339)', () => {
  it('keys the synced overlay by character id', () => {
    expect(itemEffectsKey('izzy')).toBe('cnmh_itemeffects_izzy');
  });

  it('itemKeyOf prefers id, falls back to name', () => {
    expect(itemKeyOf({ id: 'sword-1', name: 'Sword' })).toBe('sword-1');
    expect(itemKeyOf({ name: 'Sword' })).toBe('Sword');
    expect(itemKeyOf(null)).toBeNull();
  });

  it('itemEffectsFor matches by item id (and name fallback)', () => {
    const overlay = [
      { id: 'e1', itemId: 'sword-1', label: 'Weightless' },
      { id: 'e2', itemId: 'Shield', label: 'Oiled' },
    ];
    expect(itemEffectsFor(overlay, { id: 'sword-1' }).map((e) => e.id)).toEqual(['e1']);
    expect(itemEffectsFor(overlay, { name: 'Shield' }).map((e) => e.id)).toEqual(['e2']);
    expect(itemEffectsFor(overlay, { id: 'nope' })).toEqual([]);
  });

  it('itemEffectLabel falls back label → note → Active', () => {
    expect(itemEffectLabel({ label: 'Weightless' })).toBe('Weightless');
    expect(itemEffectLabel({ note: 'Negligible Bulk' })).toBe('Negligible Bulk');
    expect(itemEffectLabel({})).toBe('Active');
  });

  it('stampItemEffects attaches activeEffects only to matching items', () => {
    const overlay = [{ id: 'e1', itemId: 'sword-1', label: 'Weightless' }];
    const out = stampItemEffects([{ id: 'sword-1', name: 'Sword' }, { id: 'bow', name: 'Bow' }], overlay);
    expect(out[0].activeEffects).toHaveLength(1);
    expect(out[1].activeEffects).toBeUndefined();
  });

  describe('applyItemEffect', () => {
    const user = { id: 'izzy', name: 'Izzy' };
    const target = { id: 'plate-1', name: 'Full Plate' };

    it('appends an entry, writes the overlay via sendUpdate, and logs', () => {
      const sendUpdate = vi.fn();
      const appendLog = vi.fn();
      const getState = vi.fn(() => [{ id: 'old', itemId: 'x' }]);
      const meta = { kind: 'effect', target: 'item', label: 'Weightless', note: 'Negligible Bulk', durationMinutes: 60 };

      const next = applyItemEffect({
        user, targetItem: target, itemName: 'Oil of Weightlessness', meta,
        nowSecs: 1000, getState, sendUpdate, appendLog,
      });

      expect(next).toHaveLength(2);
      const entry = next[1];
      expect(entry).toMatchObject({
        itemId: 'plate-1', itemName: 'Full Plate', label: 'Weightless',
        note: 'Negligible Bulk', source: 'Oil of Weightlessness', appliedBy: 'izzy',
        expireAtSecs: 1000 + 60 * 60,
      });
      expect(sendUpdate).toHaveBeenCalledWith('izzy', 'itemeffects', next);
      expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Izzy applied Oil of Weightlessness to Full Plate (60 min)',
      }));
    });

    it('omits expireAtSecs when the effect has no duration', () => {
      const meta = { kind: 'effect', target: 'item', label: 'Protected' };
      const next = applyItemEffect({
        user, targetItem: target, itemName: 'Anticorrosion Oil', meta,
        nowSecs: 1000, getState: () => [], sendUpdate: vi.fn(), appendLog: vi.fn(),
      });
      expect(next[0].expireAtSecs).toBeUndefined();
    });

    it('transient consumables log only — no overlay write, no tracked entry', () => {
      const sendUpdate = vi.fn();
      const appendLog = vi.fn();
      const getState = vi.fn(() => [{ id: 'existing', itemId: 'x' }]);
      const meta = { kind: 'effect', target: 'item', transient: true, note: 'Restore 2d4 HP to rust damage' };

      const next = applyItemEffect({
        user, targetItem: target, itemName: 'Rust Scrub', meta,
        nowSecs: 1000, getState, sendUpdate, appendLog,
      });

      // Overlay unchanged (returns current), nothing written.
      expect(next).toEqual([{ id: 'existing', itemId: 'x' }]);
      expect(sendUpdate).not.toHaveBeenCalled();
      expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Izzy applied Rust Scrub to Full Plate — Restore 2d4 HP to rust damage',
      }));
    });

    it('a transient consumable with a rolled amount restores item HP (#543)', () => {
      const durableTarget = { id: 'plate-1', name: 'Full Plate', uid: 'plate-1', durability: { hardness: 9, hp: 36 } };
      const sendUpdate = vi.fn();
      const appendLog = vi.fn();
      const getState = vi.fn((_id, key) =>
        key === 'itemhp' ? { 'plate-1': { hp: 10 } } : [{ id: 'existing', itemId: 'x' }]);
      const meta = { kind: 'effect', target: 'item', transient: true, note: 'Restore 2d4 HP to rust damage' };

      applyItemEffect({
        user, targetItem: durableTarget, itemName: 'Rust Scrub', meta, amount: 6,
        nowSecs: 1000, getState, sendUpdate, appendLog,
      });

      // HP restored on the itemhp overlay (10 + 6 = 16, still ≤ BT 18 → broken).
      expect(sendUpdate).toHaveBeenCalledWith('izzy', 'itemhp', { 'plate-1': { hp: 16 } });
      expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Izzy applied Rust Scrub to Full Plate — restored 6 HP (16/36, still broken)',
      }));
    });
  });

  describe('restoreItemHpOverlay (#543)', () => {
    const durableTarget = { id: 'plate-1', name: 'Full Plate', uid: 'plate-1', durability: { hardness: 9, hp: 36 } };

    it('restores HP toward max and reports the resulting status', () => {
      const sendUpdate = vi.fn();
      const getState = vi.fn(() => ({ 'plate-1': { hp: 30 } }));
      const result = restoreItemHpOverlay({
        ownerId: 'izzy', targetItem: durableTarget, amount: 8, getState, sendUpdate,
      });
      expect(result).toEqual({ hp: 36, maxHp: 36, broken: false }); // 30 + 8 clamped to 36
      expect(sendUpdate).toHaveBeenCalledWith('izzy', 'itemhp', { 'plate-1': { hp: 36 } });
    });

    it('seeds from the authored max when no overlay record exists', () => {
      const result = restoreItemHpOverlay({
        ownerId: 'izzy', targetItem: durableTarget, amount: 5, getState: () => ({}), sendUpdate: vi.fn(),
      });
      expect(result.hp).toBe(36); // already at max — clamp is a no-op
    });

    it('is a no-op for a non-durable target, a missing uid, or a non-positive amount', () => {
      const sendUpdate = vi.fn();
      expect(restoreItemHpOverlay({ ownerId: 'izzy', targetItem: { uid: 'x', name: 'Rope' }, amount: 5, getState: () => ({}), sendUpdate })).toBeNull();
      expect(restoreItemHpOverlay({ ownerId: 'izzy', targetItem: { name: 'No uid', durability: { hp: 10 } }, amount: 5, getState: () => ({}), sendUpdate })).toBeNull();
      expect(restoreItemHpOverlay({ ownerId: 'izzy', targetItem: durableTarget, amount: 0, getState: () => ({}), sendUpdate })).toBeNull();
      expect(sendUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removeItemEffect', () => {
    it('drops the entry with the matching id, leaving the rest', () => {
      const overlay = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      expect(removeItemEffect(overlay, 'b').map((e) => e.id)).toEqual(['a', 'c']);
    });
    it('is a safe no-op for an unknown id or non-array', () => {
      expect(removeItemEffect([{ id: 'a' }], 'z')).toEqual([{ id: 'a' }]);
      expect(removeItemEffect(null, 'a')).toEqual([]);
    });
  });

  describe('pruneExpiredItemEffects', () => {
    it('splits expired (<= now) from active and is a no-op when none expired', () => {
      const overlay = [
        { id: 'a', expireAtSecs: 500 },
        { id: 'b', expireAtSecs: 5000 },
        { id: 'c' }, // no expiry — never pruned
      ];
      const { next, expired } = pruneExpiredItemEffects(overlay, 1000);
      expect(expired.map((e) => e.id)).toEqual(['a']);
      expect(next.map((e) => e.id)).toEqual(['b', 'c']);

      const none = pruneExpiredItemEffects(overlay, 100);
      expect(none.expired).toEqual([]);
      expect(none.next).toBe(overlay);
    });
  });
});
