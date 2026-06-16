import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => {
      subs.add(force);
      return () => subs.delete(force);
    }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

vi.mock('../../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: vi.fn() }),
}));

// PersistentChip pulls in useGmAuth (probes /api/gm/whoami).
vi.mock('../../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ isGm: false, email: null, loading: false }),
}));

import { __reset, useSyncedState } from '../../../hooks/useSyncedState';
import InitiativeStrip from './InitiativeStrip';
import { useEncounter } from '../../../hooks/useEncounter';

const pellias = { id: 'Pellias', name: 'Pellias' };

const EncounterDriver = ({ onReady }) => {
  const enc = useEncounter();
  React.useEffect(() => { onReady(enc); }, [enc, onReady]);
  return null;
};

const SyncDriver = ({ skey, onReady }) => {
  const [val, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady({ val, set }); }, [val, set, onReady]);
  return null;
};

const startWithEnemy = (getDrv) => {
  act(() => getDrv().startEncounter([pellias]));
  act(() => getDrv().addEnemy('Goblin', 8));
  const [p] = getDrv().encounter.order;
  act(() => getDrv().setInitiative(p.entryId, 15));
  act(() => getDrv().beginRound1());
};

beforeEach(() => { __reset(); });

describe('InitiativeStrip', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<InitiativeStrip charId="Pellias" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one entry per combatant, with the current actor marked', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <InitiativeStrip charId="Pellias" />
      </>
    );
    startWithEnemy(() => drv);
    expect(screen.getByText('Pellias')).toBeInTheDocument();
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    // Pellias (init 15) goes before Goblin (8) → Pellias is current.
    const pelliasEntry = screen.getByText('Pellias').closest('.cmd-init-entry');
    expect(pelliasEntry).toHaveAttribute('aria-current', 'true');
  });

  it('shows a flanked badge when flanked state arrives', () => {
    let drv, flanked;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_flanked_global" onReady={(s) => (flanked = s)} />
        <InitiativeStrip charId="Pellias" />
      </>
    );
    startWithEnemy(() => drv);
    const goblin = drv.encounter.order.find((e) => e.name === 'Goblin');
    act(() => flanked.set({ [goblin.entryId]: { byCharIds: ['Pellias', 'Ashka'] } }));
    expect(screen.getByLabelText('Goblin is flanked')).toBeInTheDocument();
  });

  it('tapping a foe toggles focus and persists to cnmh_focus_<charId>', () => {
    let drv, focus;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (focus = s)} />
        <InitiativeStrip charId="Pellias" />
      </>
    );
    startWithEnemy(() => drv);
    const goblin = drv.encounter.order.find((e) => e.name === 'Goblin');
    const btn = screen.getByRole('button', { name: 'Focus Goblin' });

    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(focus.val).toBe(goblin.entryId);
    expect(screen.getByRole('button', { name: 'Focus Goblin' })).toHaveAttribute('aria-pressed', 'true');

    // Re-tap clears it.
    fireEvent.click(screen.getByRole('button', { name: 'Focus Goblin' }));
    expect(focus.val).toBeNull();
  });

  it('makes PC entries focus-clickable too — focusing an ally (#429)', () => {
    let drv, focus;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (focus = s)} />
        <InitiativeStrip charId="Pellias" />
      </>
    );
    startWithEnemy(() => drv);
    const pellias = drv.encounter.order.find((e) => e.name === 'Pellias');
    const btn = screen.getByRole('button', { name: 'Focus Pellias' });
    fireEvent.click(btn);
    expect(focus.val).toBe(pellias.entryId);
    expect(screen.getByRole('button', { name: 'Focus Pellias' })).toHaveAttribute('aria-pressed', 'true');
  });
});
