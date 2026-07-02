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

  it('precision keeps the single-total entry — it folds into the parent instance', () => {
    render(
      <DamagePanel
        profile={gloamingProfile}
        hitResults={hit}
        entered=""
        onEntered={() => {}}
        enteredParts={{}}
        onEnteredPart={() => {}}
        riderState={{ 'gloaming-hidden-precision': true }}
        onToggleRider={() => {}}
        critDouble={false}
        onCritDouble={() => {}}
      />
    );
    expect(screen.getByLabelText('rolled damage total')).toBeInTheDocument();
  });
});

// Multi-instance entry (#1019) — a mixed-type profile takes one total per part.
describe('DamagePanel multi-instance entry', () => {
  const flamingProfile = {
    expression: '2d8+4',
    typeLabel: 'piercing',
    riders: [{
      id: 'rune-flaming-dice', label: 'Flaming',
      dice: '1d6', type: 'fire', defaultOn: true,
    }],
  };

  const renderMulti = (props = {}) => render(
    <DamagePanel
      profile={flamingProfile}
      hitResults={hit}
      entered=""
      onEntered={() => {}}
      enteredParts={props.enteredParts ?? {}}
      onEnteredPart={props.onEnteredPart ?? (() => {})}
      riderState={props.riderState ?? {}}
      onToggleRider={() => {}}
      critDouble={false}
      onCritDouble={() => {}}
    />
  );

  it('renders one labeled input per typed part instead of the single total', () => {
    renderMulti();
    expect(screen.queryByLabelText('rolled damage total')).not.toBeInTheDocument();
    expect(screen.getByLabelText('rolled piercing total')).toBeInTheDocument();
    expect(screen.getByLabelText('rolled fire total')).toBeInTheDocument();
    expect(screen.getByText('2d8+4 piercing')).toBeInTheDocument();
    // the fire dice appear both as the part label and on the rider toggle line
    expect(screen.getAllByText(/1d6 fire/).length).toBeGreaterThan(0);
  });

  it('reports per-part entry through onEnteredPart with the part key', () => {
    const onEnteredPart = vi.fn();
    renderMulti({ onEnteredPart });
    fireEvent.change(screen.getByLabelText('rolled fire total'), { target: { value: '4' } });
    expect(onEnteredPart).toHaveBeenCalledWith('rune-flaming-dice', '4');
  });

  it('falls back to the single total once the typed rider is toggled off', () => {
    renderMulti({ riderState: { 'rune-flaming-dice': false } });
    expect(screen.getByLabelText('rolled damage total')).toBeInTheDocument();
    expect(screen.queryByLabelText('rolled fire total')).not.toBeInTheDocument();
  });
});
