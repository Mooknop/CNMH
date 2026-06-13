import React from 'react';
import { render, screen } from '@testing-library/react';

// Per-PC prey lookup, keyed by hunter charId.
const preyByHunter = {};
vi.mock('../../hooks/useHuntPrey', () => ({
  useHuntPrey: (charId) => ({ prey: preyByHunter[charId] || null, designate: vi.fn(), clear: vi.fn() }),
}));

import HuntPreyBadge from './HuntPreyBadge';

const goblin = { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'gob' };
const orc = { entryId: 'e-orc', kind: 'enemy', name: 'Orc', creatureKey: 'orc' };
const order = [
  goblin,
  orc,
  { entryId: 'e-ash', kind: 'pc', name: 'Ashka', charId: 'AshkaBGosh' },
];

beforeEach(() => {
  for (const k of Object.keys(preyByHunter)) delete preyByHunter[k];
});

describe('HuntPreyBadge', () => {
  it('renders nothing for a non-enemy entry', () => {
    preyByHunter.AshkaBGosh = { targetKey: 'gob' };
    const { container } = render(<HuntPreyBadge enemyEntry={order[2]} order={order} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no hunter targets this enemy', () => {
    const { container } = render(<HuntPreyBadge enemyEntry={goblin} order={order} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the badge on the enemy a PC has designated as prey', () => {
    preyByHunter.AshkaBGosh = { targetKey: 'gob', targetName: 'Goblin' };
    render(<HuntPreyBadge enemyEntry={goblin} order={order} />);
    expect(screen.getByLabelText("Goblin is Ashka's prey")).toBeInTheDocument();
  });

  it('does not show the badge on a different enemy', () => {
    preyByHunter.AshkaBGosh = { targetKey: 'gob', targetName: 'Goblin' };
    const { container } = render(<HuntPreyBadge enemyEntry={orc} order={order} />);
    expect(container.firstChild).toBeNull();
  });
});
