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

function enterD20(value) {
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: String(value) } });
}

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

  // ── rollBonus mode ─────────────────────────────────────────────────────────

  test('shows bonus badge and computed total when rollBonus is provided', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />);
    enterD20(10);
    expect(screen.getByLabelText(/roll bonus/i)).toHaveTextContent('+5');
    expect(screen.getByLabelText(/computed total/i)).toHaveTextContent('= 15');
  });

  test('shows Critical Hit when d20 + bonus beats AC by 10+ (rollBonus mode)', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />);
    // AC 15, crit threshold 25: d20=20 → total=25 → Critical Hit
    enterD20(20);
    expect(screen.getByText('Critical Hit')).toBeInTheDocument();
  });

  test('shows Hit when d20 + bonus meets AC', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />);
    // d20=10 + bonus=5 → total=15 = AC → Hit
    enterD20(10);
    expect(screen.getByText('Hit')).toBeInTheDocument();
  });

  test('shows Miss when d20 + bonus is below AC', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />);
    // d20=5 + bonus=5 → total=10 < AC 15 → Miss
    enterD20(5);
    expect(screen.getByText('Miss')).toBeInTheDocument();
  });

  test('entering 20 shifts degree up (nat 20 auto-detected)', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={0} />);
    // d20=20 → total=20 vs AC 15 → would be Hit (20>=15), nat-20 shifts to Critical Hit
    enterD20(20);
    expect(screen.getByText('Critical Hit')).toBeInTheDocument();
  });

  test('entering 1 shifts degree down (nat 1 auto-detected)', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={14} />);
    // d20=1 + bonus=14 → total=15 = AC → would be Hit, nat-1 shifts to Miss
    enterD20(1);
    expect(screen.getByText('Miss')).toBeInTheDocument();
  });

  // ── manual-total (null bonus) mode ────────────────────────────────────────

  test('manual-total mode when rollBonus is null: input treated as full total', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={null} />);
    // Enter 15 as total → Hit vs AC 15
    enterD20(15);
    expect(screen.getByText('Hit')).toBeInTheDocument();
    expect(screen.queryByLabelText(/roll bonus/i)).toBeNull();
    expect(screen.queryByLabelText(/computed total/i)).toBeNull();
  });

  test('manual-total mode: entering 20 still shifts degree up', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={null} />);
    enterD20(20);
    // 20 vs AC 15 = Hit, nat-20 → Critical Hit
    expect(screen.getByText('Critical Hit')).toBeInTheDocument();
  });

  test('manual-total mode: entering 1 still shifts degree down', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={null} />);
    enterD20(1);
    // 1 vs AC 15 = Critical Miss (already lowest), stays Critical Miss
    expect(screen.getByText('Critical Miss')).toBeInTheDocument();
  });

  // ── save terminology ──────────────────────────────────────────────────────

  test('uses save terminology for non-AC defenses', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="reflex" rollBonus={10} />);
    // reflex mod 5 → DC 15; d20=5 + bonus=10 → total=15 → Success
    enterD20(5);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.queryByText('Hit')).not.toBeInTheDocument();
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  test('shows "no DC available" when defenses is null', () => {
    render(<TargetRollResolver enemyTargets={[noDefenseEntry]} targetDefense="ac" rollBonus={5} />);
    enterD20(15);
    expect(screen.getByText('no DC available')).toBeInTheDocument();
  });

  test('getResults() returns null when input is empty', () => {
    const ref = createRef();
    render(
      <TargetRollResolver ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />
    );
    expect(ref.current.getResults()).toBeNull();
  });

  test('getResults() returns correct total (d20 + bonus) when rollBonus is set', () => {
    const ref = createRef();
    render(
      <TargetRollResolver ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />
    );
    enterD20(10);
    const results = ref.current.getResults();
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: 'cbt-goblin', name: 'Goblin', dc: 15, total: 15 }),
      ])
    );
  });

  test('getResults() returns raw d20 as total when rollBonus is null', () => {
    const ref = createRef();
    render(
      <TargetRollResolver ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={null} />
    );
    enterD20(20);
    const results = ref.current.getResults();
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ total: 20 }),
      ])
    );
  });
});
