import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

let mockAct;
vi.mock('../../hooks/useItemActivation', () => ({
  useItemActivation: () => mockAct,
}));
vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span className="trait">{trait}</span> }));

import AugmentationActivations from './AugmentationActivations';

const actuated = { cost: 'none', name: 'Mirror', actionCount: 'reaction', frequency: 'see description', traits: ['Envision'], description: 'Trigger …; Effect +2 vs visual.' };
const withAug = (aug) => ({ uid: 'sh1', name: 'War Shield', shield: { hardness: 4 }, augmentation: aug });
const character = { id: 'pellias', name: 'Pellias' };

const setup = (item, onActivate = vi.fn()) => {
  render(<AugmentationActivations character={character} item={item} nowSecs={0} onActivate={onActivate} />);
  return onActivate;
};

beforeEach(() => {
  mockAct = { activation: { canActivate: true, activate: vi.fn(() => ({ ok: true })) }, gate: { available: true } };
});

describe('AugmentationActivations', () => {
  it('renders an interactive card for an actuated augmentation', () => {
    setup(withAug({ id: 'mirror', name: 'Mirror', actuated }));
    expect(screen.getByTestId('augmentation-actuated')).toBeInTheDocument();
    expect(screen.getByText('Envision')).toBeInTheDocument();
    expect(screen.getByText(/Frequency: see description/)).toBeInTheDocument();
    expect(screen.getByTestId('augmentation-activate')).toBeInTheDocument();
  });

  it('renders nothing for a passive augmentation (no actuated) or none at all', () => {
    const { container: c1 } = render(
      <AugmentationActivations character={character} item={withAug({ id: 'coat-of-arms', name: 'Coat of Arms' })} nowSecs={0} onActivate={vi.fn()} />,
    );
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(
      <AugmentationActivations character={character} item={{ uid: 'x', name: 'Plain', shield: {} }} nowSecs={0} onActivate={vi.fn()} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it('fires the activation (spending the gate) and reports it', () => {
    const onActivate = setup(withAug({ id: 'mirror', name: 'Mirror', actuated }));
    fireEvent.click(screen.getByTestId('augmentation-activate'));
    expect(mockAct.activation.activate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'mirror' }));
  });

  it('does not report when the activation is rejected by the gate', () => {
    mockAct = { activation: { canActivate: true, activate: vi.fn(() => ({ ok: false })) }, gate: { available: true } };
    const onActivate = setup(withAug({ id: 'mirror', name: 'Mirror', actuated }));
    fireEvent.click(screen.getByTestId('augmentation-activate'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('shows an unavailable hint (no button) when the frequency is spent', () => {
    mockAct = { activation: { canActivate: false, activate: vi.fn() }, gate: { available: false } };
    setup(withAug({ id: 'mirror', name: 'Mirror', actuated }));
    expect(screen.getByTestId('augmentation-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('augmentation-activate')).toBeNull();
  });
});
