import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  THIRSTING_REGAIN,
  REVERBERATING,
  shieldRuneStrikeRiders,
  thirstingRegainFor,
  applyThirstingOnHit,
} from './shieldRuneStrike';
import { buildDamageProfile, computeTargetDamage } from './damage';
import { APP } from '../sync/keys';

const rune = (id, name) => ({ id, type: 'property', target: 'shield', name });
// No reinforcing rune in the fixture: resolveShieldBlock then passes the
// authored H5/HP20/BT10 through untouched, keeping the max-HP math legible.
const shieldWith = (property, extra = {}) => ({
  uid: 'sh1',
  name: 'Steel Shield',
  shield: { hardness: 5, hp: 20, brokenThreshold: 10 },
  state: 'held1',
  runes: { property },
  ...extra,
});

describe('shieldRuneStrikeRiders — Reverberating release pair (#1246)', () => {
  it('emits the opt-in sonic bonus + crit persistent riders, per grade', () => {
    const riders = shieldRuneStrikeRiders(shieldWith([rune('reverberating', 'Reverberating')]));
    expect(riders).toHaveLength(2);
    expect(riders[0]).toMatchObject({
      id: 'reverberating-charge',
      label: 'Reverberating (sonic)',
      bonus: { perWeaponDie: 1 },
      defaultOn: false,
    });
    expect(riders[1]).toMatchObject({
      id: 'reverberating-crit',
      persistent: { dice: '2d4', type: 'sonic' },
      condition: 'deafened 1 minute',
      on: ['criticalSuccess'],
      defaultOn: false,
    });
  });

  it('scales with the rune grade (greater ×2 + 4d4, major ×3 + 6d4)', () => {
    const greater = shieldRuneStrikeRiders(shieldWith([rune('greater-reverberating', 'Greater Reverberating')]));
    expect(greater[0].bonus).toEqual({ perWeaponDie: REVERBERATING['greater-reverberating'].perDie });
    expect(greater[1].persistent.dice).toBe('4d4');
    const major = shieldRuneStrikeRiders(shieldWith([rune('major-reverberating', 'Major Reverberating')]));
    expect(major[0].bonus).toEqual({ perWeaponDie: 3 });
    expect(major[1].persistent.dice).toBe('6d4');
  });

  it('emits nothing for runeless shields, other runes, or missing items', () => {
    expect(shieldRuneStrikeRiders(shieldWith([rune('thirsting', 'Thirsting')]))).toEqual([]);
    expect(shieldRuneStrikeRiders(shieldWith([]))).toEqual([]);
    expect(shieldRuneStrikeRiders({ uid: 'x', shield: {} })).toEqual([]);
    expect(shieldRuneStrikeRiders(null)).toEqual([]);
  });

  it('the release nets through the damage step: +dice-count sonic on a hit, persistent on a crit only', () => {
    // A bash-shaped strike (attackMod marks it a strike for buildDamageProfile).
    const strike = {
      name: 'Shield Bash',
      attackMod: 9,
      damage: '2d4+2', // e.g. a striking-runed attachment — 2 weapon dice
      damageType: 'bludgeoning',
      riders: shieldRuneStrikeRiders(shieldWith([rune('reverberating', 'Reverberating')])),
    };
    const profile = buildDamageProfile(strike, { level: 5 });
    // Off by default — the charge is opt-in.
    const off = computeTargetDamage({ entered: 8, degree: 'success', riders: profile.riders, entryId: 'e1' });
    expect(off.final).toBe(8);
    // Toggled on: +1 sonic per weapon die (2 dice → +2).
    const on = computeTargetDamage({
      entered: 8, degree: 'success', riders: profile.riders,
      riderState: { 'reverberating-charge': true }, entryId: 'e1',
    });
    expect(on.final).toBe(10);
    expect(on.parts.riders).toEqual([{ label: 'Reverberating (sonic)', amount: 2 }]);
    // Crit with both toggles: bonus doubles with the hit; persistent + deafened ride.
    const crit = computeTargetDamage({
      entered: 8, degree: 'criticalSuccess', riders: profile.riders,
      riderState: { 'reverberating-charge': true, 'reverberating-crit': true }, entryId: 'e1',
    });
    expect(crit.final).toBe(20); // (8 + 2) × 2
    expect(crit.persistent).toEqual([
      { dice: '2d4', type: 'sonic', label: 'Reverberating — charged crit' },
    ]);
    expect(crit.conditions).toEqual([
      { label: 'Reverberating — charged crit', condition: 'deafened 1 minute' },
    ]);
    // The crit rider never fires on a plain hit even when toggled on.
    const hitWithCritToggle = computeTargetDamage({
      entered: 8, degree: 'success', riders: profile.riders,
      riderState: { 'reverberating-crit': true }, entryId: 'e1',
    });
    expect(hitWithCritToggle.persistent).toEqual([]);
  });
});

describe('thirstingRegainFor', () => {
  it('reads the grade off the shield runes (2/5/10)', () => {
    expect(thirstingRegainFor(shieldWith([rune('thirsting', 'Thirsting')])))
      .toEqual({ amount: THIRSTING_REGAIN.thirsting, name: 'Thirsting' });
    expect(thirstingRegainFor(shieldWith([rune('greater-thirsting', 'Greater Thirsting')])).amount).toBe(5);
    expect(thirstingRegainFor(shieldWith([rune('major-thirsting', 'Major Thirsting')])).amount).toBe(10);
    expect(thirstingRegainFor(shieldWith([rune('reverberating', 'Reverberating')]))).toBeNull();
    expect(thirstingRegainFor(null)).toBeNull();
  });
});

describe('applyThirstingOnHit (#1246)', () => {
  // Un-reinforced fixture: entryHpStatus reads the authored H5/HP20/BT10.
  const shieldEntry = () => shieldWith([rune('thirsting', 'Thirsting')]);
  const character = (entry) => ({ id: 'Pellias', name: 'Pellias', inventory: [entry] });
  const bashAbility = { name: 'Shield Bash', shieldBash: true, hostUid: 'sh1' };
  const hit = (degree, final) => ({ entryId: 'e1', degree, damage: { final } });
  const groups = (...results) => [{ rayIndex: null, results }];

  let sendUpdate; let appendLog; let overlay;
  const getState = (charId, key) => (key === APP.ITEMHP ? overlay : undefined);

  beforeEach(() => {
    sendUpdate = vi.fn();
    appendLog = vi.fn();
    overlay = undefined;
    window.localStorage.clear();
  });

  const run = (over = {}) => applyThirstingOnHit({
    ability: bashAbility,
    character: character(shieldEntry()),
    rayGroups: groups(hit('success', 6)),
    chainResults: null,
    getState,
    sendUpdate,
    appendLog,
    ...over,
  });

  it('regains the grade amount on a damaging hit, from the live overlay HP', () => {
    overlay = { sh1: { hp: 12 } };
    run();
    expect(sendUpdate).toHaveBeenCalledWith('Pellias', APP.ITEMHP, { sh1: { hp: 14 } });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Thirsting: Pellias\'s shield drinks deep — regains 2 HP (14/20)'),
    }));
    // GM keeps the blood call — the reminder rides the log line.
    expect(appendLog.mock.calls[0][0].text).toContain('blood or a similar life essence');
  });

  it('stacks per damaging hit and caps at the authored max', () => {
    overlay = { sh1: { hp: 17 } };
    run({ rayGroups: groups(hit('success', 6), hit('criticalSuccess', 12)) });
    // 2 damaging hits × 2 = 4, capped 17 → 20.
    expect(sendUpdate).toHaveBeenCalledWith('Pellias', APP.ITEMHP, { sh1: { hp: 20 } });
  });

  it('does nothing at full HP, on misses, or on zero-damage hits', () => {
    run(); // no overlay record → already at authored max
    run({ rayGroups: groups(hit('failure', 6)) });
    run({ rayGroups: groups(hit('success', 0)) });
    run({ rayGroups: groups({ entryId: 'e1', degree: 'success' }) }); // damage step skipped
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('does nothing without the rune, off-shield strikes, or a destroyed shield', () => {
    overlay = { sh1: { hp: 12 } };
    run({ character: character(shieldWith([])) }); // no thirsting rune
    run({ ability: { name: 'Longsword Strike' } }); // not a shield strike
    expect(sendUpdate).not.toHaveBeenCalled();
    overlay = { sh1: { hp: 0 } }; // destroyed — beyond thirst
    run();
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('covers attachment strikes and chained results', () => {
    overlay = { sh1: { hp: 12 } };
    applyThirstingOnHit({
      ability: { name: 'Shield Spikes', shieldAttachment: true, hostUid: 'sh1' },
      character: character(shieldEntry()),
      rayGroups: [],
      chainResults: { rolls: [[hit('success', 4)]] },
      getState,
      sendUpdate,
      appendLog,
    });
    expect(sendUpdate).toHaveBeenCalledWith('Pellias', APP.ITEMHP, { sh1: { hp: 14 } });
  });
});
