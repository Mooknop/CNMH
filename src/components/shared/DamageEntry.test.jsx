// DamageEntry (#1682) — damage-part entry primitive for the RollSheet
// redesign's Phase-2 "amount" step. Mirrors FoundryDiceInput.test.jsx's
// dice-tower idioms (renderWithProviders + RELAY roll req/ack), but this
// primitive shows ONE control per row (pill OR input), not both.
import React, { useState } from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import DamageEntry from './DamageEntry';
import { ROLL_TIMEOUT_MS } from '../../utils/diceRelay';
import { setDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import { RELAY } from '../../sync/keys';

const RAIL_STATE = { global: { [RELAY.BRIDGEHELLO]: { protocol: 3 } } };

const firePart = { key: 'flaming', dice: '1d6', type: 'fire', formula: '1d6' };

function Host({ part = firePart, charId = 'Amiri', flavor = 'Strike: Scythe — fire damage', onFoundryRolled }) {
  const [val, setVal] = useState('');
  return (
    <DamageEntry
      part={part}
      value={val}
      onChange={setVal}
      onFoundryRolled={onFoundryRolled}
      charId={charId}
      flavor={flavor}
    />
  );
}

const pillButton = () => screen.queryByRole('button', { name: /roll in foundry/i });
const totalInput = () => screen.queryByLabelText('rolled damage total');
const sentReq = (session) => session.sent.find((s) => s.stateType === RELAY.ROLLREQ);

afterEach(() => {
  setDevicePref(TABLE_DICE_PREF, false);
});

describe('DamageEntry', () => {
  it('renders the dice expression with its type label', () => {
    renderWithProviders(<Host />);
    expect(screen.getByText('1d6 fire')).toBeInTheDocument();
  });

  it('renders without a type label when the part has none', () => {
    renderWithProviders(<Host part={{ key: 'base', dice: '2d8+9', formula: '2d8+9' }} />);
    expect(screen.getByText('2d8+9')).toBeInTheDocument();
  });

  describe('table-dice mode', () => {
    beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

    it('renders the total input (not the pill) with the accessible name, and reports typed values', () => {
      renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

      expect(pillButton()).toBeNull();
      const input = totalInput();
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: '4' } });
      expect(totalInput()).toHaveValue(4);
    });
  });

  describe('Foundry mode', () => {
    it('renders the pill button when a rail-capable bridge is connected', () => {
      renderWithProviders(<Host />, { session: { state: RAIL_STATE } });
      expect(pillButton()).toBeInTheDocument();
      expect(totalInput()).toBeNull();
    });

    it('a successful delegated roll shows "rolled N" and propagates the total via onChange and onFoundryRolled', async () => {
      const onFoundryRolled = vi.fn();
      const { session } = renderWithProviders(<Host onFoundryRolled={onFoundryRolled} />, {
        session: { state: RAIL_STATE },
      });

      await act(async () => { fireEvent.click(pillButton()); });
      const req = sentReq(session);
      expect(req.characterId).toBe('global');
      expect(req.value).toEqual(expect.objectContaining({
        formula: '1d6', flavor: 'Strike: Scythe — fire damage', charId: 'Amiri',
      }));
      expect(pillButton()).toBeDisabled();

      await act(async () => {
        session.push('global', RELAY.ROLLDONE, {
          id: req.value.id, charId: 'Amiri', ok: true, total: 4, faces: [[6, 4]], ts: Date.now(),
        });
      });

      expect(screen.getByText('rolled 4')).toBeInTheDocument();
      expect(pillButton()).toBeNull();
      expect(onFoundryRolled).toHaveBeenCalledWith(4);
    });

    it('a nack leaves the pill in place for another attempt', async () => {
      const { session } = renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

      await act(async () => { fireEvent.click(pillButton()); });
      const req = sentReq(session);
      await act(async () => {
        session.push('global', RELAY.ROLLDONE, {
          id: req.value.id, charId: 'Amiri', ok: false, total: null, faces: [], ts: Date.now(),
        });
      });

      expect(pillButton()).toBeEnabled();
      expect(screen.queryByText(/^rolled /)).not.toBeInTheDocument();
    });

    it('a timeout without an ack re-enables the pill', async () => {
      vi.useFakeTimers();
      try {
        renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

        await act(async () => { fireEvent.click(pillButton()); });
        expect(pillButton()).toBeDisabled();

        await act(async () => { vi.advanceTimersByTime(ROLL_TIMEOUT_MS + 1); });

        expect(pillButton()).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('falls back to the total input when Foundry is unavailable', () => {
      renderWithProviders(<Host />, {
        session: { state: RAIL_STATE, foundryConnected: false },
      });
      expect(pillButton()).toBeNull();
      expect(totalInput()).toBeInTheDocument();
    });

    it('falls back to the total input without a charId', () => {
      renderWithProviders(<Host charId={null} />, { session: { state: RAIL_STATE } });
      expect(pillButton()).toBeNull();
      expect(totalInput()).toBeInTheDocument();
    });

    it('falls back to the total input on a non-rollable formula', () => {
      renderWithProviders(<Host part={{ key: 'cold', dice: '1d6 cold', formula: '1d6 cold' }} />, {
        session: { state: RAIL_STATE },
      });
      expect(pillButton()).toBeNull();
      expect(totalInput()).toBeInTheDocument();
    });
  });
});
