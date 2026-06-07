import React from 'react';
import { render, screen } from '@testing-library/react';
import PartyPanel from './PartyPanel';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../utils/CharacterUtils', () => ({
  getCharacterColor: (i) => ['#c03030', '#3060c0', '#30a060'][i % 3],
}));

import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';

// ─── fixtures ────────────────────────────────────────────────
const THORN   = { id: 'thorn',   name: 'Thorn',   maxHp: 50 };
const PELLIAS = { id: 'pellias', name: 'Pellias',  maxHp: 40 };

const FULL_HP  = (c) => ({ current: c.maxHp, max: c.maxHp, temp: 0, dying: 0, wounded: 0, doomed: 0 });
const makeHp   = (overrides) => ({ current: 30, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0, ...overrides });

afterEach(() => vi.restoreAllMocks());

// Default: two characters, full HP for each
beforeEach(() => {
  useContent.mockReturnValue({ characters: [THORN, PELLIAS] });
  useSyncedState.mockImplementation((key) => {
    if (key === 'cnmh_hp_thorn')   return [FULL_HP(THORN),   vi.fn()];
    if (key === 'cnmh_hp_pellias') return [FULL_HP(PELLIAS),  vi.fn()];
    return [null, vi.fn()];
  });
});

// ─── tests ───────────────────────────────────────────────────
describe('PartyPanel', () => {
  it('renders a row per character', () => {
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toBeInTheDocument();
    expect(screen.getByTestId('party-row-pellias')).toBeInTheDocument();
  });

  it('shows current/max HP for each character', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn')   return [makeHp({ current: 32, max: 50 }), vi.fn()];
      if (key === 'cnmh_hp_pellias') return [makeHp({ current: 18, max: 40 }), vi.fn()];
      return [null, vi.fn()];
    });
    render(<PartyPanel />);
    expect(screen.getByLabelText('hp-thorn').textContent).toBe('32/50');
    expect(screen.getByLabelText('hp-pellias').textContent).toBe('18/40');
  });

  it('shows temp HP alongside current/max', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 50, max: 50, temp: 8 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    const hpEl = screen.getByLabelText('hp-thorn');
    expect(hpEl.textContent).toContain('+8');
  });

  it('shows a Dying badge when dying > 0', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 0, max: 50, dying: 2 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    expect(screen.getByLabelText('dying-thorn')).toHaveTextContent('Dying 2');
    expect(screen.queryByLabelText('dying-pellias')).not.toBeInTheDocument();
  });

  it('shows a Wounded badge when wounded > 0 and not dying', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 30, max: 50, wounded: 1 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    expect(screen.getByLabelText('wounded-thorn')).toHaveTextContent('Wounded 1');
  });

  it('suppresses the Wounded badge when also dying', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 0, max: 50, dying: 1, wounded: 1 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    // Only the Dying badge — not both
    expect(screen.getByLabelText('dying-thorn')).toBeInTheDocument();
    expect(screen.queryByLabelText('wounded-thorn')).not.toBeInTheDocument();
  });

  it('marks the row data-status="dead" when current HP is 0', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 0, max: 50 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toHaveAttribute('data-status', 'dead');
    expect(screen.getByTestId('party-row-pellias')).toHaveAttribute('data-status', 'full');
  });

  it('marks the row data-status="critical" at ≤25% HP', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 12, max: 50 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toHaveAttribute('data-status', 'critical');
  });

  it('marks the row data-status="low" at ≤50% HP', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 25, max: 50 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toHaveAttribute('data-status', 'low');
  });

  it('applies the per-character accent colour via --x-theme', () => {
    render(<PartyPanel />);
    const thornRow = screen.getByTestId('party-row-thorn');
    expect(thornRow.style.getPropertyValue('--x-theme')).toBe('#c03030');
    const pelliasRow = screen.getByTestId('party-row-pellias');
    expect(pelliasRow.style.getPropertyValue('--x-theme')).toBe('#3060c0');
  });

  it('shows a placeholder when the roster is empty', () => {
    useContent.mockReturnValue({ characters: [] });
    render(<PartyPanel />);
    expect(screen.getByText(/No characters in the roster yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'party-roster' })).not.toBeInTheDocument();
  });

  it('shows a placeholder when characters is undefined', () => {
    useContent.mockReturnValue({});
    render(<PartyPanel />);
    expect(screen.getByText(/No characters in the roster yet/i)).toBeInTheDocument();
  });

  it('sets --hp-pct based on current/max ratio', () => {
    useSyncedState.mockImplementation((key) => {
      if (key === 'cnmh_hp_thorn') return [makeHp({ current: 25, max: 50 }), vi.fn()];
      return [FULL_HP(PELLIAS), vi.fn()];
    });
    render(<PartyPanel />);
    const thornRow = screen.getByTestId('party-row-thorn');
    expect(thornRow.style.getPropertyValue('--hp-pct')).toBe('50%');
  });
});
