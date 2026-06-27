import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MoveRunePanel from './MoveRunePanel';
import { useCharacter } from '../../hooks/useCharacter';
import { useMoveRune } from '../../hooks/useMoveRune';

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useMoveRune', () => ({ useMoveRune: vi.fn() }));

const character = { id: 'blu' };
const mockMove = vi.fn();

const flaming = { id: 'flaming', name: 'Flaming', level: 8, price: 500 };
const frost = { id: 'frost', name: 'Frost', level: 8, price: 500 };
const longsword = { uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' }, runes: { property: [flaming] } };
// A +1 weapon with one free property slot — a valid apply target.
const dagger = { uid: 'w2', name: 'Dagger', strikes: { damage: '1d4' }, runes: { potency: 1 } };
// A +1 weapon whose single slot is full — applying requires displacing a rune.
const fullPick = { uid: 'w3', name: 'Pick', strikes: { damage: '1d6' }, runes: { potency: 1, property: [frost] } };
// A potency-0 weapon can hold no property runes — never an apply target.
const club = { uid: 'w4', name: 'Club', strikes: { damage: '1d6' } };
const runestone = { uid: 'rs1', name: 'Flaming Runestone', runestone: { runeRef: 'flaming', rune: flaming } };

const setChar = (inventory, rank = 2) =>
  useCharacter.mockReturnValue({ skillProficiencies: { crafting: rank }, inventory });

beforeEach(() => {
  vi.clearAllMocks();
  mockMove.mockReturnValue({ degree: 'success', outcome: { moved: true, destroyed: false, costGp: 50 } });
  useMoveRune.mockReturnValue({ move: mockMove });
  setChar([longsword]);
});

describe('MoveRunePanel', () => {
  it('renders nothing when there are no movable runes', () => {
    setChar([dagger]); // no runed weapon, no runestone
    const { container } = render(<MoveRunePanel character={character} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gates on trained Crafting', () => {
    setChar([longsword], 0);
    render(<MoveRunePanel character={character} />);
    expect(screen.getByText(/requires trained Crafting/i)).toBeInTheDocument();
  });

  it('lists a weapon rune and shows its DC', () => {
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'w:w1:flaming' } });
    expect(screen.getByText(/DC 24/)).toBeInTheDocument(); // level-8 rune
    expect(screen.getByText(/50 gp/)).toBeInTheDocument(); // 10% upkeep
  });

  it('moves a rune off a weapon to a runestone', () => {
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'w:w1:flaming' } });
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move rune' }));
    expect(mockMove).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'toRunestone', weapon: longsword, rune: flaming, d20: 12, total: 26,
    }));
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/expended 50 gp/i)).toBeInTheDocument();
  });

  it('requires a target weapon when applying a runestone', () => {
    setChar([runestone, dagger]);
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'r:rs1' } });
    // No target selected yet → move disabled.
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '40' } });
    expect(screen.getByRole('button', { name: 'Move rune' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Target weapon'), { target: { value: 'w2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move rune' }));
    expect(mockMove).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'toWeapon', weapon: dagger, runestone, rune: flaming,
    }));
  });

  it('excludes potency-0 weapons (no property slots) from apply targets', () => {
    setChar([runestone, club]);
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'r:rs1' } });
    expect(screen.getByText(/no weapon with a potency rune/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Club/ })).not.toBeInTheDocument();
  });

  it('requires displacing a rune when the target weapon is full', () => {
    setChar([runestone, fullPick]);
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'r:rs1' } });
    fireEvent.change(screen.getByLabelText('Target weapon'), { target: { value: 'w3' } });
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '40' } });
    // Full weapon → must pick a rune to displace before moving.
    expect(screen.getByRole('button', { name: 'Move rune' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Rune to replace'), { target: { value: 'frost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move rune' }));
    expect(mockMove).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'toWeapon', weapon: fullPick, runestone, rune: flaming, replaceRuneId: 'frost',
    }));
  });

  it('reports a destroyed rune on a critical failure', () => {
    mockMove.mockReturnValue({ degree: 'criticalFailure', outcome: { moved: false, destroyed: true, costGp: 0 } });
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'w:w1:flaming' } });
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move rune' }));
    expect(screen.getByText('Critical Failure')).toBeInTheDocument();
    expect(screen.getByText(/rune was destroyed/i)).toBeInTheDocument();
  });

  it('surfaces a rejection (e.g. unaffordable upkeep)', () => {
    mockMove.mockReturnValue(null);
    render(<MoveRunePanel character={character} />);
    fireEvent.change(screen.getByLabelText('Rune to move'), { target: { value: 'w:w1:flaming' } });
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move rune' }));
    expect(screen.getByText(/not enough gold/i)).toBeInTheDocument();
  });
});
