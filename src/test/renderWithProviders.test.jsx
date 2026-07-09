import React, { useState, useEffect } from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders, makeCharacter, makeItem, invRef, makeSessionBus } from './renderWithProviders';
import { useContent } from '../contexts/ContentContext';
import { useSyncedState } from '../hooks/useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { syncKey, APP } from '../sync/keys';

// Probe components exercising the real provider stack end to end.
const CatalogProbe = () => {
  const { characters, items, source } = useContent();
  const char = characters[0];
  return (
    <div>
      <div data-testid="source">{source}</div>
      <div data-testid="item-count">{items.length}</div>
      <div data-testid="char-name">{char?.name}</div>
      <div data-testid="inv-name">{char?.inventory?.[0]?.name}</div>
    </div>
  );
};

const SyncProbe = ({ charId }) => {
  const [hp, setHp] = useSyncedState(syncKey(APP.EFFECTS, charId), []);
  return (
    <div>
      <div data-testid="effect-count">{hp.length}</div>
      <button onClick={() => setHp([...hp, { id: 'x' }])}>add</button>
    </div>
  );
};

describe('renderWithProviders', () => {
  // useSyncedState persists every write/incoming value to localStorage and
  // reads it back as the initial value — clear it so tests stay independent.
  beforeEach(() => window.localStorage.clear());

  it('seeds ContentProvider and resolves character inventory refs through the real pipeline', () => {
    const dagger = makeItem({ id: 'dagger', name: 'Dagger', price: 0.2 });
    const pc = makeCharacter({ id: 'pc-1', name: 'Valeros', inventory: [invRef('dagger')] });
    renderWithProviders(<CatalogProbe />, {
      content: { character: [pc], item: [dagger] },
    });
    expect(screen.getByTestId('source')).toHaveTextContent('server');
    expect(screen.getByTestId('item-count')).toHaveTextContent('1');
    expect(screen.getByTestId('char-name')).toHaveTextContent('Valeros');
    // resolveCharacterItems inlined the catalog doc into the inventory entry.
    expect(screen.getByTestId('inv-name')).toHaveTextContent('Dagger');
  });

  it('falls back to the bundled seed for unseeded collections', () => {
    renderWithProviders(<CatalogProbe />, {
      content: { character: [makeCharacter({ name: 'Solo' })] },
    });
    // No items seeded → the full bundled item catalog backs the app.
    expect(Number(screen.getByTestId('item-count').textContent)).toBeGreaterThan(100);
  });

  it('runs the real useSyncedState against the session bus (writes land in sent)', () => {
    const { session } = renderWithProviders(<SyncProbe charId="pc-1" />);
    expect(screen.getByTestId('effect-count')).toHaveTextContent('0');
    act(() => screen.getByRole('button', { name: 'add' }).click());
    expect(screen.getByTestId('effect-count')).toHaveTextContent('1');
    expect(session.sent).toEqual([
      expect.objectContaining({ characterId: 'pc-1', stateType: 'effects' }),
    ]);
  });

  it('push() delivers a remote update to live subscribers', () => {
    const { session } = renderWithProviders(<SyncProbe charId="pc-1" />);
    act(() => session.push('pc-1', 'effects', [{ id: 'a' }, { id: 'b' }]));
    expect(screen.getByTestId('effect-count')).toHaveTextContent('2');
  });

  it('honors the offline-sandbox freeze exactly like SessionProvider', () => {
    const bus = makeSessionBus({ connected: true, foundryConnected: false });
    renderWithProviders(<SyncProbe charId="pc-1" />, { session: bus });
    act(() => screen.getByRole('button', { name: 'add' }).click());
    // effects is a per-character resource write — frozen in the sandbox.
    expect(bus.sent).toEqual([]);
    expect(screen.getByTestId('effect-count')).toHaveTextContent('0');
  });

  it('exposes presence flags to consumers', () => {
    const Presence = () => {
      const { connected, foundryConnected } = useSession();
      return <div data-testid="p">{String(connected)}-{String(foundryConnected)}</div>;
    };
    renderWithProviders(<Presence />, { session: { connected: true, foundryConnected: true } });
    expect(screen.getByTestId('p')).toHaveTextContent('true-true');
  });

  it('seeded session state is visible through getState from first render', () => {
    const Reader = () => {
      const { getState } = useSession();
      const [val, setVal] = useState(null);
      useEffect(() => { setVal(getState('pc-1', 'gold')); }, [getState]);
      return <div data-testid="gold">{String(val)}</div>;
    };
    renderWithProviders(<Reader />, {
      session: { state: { 'pc-1': { gold: 42 } } },
    });
    expect(screen.getByTestId('gold')).toHaveTextContent('42');
  });
});
