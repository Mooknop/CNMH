import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SpellsSegment from './SpellsSegment';

const mockUseCharacter = vi.fn();
vi.mock('../../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

// Focus entries are catalog refs (#622) — the segment resolves them here.
vi.mock('../../../contexts/ContentContext', () => ({
  useContent: () => ({ spells: [{ id: 'counter-performance', name: 'Counter Performance', level: 1 }] }),
}));

const mockUseCastingResources = vi.fn();
vi.mock('../../../hooks/useCastingResources', () => ({
  useCastingResources: (...args) => mockUseCastingResources(...args),
}));

const mockMakeOnCast = vi.fn();
const mockUseSpellCastFlow = vi.fn();
vi.mock('../../../hooks/useSpellCastFlow', () => ({
  useSpellCastFlow: (...args) => mockUseSpellCastFlow(...args),
}));

// SpellCard drags in TraitContext + the detail modal — a stub with a direct
// cast button keeps the wiring observable.
vi.mock('../../spells/SpellCard', () => ({
  default: ({ spell, onCast }) => (
    <div data-testid="spell-card">
      <span>{spell.name}</span>
      {onCast && <button onClick={() => onCast(spell, 2)}>{`cast-${spell.name}`}</button>}
    </div>
  ),
}));

vi.mock('../CastSpellModal', () => ({
  default: ({ spell }) => <div data-testid="cast-spell-modal">{spell.name}</div>,
}));

const daze = { id: 'daze', name: 'Daze', level: 0 };
const fear = { id: 'fear', name: 'Fear', level: 1 };
const mirror = { id: 'mirror-image', name: 'Mirror Image', level: 2 };

// A bard-flavored caster: 2 cantrips' worth of repertoire, rank 1+2 slots,
// a composition focus spell, and a 2-point focus pool.
const bard = {
  id: 'izzy',
  name: 'Izzy',
  class: 'Bard',
  spellcasting: { focus: { max: 2, current: 2 } },
  focus_spells: [{ spellRef: 'counter-performance' }],
};
const model = (overrides = {}) => ({
  spellcasting: { spells: [daze, fear, mirror] },
  spellSlotTotals: { 1: 3, 2: 2 },
  level: 4,
  flags: {},
  ...overrides,
});

describe('SpellsSegment', () => {
  beforeEach(() => {
    mockUseCharacter.mockReturnValue(model());
    mockUseCastingResources.mockReturnValue({
      slots: { remainingFor: (r) => (r === 1 ? 2 : 1), totals: { 1: 3, 2: 2 } },
      focus: { max: 2, remaining: 1 },
    });
    mockMakeOnCast.mockReset();
    mockMakeOnCast.mockImplementation((source) => (spell, cost) => mockMakeOnCast.lastCast = { source, spell, cost });
    mockUseSpellCastFlow.mockReturnValue({
      isMyTurn: true,
      makeOnCast: mockMakeOnCast,
      castRequest: null,
      clearCast: vi.fn(),
    });
  });

  it('renders the resource bar with focus + per-rank slot pips', () => {
    render(<SpellsSegment character={bard} />);
    const bar = screen.getByRole('group', { name: 'Casting resources' });
    expect(within(bar).getByRole('img', { name: 'Focus points: 1 of 2 remaining' })).toBeInTheDocument();
    expect(within(bar).getByRole('img', { name: 'Rank 1 slots: 2 of 3 remaining' })).toBeInTheDocument();
    expect(within(bar).getByRole('img', { name: 'Rank 2 slots: 1 of 2 remaining' })).toBeInTheDocument();
    expect(within(bar).getByText('1st')).toBeInTheDocument();
    expect(within(bar).getByText('2nd')).toBeInTheDocument();
  });

  it('groups Cantrips (at will) → Focus → ranks, with slot pips on rank headers', () => {
    render(<SpellsSegment character={bard} />);
    const cantrips = screen.getByRole('region', { name: 'Cantrips' });
    expect(within(cantrips).getByText('Daze')).toBeInTheDocument();
    expect(within(cantrips).getByText('at will')).toBeInTheDocument();

    // Bard focus pool → "Compositions" group with its own pips.
    const focus = screen.getByRole('region', { name: 'Compositions' });
    expect(within(focus).getByText('Counter Performance')).toBeInTheDocument();

    const rank1 = screen.getByRole('region', { name: 'Rank 1' });
    expect(within(rank1).getByText('Fear')).toBeInTheDocument();
    expect(within(rank1).getByRole('img', { name: 'Rank 1 slots: 2 of 3 remaining' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Rank 2' })).getByText('Mirror Image')).toBeInTheDocument();
  });

  it('routes casts through the per-source cast flow (slot vs focus)', () => {
    render(<SpellsSegment character={bard} />);
    fireEvent.click(screen.getByRole('button', { name: 'cast-Fear' }));
    expect(mockMakeOnCast.lastCast).toMatchObject({ source: 'slot', spell: { name: 'Fear' } });
    fireEvent.click(screen.getByRole('button', { name: 'cast-Counter Performance' }));
    expect(mockMakeOnCast.lastCast).toMatchObject({ source: 'focus', spell: { name: 'Counter Performance' } });
  });

  it('hosts the cast resolver when a cast is pending', () => {
    mockUseSpellCastFlow.mockReturnValue({
      isMyTurn: true,
      makeOnCast: mockMakeOnCast,
      castRequest: { spell: fear, cost: 2, source: 'slot' },
      clearCast: vi.fn(),
    });
    render(<SpellsSegment character={bard} />);
    expect(screen.getByTestId('cast-spell-modal')).toHaveTextContent('Fear');
  });

  it('keeps the full spellbook one tap away under the "Cast a Spell" name', () => {
    const onMagicOpen = vi.fn();
    render(<SpellsSegment character={bard} onMagicOpen={onMagicOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cast a Spell' }));
    expect(onMagicOpen).toHaveBeenCalled();
  });

  it('falls back to the full launcher for items-only magic (no repertoire, no focus)', () => {
    mockUseCharacter.mockReturnValue(model({ spellcasting: { spells: [] }, spellSlotTotals: {}, flags: { hasScrolls: true } }));
    const onMagicOpen = vi.fn();
    render(<SpellsSegment character={{ id: 'ashka', name: 'Ashka' }} onMagicOpen={onMagicOpen} />);
    expect(screen.queryByTestId('spell-card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cast a Spell' }));
    expect(onMagicOpen).toHaveBeenCalled();
  });
});
