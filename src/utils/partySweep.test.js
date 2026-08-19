import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performEncounterSweep, performEncounterGlobalSweep } from './partySweep';
import { defaultEncounter } from './encounterUtils';

// In-memory synced state keyed "id:type", with getState/sendUpdate shims.
let store;
const getState = (id, type) => store[`${id}:${type}`];
const sendUpdate = vi.fn((id, type, value) => { store[`${id}:${type}`] = value; });

const CHAR = { id: 'thorn', name: 'Thorn' };

beforeEach(() => {
  store = {};
  sendUpdate.mockClear();
  globalThis.localStorage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() };
});

describe('performEncounterSweep', () => {
  it('does nothing when there is no dirty combat state', () => {
    const { summary, changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
    expect(summary).toBe('nothing to clear');
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('resets turn economy, stance, shield, prey and sustains', () => {
    store['thorn:turnstate'] = { actionsSpent: 2, reactionSpent: true };
    store['thorn:shieldraise'] = { raised: true, ts: 1 };
    store['thorn:stance'] = { active: true, name: 'Mountain Stance' };
    store['thorn:huntprey'] = { targetName: 'Ogre' };
    store['thorn:sustains'] = [{ id: 's1', spellName: 'Bless' }];

    const { summary, changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });

    expect(changed).toBe(5);
    expect(store['thorn:turnstate'].actionsSpent).toBe(0);
    expect(store['thorn:turnstate'].reactionSpent).toBe(false);
    expect(store['thorn:shieldraise']).toEqual({ raised: false, ts: 0 });
    expect(store['thorn:stance']).toEqual({ active: false, name: null, ts: 0 });
    expect(store['thorn:huntprey']).toBeNull();
    expect(store['thorn:sustains']).toEqual([]);
    expect(summary).toContain('turn economy');
    expect(summary).toContain('sustained spells');
  });

  // #1733 ruling 1: the kinetic aura survives encounter end (kineticists keep
  // auras running in exploration) — only a manual Dismiss, an overflow burn,
  // or the KO sweep (`useAuraKoSweep`) ends it. The sweep must never touch it.
  it('leaves an active kinetic aura untouched (#1733 ruling 1)', () => {
    store['thorn:aura'] = { active: true, ts: 1 };
    const { changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(store['thorn:aura']).toEqual({ active: true, ts: 1 });
    expect(sendUpdate).not.toHaveBeenCalledWith('thorn', 'aura', expect.anything());
    expect(changed).toBe(0);
  });

  it('expires encounter-scoped effects but keeps manual + clock immunities', () => {
    store['thorn:effects'] = [
      { id: 'e1', effectId: 'frightened', expireAt: { round: 2, boundary: 'round-end' } },
      { id: 'e2', effectId: 'mage-armor' }, // manual, no expiry
      { id: 'e3', effectId: 'treat-wounds-immunity', expireAtSecs: 999999 }, // clock-based
    ];

    performEncounterSweep({ character: CHAR, getState, sendUpdate });

    const kept = store['thorn:effects'].map((e) => e.id);
    expect(kept).toEqual(['e2', 'e3']);
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'effects', expect.any(Array));
  });

  it('drops catalog-flagged encounterScoped effects (eld-charged) with no expireAt', () => {
    store['thorn:effects'] = [
      { id: 'c1', effectId: 'eld-charged' }, // no expireAt, but flagged encounterScoped (#275)
      { id: 'm1', effectId: 'mage-armor' },  // manual, kept
    ];

    performEncounterSweep({ character: CHAR, getState, sendUpdate });

    expect(store['thorn:effects'].map((e) => e.id)).toEqual(['m1']);
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'effects', expect.any(Array));
  });

  it('leaves effects untouched when none are encounter-scoped', () => {
    store['thorn:effects'] = [{ id: 'e2', effectId: 'mage-armor' }];
    const { changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
    expect(sendUpdate).not.toHaveBeenCalledWith('thorn', 'effects', expect.anything());
  });

  it('only resets the turn state when it is actually dirty', () => {
    store['thorn:turnstate'] = { actionsSpent: 0, attacksMade: 0, reactionSpent: false, hasStartedFirstTurn: false, actionsLog: [] };
    const { changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
  });

  // Keys folded in from useEncounter's deleted endEncounter (#1677). The store
  // above IS the session cache, so these also pin the #1671 contract: the sweep
  // reads purely through getState — a value that only ever ARRIVED over the
  // relay (never landed in localStorage) still gets cleared.
  it('clears a Harmless Bystander declaration (#226)', () => {
    store['thorn:bystander'] = { active: true, mod: 'deception', ts: 1 };
    const { summary } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(store['thorn:bystander']).toMatchObject({ active: false, mod: null, revealed: false });
    expect(summary).toContain('Harmless Bystander');
  });

  // #465: the 1-day per-creature immunity ledger rides the SAME key as the
  // declaration, and it must outlive the fight that created it.
  it('keeps unexpired Harmless Bystander immunities and prunes expired ones', () => {
    store['thorn:bystander'] = {
      active: true,
      mod: 'deception',
      ts: 1,
      revealed: true,
      immune: {
        'creature:ghoul': { abilityKey: 'harmless-bystander', appliedBy: 'thorn', expireAtSecs: 5000 },
        'creature:rat':   { abilityKey: 'harmless-bystander', appliedBy: 'thorn', expireAtSecs: 100 },
      },
    };
    performEncounterSweep({ character: CHAR, getState, sendUpdate, nowSecs: 1000 });
    expect(Object.keys(store['thorn:bystander'].immune)).toEqual(['creature:ghoul']);
    expect(store['thorn:bystander'].revealed).toBe(false);
  });

  it('clears the playing state (#935)', () => {
    store['thorn:playing'] = { active: true, expireAt: { round: 2, entryId: 'e1', boundary: 'turn-end' }, ts: 1 };
    performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(store['thorn:playing']).toEqual({ active: false, ts: 0 });
  });

  it('clears a pending Lingering Composition (#226-B)', () => {
    store['thorn:lingering'] = { spellId: 'inspire-courage', ts: 1 };
    performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(store['thorn:lingering']).toBeNull();
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'lingering', null);
  });

  it('skips inactive bystander/playing and absent lingering', () => {
    store['thorn:bystander'] = { active: false, mod: null, ts: 0 };
    store['thorn:playing'] = { active: false, ts: 0 };
    const { changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});

// Once-per-sweep globals folded in from endEncounter (#1677): the encounter
// record itself, Recall Knowledge pruning, and the persistent / enemy-fx /
// summons maps.
describe('performEncounterGlobalSweep', () => {
  it('does nothing when every global is absent or already idle', () => {
    const { summary, changed } = performEncounterGlobalSweep({ getState, sendUpdate });
    expect(changed).toBe(0);
    expect(summary).toBe('nothing to clear');
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('leaves an already-default encounter record alone', () => {
    store['global:encounter'] = defaultEncounter();
    const { changed } = performEncounterGlobalSweep({ getState, sendUpdate });
    expect(changed).toBe(0);
  });

  it('resets a live encounter record — order, log, saves, resolutions, payloads — to default', () => {
    store['global:encounter'] = {
      ...defaultEncounter(),
      active: true,
      phase: 'in-progress',
      round: 3,
      order: [{ entryId: 'pc-1', kind: 'pc', charId: 'thorn' }],
      log: [{ id: 'l1', text: 'Round 3 begins' }],
      saveRequests: [{ id: 'sr-1' }],
      saveResolutions: [{ id: 'sr-0' }],
      armedPayloads: [{ id: 'ap-1' }],
    };
    performEncounterGlobalSweep({ getState, sendUpdate });
    expect(store['global:encounter']).toEqual(defaultEncounter());
    expect(sendUpdate).toHaveBeenCalledWith('global', 'encounter', defaultEncounter());
    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
      'cnmh_encounter_global', JSON.stringify(defaultEncounter()),
    );
  });

  it('prunes Recall Knowledge: ephemeral entryId records drop, creatureKey records persist with crit-fail locks reset (#333)', () => {
    store['global:encounter'] = {
      ...defaultEncounter(),
      active: true,
      order: [
        { entryId: 'e-manual', kind: 'enemy', name: 'Bandit' },              // no creatureKey → ephemeral
        { entryId: 'e-ghoul', kind: 'enemy', creatureKey: 'ghoul' },         // campaign-persistent
        { entryId: 'pc-1', kind: 'pc', charId: 'thorn' },
      ],
    };
    store['global:knowledge'] = {
      'e-manual': { identity: true, lockedOut: {} },
      ghoul: { identity: true, lockedOut: { thorn: true } },
    };
    performEncounterGlobalSweep({ getState, sendUpdate });
    expect(store['global:knowledge']).toEqual({
      ghoul: { identity: true, lockedOut: {} },
    });
  });

  it('clears dirty persistent / enemy-fx / summons globals and reports them', () => {
    store['global:persistent'] = { 'e-1': [{ id: 'pd-1', dice: '1d4', type: 'bleed' }] };
    store['global:enemyfx'] = { 'e-1': { conditions: [{ id: 'frightened', value: 1 }], effects: [] } };
    store['global:summons'] = [{ entryId: 'sum-1', kind: 'summon', name: 'Skeletal Champion' }];

    const { summary, changed } = performEncounterGlobalSweep({ getState, sendUpdate });

    expect(changed).toBe(3);
    expect(store['global:persistent']).toEqual({});
    expect(store['global:enemyfx']).toEqual({});
    expect(store['global:summons']).toEqual([]);
    expect(summary).toContain('persistent damage');
    expect(summary).toContain('enemy conditions');
    expect(summary).toContain('summons');
  });

  it('skips already-empty maps rather than writing redundant updates', () => {
    store['global:persistent'] = {};
    store['global:enemyfx'] = {};
    store['global:summons'] = [];
    store['global:knowledge'] = {};
    const { changed } = performEncounterGlobalSweep({ getState, sendUpdate });
    expect(changed).toBe(0);
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
