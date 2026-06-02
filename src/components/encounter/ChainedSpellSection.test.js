import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChainedSpellSection from './ChainedSpellSection';

jest.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: jest.fn(),
}));
jest.mock('../../utils/defense', () => ({
  DEFENSE_LABELS: { ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' },
  DEFENSE_OPTIONS: [{ value: 'ac', label: 'AC' }],
  defenseDC: jest.fn(() => 15),
}));
jest.mock('./TargetRollResolver', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  // eslint-disable-next-line react/display-name
  return forwardRef(({ enemyTargets, rollBonus }, ref) => {
    useImperativeHandle(ref, () => ({
      getResults: () => enemyTargets.map((e) => ({
        entryId: e.entryId, name: e.name, dc: 15, total: (rollBonus || 0) + 10, degree: 'success',
      })),
    }));
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'spell-resolver' }, `bonus=${rollBonus}`);
  });
});

const { resolveActionRoll } = require('../../utils/rollResolution');

const FIREBALL = { id: 'fireball', name: 'Fireball', actions: 'Two Actions', range: '500 feet', defense: 'Reflex' };
const LIGHT    = { id: 'light',    name: 'Light',    actions: 'Two Actions', range: '120 feet' };
const HEAL     = { id: 'heal',     name: 'Heal',     actions: 'Two Actions' }; // no range

const character = {
  id: 'Jade',
  name: 'JadeInferno',
  spellcasting: { spells: [LIGHT, FIREBALL, HEAL] },
};

const reachChain = { into: 'spell', cost: 'added', spellFilter: 'has-range', modifier: 'Range increased by 30 feet' };
const harrowChain = { into: 'spell', cost: 'added', spellFilter: 'any', modifier: 'Draw a Harrow card' };

const enemyTargets = [{ entryId: 'e1', name: 'Goblin', defenses: { ac: { value: 15 } } }];

beforeEach(() => {
  resolveActionRoll.mockReturnValue({ mode: 'none', bonus: null, dc: null, defense: null });
});
afterEach(() => jest.clearAllMocks());

describe('ChainedSpellSection', () => {
  it('filters spells to has-range only when spellFilter is has-range', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    const opts = Array.from(screen.getByLabelText('spell picker').options).map((o) => o.text);
    expect(opts.some((t) => t.includes('Light'))).toBe(true);
    expect(opts.some((t) => t.includes('Fireball'))).toBe(true);
    expect(opts.some((t) => t.includes('Heal'))).toBe(false); // no range
  });

  it('shows all spells when spellFilter is any', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    const opts = Array.from(screen.getByLabelText('spell picker').options).map((o) => o.text);
    expect(opts.some((t) => t.includes('Heal'))).toBe(true);
  });

  it('shows the modifier note', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByText(/Range increased by 30 feet/)).toBeInTheDocument();
  });

  it('shows correct additive total cost (parent + spell)', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    // Light is 2 actions, parent is 1 → total 3
    expect(screen.getByText(/Total: 3 action/)).toBeInTheDocument();
    expect(screen.getByText(/\(1 \+ 2\)/)).toBeInTheDocument();
  });

  it('updates total cost when a different spell is selected', () => {
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [
          { id: 's1', name: 'Cantrip', actions: 'One Action', range: '30 feet' },
          { id: 's2', name: 'BigSpell', actions: 'Three Actions', range: '60 feet' },
        ]}}}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByText(/Total: 2 action/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 's2' } });
    expect(screen.getByText(/Total: 4 action/)).toBeInTheDocument();
  });

  it('notifies parent via onTotalCostChange when spell changes', () => {
    const onCostChange = jest.fn();
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [
          { id: 's1', name: 'A', actions: 'One Action', range: '30 feet' },
          { id: 's2', name: 'B', actions: 'Two Actions', range: '60 feet' },
        ]}}}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
        onTotalCostChange={onCostChange}
      />
    );
    expect(onCostChange).toHaveBeenCalledWith(2); // initial: 1+1
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 's2' } });
    expect(onCostChange).toHaveBeenCalledWith(3); // after change: 1+2
  });

  it('shows TargetRollResolver when spell resolves to actor-roll mode', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={enemyTargets}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByTestId('spell-resolver')).toBeInTheDocument();
  });

  it('getResults returns spellId, spellName, totalCost, and roll results', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={enemyTargets}
        conditions={[]}
        effects={[]}
      />
    );
    const res = ref.current.getResults();
    expect(res.spellName).toBe('Light');
    expect(res.totalCost).toBe(3); // 1+2
    expect(res.rollResults).toHaveLength(1);
    expect(res.rollResults[0]).toMatchObject({ name: 'Goblin', degree: 'success' });
  });

  it('getTotalCost returns the current total', () => {
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(ref.current.getTotalCost()).toBe(3); // Light (2) + parent (1)
  });

  it('shows empty-state when no qualifying spells', () => {
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [HEAL] } }}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByText(/No qualifying spells/i)).toBeInTheDocument();
  });
});
