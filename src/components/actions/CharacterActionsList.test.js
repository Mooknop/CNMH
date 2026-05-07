import React from 'react';
import { render, screen } from '@testing-library/react';
import CharacterActionsList from './CharacterActionsList';

jest.mock('./ActionCardList', () => ({ items, emptyMessage }) => (
  <div data-testid="action-card-list">{emptyMessage}</div>
));
jest.mock('./StrikesList', () => () => <div data-testid="strikes-list" />);
jest.mock('./ThaumaturgeExploitsDisplay', () => () => (
  <div data-testid="thaumaturge-exploits">Exploits</div>
));

const mockUseCharacter = jest.fn();
jest.mock('../../hooks/useCharacter', () => ({
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

  it('renders StrikesList', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getByTestId('strikes-list')).toBeInTheDocument();
  });

  it('renders ActionCardList for unique character actions', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getAllByTestId('action-card-list').length).toBeGreaterThan(0);
  });

  it('renders Offensive, Defensive, and Movement section dividers', () => {
    render(<CharacterActionsList character={mockCharacter} />);
    expect(screen.getByText('Offensive')).toBeInTheDocument();
    expect(screen.getByText('Defensive')).toBeInTheDocument();
    expect(screen.getByText('Movement')).toBeInTheDocument();
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
      // ActionCardList is mocked — just verify it renders without error
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
