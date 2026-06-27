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
const longsword = { uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' }, runes: { property: [flaming] } };
const dagger = { uid: 'w2', name: 'Dagger', strikes: { damage: '1d4' } };
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
