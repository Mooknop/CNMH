import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store — mirrors InitiativeEntry.test.js pattern.
vi.mock('../../hooks/useSyncedState', () => {
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
const mockGetState = vi.fn(() => undefined);
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate, getState: mockGetState }),
}));

// PersistentChip (#272) pulls in useGmAuth, which probes /api/gm/whoami.
vi.mock('../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ isGm: false, email: null, loading: false }),
}));

import { __reset, useSyncedState } from '../../hooks/useSyncedState';
import TurnTrackerPanel from './TurnTrackerPanel';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSummons } from '../../hooks/useSummons';

// Exposes the shared summon ledger so a test can seed a summon and observe the
// panel's sustain-end reconciler prune it (#261).
const SummonsDriver = ({ onReady }) => {
  const s = useSummons();
  React.useEffect(() => { onReady(s); }, [s, onReady]);
  return null;
};

// Lets a test inject bridge responses (cnmh_moveopts_* / cnmh_movedone_*) into
// the shared synced-state store.
const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

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

beforeEach(() => {
  __reset();
  mockSendUpdate.mockClear();
});

describe('TurnTrackerPanel', () => {
  it('renders nothing when encounter is idle', () => {
    const { container } = render(
      <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides turn controls when it is not my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Ashka" characterName="Ashka" />
      </>
    );
    act(() => drv.startEncounter([pellias, ashka]));
    const [p, a] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 20)); // Pellias goes first
    act(() => drv.setInitiative(a.entryId, 10));
    act(() => drv.beginRound1());
    // Pellias is current, Ashka's panel should not show controls
    expect(screen.queryByRole('group', { name: 'Turn controls' })).toBeNull();
  });

  // ── Movement (Feature 3) ────────────────────────────────────────────────
  // getDrv re-reads the live hook value (the outer var is reassigned on each
  // re-render via onReady, so a captured-by-value reference would go stale).
  const startMyTurn = (getDrv) => {
    act(() => getDrv().startEncounter([pellias]));
    const [p] = getDrv().encounter.order;
    act(() => getDrv().setInitiative(p.entryId, 12));
    act(() => getDrv().beginRound1());
  };

  it('no longer renders a Move button — movement is a grid tile now (#415)', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    expect(screen.queryByLabelText('Move')).toBeNull();
  });

  // ── Raise a Shield (Slice 1) ────────────────────────────────────────────
  const startMyTurnShield = (getDrv) => {
    act(() => getDrv().startEncounter([pellias]));
    const [p] = getDrv().encounter.order;
    act(() => getDrv().setInitiative(p.entryId, 12));
    act(() => getDrv().beginRound1());
  };

  const shieldInv = [{
    uid: 'sh', name: 'Steel Shield', state: 'held1',
    shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 },
  }];

  it('shows a Raise a Shield control when a shield is held on my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startMyTurnShield(() => drv);
    expect(screen.getByLabelText('Raise a Shield')).toBeInTheDocument();
  });

  it('shows no shield control when no shield is held', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={[]} />
      </>
    );
    startMyTurnShield(() => drv);
    expect(screen.queryByLabelText('Raise a Shield')).toBeNull();
  });

  it('raising the shield spends one action and switches to Lower', () => {
    let drv, tsDriver;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startMyTurnShield(() => drv);

    fireEvent.click(screen.getByLabelText('Raise a Shield'));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(screen.getByLabelText('Lower Shield')).toBeInTheDocument();
    expect(screen.queryByLabelText('Raise a Shield')).toBeNull();
  });

  it('Raise is disabled when the held shield is broken', () => {
    let drv;
    const brokenInv = [{ ...shieldInv[0], shield: { bonus: 2, hardness: 5, hp: 10, brokenThreshold: 10 } }];
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={brokenInv} />
      </>
    );
    startMyTurnShield(() => drv);
    expect(screen.getByLabelText('Raise a Shield')).toBeDisabled();
  });

  it('auto-lowers the shield at the start of the next turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startMyTurnShield(() => drv);

    fireEvent.click(screen.getByLabelText('Raise a Shield'));
    expect(screen.getByLabelText('Lower Shield')).toBeInTheDocument();

    // Advance to the next round (single PC → back to Pellias, new turn token).
    act(() => drv.beginNextRound());

    // Raise a Shield expired at the start of the new turn.
    expect(screen.getByLabelText('Raise a Shield')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lower Shield')).toBeNull();
  });

  // ── Shield Block reaction (Slice 4) ──────────────────────────────────────
  function startAndRaiseShield(getDrv) {
    startMyTurnShield(getDrv);
    fireEvent.click(screen.getByLabelText('Raise a Shield'));
  }

  it('Shield Block bar appears when shield is raised', () => {
    let drv;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);
    expect(screen.getByLabelText('Shield Block')).toBeInTheDocument();
    expect(screen.getByLabelText('Shield Block damage')).toBeInTheDocument();
  });

  it('clicking Block with a damage value spends reaction and logs the result', () => {
    let drv, tsDriver;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);

    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));

    expect(tsDriver.turnState.reactionSpent).toBe(true);
    // Result logged: H5 on 12 → 5 prevented, shield 13HP
    const log = drv.encounter.log;
    expect(log.some((e) => e.text.includes('5 prevented'))).toBe(true);
  });

  it('Block button is disabled with no damage entered', () => {
    let drv;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  it('Block button is disabled after the reaction is spent', () => {
    let drv;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));
    // After spending the reaction the button should be disabled.
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  // ── Flanking badge ────────────────────────────────────────────────────────
  // Pellias + an enemy in the order so there is something to show the badge on.
  const startMyTurnWithEnemy = (getDrv) => {
    act(() => getDrv().startEncounter([pellias]));
    act(() => getDrv().addEnemy('Goblin', 8));
    const [p] = getDrv().encounter.order;
    act(() => getDrv().setInitiative(p.entryId, 15));
    act(() => getDrv().beginRound1());
  };


  // ── Shield Block reaction (Slice 4) ──────────────────────────────────────

  it('Shield Block button appears when shield is raised', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startAndRaiseShield(() => drv);
    expect(screen.getByLabelText('Shield Block')).toBeInTheDocument();
  });

  // ── Bestiary button ───────────────────────────────────────────────────────

  it('shows Bestiary button when enemies are present', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurnWithEnemy(() => drv);
    expect(screen.getByLabelText('Open Bestiary')).toBeInTheDocument();
  });

  it('hides Bestiary button when there are no enemies', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    const [p] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 15));
    act(() => drv.beginRound1());
    expect(screen.queryByLabelText('Open Bestiary')).not.toBeInTheDocument();
  });

  it('opens BestiaryModal when Bestiary button is clicked', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurnWithEnemy(() => drv);
    fireEvent.click(screen.getByLabelText('Open Bestiary'));
    // Modal is open: the modal heading and the enemy name both appear.
    expect(screen.getAllByText('Bestiary').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Goblin').length).toBeGreaterThanOrEqual(1);
  });

  // ── Kinetic aura (#228) ───────────────────────────────────────────────────

  it('no aura UI while the aura is down', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    expect(screen.queryByLabelText('Dismiss Aura')).toBeNull();
    expect(screen.queryByLabelText(/kinetic aura is active/)).toBeNull();
  });

  it('shows a Dismiss button when the aura is active on my turn', () => {
    let drv, setAura;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_aura_Pellias" onReady={(s) => (setAura = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);

    act(() => setAura({ active: true, ts: 1 }));
    // The aura chip itself now lives in the InitiativeStrip; the Dismiss control stays here.
    expect(screen.getByLabelText('Dismiss Aura')).toBeInTheDocument();
  });

  it('Dismiss spends one action, drops the aura, and logs it', () => {
    let drv, tsDriver, setAura;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <SyncDriver skey="cnmh_aura_Pellias" onReady={(s) => (setAura = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    act(() => setAura({ active: true, ts: 1 }));

    fireEvent.click(screen.getByLabelText('Dismiss Aura'));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(screen.queryByLabelText('Dismiss Aura')).toBeNull();
    expect(screen.queryByLabelText("Pellias's kinetic aura is active")).toBeNull();
    expect(
      drv.encounter.log.some((e) => e.text.includes('Dismissed their kinetic aura'))
    ).toBe(true);
  });

  it('the aura survives turn changes (unlike a raised shield)', () => {
    let drv, setAura;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_aura_Pellias" onReady={(s) => (setAura = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    act(() => setAura({ active: true, ts: 1 }));

    act(() => drv.beginNextRound());
    // Dismiss control still offered next round → the aura persisted (a raised shield would have dropped).
    expect(screen.getByLabelText('Dismiss Aura')).toBeInTheDocument();
  });

  // ── Turn-start free-action offers (#228 — Primary Threat) ─────────────────

  const primaryThreatChar = {
    id: 'Pellias',
    name: 'Pellias',
    feats: [{
      name: 'Primary Threat',
      freeActions: [{
        name: 'Primary Threat',
        offerAt: { round: 1 },
        reminder: 'Enemies that act after Pellias take a -1 circumstance penalty to attack rolls against his allies until the start of his next turn.',
      }],
    }],
  };

  it('offers a round-1 free action at turn start; Use logs the action and the reminder', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" character={primaryThreatChar} />
      </>
    );
    startMyTurn(() => drv);

    expect(screen.getByRole('group', { name: 'Primary Threat (free action)' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Use Primary Threat'));

    expect(screen.queryByRole('group', { name: 'Primary Threat (free action)' })).toBeNull();
    const texts = drv.encounter.log.map((e) => e.text);
    expect(texts.some((t) => t.includes('Pellias used Primary Threat (free action)'))).toBe(true);
    expect(texts.some((t) => t.includes('-1 circumstance penalty to attack rolls'))).toBe(true);
  });

  it('Dismiss hides the offer without logging', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" character={primaryThreatChar} />
      </>
    );
    startMyTurn(() => drv);

    const logLen = drv.encounter.log.length;
    fireEvent.click(screen.getByLabelText('Dismiss Primary Threat'));
    expect(screen.queryByRole('group', { name: 'Primary Threat (free action)' })).toBeNull();
    expect(drv.encounter.log.length).toBe(logLen);
  });

  it('round-gated offers do not appear on later rounds', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" character={primaryThreatChar} />
      </>
    );
    startMyTurn(() => drv);
    expect(screen.getByRole('group', { name: 'Primary Threat (free action)' })).toBeInTheDocument();

    act(() => drv.beginNextRound());
    expect(screen.queryByRole('group', { name: 'Primary Threat (free action)' })).toBeNull();
  });

  // ── Sustained-spell prompts (#220) ───────────────────────────────────────
  // Seed the caster's sustain ledger directly via useSyncedState (the shared
  // mock store), mirroring how registerSustain writes it in the real cast flow.
  const seedSustain = (set, entries) => act(() => set(entries));

  it('shows a Sustain prompt for a spell not yet sustained this round', () => {
    let drv, setSustains;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    seedSustain(setSustains, [{ id: 's1', spellName: 'Bless', lastSustainedRound: 0 }]);
    expect(screen.getByRole('group', { name: 'Sustain Bless' })).toBeInTheDocument();
  });

  it('does not prompt for a spell already sustained (or cast) this round', () => {
    let drv, setSustains;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv); // round 1
    seedSustain(setSustains, [{ id: 's1', spellName: 'Bless', lastSustainedRound: 1 }]);
    expect(screen.queryByRole('group', { name: 'Sustain Bless' })).toBeNull();
  });

  it('Sustain spends one action and dismisses the prompt', () => {
    let drv, tsDriver, setSustains;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv); // round 1
    seedSustain(setSustains, [{ id: 's1', spellName: 'Bless', lastSustainedRound: 0 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Sustain Bless' }));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(screen.queryByRole('group', { name: 'Sustain Bless' })).toBeNull();
  });

  it('Sustaining Hymn of Healing re-grants the target temp HP (#226)', () => {
    let drv, setSustains;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    seedSustain(setSustains, [{
      id: 's1', spellId: 'hymn-of-healing', spellName: 'Hymn of Healing', lastSustainedRound: 0,
      heal: { targetId: 'Ashka', targetName: 'Ashka', targetMaxHp: 30, fastHealing: 4, tempHp: 4 },
    }]);

    fireEvent.click(screen.getByRole('button', { name: 'Sustain Hymn of Healing' }));
    // Temp HP written to the heal target (no stored hp → seeded full, temp set).
    expect(mockSendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ temp: 4 }));
    expect(drv.encounter.log.some((l) => /Ashka gains 4 temporary HP/.test(l.text))).toBe(true);
  });

  it('End removes the sustain and logs it', () => {
    let drv, setSustains;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    seedSustain(setSustains, [{ id: 's1', spellName: 'Bless', lastSustainedRound: 0 }]);

    fireEvent.click(screen.getByRole('button', { name: 'End Bless' }));
    expect(screen.queryByRole('group', { name: 'Sustain Bless' })).toBeNull();
    expect(drv.encounter.log.some((l) => l.text === 'Bless ends')).toBe(true);
  });

  it('prunes a linked summon when its sustain ends (#261)', () => {
    let drv, setSustains, summonsApi;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_sustains_Pellias" onReady={(s) => (setSustains = s)} />
        <SummonsDriver onReady={(s) => (summonsApi = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);
    seedSustain(setSustains, [{ id: 's1', spellName: 'Summon Undead', lastSustainedRound: 0 }]);
    act(() => summonsApi.addSummon({ name: 'Skeleton', casterId: 'Pellias', sustainId: 's1', maxHp: 10 }));
    expect(summonsApi.summons).toHaveLength(1); // alive while sustain s1 exists

    fireEvent.click(screen.getByRole('button', { name: 'End Summon Undead' }));
    expect(summonsApi.summons).toHaveLength(0); // sustain gone → summon pruned
  });

});
