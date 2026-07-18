// Dice-tower entry tests (#1490 S2): the manual d20 input is untouched; a
// rail-capable bridge (protocol ≥ ROLL_PROTOCOL) + charId adds a "Roll in
// Foundry" button whose ack fills the input. Nack/timeout leave the input
// editable — manual entry is always the fallback.
import React, { useState } from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import FoundryDiceInput from './FoundryDiceInput';
import { ROLL_TIMEOUT_MS } from '../../utils/diceRelay';
import { RELAY } from '../../sync/keys';

function Host({ charId = 'Amiri', flavor = 'Strike: Longsword' }) {
  const [val, setVal] = useState('');
  return (
    <FoundryDiceInput
      value={val}
      onValue={setVal}
      charId={charId}
      flavor={flavor}
      inputClassName="trr-roll-input"
    />
  );
}

const RAIL_STATE = { global: { [RELAY.BRIDGEHELLO]: { protocol: 3 } } };

const rollButton = () => screen.queryByRole('button', { name: /roll in foundry/i });
const sentReq = (session) => session.sent.find((s) => s.stateType === RELAY.ROLLREQ);

describe('FoundryDiceInput', () => {
  test('delegated roll: request carries formula/flavor/charId, ack fills the input', async () => {
    const { session } = renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

    await act(async () => { fireEvent.click(rollButton()); });

    const req = sentReq(session);
    expect(req.characterId).toBe('global');
    expect(req.value).toEqual(expect.objectContaining({
      formula: '1d20', flavor: 'Strike: Longsword', charId: 'Amiri',
    }));
    expect(rollButton()).toBeDisabled();

    await act(async () => {
      session.push('global', RELAY.ROLLDONE, {
        id: req.value.id, charId: 'Amiri', ok: true, total: 14, faces: [[20, 14]], ts: Date.now(),
      });
    });

    expect(screen.getByLabelText(/raw d20/i)).toHaveValue(14);
    expect(rollButton()).toBeEnabled();
  });

  test('a bridge nack (ok:false) re-enables the button and leaves the input empty', async () => {
    const { session } = renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

    await act(async () => { fireEvent.click(rollButton()); });
    const req = sentReq(session);
    await act(async () => {
      session.push('global', RELAY.ROLLDONE, {
        id: req.value.id, charId: 'Amiri', ok: false, total: null, faces: [], ts: Date.now(),
      });
    });

    expect(screen.getByLabelText(/raw d20/i)).toHaveValue(null);
    expect(rollButton()).toBeEnabled();
  });

  test('a stale ack for a DIFFERENT request id is ignored', async () => {
    const { session } = renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

    await act(async () => { fireEvent.click(rollButton()); });
    await act(async () => {
      session.push('global', RELAY.ROLLDONE, {
        id: 'roll-someone-else', charId: 'Kalli', ok: true, total: 20, faces: [[20, 20]], ts: Date.now(),
      });
    });

    expect(screen.getByLabelText(/raw d20/i)).toHaveValue(null);
    expect(rollButton()).toBeDisabled(); // still waiting on OUR ack
  });

  test('timeout without an ack re-enables manual entry', async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

      await act(async () => { fireEvent.click(rollButton()); });
      expect(rollButton()).toBeDisabled();

      await act(async () => { vi.advanceTimersByTime(ROLL_TIMEOUT_MS + 1); });

      expect(rollButton()).toBeEnabled();
      expect(screen.getByLabelText(/raw d20/i)).toHaveValue(null);
    } finally {
      vi.useRealTimers();
    }
  });

  test('manual typing still drives the input directly', () => {
    renderWithProviders(<Host />, { session: { state: RAIL_STATE } });
    fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '17' } });
    expect(screen.getByLabelText(/raw d20/i)).toHaveValue(17);
  });

  test('no button without a charId', () => {
    renderWithProviders(<Host charId={null} />, { session: { state: RAIL_STATE } });
    expect(rollButton()).toBeNull();
  });

  test('no button when the bridge protocol predates the rail', () => {
    renderWithProviders(<Host />, {
      session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 2 } } } },
    });
    expect(rollButton()).toBeNull();
  });

  test('no button when Foundry is not connected', () => {
    renderWithProviders(<Host />, {
      session: { state: RAIL_STATE, foundryConnected: false },
    });
    expect(rollButton()).toBeNull();
  });
});

// ── damage formulas (#1490 S5) ───────────────────────────────────────────────
describe('FoundryDiceInput formula prop', () => {
  function DamageHost({ formula }) {
    const [val, setVal] = useState('');
    return (
      <FoundryDiceInput
        value={val}
        onValue={setVal}
        charId="Amiri"
        flavor="Strike: Scythe — damage"
        formula={formula}
        ariaLabel="rolled damage total"
        inputClassName="dmg-total-input"
      />
    );
  }

  test('a damage formula fills the TOTAL from the ack, not a die face', async () => {
    const { session } = renderWithProviders(<DamageHost formula="2d8+4" />, {
      session: { state: RAIL_STATE },
    });

    await act(async () => { fireEvent.click(rollButton()); });
    const req = sentReq(session);
    expect(req.value).toEqual(expect.objectContaining({ formula: '2d8+4' }));

    await act(async () => {
      session.push('global', RELAY.ROLLDONE, {
        id: req.value.id, charId: 'Amiri', ok: true, total: 13, faces: [[8, 5], [8, 4]], ts: Date.now(),
      });
    });
    expect(screen.getByLabelText('rolled damage total')).toHaveValue(13);
  });

  test('a non-rollable expression (authored prose / empty) hides the button', () => {
    renderWithProviders(<DamageHost formula="1d6 cold" />, { session: { state: RAIL_STATE } });
    expect(rollButton()).toBeNull();
  });

  test('an empty formula hides the button', () => {
    renderWithProviders(<DamageHost formula="" />, { session: { state: RAIL_STATE } });
    expect(rollButton()).toBeNull();
  });
});
