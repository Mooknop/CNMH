import React from 'react';
import { render, screen } from '@testing-library/react';
import PartyPanel from './PartyPanel';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useCharacterLiveState', () => ({ useCharacterLiveState: vi.fn() }));
vi.mock('../../contexts/GameDateContext', () => ({ useGameDate: vi.fn() }));
vi.mock('../../utils/CharacterUtils', () => ({
  getCharacterColor: (i) => ['#c03030', '#3060c0', '#30a060'][i % 3],
}));

import { useContent } from '../../contexts/ContentContext';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { useGameDate } from '../../contexts/GameDateContext';
import { toGameSeconds } from '../../utils/gameTime';

// Fixed campaign clock → a stable nowSecs for cooldown/immunity math.
const CLOCK = { year: 4725, month: 5, day: 10, hour: 12, minute: 0, second: 0 };
const NOW = toGameSeconds(CLOCK);

// ─── fixtures ────────────────────────────────────────────────
const THORN   = { id: 'thorn',   name: 'Thorn',   maxHp: 50 };
const PELLIAS = { id: 'pellias', name: 'Pellias',  maxHp: 40,
  spellcasting: { spell_slots: { 1: 3, 2: 2 } } };

const FULL_HP = (c) => ({ current: c.maxHp, max: c.maxHp, temp: 0, dying: 0, wounded: 0, doomed: 0 });
const makeHp  = (overrides) => ({ current: 30, max: 50, temp: 0, dying: 0, wounded: 0, doomed: 0, ...overrides });

// Mock useCharacterLiveState off a per-id map of live-state objects.
const mockLiveState = (byId) => {
  useCharacterLiveState.mockImplementation((id) => ({
    liveState: byId[id] || {},
    refresh: vi.fn(),
  }));
};

afterEach(() => vi.restoreAllMocks());

// Default: two characters, full HP for each
beforeEach(() => {
  useContent.mockReturnValue({ characters: [THORN, PELLIAS] });
  useGameDate.mockReturnValue({
    gameDate: { year: CLOCK.year, month: CLOCK.month, day: CLOCK.day },
    time: { hour: CLOCK.hour, minute: CLOCK.minute, second: CLOCK.second },
  });
  mockLiveState({
    thorn:   { hp: FULL_HP(THORN) },
    pellias: { hp: FULL_HP(PELLIAS) },
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
    mockLiveState({
      thorn:   { hp: makeHp({ current: 32, max: 50 }) },
      pellias: { hp: makeHp({ current: 18, max: 40 }) },
    });
    render(<PartyPanel />);
    expect(screen.getByLabelText('hp-thorn').textContent).toBe('32/50');
    expect(screen.getByLabelText('hp-pellias').textContent).toBe('18/40');
  });

  it('falls back to the character maxHp when no hp state is synced', () => {
    mockLiveState({ thorn: {}, pellias: {} });
    render(<PartyPanel />);
    expect(screen.getByLabelText('hp-thorn').textContent).toBe('50/50');
    expect(screen.getByLabelText('hp-pellias').textContent).toBe('40/40');
  });

  it('shows temp HP alongside current/max', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 50, max: 50, temp: 8 }) } });
    render(<PartyPanel />);
    expect(screen.getByLabelText('hp-thorn').textContent).toContain('+8');
  });

  it('shows a Dying badge when dying > 0', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 0, max: 50, dying: 2 }) } });
    render(<PartyPanel />);
    expect(screen.getByLabelText('dying-thorn')).toHaveTextContent('Dying 2');
    expect(screen.queryByLabelText('dying-pellias')).not.toBeInTheDocument();
  });

  it('shows a Wounded badge when wounded > 0 and not dying', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 30, max: 50, wounded: 1 }) } });
    render(<PartyPanel />);
    expect(screen.getByLabelText('wounded-thorn')).toHaveTextContent('Wounded 1');
  });

  it('suppresses the Wounded badge when also dying', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 0, max: 50, dying: 1, wounded: 1 }) } });
    render(<PartyPanel />);
    expect(screen.getByLabelText('dying-thorn')).toBeInTheDocument();
    expect(screen.queryByLabelText('wounded-thorn')).not.toBeInTheDocument();
  });

  it('marks the row data-status="dead" when current HP is 0', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 0, max: 50 }) } });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toHaveAttribute('data-status', 'dead');
    expect(screen.getByTestId('party-row-pellias')).toHaveAttribute('data-status', 'full');
  });

  it('marks the row data-status="critical" at ≤25% HP', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 12, max: 50 }) } });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toHaveAttribute('data-status', 'critical');
  });

  it('marks the row data-status="low" at ≤50% HP', () => {
    mockLiveState({ thorn: { hp: makeHp({ current: 25, max: 50 }) } });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn')).toHaveAttribute('data-status', 'low');
  });

  it('applies the per-character accent colour via --x-theme', () => {
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn').style.getPropertyValue('--x-theme')).toBe('#c03030');
    expect(screen.getByTestId('party-row-pellias').style.getPropertyValue('--x-theme')).toBe('#3060c0');
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
    mockLiveState({ thorn: { hp: makeHp({ current: 25, max: 50 }) } });
    render(<PartyPanel />);
    expect(screen.getByTestId('party-row-thorn').style.getPropertyValue('--hp-pct')).toBe('50%');
  });

  // ── Resource chips (#230 slice 1) ──
  describe('resource chips', () => {
    it('renders a chip for each present resource key, formatted from the registry', () => {
      mockLiveState({
        thorn: { hp: FULL_HP(THORN), heropoints: 2, focus: 1 },
      });
      render(<PartyPanel />);
      const hero = screen.getByTestId('party-chip-thorn-heropoints');
      expect(hero).toHaveTextContent('Hero');
      expect(hero).toHaveTextContent('2');
      // focus has no max here (no class data) → "1 spent"
      expect(screen.getByTestId('party-chip-thorn-focus')).toHaveTextContent('1 spent');
    });

    it('formats spell slots as remaining/total using the character sheet', () => {
      mockLiveState({
        pellias: { hp: FULL_HP(PELLIAS), slots: { 1: 1 } },
      });
      render(<PartyPanel />);
      const slots = screen.getByTestId('party-chip-pellias-slots');
      expect(slots).toHaveTextContent('R1 2/3');
      expect(slots).toHaveTextContent('R2 2/2');
    });

    it('omits resource chips a character has no key for', () => {
      mockLiveState({ thorn: { hp: FULL_HP(THORN) } });
      render(<PartyPanel />);
      expect(screen.queryByTestId('party-chip-thorn-heropoints')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('resources-thorn')).not.toBeInTheDocument();
    });

    it('shows a reaction chip from turnstate and flags it spent', () => {
      mockLiveState({
        thorn:   { hp: FULL_HP(THORN), turnstate: { reactionSpent: true } },
        pellias: { hp: FULL_HP(PELLIAS), turnstate: { reactionSpent: false } },
      });
      render(<PartyPanel />);
      const spent = screen.getByTestId('party-chip-thorn-reaction');
      expect(spent).toHaveTextContent('spent');
      expect(spent).toHaveClass('is-spent');
      const ready = screen.getByTestId('party-chip-pellias-reaction');
      expect(ready).toHaveTextContent('ready');
      expect(ready).not.toHaveClass('is-spent');
    });
  });

  // ── Active-state pills (#230 slice 1) ──
  describe('active-state pills', () => {
    it('renders a pill for each active combat/class flag', () => {
      mockLiveState({
        thorn: {
          hp: FULL_HP(THORN),
          stance: { active: true, name: 'Mountain Stance' },
          huntprey: { targetName: 'Ogre' },
          eldattune: 'fire',
        },
      });
      render(<PartyPanel />);
      expect(screen.getByTestId('party-pill-thorn-stance')).toHaveTextContent('Mountain Stance');
      expect(screen.getByTestId('party-pill-thorn-huntprey')).toHaveTextContent('prey: Ogre');
      expect(screen.getByTestId('party-pill-thorn-eldattune')).toHaveTextContent('fire');
    });

    it('omits pills whose state is inactive/empty', () => {
      mockLiveState({
        thorn: {
          hp: FULL_HP(THORN),
          stance: { active: false, name: null },
          aura: { active: false },
          huntprey: null,
        },
      });
      render(<PartyPanel />);
      expect(screen.queryByTestId('party-pill-thorn-stance')).not.toBeInTheDocument();
      expect(screen.queryByTestId('party-pill-thorn-aura')).not.toBeInTheDocument();
      expect(screen.queryByTestId('party-pill-thorn-huntprey')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('state-thorn')).not.toBeInTheDocument();
    });
  });

  // ── Clock-derived cooldown/immunity timers (#230 slice 2) ──
  describe('clock-derived timers', () => {
    it('renders a cooldown ready-at derived from the freq ledger', () => {
      mockLiveState({
        thorn: { hp: FULL_HP(THORN), freq: { 'eld-flare': [{ per: 'hour', gameSecs: NOW - 600 }] } },
      });
      render(<PartyPanel />);
      const cd = screen.getByTestId('party-cooldown-thorn-eld-flare');
      expect(cd).toHaveTextContent('Eld Flare');
      expect(cd).toHaveTextContent('ready 12:50');
    });

    it('renders an immunity until-time from effects', () => {
      mockLiveState({
        thorn: {
          hp: FULL_HP(THORN),
          effects: [{ id: 'i1', effectId: 'treat-wounds-immunity', source: 'Battle Medicine', expireAtSecs: NOW + 3600 }],
        },
      });
      render(<PartyPanel />);
      const imm = screen.getByTestId('party-immunity-thorn-i1');
      expect(imm).toHaveTextContent('Immune: Battle Medicine');
      expect(imm).toHaveTextContent('until 13:00');
    });

    it('omits the timers list when nothing is on cooldown or immune', () => {
      mockLiveState({ thorn: { hp: FULL_HP(THORN) } });
      render(<PartyPanel />);
      expect(screen.queryByLabelText('timers-thorn')).not.toBeInTheDocument();
    });

    it('drops a cooldown whose window has already aged out', () => {
      mockLiveState({
        thorn: { hp: FULL_HP(THORN), freq: { 'eld-flare': [{ per: 'hour', gameSecs: NOW - 7200 }] } },
      });
      render(<PartyPanel />);
      expect(screen.queryByTestId('party-cooldown-thorn-eld-flare')).not.toBeInTheDocument();
    });
  });
});
