import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Drive the activation state machine deterministically.
let mockAct;
vi.mock('../../hooks/useItemActivation', () => ({
  useItemActivation: () => mockAct,
}));
// TraitTag needs TraitContext; stub it (display-only) so the card renders alone.
vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span className="trait">{trait}</span> }));

import ShieldRuneActivations from './ShieldRuneActivations';

const gusting = { id: 'gusting', type: 'property', name: 'Gusting', actuated: { cost: 'none', name: 'Gusting', actionCount: 1, frequency: 'once per day', traits: ['Command'], description: 'The shield casts gust of wind.', spellRef: 'gust-of-wind', castRank: 1 } };
const reflecting = { id: 'reflecting', type: 'property', name: 'Reflecting', actuated: { cost: 'none', name: 'Reflecting', frequency: 'once per day', traits: ['Command'], description: 'Trigger You are hit by a ranged weapon attack; Effect …' } };
const energyRes = { id: 'energy-resistant', type: 'property', name: 'Energy-Resistant', choice: 'fire' }; // passive, no actuated

const shield = (property) => ({ uid: 'sh1', name: 'Kite Shield', shield: { hardness: 4 }, runes: { reinforcing: 'moderate', property } });
const SPELLS = [{ id: 'gust-of-wind', name: 'Gust of Wind', level: 1 }];
const character = { id: 'pellias', name: 'Pellias' };

const setup = (property, onActivate = vi.fn()) => {
  render(
    <ShieldRuneActivations character={character} item={shield(property)} nowSecs={0} spells={SPELLS} onActivate={onActivate} />,
  );
  return onActivate;
};

beforeEach(() => {
  mockAct = { activation: { canActivate: true, activate: vi.fn(() => ({ ok: true })) }, gate: { available: true } };
});

describe('ShieldRuneActivations', () => {
  it('renders one card per property rune that has an actuated block', () => {
    setup([gusting, reflecting, energyRes]);
    expect(screen.getByTestId('shield-rune-activation-gusting')).toBeInTheDocument();
    expect(screen.getByTestId('shield-rune-activation-reflecting')).toBeInTheDocument();
    // Energy-Resistant is passive (no actuated) → no card.
    expect(screen.queryByTestId('shield-rune-activation-energy-resistant')).toBeNull();
  });

  it('renders nothing when no rune has an actuated block', () => {
    const { container } = render(
      <ShieldRuneActivations character={character} item={shield([energyRes])} nowSecs={0} spells={SPELLS} onActivate={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('a spell-casting rune shows "Cast <Spell>"; a plain one shows "Activate"', () => {
    setup([gusting, reflecting]);
    expect(screen.getByTestId('shield-rune-activate-gusting')).toHaveTextContent('Cast Gust of Wind');
    expect(screen.getByTestId('shield-rune-activate-reflecting')).toHaveTextContent('Activate');
  });

  it('activating fires the gate + reports the rune (and its spell doc for casters)', () => {
    const onActivate = setup([gusting, reflecting]);
    fireEvent.click(screen.getByTestId('shield-rune-activate-gusting'));
    expect(mockAct.activation.activate).toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledWith(gusting, SPELLS[0]);

    fireEvent.click(screen.getByTestId('shield-rune-activate-reflecting'));
    expect(onActivate).toHaveBeenLastCalledWith(reflecting, null);
  });

  it('does not report activation when the gate rejects it', () => {
    mockAct = { activation: { canActivate: true, activate: vi.fn(() => ({ ok: false })) }, gate: { available: true } };
    const onActivate = setup([reflecting]);
    fireEvent.click(screen.getByTestId('shield-rune-activate-reflecting'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('shows the spent hint (not a button) once the frequency is used up', () => {
    mockAct = { activation: { canActivate: false, activate: vi.fn() }, gate: { available: false } };
    setup([reflecting]);
    expect(screen.queryByTestId('shield-rune-activate-reflecting')).toBeNull();
    expect(screen.getByTestId('shield-rune-unavailable-reflecting')).toHaveTextContent('the clock frees it up');
  });
});
