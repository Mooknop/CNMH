import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SpellDetailModal from './SpellDetailModal';

vi.mock('../shared/Modal', () => ({ default: ({ isOpen, title, children }) =>
  isOpen ? (
    <div data-testid="modal">
      <h2>{title}</h2>
      {children}
    </div>
  ) : null
}));

vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => <span data-testid="trait">{trait}</span> }));
vi.mock('../shared/ActionSymbol', () => ({ default: ({ cost }) => <span>{cost}</span> }));
vi.mock('../shared/UseActionChip', () => ({ default: ({ verb, name, onUse }) => (
  <button onClick={() => onUse(2)}>{verb} {name}</button>
) }));

const baseSpell = { id: 's1', name: 'Fireball', level: 3, description: 'Boom.' };

describe('SpellDetailModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SpellDetailModal spell={baseSpell} isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when spell is null', () => {
    const { container } = render(
      <SpellDetailModal spell={null} isOpen onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the spell name as the modal title', () => {
    render(<SpellDetailModal spell={baseSpell} isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Fireball' })).toBeInTheDocument();
  });

  it('renders trait chips when present', () => {
    render(<SpellDetailModal spell={{ ...baseSpell, traits: ['fire', 'evocation'] }} isOpen onClose={vi.fn()} />);
    expect(screen.getAllByTestId('trait')).toHaveLength(2);
  });

  it('renders the blood-magic box for a bloodline spell with blood_magic', () => {
    const character = { spellcasting: { bloodline: { blood_magic: 'Scales appear.' } } };
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, bloodline: 'Draconic' }}
        character={character}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Blood Magic:')).toBeInTheDocument();
    expect(screen.getByText('Scales appear.')).toBeInTheDocument();
  });

  it('renders the signature explanation for a signature spell', () => {
    render(<SpellDetailModal spell={{ ...baseSpell, signature: true }} isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Signature Spell:')).toBeInTheDocument();
  });

  it('shows the inactive hint when the source item is not in hand', () => {
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, active: false, scrollName: 'Scroll of Fireball' }}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/hold Scroll of Fireball to cast/)).toBeInTheDocument();
  });

  it('hides the Cast button for an inactive spell even in encounter mode', () => {
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, active: false, actions: '2' }}
        isOpen
        encounterMode
        onCast={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Cast/ })).not.toBeInTheDocument();
  });

  it('Cast button calls onCast then closes', () => {
    const onCast = vi.fn();
    const onClose = vi.fn();
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, actions: '2' }}
        isOpen
        encounterMode
        onCast={onCast}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cast Fireball/ }));
    expect(onCast).toHaveBeenCalledWith(expect.objectContaining({ name: 'Fireball' }), 2);
    expect(onClose).toHaveBeenCalled();
  });
});
