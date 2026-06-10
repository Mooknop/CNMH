import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EldPowers from './EldPowers';

vi.mock('../shared/CollapsibleCard', () => ({
  default: function DummyCollapsibleCard({ children, header }) {
    return (
      <div data-testid="collapsible-card">
        <div data-testid="card-header">{header}</div>
        <div data-testid="card-content">{children}</div>
      </div>
    );
  }
}));

vi.mock('../shared/TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name}</span>;
  }
}));

vi.mock('../shared/ActionIcon', () => ({
  default: function DummyActionIcon({ actionText }) {
    return <span data-testid="action-icon">{actionText}</span>;
  }
}));

vi.mock('../encounter/UseAbilityModal', () => ({
  default: function DummyUseAbilityModal({ isOpen, ability, verb }) {
    return isOpen ? (
      <div data-testid="use-ability-modal">
        {verb}: {ability.name} ({ability.frequencyRule?.per}/{ability.frequencyRule?.uses})
      </div>
    ) : null;
  }
}));

const makePower = (overrides = {}) => ({
  name: 'Power of Nature',
  description: 'Channel the wild.',
  ...overrides,
});

const makeSource = (source, powers, overrides = {}) => ({
  source,
  powers,
  ...overrides,
});

describe('EldPowers', () => {
  it('renders empty state when eldPowers is empty array', () => {
    render(<EldPowers eldPowers={[]} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByText('No Eld Powers available.')).toBeInTheDocument();
  });

  it('renders Eld Powers header', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getAllByText('Eld Powers').length).toBeGreaterThan(0);
  });

  it('renders source selector dropdown', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Forest')).toBeInTheDocument();
  });

  it('shows first source selected by default', () => {
    const sources = [
      makeSource('Forest', [makePower({ name: 'Forest Power' })]),
      makeSource('River', [makePower({ name: 'River Power' })]),
    ];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByRole('combobox')).toHaveValue('Forest');
    expect(screen.getByText('Forest Power')).toBeInTheDocument();
  });

  it('switches displayed source on dropdown change', () => {
    const sources = [
      makeSource('Forest', [makePower({ name: 'Forest Power' })]),
      makeSource('River', [makePower({ name: 'River Power' })]),
    ];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'River' } });
    expect(screen.getByText('River Power')).toBeInTheDocument();
    expect(screen.queryByText('Forest Power')).toBeNull();
  });

  it('renders special property section when currentSourceData.special is present', () => {
    const sources = [
      makeSource('Forest', [makePower()], {
        special: { name: 'Nature Bond', description: 'You bond with nature.' },
      }),
    ];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByText('Nature Bond')).toBeInTheDocument();
    expect(screen.getByText('You bond with nature.')).toBeInTheDocument();
  });

  it('does not render special property section when absent', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByText('Nature Bond')).toBeNull();
  });

  it('renders power cards for each power in selected source', () => {
    const sources = [
      makeSource('Forest', [
        makePower({ name: 'Wind Gust' }),
        makePower({ name: 'Stone Wall' }),
      ]),
    ];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByText('Wind Gust')).toBeInTheDocument();
    expect(screen.getByText('Stone Wall')).toBeInTheDocument();
  });

  it('renders power traits when power.traits is non-empty', () => {
    const sources = [makeSource('Forest', [makePower({ traits: ['Primal', 'Fire'] })])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    const tags = screen.getAllByTestId('trait-tag');
    const tagTexts = tags.map(t => t.textContent);
    expect(tagTexts).toContain('Primal');
    expect(tagTexts).toContain('Fire');
  });

  it('does not render traits section when power.traits is empty', () => {
    const sources = [makeSource('Forest', [makePower({ traits: [] })])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('does not render traits section when power.traits is absent', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByTestId('trait-tag')).toBeNull();
  });

  it('renders action icon when power.actions is present', () => {
    const sources = [makeSource('Forest', [makePower({ actions: 'Two Actions' })])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getAllByTestId('action-icon').length).toBeGreaterThan(0);
  });

  it('does not render action icon when power.actions is absent', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByTestId('action-icon')).toBeNull();
  });

  it('renders power range when present', () => {
    const sources = [makeSource('Forest', [makePower({ actions: '1', range: '30 feet' })])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByText('30 feet')).toBeInTheDocument();
  });

  it('does not render Range when power.range is absent', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByText('Range:')).toBeNull();
  });

  it('renders power area when present', () => {
    const sources = [makeSource('Forest', [makePower({ area: '15-foot cone' })])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByText('15-foot cone')).toBeInTheDocument();
  });

  it('does not render Area when power.area is absent', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByText('Area:')).toBeNull();
  });

  it('renders degrees of success when power.degrees is present', () => {
    const sources = [
      makeSource('Forest', [
        makePower({
          degrees: { Success: 'Good outcome.', Failure: 'Bad outcome.' },
        }),
      ]),
    ];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.getByText('Degrees of Success:')).toBeInTheDocument();
    expect(screen.getByText('Good outcome.')).toBeInTheDocument();
    expect(screen.getByText('Bad outcome.')).toBeInTheDocument();
  });

  it('does not render degrees section when power.degrees is absent', () => {
    const sources = [makeSource('Forest', [makePower()])];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
    expect(screen.queryByText('Degrees of Success:')).toBeNull();
  });

  describe('Use button (frequency-gated, #218)', () => {
    const character = { id: 'char-izzy', name: 'Izzy' };

    it('renders a Use button per power when character is provided', () => {
      const sources = [
        makeSource('Forest', [
          makePower({ name: 'Wind Gust' }),
          makePower({ name: 'Stone Wall' }),
        ]),
      ];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      expect(screen.getAllByText('Use')).toHaveLength(2);
    });

    it('hides Use buttons without a character (display-only contexts)', () => {
      const sources = [makeSource('Forest', [makePower()])];
      render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} />);
      expect(screen.queryByText('Use')).toBeNull();
    });

    it('opens the use modal with the once-per-hour rule injected', () => {
      const sources = [makeSource('Forest', [makePower({ name: 'Wind Gust' })])];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      fireEvent.click(screen.getByText('Use'));
      expect(screen.getByTestId('use-ability-modal')).toHaveTextContent('Use: Wind Gust (hour/1)');
    });
  });
});
