import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SpellFilters from './SpellFilters';

vi.mock('../../utils/SpellUtils', () => ({
  formatSpellRank: (rank) => rank === 'all' ? 'All' : `Rank ${rank}`,
}));

describe('SpellFilters', () => {
  const defaultProps = {
    rankList: [],
    activeSpellRank: 'all',
    setActiveSpellRank: vi.fn(),
    defenseTypes: [],
    defenseFilter: 'all',
    setDefenseFilter: vi.fn(),
    themeColor: '#ff0000',
  };

  it('renders container', () => {
    const { container } = render(<SpellFilters {...defaultProps} />);
    expect(container.querySelector('.spell-filters-container')).toBeInTheDocument();
  });

  it('renders no filter buttons when rankList and defenseTypes have 2 or fewer items', () => {
    render(<SpellFilters {...defaultProps} rankList={['all', 1]} defenseTypes={['all', 'fortitude']} />);
    expect(screen.queryByText('Spell Rank:')).not.toBeInTheDocument();
  });

  it('renders rank filter when rankList has more than 2 items', () => {
    render(
      <SpellFilters
        {...defaultProps}
        rankList={['all', 1, 2, 3]}
        defenseTypes={[]}
      />
    );
    expect(screen.getByText('Spell Rank:')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Rank 1')).toBeInTheDocument();
  });

  it('calls setActiveSpellRank when rank button clicked', () => {
    const setActiveSpellRank = vi.fn();
    render(
      <SpellFilters
        {...defaultProps}
        rankList={['all', 1, 2, 3]}
        defenseTypes={[]}
        setActiveSpellRank={setActiveSpellRank}
      />
    );
    fireEvent.click(screen.getByText('Rank 1'));
    expect(setActiveSpellRank).toHaveBeenCalledWith(1);
  });

  it('renders defense filter when defenseTypes has more than 2 items', () => {
    render(
      <SpellFilters
        {...defaultProps}
        rankList={[]}
        defenseTypes={['all', 'fortitude', 'reflex', 'will']}
      />
    );
    expect(screen.getByText('Defense:')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('fortitude')).toBeInTheDocument();
  });

  it('renders None label for none defense type', () => {
    render(
      <SpellFilters
        {...defaultProps}
        rankList={[]}
        defenseTypes={['all', 'none', 'fortitude']}
      />
    );
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('calls setDefenseFilter when defense button clicked', () => {
    const setDefenseFilter = vi.fn();
    render(
      <SpellFilters
        {...defaultProps}
        rankList={[]}
        defenseTypes={['all', 'fortitude', 'reflex', 'will']}
        setDefenseFilter={setDefenseFilter}
      />
    );
    fireEvent.click(screen.getByText('fortitude'));
    expect(setDefenseFilter).toHaveBeenCalledWith('fortitude');
  });

  it('marks active rank button', () => {
    render(
      <SpellFilters
        {...defaultProps}
        rankList={['all', 1, 2, 3]}
        defenseTypes={[]}
        activeSpellRank={1}
      />
    );
    const btn = screen.getByText('Rank 1');
    expect(btn.className).toContain('active');
  });
});
