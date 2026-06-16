import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ActionGrid from './ActionGrid';

const mockUseCharacter = vi.fn();
vi.mock('../../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

const mockUseFocusTarget = vi.fn();
vi.mock('../../../hooks/useFocusTarget', () => ({
  useFocusTarget: (...args) => mockUseFocusTarget(...args),
}));

const mockUseTurnState = vi.fn();
vi.mock('../../../hooks/useTurnState', () => ({
  useTurnState: (...args) => mockUseTurnState(...args),
}));

vi.mock('../../actions/ThaumaturgeExploitsDisplay', () => ({
  default: () => <div data-testid="thaumaturge-exploits" />,
}));

const baseModel = (overrides = {}) => ({
  actions: [],
  strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4' }],
  reactions: [],
  freeActions: [],
  flags: { isThaumaturge: false },
  thaumaturge: null,
  ...overrides,
});

const character = { id: 'p1', name: 'Hero' };

describe('ActionGrid', () => {
  beforeEach(() => {
    mockUseCharacter.mockReturnValue(baseModel());
    mockUseFocusTarget.mockReturnValue({ focusEnemy: null });
    mockUseTurnState.mockReturnValue({ turnState: { actionsSpent: 0 } });
  });

  it('renders cost-group headers and a strike tile', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '1 Action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Longsword' })).toBeInTheDocument();
  });

  it('renders filter chips including All and Attack', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Attack' })).toBeInTheDocument();
  });

  it('filtering by Move hides the strike but keeps Stride', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Move' }));
    expect(screen.queryByRole('button', { name: 'Longsword' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stride' })).toBeInTheDocument();
  });

  it('search narrows tiles by name', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search actions'), { target: { value: 'longsword' } });
    expect(screen.getByRole('button', { name: 'Longsword' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stride' })).not.toBeInTheDocument();
  });

  it('shows an empty message when nothing matches', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search actions'), { target: { value: 'zzzzz' } });
    expect(screen.getByText('No actions match.')).toBeInTheDocument();
  });

  it('tapping a tile calls onUse directly with the raw action + cost (no detail modal)', () => {
    const onUse = vi.fn();
    render(<ActionGrid character={character} encounterMode onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Longsword' }), 1);
    expect(screen.queryByTestId('action-detail-modal')).not.toBeInTheDocument();
  });

  it('shows the Magic launcher only when onMagicOpen is provided', () => {
    const onMagicOpen = vi.fn();
    const { rerender } = render(<ActionGrid character={character} onUse={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Cast a Spell/ })).not.toBeInTheDocument();

    rerender(<ActionGrid character={character} onUse={vi.fn()} onMagicOpen={onMagicOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Cast a Spell/ }));
    expect(onMagicOpen).toHaveBeenCalled();
  });

  it('the Magic filter shows only the launcher, hiding cost groups', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} onMagicOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Magic' }));
    expect(screen.getByRole('button', { name: /Cast a Spell/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '1 Action' })).not.toBeInTheDocument();
  });

  it('renders Thaumaturge exploits for a thaumaturge', () => {
    mockUseCharacter.mockReturnValue(baseModel({ flags: { isThaumaturge: true }, thaumaturge: { implements: [] } }));
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    expect(screen.getByTestId('thaumaturge-exploits')).toBeInTheDocument();
  });

  it('dims a target-needing tile with a "Tap a foe" hint when in encounter with no focus', () => {
    // No focus is set (default), so the strike tile (needsTarget) shows the cue
    // instead of its stat line — but stays tappable.
    render(<ActionGrid character={character} encounterMode onUse={vi.fn()} />);
    const tile = screen.getByRole('button', { name: 'Longsword' });
    expect(within(tile).getByText('Tap a foe to target')).toBeInTheDocument();
    expect(within(tile).queryByText('+9 · 1d8+4')).not.toBeInTheDocument();
  });

  // ── Right Now shortlist (#413) ─────────────────────────────────────────────

  it('renders the Right Now shortlist in encounter mode', () => {
    render(<ActionGrid character={character} encounterMode onUse={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'Right now' });
    // With no focus the shortlist surfaces move/defense basics (e.g. Stride).
    expect(within(region).getByRole('button', { name: 'Stride' })).toBeInTheDocument();
  });

  it('hides the Right Now shortlist out of encounter', () => {
    render(<ActionGrid character={character} onUse={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Right now' })).not.toBeInTheDocument();
  });

  it('hides the Right Now shortlist when no actions remain', () => {
    mockUseTurnState.mockReturnValue({ turnState: { actionsSpent: 3 } });
    render(<ActionGrid character={character} encounterMode onUse={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Right now' })).not.toBeInTheDocument();
  });

  it('with a focused foe, a strike surfaces in Right Now and tapping it calls onUse', () => {
    mockUseFocusTarget.mockReturnValue({
      focusEnemy: { entryId: 'e1', kind: 'enemy', name: 'Goblin' },
    });
    const onUse = vi.fn();
    render(<ActionGrid character={character} encounterMode onUse={onUse} />);
    const region = screen.getByRole('region', { name: 'Right now' });
    fireEvent.click(within(region).getByRole('button', { name: 'Longsword' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Longsword' }), 1);
  });

  // ── Reactions & Free group (#424) ──────────────────────────────────────────

  it('renders a Reactions & Free group and routes taps with the reaction/free cost', () => {
    mockUseCharacter.mockReturnValue(baseModel({
      reactions: [{ name: 'Shield Block', traits: [] }],
      freeActions: [{ name: 'Quick Draw', traits: [] }],
    }));
    const onUse = vi.fn();
    render(<ActionGrid character={character} encounterMode onUse={onUse} />);
    const group = screen.getByRole('region', { name: 'Reactions & Free' });

    fireEvent.click(within(group).getByRole('button', { name: 'Shield Block' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shield Block' }), 'reaction');

    fireEvent.click(within(group).getByRole('button', { name: 'Quick Draw' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Quick Draw' }), 'free');
  });
});
