import { act } from '@testing-library/react';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useAdvanceTurn } from './useAdvanceTurn';
import { RELAY } from '../sync/keys';

beforeEach(() => window.localStorage.clear());

const ORDER = [
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', initiative: 20 },
  { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias', name: 'Pellias', initiative: 10 },
];

const encounterWith = (extra = {}) => ({
  active: true,
  phase: 'in-progress',
  round: 1,
  currentTurnIndex: 0,
  order: ORDER,
  log: [],
  saveRequests: [],
  ...extra,
});

describe('useAdvanceTurn (#1537 S1)', () => {
  it('Foundry-linked combat: advance writes the turncmd next-turn command', () => {
    const { result, session } = renderHookWithProviders(() => useAdvanceTurn());
    act(() => { session.push('global', RELAY.ENCOUNTER, encounterWith({ foundryCombatId: 'combat1' })); });

    act(() => { result.current.advance('Goblin'); });

    const cmd = session.sent.filter((m) => m.stateType === RELAY.TURNCMD).at(-1);
    expect(cmd.characterId).toBe('global');
    expect(cmd.value).toMatchObject({ action: 'next-turn' });
    // No app-side encounter advance — the bridge pushes the new pointer back.
    expect(session.sent.some((m) => m.stateType === RELAY.ENCOUNTER && m.value.currentTurnIndex !== 0)).toBe(false);
  });

  it('offline sandbox: advance falls back to the app-side turn advance', () => {
    const { result, session } = renderHookWithProviders(() => useAdvanceTurn());
    act(() => { session.push('global', RELAY.ENCOUNTER, encounterWith()); });

    act(() => { result.current.advance('Goblin'); });

    expect(session.sent.some((m) => m.stateType === RELAY.TURNCMD)).toBe(false);
    const enc = session.sent.filter((m) => m.stateType === RELAY.ENCOUNTER).at(-1);
    expect(enc.value.currentTurnIndex).toBe(1);
  });
});
