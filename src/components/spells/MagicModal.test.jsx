import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MagicModal from './MagicModal';

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('./SpellsRepertoire', () => ({ default: () => <div data-testid="spells-repertoire" /> }));
vi.mock('./InnateCastingList', () => ({ default: () => <div data-testid="innate-casting-list" /> }));
vi.mock('./FocusSpellsList', () => ({ default: () => <div data-testid="focus-spells-list" /> }));
vi.mock('./StaffSpells', () => ({ default: () => <div data-testid="staff-spells" /> }));
vi.mock('./ScrollSpells', () => ({ default: () => <div data-testid="scroll-spells" /> }));
vi.mock('./WandSpells', () => ({ default: () => <div data-testid="wand-spells" /> }));
vi.mock('./EldPowers', () => ({ default: () => <div data-testid="eld-powers" /> }));
vi.mock('./Harrowing', () => ({ default: () => <div data-testid="harrowing" /> }));
vi.mock('./SpellsHeader', () => ({ default: () => <div data-testid="spells-header" /> }));

import { useCharacter } from '../../hooks/useCharacter';

const noMagicModel = {
  spellcasting: { spells: [], spell_slots: {} },
  scrollSpells: [], wandSpells: [], innateSpells: [], staffSpells: [],
  staff: null, eldPowers: [], level: 5,
  flags: {
    hasSpellcasting: false, hasFocusSpells: false, hasInnateSpells: false,
    hasScrolls: false, hasWands: false, hasStaff: false, hasEldPowers: false, hasHarrowing: false,
  },
};

const withSpellsModel = {
  ...noMagicModel,
  spellcasting: { spells: [{ id: 's1', name: 'Fireball', level: 3, actions: 'Two Actions' }], spell_slots: {} },
  flags: { ...noMagicModel.flags, hasSpellcasting: true },
};

const withInnateModel = {
  ...noMagicModel,
  innateSpells: [{ id: 'i1', name: 'Dancing Lights', level: 0 }],
  flags: { ...noMagicModel.flags, hasInnateSpells: true },
};

const mockCharacter = { id: 'c1', name: 'Test', level: 5 };

afterEach(() => vi.restoreAllMocks());

describe('MagicModal', () => {
  it('renders nothing when closed', () => {
    useCharacter.mockReturnValue(noMagicModel);
    const { container } = render(
      <MagicModal isOpen={false} onClose={vi.fn()} character={mockCharacter} themeColor="#333" />
    );
    expect(container).toBeInTheDocument();
  });

  it('shows "No spellcasting" when open with no magic', () => {
    useCharacter.mockReturnValue(noMagicModel);
    render(
      <MagicModal isOpen onClose={vi.fn()} character={mockCharacter} themeColor="#333" />
    );
    expect(screen.getByText(/No spellcasting available/i)).toBeInTheDocument();
  });

  it('shows Spells category button when hasSpellcasting', () => {
    useCharacter.mockReturnValue(withSpellsModel);
    render(
      <MagicModal isOpen onClose={vi.fn()} character={mockCharacter} themeColor="#333" />
    );
    expect(screen.getByRole('button', { name: 'Spells' })).toBeInTheDocument();
  });

  it('shows Innate category button when hasInnateSpells', () => {
    useCharacter.mockReturnValue(withInnateModel);
    render(
      <MagicModal isOpen onClose={vi.fn()} character={mockCharacter} themeColor="#333" />
    );
    expect(screen.getByRole('button', { name: 'Innate' })).toBeInTheDocument();
  });

  it('opens SpellsRepertoire when Spells category clicked', () => {
    useCharacter.mockReturnValue(withSpellsModel);
    render(
      <MagicModal isOpen onClose={vi.fn()} character={mockCharacter} themeColor="#333" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Spells' }));
    expect(screen.getByTestId('spells-repertoire')).toBeInTheDocument();
  });

  it('shows Focus label as Devotion for champion', () => {
    useCharacter.mockReturnValue({
      ...noMagicModel,
      flags: { ...noMagicModel.flags, hasFocusSpells: true },
    });
    render(
      <MagicModal
        isOpen
        onClose={vi.fn()}
        character={{ ...mockCharacter, champion: true }}
        themeColor="#333"
      />
    );
    expect(screen.getByRole('button', { name: 'Devotion' })).toBeInTheDocument();
  });

  it('shows Focus label as Qi Spells for monk', () => {
    useCharacter.mockReturnValue({
      ...noMagicModel,
      flags: { ...noMagicModel.flags, hasFocusSpells: true },
    });
    render(
      <MagicModal
        isOpen
        onClose={vi.fn()}
        character={{ ...mockCharacter, monk: true }}
        themeColor="#333"
      />
    );
    expect(screen.getByRole('button', { name: 'Qi Spells' })).toBeInTheDocument();
  });

  it('uses staff name when hasStaff', () => {
    useCharacter.mockReturnValue({
      ...noMagicModel,
      staff: { name: 'Staff of Fire' },
      flags: { ...noMagicModel.flags, hasStaff: true },
    });
    render(
      <MagicModal isOpen onClose={vi.fn()} character={mockCharacter} themeColor="#333" />
    );
    expect(screen.getByRole('button', { name: 'Staff of Fire' })).toBeInTheDocument();
  });
});
