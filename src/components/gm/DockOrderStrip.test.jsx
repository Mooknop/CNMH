import React from 'react';
import { screen, act, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RELAY, APP } from '../../sync/keys';
import DockOrderStrip from './DockOrderStrip';

beforeEach(() => window.localStorage.clear());

const ORDER = [
  { entryId: 'e-pellias', kind: 'pc', charId: 'Pellias', name: 'Pellias', initiative: 21, foundryActorId: 'a-pellias' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', initiative: 15, foundryActorId: 'a-gob' },
  { entryId: 'e-wolf', kind: 'enemy', name: 'Wolf', initiative: 9, foundryActorId: 'a-wolf' },
];

const seed = (session, { actorMap = {}, currentTurnIndex = 1, phase = 'in-progress' } = {}) => {
  act(() => {
    session.push('global', RELAY.ACTORMAP, actorMap);
    session.push('global', RELAY.ENCOUNTER, {
      active: true, phase, round: 2, currentTurnIndex,
      order: ORDER, log: [], saveRequests: [],
    });
  });
};

describe('DockOrderStrip (#1537 S5)', () => {
  it('renders every combatant with initiative and marks the current turn', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const goblin = screen.getByTestId('dock-order-e-gob');
    expect(goblin).toHaveTextContent('Goblin');
    expect(goblin).toHaveTextContent('15');
    expect(goblin.className).toContain('is-current');
    expect(screen.getByTestId('dock-order-e-pellias').className).not.toContain('is-current');
  });

  it('an undecided combatant shows the assign select; picking a PC writes the actor map', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    // a-wolf has no verdict — auto-match hasn't fired, GM hasn't ruled.
    seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null } });

    expect(screen.queryByLabelText('assign-e-gob')).not.toBeInTheDocument();
    const select = screen.getByLabelText('assign-e-wolf');

    fireEvent.change(select, { target: { value: 'Pellias' } });

    const write = session.sent.filter((m) => m.stateType === RELAY.ACTORMAP).at(-1);
    expect(write.value).toMatchObject({ 'a-wolf': 'Pellias', 'a-pellias': 'Pellias', 'a-gob': null });
  });

  it('"Not a PC" stores the null sentinel so the slot never re-matches', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null } });

    fireEvent.change(screen.getByLabelText('assign-e-wolf'), { target: { value: '' } });

    const write = session.sent.filter((m) => m.stateType === RELAY.ACTORMAP).at(-1);
    expect(write.value['a-wolf']).toBeNull();
    expect('a-wolf' in write.value).toBe(true);
  });

  it('decided rows collapse to the reassign pencil, which reopens the select', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });

    expect(screen.queryByLabelText('assign-e-gob')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reassign Goblin' }));
    expect(screen.getByLabelText('assign-e-gob')).toBeInTheDocument();
  });

  it('badges an enemy with its applied-condition count', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });
    act(() => {
      session.push('global', APP.ENEMYFX, {
        'e-gob': {
          conditions: [
            { id: 'frightened', value: 1, source: 'x' },
            { id: 'off-guard', value: null, source: 'y' },
          ],
          effects: [],
        },
      });
    });

    // S2: the count badge became inline chips (id + value, prettified).
    const gob = within(screen.getByTestId('dock-order-e-gob'));
    expect(gob.getByText('Frightened 1')).toBeInTheDocument();
    expect(gob.getByText('Off guard')).toBeInTheDocument();
    expect(gob.getByRole('group', { name: 'Goblin: 2 applied conditions' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('dock-order-e-wolf')).queryByText(/Frightened/)
    ).not.toBeInTheDocument();
  });

  it('summon rows show HP and dismiss through useSummons; ally disposition tones the row (#1537 S6)', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    act(() => {
      session.push('global', RELAY.ACTORMAP, { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null });
      session.push('global', APP.SUMMONS, [
        { entryId: 'sum-1', kind: 'summon', name: 'Zombie Shambler', bestiary: { hp: { current: 9, max: 24 } } },
      ]);
      session.push('global', RELAY.ENCOUNTER, {
        active: true, phase: 'in-progress', round: 2, currentTurnIndex: 1,
        order: [
          ...ORDER,
          // FRIENDLY no-charId Foundry combatant → ally tone.
          { entryId: 'e-angel', kind: 'enemy', name: 'Summoned Angel', initiative: 5, foundryActorId: 'a-angel', disposition: 1 },
        ],
        log: [], saveRequests: [],
      });
    });

    // useEncounter appends cnmh_summons_global entries to the display order.
    const summonRow = screen.getByTestId('dock-order-sum-1');
    expect(summonRow).toHaveTextContent('9/24');
    expect(summonRow.className).toContain('is-summon');
    expect(screen.getByTestId('dock-order-e-angel').className).toContain('is-ally');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Zombie Shambler' }));
    const write = session.sent.filter((m) => m.stateType === APP.SUMMONS).at(-1);
    expect(write.value).toEqual([]);
  });

  describe('battle-rail staging + vitals (#1556 S2)', () => {
    it('PC rows stage on click; Follow turn reports the staged state back', () => {
      const onStage = vi.fn();
      const onFollow = vi.fn();
      const { session } = renderWithProviders(
        <DockOrderStrip stagedCharId={null} onStage={onStage} onFollow={onFollow} />
      );
      seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });

      expect(screen.getByRole('group', { name: 'Stage a character' })).toBeInTheDocument();
      const follow = screen.getByRole('button', { name: 'Follow turn' });
      expect(follow).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Stage Pellias' }));
      expect(onStage).toHaveBeenCalledWith('Pellias');

      fireEvent.click(follow);
      expect(onFollow).toHaveBeenCalled();
    });

    it('the staged row is marked; enemies never grow stage buttons', () => {
      const { session } = renderWithProviders(
        <DockOrderStrip stagedCharId="Pellias" onStage={vi.fn()} onFollow={vi.fn()} />
      );
      seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });

      expect(screen.getByTestId('dock-order-e-pellias').className).toContain('is-staged');
      expect(screen.getByRole('button', { name: 'Stage Pellias' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Follow turn' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('button', { name: 'Stage Goblin' })).not.toBeInTheDocument();
    });

    it('without staging props the rows stay inert and Follow turn is absent', () => {
      const { session } = renderWithProviders(<DockOrderStrip />);
      seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });

      expect(screen.queryByRole('button', { name: 'Stage Pellias' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Follow turn' })).not.toBeInTheDocument();
    });

    it('PC rows draw an HP micro-bar from live state', () => {
      const { session } = renderWithProviders(<DockOrderStrip />);
      seed(session, { actorMap: { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null } });
      act(() => {
        session.push('Pellias', 'hp', { current: 10, max: 20 });
      });

      expect(screen.getByLabelText('Pellias hp')).toHaveTextContent('10/20');
    });

    it('enemy rows draw HP from the bestiary block when the bridge supplies it', () => {
      const { session } = renderWithProviders(<DockOrderStrip />);
      act(() => {
        session.push('global', RELAY.ACTORMAP, { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null });
        session.push('global', RELAY.ENCOUNTER, {
          active: true, phase: 'in-progress', round: 2, currentTurnIndex: 1,
          order: [
            ORDER[0],
            { ...ORDER[1], bestiary: { hp: { current: 9, max: 20 } } },
            ORDER[2],
          ],
          log: [], saveRequests: [],
        });
      });

      expect(screen.getByLabelText('Goblin hp')).toHaveTextContent('9/20');
      // The wolf has no bestiary block — no bar rather than a 0/0 lie.
      expect(screen.queryByLabelText('Wolf hp')).not.toBeInTheDocument();
    });
  });

  it('renders during setup with dash initiatives and no current marker', () => {
    const { session } = renderWithProviders(<DockOrderStrip />);
    act(() => {
      session.push('global', RELAY.ACTORMAP, { 'a-pellias': 'Pellias', 'a-gob': null, 'a-wolf': null });
      session.push('global', RELAY.ENCOUNTER, {
        active: true, phase: 'setup', round: 0, currentTurnIndex: 0,
        order: ORDER.map((e) => ({ ...e, initiative: null })), log: [], saveRequests: [],
      });
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('dock-order-e-pellias')).toHaveTextContent('—');
    expect(screen.getByTestId('dock-order-e-pellias').className).not.toContain('is-current');
  });
});
