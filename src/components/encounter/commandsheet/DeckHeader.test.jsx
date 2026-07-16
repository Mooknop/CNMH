// Fused deck header (encounter UI redesign) — ports the retired ActionDial's
// turn-budget + End Turn coverage onto the Segmented Deck header.
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

// Row B is FocusBanner's own concern (FocusBanner.test.jsx) — keep it inert here.
vi.mock('./FocusBanner', () => ({
  default: () => <div data-testid="focus-banner" />,
}));

import { __reset, useSyncedState } from '../../../hooks/useSyncedState';
import DeckHeader from './DeckHeader';
import { useEncounter } from '../../../hooks/useEncounter';
import { useTurnState } from '../../../hooks/useTurnState';

const pellias = { id: 'Pellias', name: 'Pellias' };
const ashka = { id: 'Ashka', name: 'Ashka' };

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

describe('DeckHeader', () => {
  it('renders nothing when the encounter is idle', () => {
    const { container } = render(<DeckHeader charId="Pellias" characterName="Pellias" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the waiting line during setup', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <DeckHeader charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias])); // setup — no initiative yet
    const budget = screen.getByRole('region', { name: 'Turn budget' });
    expect(budget).toHaveTextContent(/Waiting for initiative/);
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
  });

  it('shows the round number inside the budget region on my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <DeckHeader charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    const budget = screen.getByRole('region', { name: 'Turn budget' });
    expect(budget).toHaveTextContent('Round 1');
  });

  it('shows actions-left, pips, and reaction on my turn; pips fill as actions spend', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <DeckHeader charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);

    expect(screen.getByLabelText('3 actions left')).toBeInTheDocument();
    expect(screen.getByLabelText('Actions spent')).toBeInTheDocument();

    act(() => ts.spendActions(1, 'Strike'));
    expect(screen.getByLabelText('2 actions left')).toBeInTheDocument();
  });

  it('shows the over-budget marker past 3 actions', () => {
    let drv, ts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (ts = t)} />
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
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
        <DeckHeader charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    act(() => setSustains([{ id: 's1', spellName: 'Bless', lastSustainedRound: 0 }]));

    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));
    expect(drv.encounter.log.some((l) => l.text === 'Bless ends (not sustained)')).toBe(true);
  });

  it('off-turn hides the budget row entirely (stage + React tab own off-turn)', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <DeckHeader charId="Pellias" characterName="Pellias" />
      </>
    );
    // Ashka goes first (init 20) so it is NOT Pellias's turn.
    startMyTurn(() => drv, [ashka, pellias]);

    expect(screen.queryByRole('region', { name: 'Turn budget' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
    // Row B (focus banner) still renders for off-turn target context.
    expect(screen.getByTestId('focus-banner')).toBeInTheDocument();
  });
});
