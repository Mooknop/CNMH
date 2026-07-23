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

    expect(within(screen.getByTestId('dock-order-e-gob')).getByText('2 cond')).toBeInTheDocument();
    expect(within(screen.getByTestId('dock-order-e-wolf')).queryByText(/cond/)).not.toBeInTheDocument();
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
