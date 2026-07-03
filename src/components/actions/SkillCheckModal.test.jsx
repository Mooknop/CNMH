import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillCheckModal from './SkillCheckModal';
import { getSkillAction, augmentSkillAction } from '../../data/skillActions';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { resolveActionRoll } from '../../utils/rollResolution';

vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        <button onClick={onClose}>×</button>
        {children}
      </div>
    );
  },
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useEffects', () => ({ useEffects: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../utils/rollResolution', () => ({ resolveActionRoll: vi.fn() }));
vi.mock('../../utils/CharacterUtils', () => ({
  getSkillModifier: (_c, s) => ({ survival: 7 }[s] ?? 0),
  getUnarmedAttackModifier: () => 9,
  hasFeat: (c, name) => (c?.feats || []).some((f) => f.name?.toLowerCase() === name.toLowerCase()),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

const character = { id: 'ashka', name: 'Ashka', feats: [] };
const ranger = { id: 'ashka', name: 'Ashka', feats: [{ name: 'Ranger Dedication' }] };

beforeEach(() => {
  useCharacter.mockReturnValue({ flags: {} });
  useEffects.mockReturnValue({ effects: [] });
  useSyncedState.mockImplementation(() => [[], vi.fn()]);
  resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 6 });
});

describe('SkillCheckModal (Track)', () => {
  const track = getSkillAction('track');

  it('renders nothing when closed', () => {
    const { container } = render(
      <SkillCheckModal isOpen={false} onClose={() => {}} action={track} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the net modifier and computes the degree vs a GM-entered DC', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    expect(screen.getByText('+6')).toBeInTheDocument();
    // d20 15 + 6 = 21 vs DC 20 → success
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText(/Success —/)).toBeInTheDocument();
    expect(screen.getByText(/Follow the trail/)).toBeInTheDocument();
  });

  it('renders the crit-failure note when the roll misses the DC by 10+', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    // d20 1 + 6 = 7 vs DC 20 → critical failure (miss by 13, nat-1 also steps down)
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    expect(screen.getByText(/Critical Failure —/)).toBeInTheDocument();
  });

  it('offers the Hunt Prey +2 toggle for a Ranger Dedication PC and applies it to the total', () => {
    const augmented = augmentSkillAction(ranger, track);
    render(<SkillCheckModal isOpen onClose={() => {}} action={augmented} character={ranger} />);
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
    expect(screen.getByText('18')).toBeInTheDocument(); // 12 + 6

    fireEvent.click(screen.getByRole('button', { name: /Hunt Prey vs prey/ }));
    expect(screen.getByText('20')).toBeInTheDocument(); // 12 + 6 + 2
    expect(screen.getByText(/incl\. \+2 circumstance/)).toBeInTheDocument();
  });

  it('applies a free-form circumstance modifier to the total', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    fireEvent.change(screen.getByLabelText(/Other circumstance/), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('15')).toBeInTheDocument(); // 10 + 6 - 1
  });

  it('shows no Hunt Prey toggle for a PC without the feat', () => {
    const augmented = augmentSkillAction(character, track); // no feat → same ref
    render(<SkillCheckModal isOpen onClose={() => {}} action={augmented} character={character} />);
    expect(screen.queryByRole('button', { name: /Hunt Prey/ })).not.toBeInTheDocument();
  });
});

describe('SkillCheckModal — check-bonus talisman (Sneaky Key, #1093)', () => {
  const sneakyKey = {
    uid: 'key-1',
    name: 'Sneaky Key',
    traits: ['Consumable', 'Magical', 'Talisman'],
    talisman: {
      affixTo: 'armor',
      activation: {
        cost: 1,
        trigger: 'You attempt to Pick a Lock',
        effect: { kind: 'check-bonus', skill: 'thievery', bonus: 1, value: 'status', note: 'to Pick a Lock for 1 minute' },
      },
    },
  };
  const pickLock = { id: 'pick-a-lock', name: 'Pick a Lock', skill: 'thievery', traits: [], outcomes: {} };

  let affixed;
  let consumed;
  const setAffixed = vi.fn((next) => { affixed = typeof next === 'function' ? next(affixed) : next; });
  const setConsumed = vi.fn((next) => { consumed = typeof next === 'function' ? next(consumed) : next; });

  beforeEach(() => {
    affixed = { 'key-1': 'armor-1' };
    consumed = {};
    setAffixed.mockClear();
    setConsumed.mockClear();
    useCharacter.mockReturnValue({ flags: {}, inventory: [sneakyKey, { uid: 'armor-1', name: 'Leather Armor' }] });
    useSyncedState.mockImplementation((key) => {
      if (String(key).startsWith('cnmh_affixed_')) return [affixed, setAffixed];
      if (String(key).startsWith('cnmh_consumed_')) return [consumed, setConsumed];
      return [[], vi.fn()];
    });
  });

  it('offers the opt-in and adds the bonus to the net modifier', () => {
    render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    expect(screen.getByText('+6')).toBeInTheDocument(); // talisman off
    fireEvent.click(screen.getByLabelText('Sneaky Key (+1 status)'));
    expect(screen.getByText('+7')).toBeInTheDocument();
  });

  it('consumes the talisman on close only when used on a roll', () => {
    const { rerender } = render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    fireEvent.click(screen.getByLabelText('Sneaky Key (+1 status)'));
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Close'));
    expect(setConsumed).toHaveBeenCalled();
    expect(setAffixed).toHaveBeenCalled();
    expect(affixed).toEqual({});

    // toggled on but no roll entered → not consumed
    affixed = { 'key-1': 'armor-1' };
    setConsumed.mockClear();
    setAffixed.mockClear();
    rerender(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    fireEvent.click(screen.getByLabelText('Sneaky Key (+1 status)'));
    fireEvent.click(screen.getByText('Close'));
    expect(setConsumed).not.toHaveBeenCalled();
  });

  it('shows no opt-in for a non-matching skill or unaffixed talisman', () => {
    const track = { id: 'track', name: 'Track', skill: 'survival', traits: [], outcomes: {} };
    render(<SkillCheckModal isOpen onClose={() => {}} action={track} character={character} />);
    expect(screen.queryByText(/Sneaky Key/)).not.toBeInTheDocument();

    affixed = {};
    render(<SkillCheckModal isOpen onClose={() => {}} action={pickLock} character={character} />);
    expect(screen.queryByText(/Sneaky Key/)).not.toBeInTheDocument();
  });
});
