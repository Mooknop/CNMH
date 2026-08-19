import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyBystanderReveal } from './confirmAppliers';

// The auto-lift chokepoint (#465): UseAbilityModal / SkillActionModal call this
// once per committed use, and only a HOSTILE one blows the disguise.

const IZZY = { id: 'izzy', name: 'Izzy' };
const ORDER = [
  { entryId: 'e-izzy', kind: 'pc', charId: 'izzy', name: 'Izzy' },
  { entryId: 'e-g1', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' },
  { entryId: 'e-g2', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' },
  { entryId: 'e-b', kind: 'enemy', name: 'Bandit' },
];

const NOW = 500_000;

let store;
let sendUpdate;
let appendLog;
const getState = (id, type) => store[`${id}:${type}`];

const run = (over = {}) =>
  applyBystanderReveal({
    ability: { name: 'Strike' },
    character: IZZY,
    order: ORDER,
    hostileTargets: [],
    isAttack: true,
    getState,
    sendUpdate,
    appendLog,
    nowSecs: NOW,
    ...over,
  });

beforeEach(() => {
  window.localStorage.clear();
  store = {};
  sendUpdate = vi.fn();
  appendLog = vi.fn();
});

describe('applyBystanderReveal', () => {
  it('does nothing when the PC never declared Harmless Bystander', () => {
    expect(run()).toBe(false);
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('lifts suppression and stamps a 1-day immunity on every creature present', () => {
    store['izzy:bystander'] = { active: true, mod: 'deception', ts: 1 };

    expect(run()).toBe(true);

    const [charId, type, value] = sendUpdate.mock.calls[0];
    expect(charId).toBe('izzy');
    expect(type).toBe('bystander');
    expect(value.active).toBe(true);        // the declaration itself stands
    expect(value.revealed).toBe(true);      // …but the disguise is blown
    // Deduped by persistent creature key — both ghouls share one record.
    expect(Object.keys(value.immune).sort()).toEqual(['creature:ghoul', 'e-b']);
    expect(value.immune['creature:ghoul'].expireAtSecs).toBe(NOW + 86400);
    expect(value.immune['creature:ghoul'].appliedBy).toBe('izzy');
  });

  it('logs why the feat ended, naming the creatures now immune', () => {
    store['izzy:bystander'] = { active: true, mod: 'deception', ts: 1 };
    run();
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      charId: 'izzy',
      text: expect.stringContaining('recognized as hostile'),
    }));
    expect(appendLog.mock.calls[0][0].text).toContain('Ghoul, Bandit');
  });

  it('mirrors the write to localStorage so the sheet survives a reload', () => {
    store['izzy:bystander'] = { active: true, mod: 'deception', ts: 1 };
    run();
    expect(JSON.parse(window.localStorage.getItem('cnmh_bystander_izzy')).revealed).toBe(true);
  });

  it('ignores a non-hostile use (healing an ally keeps the disguise up)', () => {
    store['izzy:bystander'] = { active: true, mod: 'deception', ts: 1 };
    expect(run({
      ability: { name: 'Soothe', traits: ['Healing'] },
      isAttack: false,
      hostileTargets: [],
    })).toBe(false);
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('fires on a non-attack ability aimed at a non-ally', () => {
    store['izzy:bystander'] = { active: true, mod: 'deception', ts: 1 };
    expect(run({
      ability: { name: 'Fear' },
      isAttack: false,
      hostileTargets: [{ entryId: 'e-b', kind: 'enemy', name: 'Bandit' }],
    })).toBe(true);
  });

  it('is idempotent — a second hostile action does not re-log', () => {
    store['izzy:bystander'] = { active: true, mod: 'deception', ts: 1 };
    run();
    store['izzy:bystander'] = sendUpdate.mock.calls[0][2];
    expect(run()).toBe(false);
    expect(appendLog).toHaveBeenCalledTimes(1);
  });

  it('carries forward an immunity stamped in an earlier fight', () => {
    store['izzy:bystander'] = {
      active: true,
      mod: 'deception',
      ts: 1,
      immune: {
        'creature:ogre': { abilityKey: 'harmless-bystander', appliedBy: 'izzy', expireAtSecs: NOW + 10 },
        'creature:rat': { abilityKey: 'harmless-bystander', appliedBy: 'izzy', expireAtSecs: NOW - 10 },
      },
    };
    run();
    const value = sendUpdate.mock.calls[0][2];
    expect(Object.keys(value.immune).sort()).toEqual(['creature:ghoul', 'creature:ogre', 'e-b']);
    expect(value.immune['creature:rat']).toBeUndefined(); // expired, pruned
  });

  it('falls back to localStorage when the session cache has nothing', () => {
    window.localStorage.setItem(
      'cnmh_bystander_izzy',
      JSON.stringify({ active: true, mod: 'deception', ts: 1 })
    );
    expect(run({ getState: () => undefined })).toBe(true);
  });
});
