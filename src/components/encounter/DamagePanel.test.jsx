// DamagePanel — unit tests for the pre-commit save-damage entry: the hint +
// extra-dice rider toggle (Gloaming Backstab's hidden precision, #269) and the
// dice-tower rail. The attack mode died with TargetRollResolver (#1680
// successor arc) — RollSheet's amount phase owns per-hit entry now.

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DamagePanel from './DamagePanel';
import { SessionContext } from '../../contexts/SessionContext';
import { makeSessionBus } from '../../test/sessionBus';
import { RELAY } from '../../sync/keys';

const gloamingProfile = {
  expression: '6d6',
  typeLabel: 'void',
  riders: [{
    id: 'gloaming-hidden-precision', label: 'Hidden',
    dice: '6d4', type: 'precision', defaultOn: false,
  }],
};

const renderPanel = (props = {}) => render(
  <DamagePanel
    profile={gloamingProfile}
    entered=""
    onEntered={() => {}}
    riderState={props.riderState ?? {}}
    onToggleRider={props.onToggleRider ?? (() => {})}
  />
);

describe('DamagePanel extra-dice rider', () => {
  it('shows only the base dice while the hidden rider is off', () => {
    renderPanel();
    // "6d6 void" appears both on the hint line and DamageEntry's own row (#1692).
    expect(screen.getAllByText('6d6 void').length).toBeGreaterThan(0);
  });

  it('folds the precision dice into the hint once the rider is toggled on', () => {
    renderPanel({ riderState: { 'gloaming-hidden-precision': true } });
    expect(screen.getByText('6d6 void + 6d4 precision')).toBeInTheDocument();
  });

  it('surfaces the rider with its own dice and fires the toggle handler', () => {
    const onToggleRider = vi.fn();
    renderPanel({ onToggleRider });
    expect(screen.getByText(/6d4 precision/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Hidden/ }));
    expect(onToggleRider).toHaveBeenCalledWith('gloaming-hidden-precision', true);
  });

  it('keeps the single-total entry with the rider on — the caster enters one number', () => {
    renderPanel({ riderState: { 'gloaming-hidden-precision': true } });
    expect(screen.getByLabelText('rolled damage total')).toBeInTheDocument();
  });
});

// ── dice-tower rail (#1490 S5) ───────────────────────────────────────────────
// DamageEntry's own delegated-roll behavior is covered in DamageEntry.test.jsx;
// this pins the panel's wiring: the FOLDED base formula and the ack filling the
// entry. The plain renders above run session-less and never grow buttons.
describe('DamagePanel dice-tower rail', () => {
  it('delegates the FOLDED base formula and fills the total from the ack', async () => {
    const bus = makeSessionBus({ state: { global: { bridgehello: { protocol: 3 } } } });
    const onEntered = vi.fn();
    render(
      <SessionContext.Provider value={bus}>
        <DamagePanel
          profile={gloamingProfile}
          entered=""
          onEntered={onEntered}
          riderState={{ 'gloaming-hidden-precision': true }}
          onToggleRider={() => {}}
          charId="pc-1"
          flavor="Strike: Scythe"
        />
      </SessionContext.Provider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /roll in foundry/i }));
    });
    const req = bus.sent.find((s) => s.stateType === RELAY.ROLLREQ);
    expect(req.value).toEqual(expect.objectContaining({
      formula: '6d6+6d4', charId: 'pc-1', flavor: 'Strike: Scythe — damage',
    }));

    await act(async () => {
      bus.push('global', RELAY.ROLLDONE, {
        id: req.value.id, charId: 'pc-1', ok: true, total: 31, faces: [], ts: Date.now(),
      });
    });
    expect(onEntered).toHaveBeenCalledWith('31');
  });
});
