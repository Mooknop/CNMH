// DamagePanel — unit tests for the damage hint + extra-dice rider toggle
// (Gloaming Backstab's hidden precision, #269).

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DamagePanel from './DamagePanel';

const gloamingProfile = {
  expression: '6d6',
  typeLabel: 'void',
  riders: [{
    id: 'gloaming-hidden-precision', label: 'Hidden',
    dice: '6d4', type: 'precision', defaultOn: false,
  }],
};

const hit = [{ entryId: 'e1', name: 'Goblin', degree: 'success', damage: null }];

const renderPanel = (props = {}) => render(
  <DamagePanel
    profile={gloamingProfile}
    hitResults={hit}
    entered=""
    onEntered={() => {}}
    riderState={props.riderState ?? {}}
    onToggleRider={props.onToggleRider ?? (() => {})}
    critDouble={false}
    onCritDouble={() => {}}
  />
);

describe('DamagePanel extra-dice rider', () => {
  it('shows only the base dice while the hidden rider is off', () => {
    renderPanel();
    expect(screen.getByText('6d6 void')).toBeInTheDocument();
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
});
