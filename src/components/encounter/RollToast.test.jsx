// RollToast (#1490 S3) — party-wide roll feedback cards off the fx channel.
// The channel's replay/staleness discipline is useFxChannel's (tested there);
// here we pin: roll-carrying events toast, plain ability events don't, chips
// speak the right degree vocabulary, and cards self-dismiss.
import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import RollToast, { ROLL_TOAST_MS } from './RollToast';
import { emitPendingRoll } from '../../utils/pendingRolls';
import { APP } from '../../sync/keys';

const AMIRI = makeCharacter({ id: 'pc-amiri', name: 'Amiri', color: '#c0440e' });

const rollEvent = (overrides = {}) => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  ts: Date.now(),
  kind: 'ability',
  charId: 'pc-amiri',
  roll: {
    d20: 14,
    total: 19,
    flavor: 'Strike: Longsword (MAP -5)',
    attack: true,
    targets: [{ name: 'Goblin', degree: 'success' }],
    more: 0,
  },
  ...overrides,
});

const pushFx = (session, evt) =>
  act(() => { session.push('global', APP.FX, [evt]); });

describe('RollToast', () => {
  test('a fresh roll event toasts name, flavor, die, total, and a Hit chip', () => {
    const { session } = renderWithProviders(<RollToast />, {
      content: { character: [AMIRI] },
    });
    pushFx(session, rollEvent());

    const toast = screen.getByTestId('roll-toast');
    expect(toast).toHaveTextContent('Amiri');
    expect(toast).toHaveTextContent('Strike: Longsword (MAP -5)');
    expect(screen.getByLabelText('d20 face 14')).toBeInTheDocument();
    expect(toast).toHaveTextContent('= 19');
    // attack:true selects Hit/Miss vocabulary
    expect(toast).toHaveTextContent('Hit');
    expect(toast).not.toHaveTextContent('Success');
  });

  test('save vocabulary when attack is false; nat 20 die gets the bloom binding', () => {
    const { session } = renderWithProviders(<RollToast />, {
      content: { character: [AMIRI] },
    });
    pushFx(session, rollEvent({
      roll: {
        d20: 20, total: 25, flavor: 'Cast: Fear', attack: false,
        targets: [{ name: 'Goblin', degree: 'criticalSuccess' }], more: 0,
      },
    }));

    expect(screen.getByTestId('roll-toast')).toHaveTextContent('Critical Success');
    expect(screen.getByLabelText('d20 face 20')).toHaveAttribute('data-fx', 'bloom');
  });

  test('nat 1 shakes; a plain ability event (no roll payload) never toasts', () => {
    const { session } = renderWithProviders(<RollToast />, {
      content: { character: [AMIRI] },
    });
    pushFx(session, { id: 'evt-plain', ts: Date.now(), kind: 'ability', charId: 'pc-amiri' });
    expect(screen.queryByTestId('roll-toast')).toBeNull();

    pushFx(session, rollEvent({ roll: { d20: 1, total: 6, flavor: 'Strike: Fist', attack: true, targets: [], more: 0 } }));
    expect(screen.getByLabelText('d20 face 1')).toHaveAttribute('data-fx', 'shake');
  });

  // Pending dice-tower cards (#1575 D2) — device-local bus, not the fx channel.
  describe('pending dice-tower rolls', () => {
    const start = (overrides = {}) => act(() => {
      emitPendingRoll({
        id: 'roll-1', phase: 'start', charId: 'pc-amiri',
        formula: '1d20', flavor: 'Initiative: Perception', ...overrides,
      });
    });

    test("'start' floats a rolling card with the roller and flavor", () => {
      renderWithProviders(<RollToast />, { content: { character: [AMIRI] } });
      start();

      const card = screen.getByTestId('roll-toast-pending');
      expect(card).toHaveTextContent('Amiri');
      expect(card).toHaveTextContent('Initiative: Perception');
      expect(card).toHaveTextContent('Rolling in Foundry…');
      expect(card).toHaveTextContent('1d20');
    });

    test("'settle' swaps the pending card for a result toast that self-dismisses", () => {
      vi.useFakeTimers();
      try {
        renderWithProviders(<RollToast />, { content: { character: [AMIRI] } });
        start();
        act(() => {
          emitPendingRoll({ id: 'roll-1', phase: 'settle', total: 23, face: 17 });
        });

        expect(screen.queryByTestId('roll-toast-pending')).toBeNull();
        const toast = screen.getByTestId('roll-toast');
        expect(screen.getByLabelText('d20 face 17')).toBeInTheDocument();
        expect(toast).toHaveTextContent('= 23');
        expect(toast).toHaveTextContent('Initiative: Perception');

        act(() => { vi.advanceTimersByTime(ROLL_TOAST_MS + 1); });
        expect(screen.queryByTestId('roll-toast')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    test("a non-d20 settle (face null) shows the total without a fake die", () => {
      renderWithProviders(<RollToast />, { content: { character: [AMIRI] } });
      start({ id: 'roll-2', formula: '2d6+4', flavor: 'Damage: Longsword' });
      act(() => {
        emitPendingRoll({ id: 'roll-2', phase: 'settle', total: 11, face: null });
      });

      const toast = screen.getByTestId('roll-toast');
      expect(toast).toHaveTextContent('= 11');
      expect(screen.queryByLabelText(/d20 face/)).toBeNull();
    });

    test("'drop' (nack/timeout) vanishes the card without a toast", () => {
      renderWithProviders(<RollToast />, { content: { character: [AMIRI] } });
      start();
      act(() => { emitPendingRoll({ id: 'roll-1', phase: 'drop' }); });

      expect(screen.queryByTestId('roll-toast-pending')).toBeNull();
      expect(screen.queryByTestId('roll-toast')).toBeNull();
    });
  });

  test('overflow count renders and the card self-dismisses', () => {
    vi.useFakeTimers();
    try {
      const { session } = renderWithProviders(<RollToast />, {
        content: { character: [AMIRI] },
      });
      pushFx(session, rollEvent({
        roll: {
          d20: 3, total: 8, flavor: 'Strike: Bow', attack: true,
          targets: [{ name: 'A', degree: 'failure' }], more: 2,
        },
      }));
      expect(screen.getByTestId('roll-toast')).toHaveTextContent('+2 more');

      act(() => { vi.advanceTimersByTime(ROLL_TOAST_MS + 1); });
      expect(screen.queryByTestId('roll-toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
