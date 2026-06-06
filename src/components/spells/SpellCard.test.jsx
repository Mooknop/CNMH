import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SpellCard from './SpellCard';

// Render the modal body inline when open so we can assert its detail content.
vi.mock('../shared/Modal', () => ({ default: ({ isOpen, title, children }) =>
  isOpen ? (
    <div data-testid="spell-detail-modal">
      <h2>{title}</h2>
      {children}
    </div>
  ) : null
}));

vi.mock('../shared/TraitTag', () => ({ default: ({ trait }) => (
  <span data-testid="trait-tag">{trait}</span>
) }));

vi.mock('../shared/ActionIcon', () => ({ default: ({ actionText }) => (
  <span data-testid="action-icon">{actionText}</span>
) }));

vi.mock('../shared/ActionSymbol', () => ({ default: ({ cost }) => (
  <span data-testid="action-symbol">{cost}</span>
) }));

vi.mock('../shared/UseActionChip', () => ({ default: ({ verb, name, onUse }) => (
  <button onClick={() => onUse(1)}>{verb} {name}</button>
) }));

const baseSpell = {
  id: 'spell1',
  name: 'Fireball',
  level: 3,
  description: 'A ball of fire explodes.',
  traits: ['fire', 'evocation'],
  actions: '2',
  range: '500 feet',
  area: '20-foot burst',
};

const renderCard = (spell, extra = {}) =>
  render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} {...extra} />);

// Open the detail modal by clicking the card.
const openDetail = () => fireEvent.click(screen.getByTestId('spell-card'));

describe('SpellCard (collapsed card)', () => {
  it('renders without crashing', () => {
    expect(() => renderCard(baseSpell)).not.toThrow();
  });

  it('renders spell name on the card', () => {
    renderCard(baseSpell);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });

  it('renders compact rank badge for non-cantrip', () => {
    renderCard(baseSpell);
    expect(screen.getByText('R3')).toBeInTheDocument();
  });

  it('renders compact cantrip badge with scaled rank', () => {
    renderCard({ ...baseSpell, level: 0, baseLevel: 1 });
    expect(screen.getByText('C3')).toBeInTheDocument();
  });

  it('renders action icon when spell has actions', () => {
    renderCard(baseSpell);
    expect(screen.getByTestId('action-icon')).toBeInTheDocument();
  });

  it('renders traits on the card', () => {
    renderCard(baseSpell);
    expect(screen.getAllByTestId('trait-tag').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('fire')).toBeInTheDocument();
  });

  it('renders Signature glyph when spell is signature', () => {
    renderCard({ ...baseSpell, signature: true });
    expect(screen.getByTitle('Signature Spell')).toBeInTheDocument();
  });

  it('renders Bloodline glyph when spell is bloodline', () => {
    renderCard({ ...baseSpell, bloodline: 'Draconic' });
    expect(screen.getByTitle('Bloodline Spell')).toBeInTheDocument();
  });

  it('marks the card inactive when a scroll item is not in hand', () => {
    renderCard({ ...baseSpell, fromScroll: true, scrollName: 'Scroll of Fireball', active: false });
    expect(screen.getByTestId('spell-card').className).toContain('is-inactive');
    expect(screen.getByText('Not in hand')).toBeInTheDocument();
  });

  it('does not mark inactive when active or no active flag', () => {
    renderCard({ ...baseSpell, fromScroll: true, scrollName: 'S', active: true });
    expect(screen.getByTestId('spell-card').className).not.toContain('is-inactive');
  });

  it('does not show the detail modal until the card is clicked', () => {
    renderCard(baseSpell);
    expect(screen.queryByTestId('spell-detail-modal')).not.toBeInTheDocument();
  });
});

describe('SpellCard → SpellDetailModal', () => {
  it('opens the detail modal on card click', () => {
    renderCard(baseSpell);
    openDetail();
    expect(screen.getByTestId('spell-detail-modal')).toBeInTheDocument();
  });

  it('renders the description in the modal', () => {
    renderCard(baseSpell);
    openDetail();
    expect(screen.getByText('A ball of fire explodes.')).toBeInTheDocument();
  });

  it('renders range, area, defense, duration, targets in the modal', () => {
    renderCard({ ...baseSpell, defense: 'Reflex', duration: '1 minute', targets: '1 creature' });
    openDetail();
    expect(screen.getByText('500 feet')).toBeInTheDocument();
    expect(screen.getByText('20-foot burst')).toBeInTheDocument();
    expect(screen.getByText('Reflex')).toBeInTheDocument();
    expect(screen.getByText('1 minute')).toBeInTheDocument();
    expect(screen.getByText('1 creature')).toBeInTheDocument();
  });

  it('renders trigger in the modal', () => {
    renderCard({ ...baseSpell, trigger: 'An enemy attacks you.' });
    openDetail();
    expect(screen.getByText('An enemy attacks you.')).toBeInTheDocument();
  });

  it('renders Prepared / Not Prepared indicator in the modal', () => {
    renderCard({ ...baseSpell, prepared: true });
    openDetail();
    expect(screen.getByText('Prepared')).toBeInTheDocument();
  });

  it('renders scroll / wand / innate indicators in the modal', () => {
    renderCard({ ...baseSpell, fromWand: true, wandName: 'Wand of Fireball' });
    openDetail();
    expect(screen.getByText('Wand of Fireball')).toBeInTheDocument();
  });

  it('renders degrees of success in the modal', () => {
    renderCard({ ...baseSpell, degrees: { 'Critical Success': 'Double damage.', 'Failure': 'Half damage.' } });
    openDetail();
    expect(screen.getByText('Critical Success:')).toBeInTheDocument();
    expect(screen.getByText('Double damage.')).toBeInTheDocument();
  });

  it('renders heightened effects in the modal', () => {
    renderCard({ ...baseSpell, heightened: { '+1': 'Increase damage by 2d6.' } });
    openDetail();
    expect(screen.getByText('+1:')).toBeInTheDocument();
    expect(screen.getByText('Increase damage by 2d6.')).toBeInTheDocument();
  });

  it('renders innate source in the modal', () => {
    renderCard({ ...baseSpell, fromInnate: true, innateSource: 'Elvish Heritage' });
    openDetail();
    expect(screen.getByText('Source: Elvish Heritage')).toBeInTheDocument();
  });

  it('shows a Cast button in encounter mode and fires onCast', () => {
    const onCast = vi.fn();
    renderCard(baseSpell, { encounterMode: true, onCast });
    openDetail();
    const castBtn = screen.getByRole('button', { name: /Cast Fireball/ });
    fireEvent.click(castBtn);
    expect(onCast).toHaveBeenCalledWith(baseSpell, 1);
  });

  it('does not show a Cast button when not in encounter mode', () => {
    renderCard(baseSpell, { onCast: vi.fn() });
    openDetail();
    expect(screen.queryByRole('button', { name: /Cast Fireball/ })).not.toBeInTheDocument();
  });
});
