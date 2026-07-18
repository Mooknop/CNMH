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
import Dossier from './Dossier';
import { useEncounter } from '../../../hooks/useEncounter';
import { fullyRevealedRecord, defaultRecord } from '../../../utils/recallKnowledge';

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
          ? { ...e, defenses: ENEMY_DEFENSES, bestiary: { level: 3, rarity: 'common', traits: ['goblin', 'humanoid'] } }
          : e
      ),
    })));
  }
  if (setFocus) act(() => setFocus(goblin.entryId));
  return goblin;
};

beforeEach(() => { __reset(); });

describe('Dossier', () => {
  it('renders nothing with no focus', () => {
    let drv;
    const { container } = render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <Dossier charId="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    expect(container.querySelector('.dossier')).toBeNull();
  });

  // ── Revealed foe (design 1c) ───────────────────────────────────────────────
  it('leads with the full stat grid + weakness for a fully-revealed record', () => {
    let drv, setEnc, setFocus, setKnowledge;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_knowledge_global" onReady={(s) => (setKnowledge = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    // Manual enemy → rk key is the entryId.
    act(() => setKnowledge({ [goblin.entryId]: fullyRevealedRecord() }));

    expect(screen.getByText('Goblin')).toBeInTheDocument();
    // Identity reveal drives the traits + level subtype line.
    expect(screen.getByText('Goblin · Humanoid · Level 3')).toBeInTheDocument();
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument(); // 10 + fort 9
    expect(screen.getByText('15')).toBeInTheDocument(); // 10 + ref 5
    expect(screen.getByText('17')).toBeInTheDocument(); // 10 + will 7
    expect(screen.getByText('Perc DC')).toBeInTheDocument();
    expect(screen.getByText('RK DC')).toBeInTheDocument();
    expect(screen.getByTestId('dossier-weak')).toHaveTextContent('cold 5');
    // AC 18, Perc 18, RK DC 18 all read 18.
    expect(screen.getAllByText('18').length).toBeGreaterThanOrEqual(3);
    // RK progress chips all confirmed.
    expect(screen.getByText('Identity ✓')).toBeInTheDocument();
    expect(screen.getByText('Defenses ✓')).toBeInTheDocument();
    expect(screen.getByText('IWR ✓')).toBeInTheDocument();
    // No redacted cells remain.
    expect(screen.queryAllByText('??')).toHaveLength(0);
  });

  it('ranks fully-revealed saves as an offense cue — lowest marked low', () => {
    let drv, setEnc, setFocus, setKnowledge;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_knowledge_global" onReady={(s) => (setKnowledge = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    act(() => setKnowledge({ [goblin.entryId]: fullyRevealedRecord() }));

    // Ref 15 is the lowest save → peril cue; Fort 19 the highest.
    expect(screen.getByText('◂ low')).toBeInTheDocument();
    expect(screen.getByText('15').closest('.dossier-cell')).toHaveClass('dossier-cell--low');
    expect(screen.getByText('19').closest('.dossier-cell')).toHaveClass('dossier-cell--high');
  });

  // ── Unidentified foe (design 2a) ───────────────────────────────────────────
  it('redacts the whole card for a default record — ?? grid + pending chips', () => {
    let drv, setEnc, setFocus;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    setupFocus(() => drv, { setEnc, setFocus });

    // Identity unrevealed → the name is withheld even though the strip shows it.
    expect(screen.getByText('Unidentified creature')).toBeInTheDocument();
    expect(screen.queryByText('Goblin')).toBeNull();
    expect(screen.getByText(/Not yet recalled/)).toBeInTheDocument();
    // All six stat cells redacted; the weakness stays hidden.
    expect(screen.getAllByText('??')).toHaveLength(6);
    expect(screen.queryByText('cold 5')).toBeNull();
    expect(screen.getByText('Identity ?')).toBeInTheDocument();
    expect(screen.getByText('Defenses ?')).toBeInTheDocument();
    expect(screen.getByText('IWR ?')).toBeInTheDocument();
  });

  it('gates each grid cell independently — a lone AC reveal fills only AC', () => {
    let drv, setEnc, setFocus, setKnowledge;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_knowledge_global" onReady={(s) => (setKnowledge = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    act(() => setKnowledge({ [goblin.entryId]: { ...defaultRecord(), ac: true } }));

    expect(screen.getByText('18')).toBeInTheDocument(); // AC revealed
    expect(screen.getAllByText('??')).toHaveLength(5);  // the rest stay hidden
    expect(screen.getByText('Unidentified creature')).toBeInTheDocument();
    expect(screen.getByText('Defenses partial')).toBeInTheDocument();
  });

  it('degrades gracefully for a foe with no stat block', () => {
    let drv, setFocus;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    // No patch → the enemy has neither defenses nor bestiary.
    setupFocus(() => drv, { setFocus, patch: false });
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText(/No stat block/)).toBeInTheDocument();
    // Nothing to redact — the reveal grid is absent entirely.
    expect(screen.queryAllByText('??')).toHaveLength(0);
  });

  // ── Per-type revealed resistances/immunities (#1014) ──────────────────────
  it('shows Resist/Immune chips for per-type damage-triggered reveals', () => {
    let drv, setEnc, setFocus, setKnowledge;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_knowledge_global" onReady={(s) => (setKnowledge = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    // Give the foe IWR beyond the base fixture's weakness.
    act(() => setEnc((cur) => ({
      ...cur,
      order: cur.order.map((e) =>
        e.entryId === goblin.entryId
          ? {
              ...e,
              defenses: {
                ...ENEMY_DEFENSES,
                resistances: [{ type: 'fire', value: 10 }, { type: 'acid', value: 5 }],
                immunities: ['poison', 'bleed'],
              },
            }
          : e
      ),
    })));
    // Only fire resistance + poison immunity have been triggered/revealed.
    act(() => setKnowledge({
      [goblin.entryId]: {
        resistancesRevealed: { fire: true },
        immunitiesRevealed: { poison: true },
      },
    }));

    expect(screen.getByTestId('dossier-resist')).toHaveTextContent('fire 10');
    expect(screen.getByTestId('dossier-resist')).not.toHaveTextContent('acid');
    expect(screen.getByTestId('dossier-immune')).toHaveTextContent('poison');
    expect(screen.getByTestId('dossier-immune')).not.toHaveTextContent('bleed');
    // The unrevealed weakness stays hidden; IWR progress reads partial.
    expect(screen.queryByText('cold 5')).toBeNull();
    expect(screen.getByText('IWR partial')).toBeInTheDocument();
  });

  // ── Active Exploit Vulnerability banner (#454) ────────────────────────────
  it('shows the Exploited banner when this foe is the active exploit target', () => {
    let drv, setEnc, setFocus, setExploit;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_exploit_global" onReady={(s) => (setExploit = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    act(() => setExploit({
      Pellias: { targetEntryId: goblin.entryId, type: 'mortal', weaknessType: 'cold', value: 5 },
    }));

    const banner = screen.getByTestId('dossier-exploit');
    expect(banner).toHaveTextContent('Exploited — Mortal Weakness');
    expect(banner).toHaveTextContent('Your Strikes deal +cold 5 to this creature');
  });

  it('shows the Personal Antithesis variant of the Exploited banner', () => {
    let drv, setEnc, setFocus, setExploit;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_exploit_global" onReady={(s) => (setExploit = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    const goblin = setupFocus(() => drv, { setEnc, setFocus });
    act(() => setExploit({
      Pellias: { targetEntryId: goblin.entryId, type: 'antithesis', weaknessType: null, value: 4 },
    }));

    const banner = screen.getByTestId('dossier-exploit');
    expect(banner).toHaveTextContent('Exploited — Personal Antithesis');
    expect(banner).toHaveTextContent('Your Strikes deal +4 to this creature');
  });

  it('hides the Exploited banner when a different foe is the exploit target', () => {
    let drv, setEnc, setFocus, setExploit;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_exploit_global" onReady={(s) => (setExploit = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    setupFocus(() => drv, { setEnc, setFocus });
    act(() => setExploit({
      Pellias: { targetEntryId: 'some-other-entry', type: 'mortal', weaknessType: 'cold', value: 5 },
    }));
    expect(screen.queryByTestId('dossier-exploit')).toBeNull();
  });

  // ── Ally focus — support view (design 2b, #429) ───────────────────────────
  it('shows the ally support card with HP + conditions when an ally is focused', () => {
    let drv, setFocus, setHp, setConds;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_focus_Pellias" onReady={(s) => (setFocus = s)} />
        <SyncDriver skey="cnmh_hp_Ashka" onReady={(s) => (setHp = s)} />
        <SyncDriver skey="cnmh_conditions_Ashka" onReady={(s) => (setConds = s)} />
        <Dossier charId="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias, { id: 'Ashka', name: 'Ashka' }]));
    const ashka = drv.encounter.order.find((e) => e.name === 'Ashka');
    act(() => setHp(12));
    act(() => setConds([{ id: 'frightened', value: 1 }]));
    act(() => setFocus(ashka.entryId));

    const card = screen.getByRole('region', { name: 'Focused ally: Ashka' });
    expect(card).toHaveTextContent('Ashka');
    expect(screen.getByTestId('dossier-ally-hp')).toHaveTextContent('12');
    expect(card).toHaveTextContent(/Frightened 1/);
    // Not the foe stat-grid card.
    expect(screen.queryByText('RK DC')).toBeNull();
    // No adjacency relay data in this fixture → the reach row stays hidden.
    expect(screen.queryByTestId('dossier-reach')).toBeNull();
  });
});
