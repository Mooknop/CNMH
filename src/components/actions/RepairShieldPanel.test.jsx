import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RepairShieldPanel from './RepairShieldPanel';
import { useCharacter } from '../../hooks/useCharacter';
import { useShield } from '../../hooks/useShield';

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useShield', () => ({ useShield: vi.fn() }));

const character = { id: 'blu' };
const mockRepair = vi.fn(() => 20);

const setChar = ({ rank = 2, feats = [] } = {}) =>
  useCharacter.mockReturnValue({ skillProficiencies: { crafting: rank }, feats, inventory: [] });

const setShield = (heldShield) =>
  useShield.mockReturnValue({ heldShield, repairShield: mockRepair });

const damagedShield = { uid: 's1', name: 'Steel Shield', shield: { hp: 10, level: 0 }, maxHp: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  setChar();
  setShield(damagedShield);
});

describe('RepairShieldPanel', () => {
  it('prompts to hold a shield when none is in hand', () => {
    setShield(null);
    render(<RepairShieldPanel character={character} />);
    expect(screen.getByText(/hold a shield to repair it/i)).toBeInTheDocument();
  });

  it('shows the shield HP and the repair DC', () => {
    render(<RepairShieldPanel character={character} />);
    expect(screen.getByText('Steel Shield')).toBeInTheDocument();
    expect(screen.getByText('10 / 20 HP')).toBeInTheDocument();
    expect(screen.getByText(/DC 15/)).toBeInTheDocument(); // level-0 → floored to level-1 DC
  });

  it('restores HP on a successful Crafting check', () => {
    render(<RepairShieldPanel character={character} />);
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '20' } }); // ≥ DC 15 → success
    fireEvent.click(screen.getByRole('button', { name: 'Repair' }));
    expect(mockRepair).toHaveBeenCalledWith(10); // expert success = 5 × 2
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/Restored 10 HP \(now 20\)/)).toBeInTheDocument();
  });

  it('restores nothing on a failed check', () => {
    render(<RepairShieldPanel character={character} />);
    fireEvent.change(screen.getByLabelText('Raw d20 die'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Check total'), { target: { value: '9' } }); // < DC 15 → failure
    fireEvent.click(screen.getByRole('button', { name: 'Repair' }));
    expect(mockRepair).toHaveBeenCalledWith(0);
    expect(screen.getByText(/No HP restored/)).toBeInTheDocument();
  });

  it('says the shield is full when at max HP', () => {
    setShield({ ...damagedShield, shield: { hp: 20, level: 0 }, maxHp: 20 });
    render(<RepairShieldPanel character={character} />);
    expect(screen.getByText(/shield is at full hp/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Repair' })).not.toBeInTheDocument();
  });

  it('reflects Quick Repair time by rank in the cost label', () => {
    setChar({ rank: 4, feats: [{ name: 'Quick Repair' }] });
    render(<RepairShieldPanel character={character} />);
    expect(screen.getByText(/Quick Repair · 1 action/)).toBeInTheDocument(); // legendary → 1 action
  });
});
