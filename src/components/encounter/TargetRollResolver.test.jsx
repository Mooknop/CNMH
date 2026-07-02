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

  // ── degree-of-success effect text (#222) ──────────────────────────────────

  const fearDegrees = {
    'Critical Success': 'The target is unaffected.',
    'Success': 'The target is frightened 1.',
    'Failure': 'The target is frightened 2.',
    'Critical Failure': 'The target is frightened 3 and fleeing.',
  };

  test('renders authored degree text next to the computed degree', () => {
    render(
      <TargetRollResolver
        enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        degrees={fearDegrees}
      />
    );
    enterD20(10); // total 15 = AC → Hit → 'Success' text
    expect(screen.getByText('The target is frightened 1.')).toBeInTheDocument();
  });

  test('degree text renders on misses too', () => {
    render(
      <TargetRollResolver
        enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        degrees={fearDegrees}
      />
    );
    enterD20(5); // total 10 < AC → Miss → 'Failure' text
    expect(screen.getByText('The target is frightened 2.')).toBeInTheDocument();
  });

  test('no degrees prop → no degree text (legacy output unchanged)', () => {
    const { container } = render(
      <TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />
    );
    enterD20(10);
    expect(container.querySelector('.trr-degree-text')).toBeNull();
    expect(container.querySelector('.dmg-panel')).toBeNull();
  });

  // ── damage step (#222) ────────────────────────────────────────────────────

  const damageProfile = {
    expression: '2d6+4',
    typeLabel: null,
    riders: [
      { id: 'ie', label: "Implement's Empowerment", bonus: { flat: 4 }, defaultOn: true },
      {
        id: 'exploit-weakness', label: 'weakness (fire 5)',
        weakness: 5, appliesToEntryIds: ['cbt-goblin'], defaultOn: true,
      },
    ],
  };

  function enterDamage(value) {
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: String(value) } });
  }

  test('damage panel appears only after a hit', () => {
    const { container } = render(
      <TargetRollResolver
        enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={damageProfile}
      />
    );
    expect(container.querySelector('.dmg-panel')).toBeNull();
    enterD20(5); // miss
    expect(container.querySelector('.dmg-panel')).toBeNull();
    enterD20(10); // hit
    expect(container.querySelector('.dmg-panel')).not.toBeNull();
    expect(screen.getByText('2d6+4')).toBeInTheDocument();
  });

  test('hit: entered total + toggled riders + weakness flow into getResults()', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={damageProfile}
      />
    );
    enterD20(10); // hit
    enterDamage(9);
    // 9 + 4 (rider) + 5 (weakness, matching entry) = 18
    expect(ref.current.getResults()[0].damage).toMatchObject({ entered: 9, final: 18 });
  });

  test('crit doubles before weakness; the ×2 toggle disables doubling', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={damageProfile}
      />
    );
    enterD20(20); // crit
    enterDamage(9);
    // (9 + 4) × 2 + 5 = 31
    expect(ref.current.getResults()[0].damage.final).toBe(31);
    fireEvent.click(screen.getByRole('checkbox', { name: /crit ×2/i }));
    // 9 + 4 + 5 = 18
    expect(ref.current.getResults()[0].damage.final).toBe(18);
  });

  test('unticking a rider drops it from the total', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={damageProfile}
      />
    );
    enterD20(10);
    enterDamage(9);
    fireEvent.click(screen.getByRole('checkbox', { name: /Implement's Empowerment/i }));
    // 9 + 5 weakness only
    expect(ref.current.getResults()[0].damage.final).toBe(14);
  });

  test('damage is null on results without an entered total', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={damageProfile}
      />
    );
    enterD20(10);
    expect(ref.current.getResults()[0].damage).toBeNull();
  });

  // ── multi-instance entry (#1019) ──────────────────────────────────────────

  const flamingProfile = {
    expression: '2d8+4',
    typeLabel: 'piercing',
    riders: [
      { id: 'rune-flaming-dice', label: 'Flaming', dice: '1d6', type: 'fire', defaultOn: true },
      { id: 'ie', label: "Implement's Empowerment", bonus: { flat: 4 }, defaultOn: true },
    ],
  };

  test('mixed-type profile: per-part totals flow into typed instances', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={flamingProfile}
      />
    );
    enterD20(10); // hit
    fireEvent.change(screen.getByLabelText('rolled piercing total'), { target: { value: '9' } });
    // fire part still empty → damage stays null
    expect(ref.current.getResults()[0].damage).toBeNull();
    fireEvent.change(screen.getByLabelText('rolled fire total'), { target: { value: '4' } });
    const dmg = ref.current.getResults()[0].damage;
    // base 9 + 4 rider = 13 piercing, 4 fire
    expect(dmg.final).toBe(17);
    expect(dmg.instances).toEqual([
      { amount: 13, type: 'piercing' },
      { amount: 4, type: 'fire' },
    ]);
  });

  test('crit doubles each typed instance separately', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={flamingProfile}
      />
    );
    enterD20(20); // crit
    fireEvent.change(screen.getByLabelText('rolled piercing total'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('rolled fire total'), { target: { value: '4' } });
    const dmg = ref.current.getResults()[0].damage;
    expect(dmg.instances).toEqual([
      { amount: 26, type: 'piercing' },
      { amount: 8, type: 'fire' },
    ]);
    expect(dmg.final).toBe(34);
  });

  test('toggling the typed rider off reverts to single-total entry', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        damage={flamingProfile}
      />
    );
    enterD20(10);
    fireEvent.click(screen.getByRole('checkbox', { name: /Flaming/ }));
    enterDamage(9);
    const dmg = ref.current.getResults()[0].damage;
    expect(dmg.final).toBe(13); // 9 + 4 rider
    expect(dmg.instances).toBeUndefined();
  });

  // ── range increments (#530) ───────────────────────────────────────────────

  const at2nd = { 'cbt-goblin': { feet: 150, increments: 2, penalty: -2, beyondMaxRange: false } };
  const outOfRange = { 'cbt-goblin': { feet: 450, increments: 5, penalty: -8, beyondMaxRange: true } };

  test('applies the per-target range penalty to the total and degree', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        rangeByEntry={at2nd}
      />
    );
    // d20 10 + bonus 5 = 15 (= AC 15, a Hit) − 2 second-increment = 13 → Miss
    enterD20(10);
    expect(screen.getByText('Miss')).toBeInTheDocument();
    expect(ref.current.getResults()[0]).toMatchObject({ total: 13 });
  });

  test('shows the increment note for a target past the first increment', () => {
    render(
      <TargetRollResolver
        enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        rangeByEntry={at2nd}
      />
    );
    enterD20(10);
    expect(screen.getByText(/150 ft · 2nd increment -2/)).toBeInTheDocument();
  });

  test('out-of-range target shows Out of range and yields no degree', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        rangeByEntry={outOfRange}
      />
    );
    enterD20(20); // would crit at point blank
    expect(screen.getByText('Out of range')).toBeInTheDocument();
    expect(screen.queryByText('Critical Hit')).not.toBeInTheDocument();
    expect(ref.current.getResults()[0]).toMatchObject({ degree: null, outOfRange: true });
  });

  test('shows the Hunt Prey waiver note when the 2nd increment is ignored', () => {
    const preyAt2nd = { 'cbt-goblin': { feet: 150, increments: 2, penalty: 0, beyondMaxRange: false, waived: true } };
    render(
      <TargetRollResolver
        enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
        rangeByEntry={preyAt2nd}
      />
    );
    enterD20(10);
    expect(screen.getByText(/Hunt Prey: 2nd increment ignored/)).toBeInTheDocument();
    // No penalty applied — 15 still meets AC 15.
    expect(screen.getByText('Hit')).toBeInTheDocument();
  });

  test('no rangeByEntry → totals and degrees unchanged (legacy output)', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5}
      />
    );
    enterD20(10);
    expect(ref.current.getResults()[0]).toMatchObject({ total: 15, degree: 'success' });
    expect(ref.current.getResults()[0].range).toBeUndefined();
  });

  // ── situational bonus toggles (#274) ──────────────────────────────────────

  const limnedToggle = [{ id: 'effect-Limned-limned target', label: 'Limned (vs limned target)', bonus: 1 }];

  test('no toggle group rendered when toggles is empty', () => {
    render(<TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={5} />);
    expect(screen.queryByRole('group', { name: /situational bonuses/i })).toBeNull();
  });

  test('flipping a toggle adds its bonus and can shift Miss → Hit', () => {
    render(
      <TargetRollResolver
        enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={4} toggles={limnedToggle}
      />
    );
    enterD20(10); // 14 < AC 15 → Miss
    expect(screen.getByText('Miss')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Limned \(vs limned target\)/ }));
    // 14 + 1 = 15 = AC → Hit
    expect(screen.getByText('Hit')).toBeInTheDocument();
    expect(screen.getByLabelText(/computed total/i)).toHaveTextContent('= 15');
    expect(screen.getByLabelText(/applied circumstance/i)).toHaveTextContent('incl. +1');
  });

  test('free-form circumstance adjusts the total', () => {
    render(
      <TargetRollResolver enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={4} />
    );
    enterD20(10); // 14 → Miss
    fireEvent.change(screen.getByLabelText(/other circumstance/i), { target: { value: '2' } });
    // 14 + 2 = 16 → Hit
    expect(screen.getByText('Hit')).toBeInTheDocument();
  });

  test('getResults() carries the applied adjust + sources', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={4} toggles={limnedToggle}
      />
    );
    enterD20(10);
    fireEvent.click(screen.getByRole('button', { name: /Limned \(vs limned target\)/ }));
    const r = ref.current.getResults()[0];
    expect(r.total).toBe(15);
    expect(r.adjust).toBe(1);
    expect(r.adjustSources).toEqual(['Limned (vs limned target)']);
  });

  test('un-flipped toggle leaves the roll unchanged (no adjust on results)', () => {
    const ref = createRef();
    render(
      <TargetRollResolver
        ref={ref} enemyTargets={[goblinEntry]} targetDefense="ac" rollBonus={4} toggles={limnedToggle}
      />
    );
    enterD20(10);
    const r = ref.current.getResults()[0];
    expect(r.total).toBe(14);
    expect(r.adjust).toBeUndefined();
  });
});
