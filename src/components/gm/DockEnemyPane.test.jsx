import React from 'react';
import { screen, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pushRelayFixture, relayFixtures } from '../../test/relayFixtures';
import { RELAY, APP } from '../../sync/keys';
import DockEnemyPane from './DockEnemyPane';

beforeEach(() => window.localStorage.clear());

// Mirrors the recorded foekit fixture's combatant (entryId cbt-gob) plus the
// defensive fields the encounter blob carries for an enemy order entry.
const ENTRY = {
  entryId: 'cbt-gob',
  kind: 'enemy',
  name: 'Goblin Warrior',
  foundryActorId: 'actor-gob',
  defenses: {
    ac: 16,
    saves: { fortitude: 5, reflex: 7, will: 3 },
    immunities: ['fire'],
    resistances: [{ type: 'cold', value: 5 }],
    weaknesses: [{ type: 'slashing', value: 3 }],
  },
  bestiary: {
    img: null,
    level: 1,
    rarity: 'common',
    traits: ['small', 'goblin'],
    perception: 5,
    speed: 25,
    hp: { current: 9, max: 12 },
    description: 'A scrappy goblin.',
  },
};

describe('DockEnemyPane (#1531 S2)', () => {
  it('renders identity, vitals, and unredacted defenses from the order entry', () => {
    renderWithProviders(<DockEnemyPane entry={ENTRY} />);

    expect(screen.getByText('Enemy turn')).toBeInTheDocument();
    expect(screen.getByLabelText('Enemy turn: Goblin Warrior')).toBeInTheDocument();
    expect(screen.getByText('Small · Goblin · Level 1')).toBeInTheDocument();
    // Vitals: no reveal gating on the GM pane.
    expect(screen.getByTestId('dock-enemy-hp')).toHaveTextContent('9/12');
    const defenses = screen.getByTestId('dock-enemy-defenses');
    expect(defenses).toHaveTextContent('16');   // AC
    expect(defenses).toHaveTextContent('+7');   // Reflex modifier
    expect(defenses).toHaveTextContent('25 ft');
    expect(screen.getByTestId('dock-enemy-weak')).toHaveTextContent('slashing 3');
    expect(screen.getByTestId('dock-enemy-resist')).toHaveTextContent('cold 5');
    expect(screen.getByTestId('dock-enemy-immune')).toHaveTextContent('fire');
  });

  it('shows the waiting note until a kit for THIS entry arrives', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    expect(screen.getByTestId('dock-enemy-waiting')).toBeInTheDocument();

    // A stale kit keyed to a different combatant must not render.
    act(() => { pushRelayFixture(session, RELAY.FOEKIT, { entryId: 'cbt-other' }); });
    expect(screen.getByTestId('dock-enemy-waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('dock-enemy-strike')).not.toBeInTheDocument();
  });

  it('renders the recorded kit across the ability tabs (S3 tab strip, #1556)', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    act(() => { pushRelayFixture(session, RELAY.FOEKIT); });

    expect(screen.queryByTestId('dock-enemy-waiting')).not.toBeInTheDocument();

    // Tab strip carries per-category counts.
    expect(screen.getByRole('tab', { name: /Strikes/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Spells/ })).toHaveTextContent('1');

    // Strikes tab (default): label, MAP ladder, typed damage, attack effect.
    const strike = screen.getByTestId('dock-enemy-strike');
    expect(strike).toHaveTextContent('Jaws');
    expect(strike).toHaveTextContent('+9 / +4 / -1');
    expect(strike).toHaveTextContent('1d8+4 piercing');
    expect(strike).toHaveTextContent('+ grab');

    // Spells tab: meta line, rank slot state, spell with uses + save.
    fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
    const entry = screen.getByTestId('dock-enemy-spellentry');
    expect(entry).toHaveTextContent('Arcane Spells');
    expect(entry).toHaveTextContent('DC 19');
    expect(entry).toHaveTextContent('2/2 slots');
    const spell = screen.getByTestId('dock-enemy-spell');
    expect(spell).toHaveTextContent('Fear');
    expect(spell).toHaveTextContent('1/1');
    expect(spell).toHaveTextContent('Will');
    expect(screen.queryByTestId('dock-enemy-strike')).not.toBeInTheDocument();

    // Abilities + Skills tabs off the same recorded payload.
    fireEvent.click(screen.getByRole('tab', { name: /Abilities/ }));
    expect(screen.getByTestId('dock-enemy-ability')).toHaveTextContent('Goblin Scuttle');
    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    expect(screen.getByText(/Acrobatics \+5/)).toBeInTheDocument();

    // Typed asserts against the fixture the assertions above rode on, so a
    // bridge re-record that renames a field fails here, not silently.
    const kit = relayFixtures.foekit.value.kit;
    expect(kit.strikes[0]).toMatchObject({ index: expect.any(Number), variantLabels: expect.any(Array) });
    expect(kit.spellcasting[0].spells[0]).toMatchObject({ rank: expect.any(Number) });
  });

  describe('strike rail (S3)', () => {
    // Rail live = Foundry connected (bus default) + protocol 6 hello; the
    // encounter order supplies the PC target chips.
    const arm = (session, { protocol = 6 } = {}) => {
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol, module: '0.0.0-test', ts: 1 });
        session.push('global', RELAY.ENCOUNTER, {
          active: true, phase: 'in-progress', round: 1, currentTurnIndex: 1,
          order: [
            { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
            { entryId: ENTRY.entryId, kind: 'enemy', name: ENTRY.name },
          ],
        });
        pushRelayFixture(session, RELAY.FOEKIT);
      });
    };

    const lastStrikeReq = (session) =>
      session.sent.filter((m) => m.stateType === RELAY.STRIKEREQ).at(-1);

    it('MAP buttons send strikereq for the right variant; no target override by default', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      arm(session);

      fireEvent.click(screen.getByRole('button', { name: 'Strike: Jaws at +4' }));

      const req = lastStrikeReq(session);
      expect(req.characterId).toBe('global');
      expect(req.value).toMatchObject({ entryId: 'cbt-gob', actionIndex: 0, variant: 1 });
      expect(req.value.targets).toBeUndefined();
      expect(req.value.damage).toBeUndefined();
    });

    it('damage and crit buttons carry the damage mode', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      arm(session);

      fireEvent.click(screen.getByRole('button', { name: 'Critical damage: Jaws' }));
      expect(lastStrikeReq(session).value).toMatchObject({ actionIndex: 0, damage: 'critical' });
    });

    it('a picked PC target chip rides the request; toggling back to Foundry’s drops it', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      arm(session);

      fireEvent.click(screen.getByRole('button', { name: 'Pellias' }));
      fireEvent.click(screen.getByRole('button', { name: 'Strike: Jaws at +9' }));
      expect(lastStrikeReq(session).value.targets).toEqual(['e-pellias']);
    });

    it('the matching ack renders the result line with the degree vocabulary', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      arm(session);

      fireEvent.click(screen.getByRole('button', { name: 'Strike: Jaws at +9' }));
      const { id } = lastStrikeReq(session).value;

      // The RECORDED strikedone fixture (id overridden to correlate) — the
      // app half of the #1308 contract for this channel.
      await act(async () => {
        pushRelayFixture(session, RELAY.STRIKEDONE, { id });
      });

      const result = await screen.findByTestId('dock-enemy-result');
      expect(result).toHaveTextContent('Jaws +9');
      expect(result).toHaveTextContent('24');
      expect(result).toHaveTextContent('Hit');
    });

    it('a nack falls back to the check-Foundry-chat note', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      arm(session);

      fireEvent.click(screen.getByRole('button', { name: 'Damage: Jaws' }));
      const { id } = lastStrikeReq(session).value;

      await act(async () => {
        session.push('global', RELAY.STRIKEDONE, { id, ok: false, ts: 2 });
      });

      expect(await screen.findByTestId('dock-enemy-result')).toHaveTextContent('check Foundry chat');
    });

    it('a pre-protocol-6 bridge keeps the read-only MAP ladder (no buttons)', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      arm(session, { protocol: 5 });

      expect(screen.getByText('+9 / +4 / -1')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Strike: Jaws/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Strike target' })).not.toBeInTheDocument();
    });
  });

  describe('ally tone (S6)', () => {
    it('renders the Ally kicker and drops the PC target chips, keeping the rails', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} tone="ally" />);
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol: 9, module: '0.0.0-test', ts: 1 });
        session.push('global', RELAY.ENCOUNTER, {
          active: true, phase: 'in-progress', round: 1, currentTurnIndex: 1,
          order: [
            { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
            { entryId: ENTRY.entryId, kind: 'enemy', name: ENTRY.name, disposition: 1 },
          ],
        });
        pushRelayFixture(session, RELAY.FOEKIT);
      });

      expect(screen.getByLabelText('Ally turn: Goblin Warrior')).toBeInTheDocument();
      expect(screen.getByText('Ally turn')).toBeInTheDocument();
      // Strike/cast execution stays; the PC target chips do not.
      expect(screen.getByRole('button', { name: 'Strike: Jaws at +9' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Strike target' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));
      expect(screen.getByRole('button', { name: 'Cast: Fear' })).toBeInTheDocument();
    });
  });

  describe('cast rail (S4)', () => {
    const armCast = (session, { protocol = 7 } = {}) => {
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol, module: '0.0.0-test', ts: 1 });
        pushRelayFixture(session, RELAY.FOEKIT);
      });
    };

    const lastCastReq = (session) =>
      session.sent.filter((m) => m.stateType === RELAY.CASTREQ).at(-1);

    // S3 tab strip: spells live on their own tab now.
    const openSpells = () => fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));

    it('the Cast button sends castreq with the entry, spell, and rank', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armCast(session);
      openSpells();

      fireEvent.click(screen.getByRole('button', { name: 'Cast: Fear' }));

      const req = lastCastReq(session);
      expect(req.characterId).toBe('global');
      expect(req.value).toMatchObject({
        entryId: 'cbt-gob',
        entryItemId: relayFixtures.foekit.value.kit.spellcasting[0].id,
        spellId: 'sp-fear',
        rank: 1,
      });
    });

    it('the matching ack renders the cast read-out', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armCast(session);
      openSpells();

      fireEvent.click(screen.getByRole('button', { name: 'Cast: Fear' }));
      const { id } = lastCastReq(session).value;

      // The RECORDED castdone fixture (id overridden to correlate).
      await act(async () => {
        pushRelayFixture(session, RELAY.CASTDONE, { id });
      });

      const result = await screen.findByTestId('dock-enemy-cast-result');
      expect(result).toHaveTextContent('Cast: Fear');
      expect(result).toHaveTextContent('rank 1');
    });

    it('a nack falls back to the cast-from-Foundry note', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armCast(session);
      openSpells();

      fireEvent.click(screen.getByRole('button', { name: 'Cast: Fear' }));
      const { id } = lastCastReq(session).value;

      await act(async () => {
        session.push('global', RELAY.CASTDONE, { id, ok: false, ts: 2 });
      });

      expect(await screen.findByTestId('dock-enemy-cast-result'))
        .toHaveTextContent('cast it from the Foundry sheet');
    });

    it('a spell with exhausted uses disables its Cast button', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      const spent = JSON.parse(JSON.stringify(relayFixtures.foekit.value));
      spent.kit.spellcasting[0].spells[0].uses = { value: 0, max: 1 };
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol: 7, module: '0.0.0-test', ts: 1 });
        session.push('global', RELAY.FOEKIT, spent);
      });
      openSpells();

      expect(screen.getByRole('button', { name: 'Cast: Fear' })).toBeDisabled();
    });

    it('a protocol-6 bridge keeps the strike rail but grows no Cast buttons', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armCast(session, { protocol: 6 });

      expect(screen.getByRole('button', { name: 'Damage: Jaws' })).toBeInTheDocument();
      openSpells();
      expect(screen.queryByRole('button', { name: 'Cast: Fear' })).not.toBeInTheDocument();
    });
  });

  describe('move rail (A2, #1572)', () => {
    const armMove = (session, { protocol = 10 } = {}) => {
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol, module: '0.0.0-test', ts: 1 });
        pushRelayFixture(session, RELAY.FOEKIT);
      });
    };

    const lastMoveReq = (session) =>
      session.sent.filter((m) => m.stateType === RELAY.MOVEREQ).at(-1);

    const openMove = () => fireEvent.click(screen.getByRole('tab', { name: 'Move' }));

    // A moveopts payload in the README wire shape: one east step open, a wall
    // west, centred where the bridge fixture puts the goblin.
    const OPTS = {
      origin: { col: 5, row: 5 },
      reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
      blocked: [{ col: 4, row: 5, kind: 'wall' }],
      gridSize: 100,
      speed: 25,
      originOccupied: false,
    };

    it('a protocol-10 bridge grows the Move tab; protocol 9 does not', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMove(session, { protocol: 9 });
      expect(screen.queryByRole('tab', { name: 'Move' })).not.toBeInTheDocument();

      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol: 10, module: '0.0.0-test', ts: 2 });
      });
      expect(screen.getByRole('tab', { name: 'Move' })).toBeInTheDocument();
    });

    it('Move sends movereq under the combat entryId', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMove(session);
      openMove();

      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));

      const req = lastMoveReq(session);
      expect(req.characterId).toBe('cbt-gob');
      expect(req.value).toMatchObject({ moveType: 'stride' });
    });

    it('moveopts opens the pad; a step confirms, chains via nextOpts, Done logs the total', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMove(session);
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;

      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...OPTS, reqTs: ts });
      });

      // The bridge's obstacles render; the open step is offered.
      expect(screen.getByLabelText('Blocked by Wall')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Step east' }));
      const confirm = session.sent.filter((m) => m.stateType === RELAY.MOVECONFIRM).at(-1);
      expect(confirm.characterId).toBe('cbt-gob');
      expect(confirm.value).toMatchObject({ destination: { col: 6, row: 5 }, moveType: 'stride' });

      // movedone chains straight into the piggybacked next step's pad (#451).
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEDONE, {
          newPosition: { col: 6, row: 5, x: 600, y: 500 },
          feetMoved: 5,
          reqTs: ts,
          nextOpts: {
            ...OPTS,
            origin: { col: 6, row: 5 },
            reachable: [{ col: 7, row: 5, feet: 5, terrain: 'normal' }],
          },
        });
      });
      const meta = screen.getByTestId('dock-enemy-move-meta');
      expect(meta).toHaveTextContent('Moved 5 ft');
      expect(meta).toHaveTextContent('1 Stride at 25 ft');
      expect(screen.getByRole('button', { name: 'Step east' })).toBeInTheDocument();

      // Done → ONE combat-log line for the whole move, dock-attributed.
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      const encUpdate = session.sent.filter((m) => m.stateType === RELAY.ENCOUNTER).at(-1);
      const logged = (encUpdate.value.log || []).at(-1);
      expect(logged).toMatchObject({ type: 'action' });
      expect(logged.text).toBe('Goblin Warrior moved 5 ft (dock)');
    });
  });

  // #1736 S4: destination-tap flow on a protocol-14+ bridge. Foe speed budget
  // comes straight off moveopts.speed (the bridge's actor read — foes have no
  // app-derived speed spine); the confirm bar is the feet-only variant since
  // the dock has no app-side action accounting for enemies.
  describe('move rail tap flow (#1736 S4)', () => {
    const armTapMove = (session, { protocol = 14 } = {}) => {
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol, module: '0.0.0-test', ts: 1 });
        pushRelayFixture(session, RELAY.FOEKIT);
      });
    };

    const lastMoveReq = (session) =>
      session.sent.filter((m) => m.stateType === RELAY.MOVEREQ).at(-1);

    const openMove = () => fireEvent.click(screen.getByRole('tab', { name: 'Move' }));

    const TAP_OPTS = { origin: { col: 5, row: 5 }, speed: 25 };

    it('a protocol-13 bridge keeps the D-pad; protocol 14 shows the tap grid instead', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armTapMove(session, { protocol: 13 });
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, {
          origin: TAP_OPTS.origin,
          reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
          blocked: [],
          speed: 25,
          reqTs: ts,
        });
      });
      expect(screen.getByRole('button', { name: 'Step east' })).toBeInTheDocument();

      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol: 14, module: '0.0.0-test', ts: 2 });
      });
      // Re-request under the new protocol to see the tap grid replace the D-pad.
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts: ts2 } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...TAP_OPTS, reqTs: ts2 });
      });
      expect(screen.queryByRole('button', { name: 'Step east' })).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Move to 6,5 —/)).toBeInTheDocument();
    });

    it('tapping a cell sends moveplan; the confirm bar is FEET-ONLY (no action count)', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armTapMove(session);
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...TAP_OPTS, reqTs: ts });
      });

      fireEvent.click(screen.getByLabelText(/Move to 6,5 —/));
      const plan = session.sent.filter((m) => m.stateType === RELAY.MOVEPLAN).at(-1);
      expect(plan.characterId).toBe('cbt-gob');
      expect(plan.value).toMatchObject({ waypoints: [{ col: 6, row: 5 }], moveType: 'stride' });

      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEPLANNED, {
          reqTs: plan.value.ts, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 5, clipped: false,
        });
      });

      const bar = screen.getByLabelText('Confirm move');
      expect(bar).toHaveTextContent('5 ft');
      expect(bar).not.toHaveTextContent('action');
    });

    it('shows the wall-framed clipped note below the pathfinding protocol floor', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armTapMove(session);
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...TAP_OPTS, reqTs: ts });
      });
      fireEvent.click(screen.getByLabelText(/Move to 6,5 —/));
      const plan = session.sent.filter((m) => m.stateType === RELAY.MOVEPLAN).at(-1);
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEPLANNED, {
          reqTs: plan.value.ts, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 5, clipped: true,
        });
      });

      expect(screen.getByText(/Path stops at a wall/)).toBeInTheDocument();
    });

    it('shows range/budget clipped copy on a protocol-23+ (pathfinding) bridge', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armTapMove(session, { protocol: 23 });
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...TAP_OPTS, reqTs: ts });
      });
      fireEvent.click(screen.getByLabelText(/Move to 6,5 —/));
      const plan = session.sent.filter((m) => m.stateType === RELAY.MOVEPLAN).at(-1);
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEPLANNED, {
          reqTs: plan.value.ts, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 5, clipped: true,
        });
      });

      expect(screen.getByText(/Out of range — tap again to keep going/)).toBeInTheDocument();
      expect(screen.queryByText(/Path stops at a wall/)).toBeNull();
    });

    it('Confirm sends moveconfirm with waypoints and no action cost; Done logs the real total', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armTapMove(session);
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...TAP_OPTS, reqTs: ts });
      });

      fireEvent.click(screen.getByLabelText(/Move to 6,5 —/));
      const plan = session.sent.filter((m) => m.stateType === RELAY.MOVEPLAN).at(-1);
      const planPath = [{ col: 6, row: 5, x: 600, y: 500 }];
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEPLANNED, {
          reqTs: plan.value.ts, path: planPath, costFeet: 5, clipped: false,
        });
      });

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      const confirm = session.sent.filter((m) => m.stateType === RELAY.MOVECONFIRM).at(-1);
      expect(confirm.characterId).toBe('cbt-gob');
      expect(confirm.value).toMatchObject({ waypoints: planPath, moveType: 'stride', actionCost: 0 });

      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEDONE, {
          newPosition: { col: 6, row: 5, x: 600, y: 500 },
          feetMoved: 5,
          reqTs: plan.value.ts,
        });
      });

      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      const encUpdate = session.sent.filter((m) => m.stateType === RELAY.ENCOUNTER).at(-1);
      const logged = (encUpdate.value.log || []).at(-1);
      expect(logged.text).toBe('Goblin Warrior moved 5 ft (dock)');
    });
  });

  // #1744 S7: map mode rolled out to the dock's own foe Move tab, mirroring
  // #1743's tap-flow rollout — same shared useMoveMapMode wiring + MoveMapSurface
  // component MoveActionSheet uses, keyed to the combat entryId. This IS the
  // GM's own surface, so ghosts come off the UNFILTERED pathpreviewgm channel
  // (audience: 'gm'), consistent with DockRoutePreviews — never the
  // player-filtered one.
  describe('move rail map mode (#1744 S7)', () => {
    const armMapMove = (session, { protocol = 16 } = {}) => {
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol, module: '0.0.0-test', ts: 1 });
        pushRelayFixture(session, RELAY.FOEKIT);
      });
    };

    const lastMoveReq = (session) =>
      session.sent.filter((m) => m.stateType === RELAY.MOVEREQ).at(-1);
    const lastSnapReq = (session) =>
      session.sent.filter((m) => m.stateType === RELAY.SNAPREQ).at(-1);

    const openMove = () => fireEvent.click(screen.getByRole('tab', { name: 'Move' }));

    const TAP_OPTS = { origin: { col: 5, row: 5 }, speed: 25 };

    const snapAckFor = (id, overrides = {}) => ({
      id,
      ok: true,
      url: '/api/images/mover.webp',
      capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600, sceneId: 'scene-1' },
      worldRect: { x1: 0, y1: 0, x2: 800, y2: 600 },
      gridSize: 100,
      moverId: 'cbt-gob',
      trigger: 'request',
      ts: Date.now(),
      ...overrides,
    });

    // PingTheMap.test.jsx's tap mechanics, reused by MoveActionSheet.mapMode.test.jsx.
    const tapMapAt = (nx, ny) => {
      const img = document.querySelector('.msv-img');
      img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
      const frame = screen.getByTestId('map-snapshot-frame');
      fireEvent.pointerDown(frame, { pointerId: 1, clientX: nx * 100, clientY: ny * 100 });
      fireEvent.pointerUp(frame, { pointerId: 1, clientX: nx * 100, clientY: ny * 100 });
    };

    const openTapMoveTo = async (session) => {
      openMove();
      fireEvent.click(screen.getByRole('button', { name: 'Move Goblin Warrior' }));
      const { ts } = lastMoveReq(session).value;
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEOPTS, { ...TAP_OPTS, reqTs: ts });
      });
    };

    it('protocol 15 keeps the surface toggle hidden (below the map-move floor)', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMapMove(session, { protocol: 15 });
      await openTapMoveTo(session);
      expect(screen.queryByRole('group', { name: 'Movement surface' })).toBeNull();
    });

    it('shows the toggle at protocol 16; Map sends a mover-centered snapreq keyed to the combat entryId', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMapMove(session);
      await openTapMoveTo(session);

      expect(screen.getByRole('group', { name: 'Movement surface' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));

      const req = lastSnapReq(session);
      expect(req.characterId).toBe('global');
      expect(req.value).toMatchObject({ moverId: 'cbt-gob', radiusFeet: 37.5 }); // 1.5 × 25 ft speed
    });

    it('a map tap resolves the real world cell and plans a move exactly like the grid', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMapMove(session);
      await openTapMoveTo(session);
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));
      const req = lastSnapReq(session);
      await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });

      // Tap the centre: world (400, 300) → cell (4, 3) on a 100 ft grid.
      tapMapAt(0.5, 0.5);

      const plan = session.sent.filter((m) => m.stateType === RELAY.MOVEPLAN).at(-1);
      expect(plan.characterId).toBe('cbt-gob');
      expect(plan.value).toMatchObject({ waypoints: [{ col: 4, row: 3 }], moveType: 'stride' });
    });

    it('Confirm on a map-mode plan stays feet-only, exactly like the grid', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMapMove(session);
      await openTapMoveTo(session);
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));
      const req = lastSnapReq(session);
      await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });

      tapMapAt(0.5, 0.5);
      const plan = session.sent.filter((m) => m.stateType === RELAY.MOVEPLAN).at(-1);
      await act(async () => {
        session.push('cbt-gob', RELAY.MOVEPLANNED, {
          reqTs: plan.value.ts, path: [{ col: 4, row: 3, x: 400, y: 300 }], costFeet: 5, clipped: false,
        });
      });

      const bar = screen.getByLabelText('Confirm move');
      expect(bar).toHaveTextContent('5 ft');
      expect(bar).not.toHaveTextContent('action');
    });

    it('renders the UNFILTERED pathpreviewgm channel as a ghost on the dock\'s own map surface', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMapMove(session);
      await openTapMoveTo(session);
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));
      const req = lastSnapReq(session);
      await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });

      // A hidden/hostile mover the PLAYER channel would never carry — the GM's
      // own surface renders it anyway (OQ-2: filter what the dock receives
      // from elsewhere, not what it draws for movers it can already see).
      act(() => {
        session.push('global', RELAY.PATHPREVIEWGM, {
          tokenId: 'tok-ambush', id: null, name: 'Hidden Ambusher', disposition: -1,
          sceneId: 'scene-1', origin: { col: 1, row: 1 }, path: [{ col: 2, row: 1 }],
          phase: 'move', source: 'foundry', ts: Date.now(),
        });
      });

      expect(document.querySelectorAll('.sro--ghost').length).toBe(1);
    });

    it('falls back to the grid on an explicit nack, without stranding the GM', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armMapMove(session);
      await openTapMoveTo(session);
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));
      const req = lastSnapReq(session);

      await act(async () => { session.push('global', RELAY.SNAPDONE, { id: req.value.id, ok: false, ts: Date.now() }); });

      expect(screen.getByText('Map unavailable — using the grid.')).toBeInTheDocument();
      expect(screen.getByLabelText(/Move to 6,5 —/)).toBeInTheDocument();
    });
  });

  describe('condition truth + GM management (S3)', () => {
    it('renders the foe’s recorded Foundry conditions as truth chips', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      act(() => { pushRelayFixture(session, RELAY.FOEKIT); });

      // The recorded kit carries the foe's real Foundry conditions.
      const recorded = relayFixtures.foekit.value.kit.conditions;
      expect(recorded.length).toBeGreaterThan(0);
      expect(screen.getByText('Frightened 1')).toBeInTheDocument();
      // Truth chips have no remove control — Foundry owns them.
      expect(screen.queryByRole('button', { name: /Remove Frightened 1/ })).not.toBeInTheDocument();
    });

    it('the GM editor applies a valued condition to the enemyfx record', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);

      fireEvent.change(screen.getByLabelText('Add condition'), { target: { value: 'clumsy' } });
      fireEvent.change(screen.getByLabelText('Condition value'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

      const write = session.sent.filter((m) => m.stateType === 'enemyfx').at(-1);
      expect(write.value['cbt-gob'].conditions).toEqual([
        expect.objectContaining({ id: 'clumsy', value: 2, source: 'GM (dock)' }),
      ]);
    });

    it('an app-applied chip removes via its × without touching other scopes', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      act(() => {
        session.push('global', APP.ENEMYFX, {
          'cbt-gob': {
            conditions: [
              { id: 'off-guard', value: null, source: 'Flanking', scopedTo: null },
              { id: 'off-guard', value: null, source: 'Feint', scopedTo: 'Pellias', scopedToName: 'Pellias' },
            ],
            effects: [],
          },
        });
      });

      fireEvent.click(screen.getByRole('button', { name: 'Remove Off-Guard' }));

      const write = session.sent.filter((m) => m.stateType === 'enemyfx').at(-1);
      expect(write.value['cbt-gob'].conditions).toEqual([
        expect.objectContaining({ id: 'off-guard', scopedTo: 'Pellias' }),
      ]);
    });
  });

  describe('RK-reveal side effects (S9)', () => {
    const armRails = (session) => {
      act(() => {
        session.push('global', RELAY.BRIDGEHELLO, { protocol: 9, module: '0.0.0-test', ts: 1 });
        pushRelayFixture(session, RELAY.FOEKIT);
      });
    };
    const knowledgeWrite = (session) =>
      session.sent.filter((m) => m.stateType === 'knowledge').at(-1);

    it('executing a strike auto-witnesses it, keyed by rkKey', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armRails(session);

      fireEvent.click(screen.getByRole('button', { name: 'Strike: Jaws at +9' }));

      // ENTRY has no creatureKey, so rkKeyFor falls back to the entryId.
      expect(knowledgeWrite(session).value['cbt-gob'].witnessed.Jaws).toEqual(
        expect.objectContaining({ kind: 'strike' })
      );
    });

    it('casting auto-witnesses the spell', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armRails(session);
      fireEvent.click(screen.getByRole('tab', { name: /Spells/ }));

      fireEvent.click(screen.getByRole('button', { name: 'Cast: Fear' }));

      expect(knowledgeWrite(session).value['cbt-gob'].witnessed.Fear).toEqual(
        expect.objectContaining({ kind: 'spell' })
      );
    });

    it('abilities reveal on the GM tap and settle into the revealed tag', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      act(() => { pushRelayFixture(session, RELAY.FOEKIT); });
      fireEvent.click(screen.getByRole('tab', { name: /Abilities/ }));

      fireEvent.click(screen.getByRole('button', { name: 'Reveal Goblin Scuttle' }));

      expect(knowledgeWrite(session).value['cbt-gob'].witnessed['Goblin Scuttle']).toEqual(
        expect.objectContaining({ kind: 'ability' })
      );
      expect(screen.queryByRole('button', { name: 'Reveal Goblin Scuttle' })).not.toBeInTheDocument();
      expect(screen.getByText('revealed')).toBeInTheDocument();
    });
  });

  it('surfaces flanked, applied conditions, and persistent damage as chips', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    act(() => {
      session.push('global', RELAY.FLANKED, { 'cbt-gob': { byCharIds: ['Pellias'] } });
      session.push('global', APP.ENEMYFX, {
        'cbt-gob': { conditions: [{ id: 'frightened', value: 2, source: 'Ashka' }], effects: [] },
      });
      session.push('global', APP.PERSISTENT, {
        'cbt-gob': [{ id: 'p1', dice: '1d6', type: 'fire', half: false }],
      });
    });

    expect(screen.getByText('⚔ flanked')).toBeInTheDocument();
    expect(screen.getByText(/Frightened 2/)).toBeInTheDocument();
    // #1537 S4: persistent damage is the real PersistentChip (clear popover),
    // whose badge carries the summary as its accessible name.
    expect(screen.getByRole('button', { name: /1d6 persistent fire/ })).toBeInTheDocument();
  });

  describe('GM vitals controls (S4)', () => {
    it('quick damage sends a typed dmgapply hit for this foe', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);

      fireEvent.change(screen.getByLabelText('Quick damage amount'), { target: { value: '9' } });
      fireEvent.change(screen.getByLabelText('Quick damage type'), { target: { value: 'fire' } });
      fireEvent.click(screen.getByRole('button', { name: 'Damage' }));

      const sent = session.sent.filter((m) => m.stateType === RELAY.DMGAPPLY).at(-1);
      expect(sent.value.sourceName).toBe('GM damage (dock)');
      expect(sent.value.hits).toEqual([
        expect.objectContaining({ entryId: 'cbt-gob', amount: 9, type: 'fire' }),
      ]);
    });

    it('quick heal sends a negative untyped amount', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);

      fireEvent.change(screen.getByLabelText('Quick damage amount'), { target: { value: '7' } });
      fireEvent.change(screen.getByLabelText('Quick damage type'), { target: { value: 'fire' } });
      fireEvent.click(screen.getByRole('button', { name: 'Heal' }));

      const sent = session.sent.filter((m) => m.stateType === RELAY.DMGAPPLY).at(-1);
      expect(sent.value.sourceName).toBe('GM healing (dock)');
      expect(sent.value.hits).toEqual([
        expect.objectContaining({ entryId: 'cbt-gob', amount: -7, type: '' }),
      ]);
    });

    it('ad-hoc save roll round-trips: saveroll out, degree read-out from the ack', async () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);

      fireEvent.change(screen.getByLabelText('Foe save'), { target: { value: 'reflex' } });
      fireEvent.change(screen.getByLabelText('Foe save DC'), { target: { value: '22' } });
      fireEvent.click(screen.getByRole('button', { name: 'Roll save' }));

      const req = session.sent.filter((m) => m.stateType === RELAY.SAVEROLL).at(-1);
      expect(req.value).toMatchObject({
        save: 'reflex',
        dc: 22,
        targets: [{ entryId: 'cbt-gob', name: 'Goblin Warrior' }],
      });

      await act(async () => {
        session.push('global', RELAY.SAVEDONE, {
          id: req.value.id,
          results: [{ entryId: 'cbt-gob', name: 'Goblin Warrior', d20: 10, total: 17 }],
          failed: [],
          ts: 2,
        });
      });

      const result = await screen.findByTestId('dock-enemy-save-result');
      expect(result).toHaveTextContent('Ref save');
      expect(result).toHaveTextContent('17 vs DC 22');
      expect(result).toHaveTextContent('Failure');
    });

    it('preset chips fill the damage-pad amount (#1556 S3)', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);

      fireEvent.click(screen.getByRole('button', { name: 'Preset 10' }));
      fireEvent.click(screen.getByRole('button', { name: 'Damage' }));

      const sent = session.sent.filter((m) => m.stateType === RELAY.DMGAPPLY).at(-1);
      expect(sent.value.hits).toEqual([
        expect.objectContaining({ entryId: 'cbt-gob', amount: 10, type: '' }),
      ]);
    });

    it('hides the controls entirely without Foundry (sandbox)', () => {
      renderWithProviders(<DockEnemyPane entry={ENTRY} />, {
        session: { foundryConnected: false },
      });
      expect(screen.queryByTestId('dock-enemy-gmctl')).not.toBeInTheDocument();
    });
  });
});
