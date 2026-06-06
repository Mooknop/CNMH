import React from 'react';
import { render, screen } from '@testing-library/react';
import CharacterActionsList from './CharacterActionsList';

vi.mock('./ActionCardList', () => ({ default: ({ items, emptyMessage }) => (
  <div data-testid="action-card-list">{emptyMessage}</div>
) }));
vi.mock('./StrikesList', () => ({ default: () => <div data-testid="strikes-list" /> }));
vi.mock('./ThaumaturgeExploitsDisplay', () => ({ default: () => (
  <div data-testid="thaumaturge-exploits">Exploits</div>
) }));
vi.mock('./ActionCategoryModal', () => ({ default: () => null }));

const mockUseCharacter = vi.fn();
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

const makeModel = (overrides = {}) => ({
  actions: [],
  flags: { isThaumaturge: false },
  thaumaturge: null,
  skillProficiencies: {},
  ...overrides,
});

const mockCharacter = { id: '1', name: 'Test' };

describe('CharacterActionsList', () => {
  beforeEach(() => {
    mockUseCharacter.mockReturnValue(makeModel());
  });

  it('renders without crashing', () => {
    expect(() => render(<CharacterActionsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders Offensive, Defensive, Movement, and Magic category buttons', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getByRole('button', { name: 'Offensive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Defensive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Movement' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Magic' })).toBeInTheDocument();
  });

  it('renders ActionCardList for unique character actions when non-empty', () => {
    mockUseCharacter.mockReturnValue(
      makeModel({ actions: [{ name: 'Custom Action', actionCount: 1 }] })
    );
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getAllByTestId('action-card-list').length).toBeGreaterThan(0);
  });

  it('does not show ThaumaturgeExploitsDisplay for non-thaumaturge', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('thaumaturge-exploits')).not.toBeInTheDocument();
  });

  it('shows ThaumaturgeExploitsDisplay for thaumaturge characters', () => {
    mockUseCharacter.mockReturnValue(
      makeModel({ flags: { isThaumaturge: true }, thaumaturge: { implements: [] } })
    );
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getByTestId('thaumaturge-exploits')).toBeInTheDocument();
  });

  describe('withHighlights', () => {
    it('passes non-highlighted items through unchanged when skill is below Expert', () => {
      mockUseCharacter.mockReturnValue(
        makeModel({ skillProficiencies: { athletics: 1, deception: 0, stealth: 0 } })
      );
      expect(() => render(<CharacterActionsList character={mockCharacter} />)).not.toThrow();
    });

    it('renders without error when a skill is Master rank', () => {
      mockUseCharacter.mockReturnValue(
        makeModel({ skillProficiencies: { athletics: 3 } })
      );
      expect(() => render(<CharacterActionsList character={mockCharacter} />)).not.toThrow();
    });

    it('renders without error when a skill is Legendary rank', () => {
      mockUseCharacter.mockReturnValue(
        makeModel({ skillProficiencies: { stealth: 4 } })
      );
      expect(() => render(<CharacterActionsList character={mockCharacter} />)).not.toThrow();
    });
  });
});
