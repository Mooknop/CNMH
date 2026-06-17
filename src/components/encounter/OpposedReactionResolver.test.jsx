// OpposedReactionResolver — DC + d20 entry for opposed reactions, plus the
// optional skill picker (#445 — Upstage "roll the same skill the enemy used").
// When `skillOptions` is passed the player chooses the skill (default
// `defaultSkill`) and the selected option's bonus drives the total; without it
// the component falls back to the single derived rollBonus/skillLabel.

import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import OpposedReactionResolver from './OpposedReactionResolver';

// Harness exposing the resolver's imperative getResults() to assertions.
const Harness = forwardRef((props, ref) => {
  const inner = useRef(null);
  useImperativeHandle(ref, () => ({ getResults: () => inner.current.getResults() }));
  return <OpposedReactionResolver ref={inner} {...props} />;
});

const skillOptions = [
  { skill: 'performance', label: 'Performance', bonus: 18 },
  { skill: 'deception',   label: 'Deception',   bonus: 12 },
  { skill: 'athletics',   label: 'Athletics',   bonus: 9 },
];

const setDc  = (v) => fireEvent.change(screen.getByLabelText('opposed dc'), { target: { value: String(v) } });
const setD20 = (v) => fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: String(v) } });

describe('OpposedReactionResolver — skill picker (#445)', () => {
  it('renders a skill dropdown defaulting to defaultSkill with its bonus', () => {
    render(<OpposedReactionResolver skillOptions={skillOptions} defaultSkill="performance" />);
    const select = screen.getByLabelText('roll skill');
    expect(select).toHaveValue('performance');
    // Bonus badge reflects the default option, not the first-by-chance.
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+18');
    // All three skills are offered with their modifiers.
    expect(screen.getByRole('option', { name: 'Deception (+12)' })).toBeInTheDocument();
  });

  it('switching skill updates the bonus, the computed total, and getResults().skill', () => {
    const ref = React.createRef();
    render(<Harness ref={ref} skillOptions={skillOptions} defaultSkill="performance" />);
    setDc(20);
    setD20(10); // 10 + 18 (Performance) = 28
    expect(screen.getByLabelText('computed total')).toHaveTextContent('= 28');

    fireEvent.change(screen.getByLabelText('roll skill'), { target: { value: 'deception' } });
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+12');
    expect(screen.getByLabelText('computed total')).toHaveTextContent('= 22'); // 10 + 12
    expect(ref.current.getResults().skill).toBe('Deception');
    expect(ref.current.getResults().total).toBe(22);
  });

  it('falls back to the option matching defaultSkill, else the first option', () => {
    render(<OpposedReactionResolver skillOptions={skillOptions} defaultSkill="not-trained" />);
    expect(screen.getByLabelText('roll skill')).toHaveValue('performance'); // first option
  });

  it('surfaces the chosen skill in the result chip', () => {
    render(<OpposedReactionResolver skillOptions={skillOptions} defaultSkill="performance" />);
    setDc(15);
    setD20(5); // 5 + 18 = 23 ≥ 15 → success
    expect(screen.getByText('Performance vs DC 15')).toBeInTheDocument();
  });

  describe('no-choice path (Disrupting Performance) is unchanged', () => {
    it('shows the static skill label + rollBonus and getResults().skill is null', () => {
      const ref = React.createRef();
      render(<Harness ref={ref} rollBonus={10} skillLabel="Performance" />);
      expect(screen.queryByLabelText('roll skill')).toBeNull();
      expect(screen.getByText('Performance')).toBeInTheDocument(); // static label span
      expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+10');
      setDc(15);
      setD20(8); // 8 + 10 = 18
      expect(screen.getByLabelText('computed total')).toHaveTextContent('= 18');
      expect(ref.current.getResults().skill).toBeNull();
    });
  });
});
