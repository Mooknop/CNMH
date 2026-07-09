import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EldPowers from './EldPowers';
import { toGameSeconds } from '../../utils/gameTime';

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

vi.mock('../shared/ActionSymbol', () => ({
  default: function DummyActionSymbol({ actionText }) {
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

// Cooldown display reads the game clock + encounter; pin both so gate math is
// deterministic (the component renders fine without real providers).
// vi.hoisted: mock factories are hoisted above module consts.
const { CLOCK } = vi.hoisted(() => ({
  CLOCK: { gameDate: { year: 4725, month: 0, day: 1 }, time: { hour: 8, minute: 0 } },
}));
const NOW_SECS = toGameSeconds({ ...CLOCK.gameDate, ...CLOCK.time });

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => CLOCK,
}));

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: null }),
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
  // Attunement (cnmh_eldattune_<id>) and the frequency ledger (cnmh_freq_<id>)
  // fall back to localStorage with no SessionProvider — clear between tests.
  beforeEach(() => localStorage.clear());

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

  it('renders level-scaled dice in descriptions and degrees (#225)', () => {
    const sources = [
      makeSource('Forest', [
        makePower({
          description: 'dealing 2d10 (+1d10 per level) void damage.',
          degrees: { Failure: 'damage equal to 2 + half your level' },
        }),
      ]),
    ];
    render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={4} />);
    expect(screen.getByText('dealing 6d10 void damage.')).toBeInTheDocument();
    expect(screen.getByText('damage equal to 4')).toBeInTheDocument();
    expect(screen.queryByText(/per level/)).toBeNull();
  });

  describe('Use button (frequency-gated, #218; attunement-gated, #225)', () => {
    const character = { id: 'char-izzy', name: 'Izzy' };
    const attuneTo = (source) =>
      localStorage.setItem('cnmh_eldattune_char-izzy', JSON.stringify(source));

    it('renders a Use button per power when character is provided', () => {
      attuneTo('Forest');
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
      attuneTo('Forest');
      const sources = [makeSource('Forest', [makePower({ name: 'Wind Gust' })])];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      fireEvent.click(screen.getByText('Use'));
      expect(screen.getByTestId('use-ability-modal')).toHaveTextContent('Use: Wind Gust (hour/1)');
    });

    it('disables Use when no source is attuned, with a hint', () => {
      const sources = [makeSource('Forest', [makePower({ name: 'Wind Gust' })])];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      expect(screen.getByText('Use')).toBeDisabled();
      expect(
        screen.getByText('No source attuned. Choose one at daily preparations.')
      ).toBeInTheDocument();
    });

    it('disables Use while browsing a non-attuned source', () => {
      attuneTo('Forest');
      const sources = [
        makeSource('Forest', [makePower({ name: 'Forest Power' })]),
        makeSource('River', [makePower({ name: 'River Power' })]),
      ];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'River' } });
      expect(screen.getByText('Use')).toBeDisabled();
      expect(
        screen.getByText('Browsing — only Forest powers can be used today.')
      ).toBeInTheDocument();
    });

    it('shows a ready-at cooldown note for a power used within the hour', () => {
      attuneTo('Forest');
      // Ledger key is the power-name slug; a use 10 minutes ago locks it for
      // the next 50 minutes of game time.
      localStorage.setItem(
        'cnmh_freq_char-izzy',
        JSON.stringify({
          'wind-gust': [{ gameSecs: NOW_SECS - 600, realTs: Date.now(), per: 'hour' }],
        })
      );
      const sources = [makeSource('Forest', [makePower({ name: 'Wind Gust' })])];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      expect(screen.getByText(/On cooldown — ready at/)).toBeInTheDocument();
    });

    it('shows no cooldown note for an unused power', () => {
      attuneTo('Forest');
      const sources = [makeSource('Forest', [makePower({ name: 'Wind Gust' })])];
      render(
        <EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />
      );
      expect(screen.queryByText(/On cooldown/)).toBeNull();
    });
  });

  describe('attunement (#219/#225: daily-prep choice, browse-only dropdown)', () => {
    const character = { id: 'char-izzy', name: 'Izzy' };

    it('does NOT write the synced attunement when browsing', () => {
      const sources = [
        makeSource('Forest', [makePower({ name: 'Forest Power' })]),
        makeSource('River', [makePower({ name: 'River Power' })]),
      ];
      render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'River' } });
      expect(localStorage.getItem('cnmh_eldattune_char-izzy')).toBeNull();
    });

    it('follows a stored attunement and marks it in the dropdown', () => {
      localStorage.setItem('cnmh_eldattune_char-izzy', JSON.stringify('River'));
      const sources = [
        makeSource('Forest', [makePower({ name: 'Forest Power' })]),
        makeSource('River', [makePower({ name: 'River Power' })]),
      ];
      render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />);
      expect(screen.getByRole('combobox')).toHaveValue('River');
      expect(screen.getByText('River Power')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'River (attuned)' })).toBeInTheDocument();
      expect(screen.getByText('Attuned')).toBeInTheDocument();
    });

    it('shows the attuned-elsewhere chip while browsing another source', () => {
      localStorage.setItem('cnmh_eldattune_char-izzy', JSON.stringify('Forest'));
      const sources = [
        makeSource('Forest', [makePower({ name: 'Forest Power' })]),
        makeSource('River', [makePower({ name: 'River Power' })]),
      ];
      render(<EldPowers eldPowers={sources} themeColor="#4a90d9" characterLevel={5} character={character} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'River' } });
      expect(screen.getByText('Attuned: Forest')).toBeInTheDocument();
    });
  });
});
