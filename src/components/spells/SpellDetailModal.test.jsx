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

  // Non-encounter slot cast (#961)
  const slotResources = (options) => ({
    optionsFor: vi.fn(() => options),
    spend: vi.fn(),
  });

  it('spends the native-rank slot and closes on a non-encounter cast', () => {
    const onClose = vi.fn();
    const option = { type: 'slot', rank: 3, label: 'Rank 3 slot (2 left)', enabled: true };
    const resources = slotResources([option]);
    render(
      <SpellDetailModal
        spell={baseSpell}
        isOpen
        castResources={resources}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cast — Rank 3 slot \(2 left\)/ }));
    expect(resources.spend).toHaveBeenCalledWith(option);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers a rank picker for a signature spell and spends the chosen rank', () => {
    const onClose = vi.fn();
    const options = [
      { type: 'slot', rank: 3, label: 'Rank 3 slot (1 left)', enabled: true },
      { type: 'slot', rank: 4, label: 'Rank 4 slot (2 left)', enabled: true },
    ];
    const resources = slotResources(options);
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, signature: true }}
        isOpen
        castResources={resources}
        onClose={onClose}
      />
    );
    expect(screen.getByText('Cast at:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rank 4 slot (2 left)' }));
    expect(resources.spend).toHaveBeenCalledWith(options[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('disables the cast button and does not spend when no slots remain', () => {
    const onClose = vi.fn();
    const option = { type: 'slot', rank: 3, label: 'Rank 3 slot (0 left)', enabled: false };
    const resources = slotResources([option]);
    render(
      <SpellDetailModal
        spell={baseSpell}
        isOpen
        castResources={resources}
        onClose={onClose}
      />
    );
    const btn = screen.getByRole('button', { name: /Rank 3 slot \(0 left\)/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(resources.spend).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows no non-encounter cast control when only free options exist (cantrip)', () => {
    const resources = slotResources([{ type: 'cantrip', label: 'Cantrip — no cost', enabled: true }]);
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, level: 0 }}
        isOpen
        castResources={resources}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Cast/ })).not.toBeInTheDocument();
  });

  it('does not show the slot cast control in encounter mode', () => {
    const resources = slotResources([{ type: 'slot', rank: 3, label: 'Rank 3 slot (2 left)', enabled: true }]);
    render(
      <SpellDetailModal
        spell={{ ...baseSpell, actions: '2' }}
        isOpen
        encounterMode
        onCast={vi.fn()}
        castResources={resources}
        onClose={vi.fn()}
      />
    );
    expect(resources.optionsFor).not.toHaveBeenCalled();
    expect(screen.queryByText(/Cast — /)).not.toBeInTheDocument();
  });
});
