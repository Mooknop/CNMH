import { renderHook } from '@testing-library/react';

let session = { connected: true, foundryConnected: true };
vi.mock('../contexts/SessionContext', () => ({ useSession: () => session }));
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'a', name: 'Aria', gold: 1000 }] }),
}));
const mockAppendEvent = vi.fn();
vi.mock('./useSessionLog', () => ({ useSessionLog: () => ({ appendEvent: mockAppendEvent }) }));

let uidSeq = 0;
vi.mock('../utils/uid', () => ({ newEntryUid: () => `u-${++uidSeq}` }));

let gold = 1000;
let acquired = [];
let removed = [];
const setGold = vi.fn((n) => { gold = typeof n === 'function' ? n(gold) : n; });
const setAcquired = vi.fn((n) => { acquired = typeof n === 'function' ? n(acquired) : n; });
const setRemoved = vi.fn((n) => { removed = typeof n === 'function' ? n(removed) : n; });
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_gold_')) return [gold, setGold];
    if (String(key).startsWith('cnmh_acquired_')) return [acquired, setAcquired];
    if (String(key).startsWith('cnmh_removed_')) return [removed, setRemoved];
    return [null, vi.fn()];
  },
}));

import { useMoveRune } from './useMoveRune';

// A level-8 rune ⇒ DC 24. Roll totals are chosen against that DC:
//   total ≥ 34 → crit success;  24..33 → success;  14..23 → failure;  ≤13 → crit fail.
const rune = { id: 'flaming', name: 'Flaming', level: 8, price: 500 };
const weapon = { uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' }, runes: { property: ['flaming'] } };
const bareWeapon = { uid: 'w2', name: 'Dagger', strikes: { damage: '1d4' } };
const runestone = { uid: 'rs1', name: 'Flaming Runestone', runestone: { runeRef: 'flaming', rune } };

beforeEach(() => {
  gold = 1000; acquired = []; removed = []; uidSeq = 0;
  vi.clearAllMocks();
  session = { connected: true, foundryConnected: true };
});

describe('toRunestone (weapon → runestone)', () => {
  it('critical success moves for free: unruned weapon + new runestone, no debit', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toRunestone', weapon, rune, d20: 18, total: 40 });
    expect(res.outcome).toEqual({ moved: true, destroyed: false, costGp: 0 });
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Longsword', runes: { property: [] } }),
      expect.objectContaining({ ref: 'runestone', runeRef: 'flaming' }),
    ]);
    expect(removed).toContain('w1'); // authored weapon masked
    expect(setGold).not.toHaveBeenCalled();
  });

  it('success moves but expends 10% of the rune value', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toRunestone', weapon, rune, d20: 10, total: 26 });
    expect(res.outcome).toEqual({ moved: true, destroyed: false, costGp: 50 });
    expect(setGold).toHaveBeenCalledWith(950); // 1000 - 50
  });

  it('failure is a no-op: no overlay writes, no debit', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toRunestone', weapon, rune, d20: 10, total: 20 });
    expect(res.outcome).toEqual({ moved: false, destroyed: false, costGp: 0 });
    expect(setAcquired).not.toHaveBeenCalled();
    expect(setRemoved).not.toHaveBeenCalled();
    expect(setGold).not.toHaveBeenCalled();
  });

  it('critical failure strips the rune from the weapon and mints no runestone', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toRunestone', weapon, rune, d20: 5, total: 10 });
    expect(res.outcome).toEqual({ moved: false, destroyed: true, costGp: 0 });
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Longsword', runes: { property: [] } }),
    ]);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('destroyed') }),
    );
  });
});

describe('toWeapon (runestone → weapon)', () => {
  it('success folds the rune onto the weapon and consumes the runestone', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toWeapon', weapon: bareWeapon, runestone, rune, d20: 10, total: 26 });
    expect(res.outcome.moved).toBe(true);
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Dagger', runes: { property: ['flaming'] } }),
    ]);
    expect(removed).toEqual(expect.arrayContaining(['w2', 'rs1'])); // weapon + stone both pulled
    expect(setGold).toHaveBeenCalledWith(950);
  });

  it('critical failure consumes the runestone and leaves the weapon untouched', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toWeapon', weapon: bareWeapon, runestone, rune, d20: 5, total: 10 });
    expect(res.outcome.destroyed).toBe(true);
    expect(removed).toContain('rs1');
    expect(removed).not.toContain('w2'); // weapon never modified
    expect(setAcquired).not.toHaveBeenCalled();
  });

  it('displaces an existing rune into a new runestone when replacing a full weapon', () => {
    const fullWeapon = { uid: 'w3', name: 'Pick', strikes: { damage: '1d6' }, runes: { potency: 1, property: ['frost'] } };
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({
      direction: 'toWeapon', weapon: fullWeapon, runestone, rune, replaceRuneId: 'frost', d20: 18, total: 40,
    });
    expect(res.outcome.moved).toBe(true);
    // The weapon ends with the new rune only (frost displaced), plus a frost runestone.
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Pick', runes: { potency: 1, property: ['flaming'] } }),
      expect.objectContaining({ ref: 'runestone', runeRef: 'frost' }),
    ]);
    expect(removed).toEqual(expect.arrayContaining(['w3', 'rs1']));
  });

  it('splices a bought (acquired) runestone instead of masking it', () => {
    acquired = [{ ref: 'runestone', runeRef: 'flaming', uid: 'rs1' }];
    const { result } = renderHook(() => useMoveRune('a'));
    result.current.move({ direction: 'toWeapon', weapon: bareWeapon, runestone, rune, d20: 18, total: 40 });
    // Spliced from acquired, then the runed weapon credited; rs1 not in acquired.
    expect(acquired.some((e) => e.uid === 'rs1')).toBe(false);
    expect(removed).not.toContain('rs1');
  });
});

describe('fundamental moves (#832)', () => {
  // Striking is level 4 ⇒ DC 19; +1 potency is level 2 ⇒ DC 16.
  const strikingDoc = { id: 'striking', name: 'Striking', fundamental: 'striking', tierKey: 'striking', level: 4, price: 65 };
  const potencyDoc = { id: 'weapon-potency-1', name: '+1 Weapon Potency', fundamental: 'potency', tier: 1, level: 2, price: 35 };
  const strikingStone = { uid: 'fs1', name: 'Striking Runestone', runestone: { runeRef: null, fundamental: 'striking', key: 'striking', rune: strikingDoc } };

  it('round-trips striking weapon → runestone → weapon', () => {
    const armed = { uid: 'w5', name: 'Falchion', strikes: { damage: '1d10' }, runes: { striking: 'striking' } };
    const { result } = renderHook(() => useMoveRune('a'));

    // Off the weapon: striking cleared, a fundamental-descriptor stone minted.
    let res = result.current.move({ direction: 'toRunestone', weapon: armed, rune: strikingDoc, d20: 18, total: 40 });
    expect(res.outcome.moved).toBe(true);
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Falchion', runes: {} }),
      expect.objectContaining({ ref: 'runestone', fundamental: 'striking', key: 'striking' }),
    ]);

    // Back onto a bare weapon: replace-in-place set, the stone cracks.
    setAcquired.mockClear();
    res = result.current.move({ direction: 'toWeapon', weapon: bareWeapon, runestone: strikingStone, rune: strikingDoc, d20: 18, total: 40 });
    expect(res.outcome.moved).toBe(true);
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Dagger', runes: { striking: 'striking' } }),
    ]);
    expect(removed).toContain('fs1');
  });

  it('rejects a non-upgrade apply (same tier already on the weapon) before rolling', () => {
    const already = { uid: 'w6', name: 'Sabre', strikes: { damage: '1d6' }, runes: { striking: 'striking' } };
    const { result } = renderHook(() => useMoveRune('a'));
    expect(result.current.move({ direction: 'toWeapon', weapon: already, runestone: strikingStone, rune: strikingDoc, d20: 18, total: 40 })).toBeNull();
    expect(setAcquired).not.toHaveBeenCalled();
    expect(setRemoved).not.toHaveBeenCalled();
  });

  it('rejects moving potency off a weapon whose property runes ride its slots', () => {
    const laden = { uid: 'w7', name: 'Pick', strikes: { damage: '1d6' }, runes: { potency: 1, property: ['flaming'] } };
    const { result } = renderHook(() => useMoveRune('a'));
    expect(result.current.move({ direction: 'toRunestone', weapon: laden, rune: potencyDoc, d20: 18, total: 40 })).toBeNull();
    expect(setAcquired).not.toHaveBeenCalled();
  });

  it('moves potency off a property-free weapon, minting a tier descriptor stone', () => {
    const plusOne = { uid: 'w8', name: 'Rapier', strikes: { damage: '1d6' }, runes: { potency: 1 } };
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toRunestone', weapon: plusOne, rune: potencyDoc, d20: 18, total: 40 });
    expect(res.outcome.moved).toBe(true);
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Rapier', runes: {} }),
      expect.objectContaining({ ref: 'runestone', fundamental: 'potency', tier: 1 }),
    ]);
  });

  it('overwrites a lower striking tier in place on apply (no displaced stone minted)', () => {
    const greaterDoc = { id: 'greater-striking', name: 'Greater Striking', fundamental: 'striking', tierKey: 'greater', level: 12, price: 1065 };
    const greaterStone = { uid: 'fs2', runestone: { runeRef: null, fundamental: 'striking', key: 'greater', rune: greaterDoc } };
    const armed = { uid: 'w9', name: 'Glaive', strikes: { damage: '1d8' }, runes: { striking: 'striking' } };
    const { result } = renderHook(() => useMoveRune('a'));
    const res = result.current.move({ direction: 'toWeapon', weapon: armed, runestone: greaterStone, rune: greaterDoc, d20: 18, total: 40 });
    expect(res.outcome.moved).toBe(true);
    expect(setAcquired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Glaive', runes: { striking: 'greater' } }),
    ]);
  });
});

describe('guards', () => {
  it('rejects when the success upkeep exceeds the buyer’s gold (no writes)', () => {
    gold = 10;
    const { result } = renderHook(() => useMoveRune('a'));
    expect(result.current.move({ direction: 'toRunestone', weapon, rune, d20: 10, total: 26 })).toBeNull();
    expect(setAcquired).not.toHaveBeenCalled();
    expect(setGold).not.toHaveBeenCalled();
  });

  it('rejects a toWeapon move with no runestone', () => {
    const { result } = renderHook(() => useMoveRune('a'));
    expect(result.current.move({ direction: 'toWeapon', weapon: bareWeapon, rune, d20: 18, total: 40 })).toBeNull();
  });

  it('freezes in the offline sandbox', () => {
    session = { connected: true, foundryConnected: false };
    const { result } = renderHook(() => useMoveRune('a'));
    expect(result.current.move({ direction: 'toRunestone', weapon, rune, d20: 18, total: 40 })).toBeNull();
  });
});
