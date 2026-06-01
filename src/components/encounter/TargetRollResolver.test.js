import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TargetRollResolver from './TargetRollResolver';

const goblinEntry = {
  entryId: 'cbt-goblin',
  name: 'Goblin',
  kind: 'enemy',
  defenses: {
    ac: 15,
    saves: { fortitude: 8, reflex: 5, will: 3 },
    immunities: [],
    resistances: [],
    weaknesses: [],
  },
};

const noDefenseEntry = {
  entryId: 'cbt-anon',
  name: 'Mystery Foe',
  kind: 'enemy',
  defenses: null,
};

describe('TargetRollResolver', () => {
  test('renders nothing when enemyTargets is empty', () => {
    const { container } = render(
      <TargetRollResolver enemyTargets={[]} targetDefense="ac" />
    );
    expect(container.firstChild).toBeNull();
  });

  test('shows defense label and DC badge for AC', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('Goblin: 15')).toBeInTheDocument();
  });

  test('shows Fortitude DC (10 + modifier) for fortitude defense', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="fortitude" />);
    expect(screen.getByText('Fortitude DC')).toBeInTheDocument();
    // 10 + 8 = 18
    expect(screen.getByText('Goblin: 18')).toBeInTheDocument();
  });

  test('shows a defense override select when targetDefense is empty', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="" />);
    expect(screen.getByRole('combobox', { name: /defense type/i })).toBeInTheDocument();
  });

  test('nat-20/nat-1 checkboxes are mutually exclusive', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    const nat20 = screen.getByLabelText(/natural 20/i);
    const nat1  = screen.getByLabelText(/natural 1/i);

    fireEvent.click(nat20);
    expect(nat20.checked).toBe(true);
    expect(nat1.checked).toBe(false);

    fireEvent.click(nat1);
    expect(nat1.checked).toBe(true);
    expect(nat20.checked).toBe(false);
  });

  test('shows Critical Hit when total beats AC by 10+ against AC', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    // AC 15, crit threshold = 25
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '25' } });
    expect(screen.getByText('Critical Hit')).toBeInTheDocument();
  });

  test('shows Hit when total meets AC', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '15' } });
    expect(screen.getByText('Hit')).toBeInTheDocument();
  });

  test('shows Miss when total is below AC', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '10' } });
    expect(screen.getByText('Miss')).toBeInTheDocument();
  });

  test('nat-20 shifts degree up: a roll that would miss hits instead', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    // Total 12 vs AC 15 = miss; nat-20 shifts to Hit
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText(/natural 20/i));
    expect(screen.getByText('Hit')).toBeInTheDocument();
  });

  test('nat-1 shifts degree down: a roll that would hit misses instead', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" />);
    // Total 15 vs AC 15 = hit; nat-1 shifts to Miss
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '15' } });
    fireEvent.click(screen.getByLabelText(/natural 1/i));
    expect(screen.getByText('Miss')).toBeInTheDocument();
  });

  test('uses save terminology for non-AC defenses', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="reflex" />);
    // reflex mod 5 → DC 15; total 15 = Success
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '15' } });
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.queryByText('Hit')).not.toBeInTheDocument();
  });

  test('shows "no DC available" when defenses is null', () => {
    render(<TargetRollResolver enemyTargets={[noDefenseEntry]} targetDefense="ac" />);
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '20' } });
    expect(screen.getByText('no DC available')).toBeInTheDocument();
  });

  test('getResults() returns results array when total is entered', () => {
    const ref = createRef();
    render(
      <TargetRollResolver ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" />
    );
    fireEvent.change(screen.getByLabelText(/roll total/i), { target: { value: '20' } });
    const results = ref.current.getResults();
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 'cbt-goblin', name: 'Goblin', dc: 15, total: 20 }),
      ])
    );
  });

  test('getResults() returns null when input is empty', () => {
    const ref = createRef();
    render(
      <TargetRollResolver ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" />
    );
    expect(ref.current.getResults()).toBeNull();
  });
});
