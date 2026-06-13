import React from 'react';
import { render, screen } from '@testing-library/react';

// Enemy-effect record lookup, keyed by entryId.
const recordByEntry = {};
vi.mock('../../hooks/useEnemyEffects', () => ({
  useEnemyEffects: () => ({
    effectsFor: (entryId) => recordByEntry[entryId] || { conditions: [], effects: [] },
  }),
}));

import EnemyConditionBadge from './EnemyConditionBadge';

const goblin = { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' };

beforeEach(() => {
  for (const k of Object.keys(recordByEntry)) delete recordByEntry[k];
});

describe('EnemyConditionBadge', () => {
  it('renders nothing for a non-enemy entry', () => {
    const pc = { entryId: 'e-ash', kind: 'pc', name: 'Ashka' };
    recordByEntry['e-ash'] = { conditions: [{ id: 'frightened', value: 2 }], effects: [] };
    const { container } = render(<EnemyConditionBadge enemyEntry={pc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the enemy has no conditions', () => {
    const { container } = render(<EnemyConditionBadge enemyEntry={goblin} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a valued condition chip', () => {
    recordByEntry['e-gob'] = { conditions: [{ id: 'frightened', value: 2 }], effects: [] };
    render(<EnemyConditionBadge enemyEntry={goblin} />);
    expect(screen.getByText('Frightened 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Goblin is Frightened 2')).toBeInTheDocument();
  });
});
