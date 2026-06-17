// useEncounter — Hymn of Healing fast-healing turn tick (#226). At the start of
// a PC's turn, the strongest Hymn fast healing aimed at them (read off any
// caster's sustain ledger) heals them, capped at max HP.

import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

// Controllable session: getState routes by key (sustains ledger / hp), sendUpdate captured.
const ledger = {};
const hp = {};
const mockSendUpdate = vi.fn((id, key, value) => { if (key === 'hp') hp[id] = value; });
const mockGetState = vi.fn((id, key) => {
  if (key === 'sustains') return ledger[id] || [];
  if (key === 'hp') return hp[id];
  return [];
});
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate, getState: mockGetState }),
}));

vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

vi.mock('../utils/expiry', () => ({
  boundariesCrossedBy: vi.fn(() => []),
  isExpired: vi.fn(() => false),
  resolveExpireAt: vi.fn(() => null),
  expiryLabel: vi.fn(() => null),
}));

import { useEncounter } from './useEncounter';

const setup = () => renderHook(() => useEncounter());
const izzy = { id: 'Izzy', name: 'Izzy' };
const ashka = { id: 'Ashka', name: 'Ashka' };

const hymnSustain = (targetId, fastHealing, targetMaxHp) => ({
  id: 's1', spellId: 'hymn-of-healing', spellName: 'Hymn of Healing',
  lastSustainedRound: 1, heal: { targetId, targetName: targetId, targetMaxHp, fastHealing, tempHp: fastHealing },
});

beforeEach(() => {
  for (const k of Object.keys(ledger)) delete ledger[k];
  for (const k of Object.keys(hp)) delete hp[k];
  mockSendUpdate.mockClear();
});

const startCombat = (result) => {
  act(() => result.current.startEncounter([izzy, ashka]));
  const [e0, e1] = result.current.encounter.order;
  act(() => result.current.setInitiative(e0.entryId, 20)); // Izzy
  act(() => result.current.setInitiative(e1.entryId, 10)); // Ashka
  act(() => result.current.beginRound1()); // currentTurnIndex 0 = Izzy
};

describe('useEncounter — Hymn fast-healing tick', () => {
  it('heals the entry whose turn is starting from a caster Hymn sustain', () => {
    ledger.Izzy = [hymnSustain('Ashka', 4, 30)];
    hp.Ashka = { current: 20, max: 30, temp: 0 };

    const { result } = setup();
    startCombat(result);
    act(() => result.current.advanceTurn()); // → Ashka's turn

    expect(mockSendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 24 }));
    expect(result.current.encounter.log.some((l) => /Fast healing 4 \(Hymn of Healing\) — Ashka \+4 HP/.test(l.text))).toBe(true);
  });

  it('does not heal a target already at full HP', () => {
    ledger.Izzy = [hymnSustain('Ashka', 4, 30)];
    hp.Ashka = { current: 30, max: 30, temp: 0 };

    const { result } = setup();
    startCombat(result);
    act(() => result.current.advanceTurn());

    expect(mockSendUpdate.mock.calls.some(([, key]) => key === 'hp')).toBe(false);
  });

  it('no fast healing when the starting entry has no Hymn aimed at them', () => {
    ledger.Izzy = [hymnSustain('Blu', 4, 30)]; // targets someone else
    hp.Ashka = { current: 20, max: 30, temp: 0 };

    const { result } = setup();
    startCombat(result);
    act(() => result.current.advanceTurn());

    expect(mockSendUpdate.mock.calls.some(([id, key]) => key === 'hp' && id === 'Ashka')).toBe(false);
  });
});
