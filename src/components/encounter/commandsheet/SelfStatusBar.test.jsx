// Self-status bar (#1502 S3) — the compressed turn budget at the top of the
// encounter tab. Ports the DeckHeader suite (itself ported from the retired
// ActionDial): budget pips, reaction states, MAP, End Turn flows, plus the
// new vitals sub-label and the off-turn behavior (bar stays, budget hides).
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store — mirrors TurnTrackerPanel.test.jsx.
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

const mockSendUpdate = vi.fn();
vi.mock('../../../contexts/SessionContext', () => ({
  // getState is read by useEncounter's turn-advance side-effects (effect expiry
  // + Hymn fast healing) when End Turn calls advanceTurn (#226/#443).
  useSession: () => ({ sendUpdate: mockSendUpdate, getState: () => [] }),
}));

import { __reset, useSyncedState } from '../../../hooks/useSyncedState';
import SelfStatusBar from './SelfStatusBar';
import { useEncounter } from '../../../hooks/useEncounter';
import { useTurnState } from '../../../hooks/useTurnState';

const pellias = { id: 'Pellias', name: 'Pellias' };
const ashka = { id: 'Ashka', name: 'Ashka' };
const barProps = {
  charId: 'Pellias',
  character: pellias,
  model: { maxHp: 40, armorClass: { value: 20, derived: true, source: 'armor' } },
};

const EncounterDriver = ({ onReady }) => {
  const enc = useEncounter();
  React.useEffect(() => { onReady(enc); }, [enc, onReady]);
  return null;
};

const TurnDriver = ({ charId, onReady }) => {
  const ts = useTurnState(charId);
  React.useEffect(() => { onReady(ts); }, [ts, onReady]);
  return null;
};

const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

// One-PC turn start. The header does NOT own the turn-start self-reset (that
// stays in TurnTrackerPanel), so tests that need a "started" turn drive the
// turnstate explicitly via the TurnDriver.
const startMyTurn = (getDrv, chars = [pellias]) => {
  act(() => getDrv().startEncounter(chars));
  const order = getDrv().encounter.order;
  order.forEach((e, i) => act(() => getDrv().setInitiative(e.entryId, 20 - i)));
  act(() => getDrv().beginRound1());
};

beforeEach(() => {
  __reset();
  mockSendUpdate.mockClear();
});

describe('SelfStatusBar', () => {
  it('renders nothing when the encounter is idle', () => {
    const { container } = render(<SelfStatusBar {...barProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the waiting line during setup', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    act(() => drv.startEncounter([pellias])); // setup — no initiative yet
    const bar = screen.getByRole('region', { name: 'Self status' });
    expect(bar).toHaveTextContent(/Waiting for initiative/);
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
  });

  it('shows the round number on my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    const bar = screen.getByRole('region', { name: 'Self status' });
    expect(bar).toHaveTextContent('Round 1');
  });

  it('shows the vitals sub-label from the synced HP + effective AC', () => {
    let drv, setHp;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_hp_Pellias" onReady={(s) => (setHp = s)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    act(() => setHp({ current: 31, max: 40, temp: 0 }));
    expect(screen.getByLabelText('Pellias vitals')).toHaveTextContent('31/40 HP · AC 20');
  });

  it('shows actions-left pips and reaction on my turn; pips drain as actions spend', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);

    expect(screen.getByLabelText('3 actions left')).toBeInTheDocument();

    act(() => ts.spendActions(1, 'Strike'));
    expect(screen.getByLabelText('2 actions left')).toBeInTheDocument();
  });

  it('shows the over-budget marker past 3 actions', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    act(() => ts.spendActions(4, 'Overdrive'));
    expect(screen.getByLabelText('Over action budget')).toHaveTextContent('+1');
  });

  it('reaction goes unavailable → available → spent', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    // No self-reset here, so it starts unavailable until the turn is started.
    expect(screen.getByLabelText('Reaction (unavailable until your first turn)')).toBeInTheDocument();
    act(() => ts.resetForNewTurn('1:0'));
    expect(screen.getByLabelText('Reaction (available)')).toBeInTheDocument();
    act(() => ts.spendReaction('Shield Block'));
    expect(screen.getByLabelText('Reaction (spent)')).toBeInTheDocument();
  });

  it('shows the MAP chip after attacks and clamps at −10', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    expect(screen.queryByText(/^MAP/)).toBeNull();
    act(() => ts.recordAttack());
    expect(screen.getByText('MAP −5')).toBeInTheDocument();
    act(() => ts.recordAttack(2));
    expect(screen.getByText('MAP −10')).toBeInTheDocument();
  });

  it('End Turn is disabled over budget and enabled at 3 spent', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    act(() => ts.spendActions(4, 'Overdrive'));
    expect(screen.getByRole('button', { name: 'End turn' })).toBeDisabled();
    act(() => ts.resetForNewTurn('1:0'));
    act(() => ts.spendActions(3, 'Triple'));
    expect(screen.getByRole('button', { name: 'End turn' })).not.toBeDisabled();
  });

  it('End Turn advances the encounter and pre-resets the next PC turnstate', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv, [pellias, ashka]);

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));

    expect(drv.encounter.currentTurnIndex).toBe(1);
    expect(mockSendUpdate).toHaveBeenCalledWith('Ashka', 'turnstate', expect.objectContaining({
      actionsSpent: 0,
      reactionAvailable: true,
      hasStartedFirstTurn: true,
    }));
  });

  it('End Turn in a Foundry combat sends turncmd and does not advance locally', () => {
    let drv, setEnc;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_encounter_global" onReady={(s) => (setEnc = s)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv, [pellias, ashka]);
    act(() => setEnc((cur) => ({ ...cur, foundryCombatId: 'fc-1' })));

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));

    expect(mockSendUpdate).toHaveBeenCalledWith('global', 'turncmd', expect.objectContaining({ action: 'next-turn' }));
    expect(drv.encounter.currentTurnIndex).toBe(0); // unchanged — Foundry drives it
  });

  it('End Turn clears a pending-loss omen and logs it', () => {
    let drv, setOmen;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_omen_Pellias" onReady={(s) => (setOmen = s)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    act(() => setOmen({ suit: 'Keys', pendingLoss: true, ts: 1 }));

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(drv.encounter.log.some((l) => l.text.includes("Pellias's harrow omen (Keys) is lost"))).toBe(true);
  });

  it('End Turn lapses a sustain not sustained this round', () => {
    let drv, setSustains;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    startMyTurn(() => drv);
    act(() => setSustains([{ id: 's1', spellName: 'Bless', lastSustainedRound: 0 }]));

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(drv.encounter.log.some((l) => l.text === 'Bless ends (not sustained)')).toBe(true);
  });

  it('off-turn keeps the bar (vitals + reaction) but hides the budget pieces', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SelfStatusBar {...barProps} />
      </>
    );
    // Ashka goes first (init 20) so it is NOT Pellias's turn.
    startMyTurn(() => drv, [ashka, pellias]);

    // The bar itself stays — reactions are what off-turn is about.
    const bar = screen.getByRole('region', { name: 'Self status' });
    expect(bar).toHaveTextContent('Round 1');
    expect(screen.getByLabelText(/^Reaction/)).toBeInTheDocument();
    // No budget to spend off-turn: pips, MAP and End Turn hide.
    expect(screen.queryByLabelText(/actions left/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
    expect(screen.queryByText(/^MAP/)).toBeNull();
  });
});
