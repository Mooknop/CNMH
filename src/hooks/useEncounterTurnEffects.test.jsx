import { renderHook, act } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAppendLog = vi.fn();
let mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog: mockAppendLog }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({ useGmAuth: () => ({ isGm: mockIsGm }) }));

// Session: getState routes sustains/hp; sendUpdate captured.
const ledger = {};
const hp = {};
const mockSendUpdate = vi.fn((id, key, value) => { if (key === 'hp') hp[id] = value; });
const mockGetState = vi.fn((id, key) => {
  if (key === 'sustains') return ledger[id] || [];
  if (key === 'hp') return hp[id];
  return [];
});
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [{ id: 'inspire-courage', name: 'Inspire Courage' }] }),
}));

import { useEncounterTurnEffects } from './useEncounterTurnEffects';

const izzy  = { entryId: 'e-izzy', kind: 'pc', charId: 'Izzy', name: 'Izzy' };
const ashka = { entryId: 'e-ashka', kind: 'pc', charId: 'Ashka', name: 'Ashka' };
const order = [izzy, ashka];

// Foundry-linked in-progress encounter (the bridge owns turn advancement).
const foundry = (round, turnIdx, extra = {}) => ({
  active: true, phase: 'in-progress', round, currentTurnIndex: turnIdx, order,
  foundryCombatId: 'fc-1', ...extra,
});

const setup = () => renderHook(() => useEncounterTurnEffects());
const transition = (hook, next) => act(() => { mockEncounter = next; hook.rerender(); });

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGm = true;
  mockEncounter = { active: false, phase: 'idle', round: 0, currentTurnIndex: 0, order: [] };
  localStorage.clear();
  for (const k of Object.keys(ledger)) delete ledger[k];
  for (const k of Object.keys(hp)) delete hp[k];
});

describe('useEncounterTurnEffects (#443)', () => {
  it('on a Foundry-linked turn transition, expires effects + applies fast healing', () => {
    // Izzy (outgoing) carries a 1-round effect expiring at her turn-end.
    localStorage.setItem('cnmh_effects_Izzy', JSON.stringify([
      { id: 'fx', effectId: 'inspire-courage', expireAt: { round: 1, entryId: 'e-izzy', boundary: 'turn-end' } },
    ]));
    // A Hymn aimed at Ashka (incoming), who is hurt.
    ledger.Izzy = [{ spellId: 'hymn-of-healing', heal: { targetId: 'Ashka', targetMaxHp: 30, fastHealing: 4 } }];
    hp.Ashka = { current: 20, max: 30, temp: 0 };

    const hook = setup();
    transition(hook, foundry(1, 0)); // first observation — no action
    transition(hook, foundry(1, 1)); // Izzy → Ashka

    expect(mockSendUpdate).toHaveBeenCalledWith('Izzy', 'effects', []);
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({ text: 'Inspire Courage expired on Izzy' }));
    expect(mockSendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 24 }));
  });

  it('does nothing for a non-GM client', () => {
    mockIsGm = false;
    localStorage.setItem('cnmh_effects_Izzy', JSON.stringify([
      { id: 'fx', effectId: 'inspire-courage', expireAt: { round: 1, entryId: 'e-izzy', boundary: 'turn-end' } },
    ]));
    const hook = setup();
    transition(hook, foundry(1, 0));
    transition(hook, foundry(1, 1));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('does nothing for an app-driven (non-Foundry) encounter — advanceTurn owns that', () => {
    localStorage.setItem('cnmh_effects_Izzy', JSON.stringify([
      { id: 'fx', effectId: 'inspire-courage', expireAt: { round: 1, entryId: 'e-izzy', boundary: 'turn-end' } },
    ]));
    const appDriven = (round, turnIdx) => ({
      active: true, phase: 'in-progress', round, currentTurnIndex: turnIdx, order, // no foundryCombatId
    });
    const hook = setup();
    transition(hook, appDriven(1, 0));
    transition(hook, appDriven(1, 1));
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });

  it('does not act on the first in-progress observation (no outgoing turn yet)', () => {
    localStorage.setItem('cnmh_effects_Izzy', JSON.stringify([
      { id: 'fx', effectId: 'inspire-courage', expireAt: { round: 1, entryId: 'e-izzy', boundary: 'turn-end' } },
    ]));
    const hook = setup();
    transition(hook, foundry(1, 0)); // only the initial observation
    expect(mockSendUpdate).not.toHaveBeenCalled();
  });
});
