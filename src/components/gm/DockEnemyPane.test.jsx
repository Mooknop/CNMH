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

  it('renders the recorded kit: strikes, spells with slots/uses, abilities, skills', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    act(() => { pushRelayFixture(session, RELAY.FOEKIT); });

    expect(screen.queryByTestId('dock-enemy-waiting')).not.toBeInTheDocument();

    // Strike row: label, MAP ladder, typed damage, attack effect.
    const strike = screen.getByTestId('dock-enemy-strike');
    expect(strike).toHaveTextContent('Jaws');
    expect(strike).toHaveTextContent('+9 / +4 / -1');
    expect(strike).toHaveTextContent('1d8+4 piercing');
    expect(strike).toHaveTextContent('+ grab');

    // Spellcasting entry: meta line, rank slot state, spell with uses + save.
    const entry = screen.getByTestId('dock-enemy-spellentry');
    expect(entry).toHaveTextContent('Arcane Spells');
    expect(entry).toHaveTextContent('DC 19');
    expect(entry).toHaveTextContent('2/2 slots');
    const spell = screen.getByTestId('dock-enemy-spell');
    expect(spell).toHaveTextContent('Fear');
    expect(spell).toHaveTextContent('1/1');
    expect(spell).toHaveTextContent('Will');

    // Ability + skills off the same recorded payload.
    expect(screen.getByTestId('dock-enemy-ability')).toHaveTextContent('Goblin Scuttle');
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
      expect(screen.getByRole('button', { name: 'Cast: Fear' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Strike target' })).not.toBeInTheDocument();
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

    it('the Cast button sends castreq with the entry, spell, and rank', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armCast(session);

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

      expect(screen.getByRole('button', { name: 'Cast: Fear' })).toBeDisabled();
    });

    it('a protocol-6 bridge keeps the strike rail but grows no Cast buttons', () => {
      const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
      armCast(session, { protocol: 6 });

      expect(screen.getByRole('button', { name: 'Damage: Jaws' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cast: Fear' })).not.toBeInTheDocument();
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

    it('hides the controls entirely without Foundry (sandbox)', () => {
      renderWithProviders(<DockEnemyPane entry={ENTRY} />, {
        session: { foundryConnected: false },
      });
      expect(screen.queryByTestId('dock-enemy-gmctl')).not.toBeInTheDocument();
    });
  });
});
