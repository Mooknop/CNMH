import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChainedSpellSection from './ChainedSpellSection';
import { resolveActionRoll } from '../../utils/rollResolution';

vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: vi.fn(),
}));
vi.mock('../../utils/defense', () => ({
  DEFENSE_LABELS: { ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' },
  DEFENSE_OPTIONS: [{ value: 'ac', label: 'AC' }],
  defenseDC: vi.fn(() => 15),
}));
vi.mock('./TargetRollResolver', () => {
  const { forwardRef, useImperativeHandle } = require('react');
   
  return { default: forwardRef(({ enemyTargets, rollBonus }, ref) => {
    useImperativeHandle(ref, () => ({
      getResults: () => enemyTargets.map((e) => ({
        entryId: e.entryId, name: e.name, dc: 15, total: (rollBonus || 0) + 10, degree: 'success',
      })),
    }));
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'spell-resolver' }, `bonus=${rollBonus}`);
  }) };
});


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
afterEach(() => vi.clearAllMocks());

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
    const onCostChange = vi.fn();
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

// Rank picking + heightening for chained casts (#235). The resources prop is
// the parent's useCastingResources instance; stubbed here.
describe('ChainedSpellSection rank picker', () => {
  const SIGNATURE = {
    id: 'fear', name: 'Fear', actions: 'Two Actions', range: '30 feet',
    level: 1, signature: true,
    heightened: { '3rd': 'You can target up to five creatures.' },
  };
  const NATIVE_ONLY = {
    id: 'mage-armor', name: 'Mage Armor', actions: 'Two Actions', range: '30 feet', level: 1,
  };
  const CANTRIP = {
    id: 'detect-magic', name: 'Detect Magic', actions: 'Two Actions', range: '30 feet', level: 0,
  };

  const signatureOptions = [
    { type: 'slot', rank: 1, label: 'Rank 1 slot (2 left)', enabled: true },
    { type: 'slot', rank: 2, label: 'Rank 2 slot (1 left)', enabled: true },
    { type: 'slot', rank: 3, label: 'Rank 3 slot (0 left)', enabled: false, reason: 'No rank-3 slots remaining' },
  ];

  const makeResources = (optionsBySpellId) => ({
    optionsFor: vi.fn((spell) => optionsBySpellId[spell.id] || []),
    spend: vi.fn(() => ({ ok: true, label: 'rank 1 slot' })),
  });

  const renderWithResources = (spells, resources, ref) =>
    render(
      <ChainedSpellSection
        ref={ref}
        character={{ ...character, spellcasting: { spells } }}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
        resources={resources}
      />
    );

  it('renders one radio per rank option for a signature spell', () => {
    renderWithResources([SIGNATURE], makeResources({ fear: signatureOptions }));
    const group = screen.getByRole('radiogroup', { name: /chained casting source/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByText('Rank 1 slot (2 left)')).toBeInTheDocument();
    expect(screen.getByText('Rank 2 slot (1 left)')).toBeInTheDocument();
    expect(screen.getByText('Rank 3 slot (0 left)')).toBeInTheDocument();
  });

  it('getResults carries the chosen option and rank; spellRank stays native', () => {
    const ref = createRef();
    renderWithResources([SIGNATURE], makeResources({ fear: signatureOptions }), ref);
    fireEvent.click(screen.getByRole('radio', { name: /rank 2 slot/i }));
    const res = ref.current.getResults();
    expect(res.castOption).toMatchObject({ type: 'slot', rank: 2 });
    expect(res.castRank).toBe(2);
    expect(res.spellRank).toBe(1);
  });

  it('shows heightened text only above native rank', () => {
    renderWithResources([SIGNATURE], makeResources({ fear: signatureOptions }));
    // default = rank 1 (native) → no heightened block
    expect(screen.queryByText(/target up to five creatures/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /rank 3 slot/i }));
    expect(screen.getByText(/target up to five creatures/)).toBeInTheDocument();
  });

  it('non-signature spell shows a single cost line, no radio group', () => {
    const ref = createRef();
    const resources = makeResources({
      'mage-armor': [{ type: 'slot', rank: 1, label: 'Rank 1 slot (2 left)', enabled: true }],
    });
    renderWithResources([NATIVE_ONLY], resources, ref);
    expect(screen.queryByRole('radiogroup', { name: /chained casting source/i })).not.toBeInTheDocument();
    expect(screen.getByText('Rank 1 slot (2 left)')).toBeInTheDocument();
    expect(ref.current.getResults().castRank).toBe(1);
  });

  it('cantrip shows the free label and no rank in results', () => {
    const ref = createRef();
    const resources = makeResources({
      'detect-magic': [{ type: 'cantrip', label: 'Cantrip — no cost', enabled: true }],
    });
    renderWithResources([CANTRIP], resources, ref);
    expect(screen.getByText('Cantrip — no cost')).toBeInTheDocument();
    const res = ref.current.getResults();
    expect(res.castOption).toMatchObject({ type: 'cantrip' });
    expect(res.castRank).toBe(0);
  });

  it('without the resources prop getResults reports no cast option', () => {
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={{ ...character, spellcasting: { spells: [SIGNATURE] } }}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.queryByRole('radiogroup', { name: /chained casting source/i })).not.toBeInTheDocument();
    const res = ref.current.getResults();
    expect(res.castOption).toBeNull();
    expect(res.castRank).toBe(1);
  });

  it('switching spells resets the rank choice to the default option', () => {
    const ref = createRef();
    const resources = makeResources({
      fear: signatureOptions,
      'mage-armor': [{ type: 'slot', rank: 1, label: 'Rank 1 slot (2 left)', enabled: true }],
    });
    renderWithResources([SIGNATURE, NATIVE_ONLY], resources, ref);
    fireEvent.click(screen.getByRole('radio', { name: /rank 2 slot/i }));
    expect(ref.current.getResults().castRank).toBe(2);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'mage-armor' } });
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'fear' } });
    expect(ref.current.getResults().castRank).toBe(1); // back to first enabled
  });
});
