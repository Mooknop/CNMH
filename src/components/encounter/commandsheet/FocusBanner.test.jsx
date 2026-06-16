import React from 'react';
import { render, screen, act } from '@testing-library/react';

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

vi.mock('../../../contexts/ContentContext', () => ({
  useContent: () => ({ monsters: [], effects: [] }),
}));

import { __reset, useSyncedState } from '../../../hooks/useSyncedState';
import FocusBanner from './FocusBanner';
import { useEncounter } from '../../../hooks/useEncounter';
import { fullyRevealedRecord } from '../../../utils/recallKnowledge';

const pellias = { id: 'Pellias', name: 'Pellias' };

const EncounterDriver = ({ onReady }) => {
  const enc = useEncounter();
  React.useEffect(() => { onReady(enc); }, [enc, onReady]);
  return null;
};

const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

const ENEMY_DEFENSES = {
  ac: 18,
  perception: 8,
  saves: { fortitude: 9, reflex: 5, will: 7 },
  weaknesses: [{ type: 'cold', value: 5 }],
};

// Build a one-PC-one-enemy encounter, optionally patching the enemy entry with a
// Foundry stat block (defenses + bestiary) and focusing it.
const setupFocus = (getDrv, { setEnc, setFocus, patch = true } = {}) => {
  act(() => getDrv().startEncounter([pellias]));
  act(() => getDrv().addEnemy('Goblin', 8));
  const [p] = getDrv().encounter.order;
  act(() => getDrv().setInitiative(p.entryId, 15));
  act(() => getDrv().beginRound1());
  const goblin = getDrv().encounter.order.find((e) => e.name === 'Goblin');
  if (patch && setEnc) {
    act(() => setEnc((cur) => ({
      ...cur,
      order: cur.order.map((e) =>
        e.entryId === goblin.entryId
          ? { ...e, defenses: ENEMY_DEFENSES, bestiary: { level: 3, rarity: 'common' } }
          : e
      ),
    })));
  }
  if (setFocus) act(() => setFocus(goblin.entryId));
  return goblin;
};

beforeEach(() => { __reset(); });

describe('FocusBanner', () => {
  it('renders nothing with no focus', () => {
    let drv;
    const { container } = render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <FocusBanner charId="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    expect(container.querySelector('.cmd-focus')).toBeNull();
  });

  it('shows all DC rows + RK DC + weaknesses with a fully-revealed record', () => {
    let drv, setEnc, setFocus, setKnowledge;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_knowledge_global" onReady={(s) => (setKnowledge = s)} />
        <FocusBanner charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    // Manual enemy → rk key is the entryId.
    act(() => setKnowledge({ [goblin.entryId]: fullyRevealedRecord() }));

    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('Fort')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument(); // 10 + fort 9
    expect(screen.getByText('15')).toBeInTheDocument(); // 10 + ref 5
    expect(screen.getByText('17')).toBeInTheDocument(); // 10 + will 7
    expect(screen.getByText('Perc DC')).toBeInTheDocument();
    expect(screen.getByText('RK DC')).toBeInTheDocument();
    expect(screen.getByText('cold 5')).toBeInTheDocument();
    // AC 18, Perc 18, RK DC 18 all read 18.
    expect(screen.getAllByText('18').length).toBeGreaterThanOrEqual(3);
  });

  it('hides unrevealed rows (default record) — shows only the name', () => {
    let drv, setEnc, setFocus;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <FocusBanner charId="Pellias" />
      </>
    );
    setupFocus(() => drv, { setEnc, setFocus });
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.queryByText('AC')).toBeNull();
    expect(screen.queryByText('RK DC')).toBeNull();
    expect(screen.queryByText('cold 5')).toBeNull();
  });

  it('degrades gracefully for a foe with no stat block', () => {
    let drv, setFocus;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <FocusBanner charId="Pellias" />
      </>
    );
    // No patch → the enemy has neither defenses nor bestiary.
    setupFocus(() => drv, { setFocus, patch: false });
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText(/No stat block/)).toBeInTheDocument();
  });

  // ── Ally focus (#429) ──────────────────────────────────────────────────────
  it('shows an ally banner with HP + conditions when an ally is focused', () => {
    let drv, setFocus, setHp, setConds;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_hp_Ashka" onReady={(s) => (setHp = s)} />
        <SyncDriver skey="cnmh_conditions_Ashka" onReady={(s) => (setConds = s)} />
        <FocusBanner charId="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias, { id: 'Ashka', name: 'Ashka' }]));
    const ashka = drv.encounter.order.find((e) => e.name === 'Ashka');
    act(() => setHp(12));
    act(() => setConds([{ id: 'frightened', value: 1 }]));
    act(() => setFocus(ashka.entryId));

    const banner = screen.getByRole('region', { name: 'Focused ally: Ashka' });
    expect(banner).toHaveTextContent('Ashka');
    expect(banner).toHaveTextContent('12');
    expect(banner).toHaveTextContent(/Frightened 1/);
    // Not the enemy stat-line banner.
    expect(screen.queryByText('RK DC')).toBeNull();
  });
});
