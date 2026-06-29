import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAppendLog = vi.fn();
let mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog: mockAppendLog }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

// useSession: getState backs the per-combatant effect lookup (#900). Default
// returns nothing (no resistance); tests override mockEffects to inject buffs.
let mockEffects = {}; // { [charId]: { effects?: [], foundryeffects?: [] } }
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: (charId, stateType) => mockEffects[charId]?.[stateType],
  }),
}));

// Catalog the resistance reader resolves effectIds against.
vi.mock('../utils/EffectUtils', async (importOriginal) => {
  const actual = await importOriginal();
  const catalog = [
    { id: 'blood-booster-greater', name: 'Blood Booster (Greater)', modifiers: [
      { stat: 'resistance', amount: 20, vs: 'persistent-bleed,persistent-poison', flatCheckEase: true },
    ] },
  ];
  return {
    ...actual,
    resistanceFor: (effects, vsType) => actual.resistanceFor(effects, vsType, catalog),
    flatCheckEasedFor: (effects, vsType) => actual.flatCheckEasedFor(effects, vsType, catalog),
  };
});

// useSyncedState: plain useState, with the setter spied for write assertions.
const syncedMock = vi.hoisted(() => ({ setSpy: null }));
vi.mock('./useSyncedState', () => {
  const React = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => {
      const [value, setValue] = React.useState(init);
      syncedMock.setSpy = syncedMock.setSpy || vi.fn(setValue);
      return [value, syncedMock.setSpy];
    },
  };
});

import { usePersistentReminders } from './usePersistentReminders';

const goblin = { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' };
const pc     = { entryId: 'e-pc', kind: 'pc', charId: 'char-a', name: 'Ashka' };
const order  = [pc, goblin];

const inProgress = (round, turnIdx, extra = {}) => ({
  active: true, phase: 'in-progress', round, currentTurnIndex: turnIdx, order, ...extra,
});

const setup = () => renderHook(() => usePersistentReminders());

const setEncounter = (hook, next) => {
  act(() => { mockEncounter = next; hook.rerender(); });
};

const seedMap = (hook, map) => {
  act(() => { syncedMock.setSpy(map); });
  hook.rerender();
};

const reminderTexts = () => mockAppendLog.mock.calls.map(([e]) => e.text);

beforeEach(() => {
  vi.clearAllMocks();
  syncedMock.setSpy = null;
  mockIsGm = true;
  mockEffects = {};
  mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
});

describe('usePersistentReminders (#272)', () => {
  it("reminds for the outgoing combatant's instances when their turn ends", () => {
    const hook = setup();
    setEncounter(hook, inProgress(1, 1)); // Goblin's turn underway
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'electricity', sourceName: 'Polarize' }] });
    setEncounter(hook, inProgress(2, 0)); // Goblin's turn ends, wraps to round 2
    expect(reminderTexts()).toContain(
      'Goblin: 1d4 persistent electricity — DC 15 flat check to end'
    );
  });

  it('reminds once per instance, including PCs (uniform entryId map)', () => {
    const hook = setup();
    setEncounter(hook, inProgress(1, 0)); // Ashka's turn underway
    seedMap(hook, {
      'e-pc': [
        { id: 'pd-1', dice: '1d4', type: 'bleed', sourceName: 'Shard Strike' },
        { id: 'pd-2', dice: '2d6', type: 'fire', sourceName: 'Fireball' },
      ],
    });
    setEncounter(hook, inProgress(1, 1));
    expect(reminderTexts()).toEqual([
      'Ashka: 1d4 persistent bleed — DC 15 flat check to end',
      'Ashka: 2d6 persistent fire — DC 15 flat check to end',
    ]);
  });

  it("annotates a PC's resistance and eases the recovery DC from an active effect (#900)", () => {
    mockEffects = { 'char-a': { effects: [{ id: 'u1', effectId: 'blood-booster-greater' }] } };
    const hook = setup();
    setEncounter(hook, inProgress(1, 0)); // Ashka's turn underway
    seedMap(hook, {
      'e-pc': [
        { id: 'pd-1', dice: '1d6', type: 'bleed', sourceName: 'Wound' },
        { id: 'pd-2', dice: '1d6', type: 'fire', sourceName: 'Torch' },
      ],
    });
    setEncounter(hook, inProgress(1, 1)); // Ashka's turn ends
    expect(reminderTexts()).toEqual([
      'Ashka: 1d6 persistent bleed, resistance 20 (reduce, min 0) — DC 10 flat check to end',
      // fire is not covered by Blood Booster — standard line
      'Ashka: 1d6 persistent fire — DC 15 flat check to end',
    ]);
  });

  it('leaves enemies (no charId) with the standard DC-15 line (#900)', () => {
    mockEffects = { 'char-a': { effects: [{ id: 'u1', effectId: 'blood-booster-greater' }] } };
    const hook = setup();
    setEncounter(hook, inProgress(1, 1)); // Goblin's turn underway
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'bleed' }] });
    setEncounter(hook, inProgress(2, 0));
    expect(reminderTexts()).toContain('Goblin: 1d4 persistent bleed — DC 15 flat check to end');
  });

  it('does not remind on first observation of an in-progress encounter (mid-combat mount)', () => {
    const hook = setup();
    seedMap(hook, { 'e-pc': [{ id: 'pd-1', dice: '1d4', type: 'bleed' }] });
    setEncounter(hook, inProgress(2, 1)); // first sighting — no outgoing turn yet
    expect(mockAppendLog).not.toHaveBeenCalled();
  });

  it('does not re-fire on unrelated re-renders within the same turn', () => {
    const hook = setup();
    setEncounter(hook, inProgress(1, 1));
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'fire' }] });
    setEncounter(hook, inProgress(2, 0));
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
    hook.rerender();
    hook.rerender();
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
  });

  it('works when the encounter is Foundry-linked', () => {
    const hook = setup();
    setEncounter(hook, inProgress(1, 1, { foundryCombatId: 'combat-abc' }));
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d6', type: 'acid' }] });
    setEncounter(hook, inProgress(2, 0, { foundryCombatId: 'combat-abc' }));
    expect(reminderTexts()).toContain('Goblin: 1d6 persistent acid — DC 15 flat check to end');
  });

  it('non-GM clients never write or log', () => {
    mockIsGm = false;
    const hook = setup();
    setEncounter(hook, inProgress(1, 1));
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'fire' }] });
    syncedMock.setSpy.mockClear(); // discard the seeding call itself
    setEncounter(hook, inProgress(2, 0));
    setEncounter(hook, { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] });
    expect(mockAppendLog).not.toHaveBeenCalled();
    expect(syncedMock.setSpy).not.toHaveBeenCalled();
  });

  it('prunes entries whose combatant left the order', () => {
    const hook = setup();
    setEncounter(hook, inProgress(1, 0));
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'fire' }] });
    syncedMock.setSpy.mockClear();
    setEncounter(hook, inProgress(1, 0, { order: [pc] })); // Goblin removed
    expect(syncedMock.setSpy).toHaveBeenCalledWith({});
  });

  it('clears the map when the encounter ends', () => {
    const hook = setup();
    setEncounter(hook, inProgress(1, 0));
    seedMap(hook, { 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'fire' }] });
    syncedMock.setSpy.mockClear();
    setEncounter(hook, { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] });
    expect(syncedMock.setSpy).toHaveBeenCalledWith({});
  });
});
