// RollEntry (#1681, Roll Resolution redesign — workstream A): the shared
// d20 entry primitive. Mode is read internally from the TABLE_DICE_PREF
// device pref and useFoundryDice() — never a prop — so these tests drive
// mode the same way FoundryDiceInput.test.jsx does: via setDevicePref and a
// rail-capable session bus.
import React, { useState } from 'react';
import { screen, fireEvent, act, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import RollEntry from './RollEntry';
import { setDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import { RELAY } from '../../sync/keys';

function Host({
  bonus = 18,
  bonusLabel = 'attack',
  dcLine = 'nothing rolled yet · Ghoul AC 24',
  initialFace = null,
  disabled = false,
  onFaceChange,
  onCommit,
}) {
  const [face, setFace] = useState(initialFace);
  return (
    <RollEntry
      face={face}
      onFaceChange={(f) => { setFace(f); onFaceChange?.(f); }}
      onCommit={(f) => onCommit?.(f)}
      bonus={bonus}
      bonusLabel={bonusLabel}
      dcLine={dcLine}
      disabled={disabled}
    />
  );
}

const RAIL_STATE = { global: { [RELAY.BRIDGEHELLO]: { protocol: 3 } } };

const pad = () => screen.getByRole('group', { name: 'raw d20' });
const pill = () => screen.queryByRole('button', { name: /roll d20 in foundry/i });
const sentReq = (session) => session.sent.find((s) => s.stateType === RELAY.ROLLREQ);

describe('RollEntry', () => {
  afterEach(() => setDevicePref(TABLE_DICE_PREF, false));

  test('table-dice mode renders a 1-20 pad; tapping a face calls onFaceChange', () => {
    setDevicePref(TABLE_DICE_PREF, true);
    const onFaceChange = vi.fn();
    renderWithProviders(<Host onFaceChange={onFaceChange} />, { session: { state: RAIL_STATE } });

    const buttons = within(pad()).getAllByRole('button');
    expect(buttons).toHaveLength(20);
    expect(buttons.map((b) => b.textContent)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1))
    );

    fireEvent.click(within(pad()).getByRole('button', { name: '17' }));
    expect(onFaceChange).toHaveBeenCalledWith(17);
  });

  test('Foundry mode renders the pill; a successful roll calls onFaceChange then onCommit', async () => {
    const onFaceChange = vi.fn();
    const onCommit = vi.fn();
    const { session } = renderWithProviders(
      <Host onFaceChange={onFaceChange} onCommit={onCommit} />,
      { session: { state: RAIL_STATE } }
    );

    expect(pill()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'raw d20' })).toBeNull();

    await act(async () => { fireEvent.click(pill()); });
    const req = sentReq(session);
    expect(req.value).toEqual(expect.objectContaining({ formula: '1d20' }));

    await act(async () => {
      session.push('global', RELAY.ROLLDONE, {
        id: req.value.id, charId: null, ok: true, total: 14, faces: [[20, 14]], ts: Date.now(),
      });
    });

    expect(onFaceChange).toHaveBeenCalledWith(14);
    expect(onCommit).toHaveBeenCalledWith(14);
  });

  test('a null ack (nack) falls back to the pad plus a gold notice', async () => {
    const onFaceChange = vi.fn();
    const onCommit = vi.fn();
    const { session } = renderWithProviders(
      <Host onFaceChange={onFaceChange} onCommit={onCommit} />,
      { session: { state: RAIL_STATE } }
    );

    await act(async () => { fireEvent.click(pill()); });
    const req = sentReq(session);
    await act(async () => {
      session.push('global', RELAY.ROLLDONE, {
        id: req.value.id, charId: null, ok: false, total: null, faces: [], ts: Date.now(),
      });
    });

    expect(screen.getByText(/foundry isn.t answering — tap your die instead\./i)).toBeInTheDocument();
    expect(within(pad()).getAllByRole('button')).toHaveLength(20);
    expect(onFaceChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  test('the pref-flip link switches this device to table mode', () => {
    renderWithProviders(<Host />, { session: { state: RAIL_STATE } });
    expect(pill()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /switch this device to table mode/i }));

    expect(window.localStorage.getItem('cnmh-devicepref-tabledice')).toBe('true');
    expect(pill()).toBeNull();
    expect(pad()).toBeInTheDocument();
  });

  test('a natural 20 gets the crit ring class', () => {
    setDevicePref(TABLE_DICE_PREF, true);
    renderWithProviders(<Host initialFace={20} />, { session: { state: RAIL_STATE } });
    expect(screen.getByRole('status')).toHaveClass('rollentry-ring--nat20');
  });

  test('a natural 1 gets the fumble ring class', () => {
    setDevicePref(TABLE_DICE_PREF, true);
    renderWithProviders(<Host initialFace={1} />, { session: { state: RAIL_STATE } });
    expect(screen.getByRole('status')).toHaveClass('rollentry-ring--nat1');
  });

  test('a null bonus renders the em-dash heading instead of a labelled bonus', () => {
    setDevicePref(TABLE_DICE_PREF, true);
    renderWithProviders(<Host bonus={null} bonusLabel="attack" />, { session: { state: RAIL_STATE } });
    expect(screen.getByText('your d20 · —')).toBeInTheDocument();
  });
});
