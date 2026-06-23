import React from 'react';
import { render, screen } from '@testing-library/react';

// Enemy-effect record lookup, keyed by entryId.
const recordByEntry = {};
vi.mock('../../hooks/useEnemyEffects', () => ({
  useEnemyEffects: () => ({
    effectsFor: (entryId) => recordByEntry[entryId] || { conditions: [], effects: [] },
  }),
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [{ id: 'beacon-shot', name: 'Beacon Shot' }] }),
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

  it('names the attacker for an observer-scoped condition (#348)', () => {
    recordByEntry['e-gob'] = {
      conditions: [{ id: 'off-guard', scopedTo: 'ashka', scopedToName: 'Ashka' }],
      effects: [],
    };
    render(<EnemyConditionBadge enemyEntry={goblin} />);
    expect(screen.getByText('Off-Guard to Ashka')).toBeInTheDocument();
    expect(screen.getByLabelText('Goblin is Off-Guard to Ashka')).toBeInTheDocument();
  });

  it('falls back to the effect catalog name for an on-hit ammo marker (#676)', () => {
    recordByEntry['e-gob'] = { conditions: [{ id: 'beacon-shot', source: 'Beacon Shot' }], effects: [] };
    render(<EnemyConditionBadge enemyEntry={goblin} />);
    expect(screen.getByText('Beacon Shot')).toBeInTheDocument();
  });

  it('renders a generic and a scoped off-guard as distinct chips', () => {
    recordByEntry['e-gob'] = {
      conditions: [
        { id: 'off-guard', scopedTo: null },
        { id: 'off-guard', scopedTo: 'izzy', scopedToName: 'Izzy' },
      ],
      effects: [],
    };
    render(<EnemyConditionBadge enemyEntry={goblin} />);
    expect(screen.getByText('Off-Guard')).toBeInTheDocument();
    expect(screen.getByText('Off-Guard to Izzy')).toBeInTheDocument();
  });
});
