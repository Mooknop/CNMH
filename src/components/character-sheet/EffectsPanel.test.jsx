import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockRemoveEffect = vi.fn();
const mockEffects = { effects: [], removeEffect: mockRemoveEffect };

vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => mockEffects,
}));

// pf2eEffects exports a default catalog array plus a named getEffect helper.
vi.mock('../../data/pf2eEffects', () => {
  const catalog = [
    { id: 'heroism-1', name: 'Heroism 1', modifiers: [] },
    { id: 'bless', name: 'Bless', modifiers: [] },
    { id: 'ability-immunity', name: 'Immune', modifiers: [] },
  ];
  const getEffect = (id) => catalog.find((e) => e.id === id);
  return { __esModule: true, default: catalog, getEffect };
});

// Fixed clock: 5 Pharast 4725 08:00.
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));

import EffectsPanel from './EffectsPanel';
import { toGameSeconds } from '../../utils/gameTime';

const NOW = toGameSeconds({ day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 });

describe('EffectsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEffects.effects = [];
  });

  it('renders nothing when no effects are active', () => {
    const { container } = render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the EFFECTS header when effects are present', () => {
    mockEffects.effects = [{ id: 'uid-1', effectId: 'heroism-1', ts: 1 }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('EFFECTS')).toBeInTheDocument();
  });

  it('shows the effect count', () => {
    mockEffects.effects = [
      { id: 'uid-1', effectId: 'heroism-1', ts: 1 },
      { id: 'uid-2', effectId: 'bless', ts: 2 },
    ];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows all effect names', () => {
    mockEffects.effects = [
      { id: 'uid-1', effectId: 'heroism-1', ts: 1 },
      { id: 'uid-2', effectId: 'bless', ts: 2 },
    ];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('Heroism 1')).toBeInTheDocument();
    expect(screen.getByText('Bless')).toBeInTheDocument();
  });

  it('falls back to effectId when effect is not in catalog', () => {
    mockEffects.effects = [{ id: 'uid-unk', effectId: 'unknown-effect', ts: 1 }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('unknown-effect')).toBeInTheDocument();
  });

  it('calls removeEffect with the entry id when × is clicked', () => {
    mockEffects.effects = [{ id: 'uid-rm', effectId: 'heroism-1', ts: 1 }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    fireEvent.click(screen.getByTitle('Remove Heroism 1'));
    expect(mockRemoveEffect).toHaveBeenCalledWith('uid-rm');
  });

  it('renders a remove button per effect', () => {
    mockEffects.effects = [
      { id: 'uid-1', effectId: 'heroism-1', ts: 1 },
      { id: 'uid-2', effectId: 'bless', ts: 2 },
    ];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    const removeButtons = screen.getAllByRole('button');
    expect(removeButtons).toHaveLength(2);
  });

  it('labels an ability immunity with its source and clock expiry', () => {
    mockEffects.effects = [{
      id: 'uid-imm',
      effectId: 'ability-immunity',
      source: 'Guidance',
      expireAtSecs: NOW + 3600,
      ts: 1,
    }];
    render(<EffectsPanel charId="char-a" themeColor="#cc0000" />);
    expect(screen.getByText('Immune: Guidance')).toBeInTheDocument();
    // 08:00 + 1h, same day → bare time.
    expect(screen.getByText('09:00')).toBeInTheDocument();
  });
});
