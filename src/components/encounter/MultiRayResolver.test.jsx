// MultiRayResolver — unit tests. Stubs TargetRollResolver so we can assert on the
// per-ray target wiring and the getResults() shape without a real d20 input.

import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MultiRayResolver from './MultiRayResolver';

// Stub TargetRollResolver: echoes the single target it was scoped to, and returns
// null from getResults() when told to (simulating "no d20 entered").
vi.mock('./TargetRollResolver', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  const React = require('react');
  return {
    default: forwardRef(({ enemyTargets, rollBonus }, ref) => {
      const target = enemyTargets[0];
      useImperativeHandle(ref, () => ({
        getResults: () =>
          target?.empty
            ? null
            : [{ entryId: target.entryId, name: target.name, dc: 15, total: (rollBonus || 0) + 10, degree: 'success' }],
      }));
      return React.createElement('div', {
        'data-testid': 'resolver',
        'data-target': target?.name,
      }, `bonus=${rollBonus}`);
    }),
  };
});

const targets = [
  { entryId: 'e1', name: 'Goblin', defenses: { ac: { value: 15 } } },
  { entryId: 'e2', name: 'Orc', defenses: { ac: { value: 18 } } },
];

describe('MultiRayResolver', () => {
  it('renders one resolver row per ray', () => {
    render(<MultiRayResolver rayCount={3} enemyTargets={targets} rollBonus={9} />);
    expect(screen.getAllByTestId('resolver')).toHaveLength(3);
  });

  it('renders nothing when there are no targets', () => {
    const { container } = render(<MultiRayResolver rayCount={3} enemyTargets={[]} rollBonus={9} />);
    expect(container.firstChild).toBeNull();
  });

  it('defaults ray i to target i, falling back to the last target', () => {
    render(<MultiRayResolver rayCount={3} enemyTargets={targets} rollBonus={9} />);
    const resolvers = screen.getAllByTestId('resolver');
    expect(resolvers[0]).toHaveAttribute('data-target', 'Goblin'); // ray 0 → target 0
    expect(resolvers[1]).toHaveAttribute('data-target', 'Orc');    // ray 1 → target 1
    expect(resolvers[2]).toHaveAttribute('data-target', 'Orc');    // ray 2 → clamps to last
  });

  it('hides the per-ray target select when only one target is selected', () => {
    render(<MultiRayResolver rayCount={2} enemyTargets={[targets[0]]} rollBonus={9} />);
    expect(screen.queryByLabelText(/ray 1 target/)).not.toBeInTheDocument();
  });

  it('changing a ray target re-scopes that resolver', () => {
    render(<MultiRayResolver rayCount={1} enemyTargets={targets} rollBonus={9} />);
    fireEvent.change(screen.getByLabelText('ray 1 target'), { target: { value: 'e2' } });
    expect(screen.getByTestId('resolver')).toHaveAttribute('data-target', 'Orc');
  });

  it('getResults returns one entry per ray with the chosen target', () => {
    const ref = createRef();
    render(<MultiRayResolver ref={ref} rayCount={2} enemyTargets={targets} rollBonus={9} />);
    const res = ref.current.getResults();
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ rayIndex: 0 });
    expect(res[0].results[0]).toMatchObject({ name: 'Goblin', degree: 'success', total: 19 });
    expect(res[1].results[0]).toMatchObject({ name: 'Orc' });
  });

  it('drops rays with no d20 entered', () => {
    const ref = createRef();
    // Mark the second target as "empty" so its resolver returns null.
    const withEmpty = [targets[0], { ...targets[1], empty: true }];
    render(<MultiRayResolver ref={ref} rayCount={2} enemyTargets={withEmpty} rollBonus={9} />);
    const res = ref.current.getResults();
    expect(res).toHaveLength(1);
    expect(res[0].rayIndex).toBe(0);
  });
});
