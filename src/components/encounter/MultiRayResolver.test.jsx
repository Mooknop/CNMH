// MultiRayResolver — unit tests. Renders the real SequentialAttackSteps driver
// (#1691, LOCKED design: sequential, one ray at a time) so these assert the
// actual tap-pad idiom rather than a stand-in. Each ray gets its own d20 tap
// pad; committing one ray freezes its degree and advances to the next.

import React, { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MultiRayResolver from './MultiRayResolver';

const rollPad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) =>
  fireEvent.click(within(rollPad()).getByRole('button', { name: String(n), exact: true }));
const confirmRay = (n) => fireEvent.click(screen.getByRole('button', { name: `Confirm ray ${n}` }));
const rollRay = (n, face) => { tapFace(face); confirmRay(n); };

const targets = [
  { entryId: 'e1', name: 'Goblin', defenses: { ac: 15 } },
  { entryId: 'e2', name: 'Orc', defenses: { ac: 18 } },
];

describe('MultiRayResolver', () => {
  it('renders the first ray of N in the step heading', () => {
    render(<MultiRayResolver rayCount={3} enemyTargets={targets} rollBonus={9} />);
    expect(screen.getByText('Ray 1 of 3')).toBeInTheDocument();
  });

  it('renders nothing when there are no targets', () => {
    const { container } = render(<MultiRayResolver rayCount={3} enemyTargets={[]} rollBonus={9} />);
    expect(container.firstChild).toBeNull();
  });

  it('defaults ray i to target i, falling back to the last target', () => {
    render(<MultiRayResolver rayCount={3} enemyTargets={targets} rollBonus={9} />);
    // Ray 1 (current step) targets Goblin by default.
    expect(screen.getByLabelText('ray 1 target')).toHaveValue('e1');
    rollRay(1, 10);
    // Ray 2 clamps... actually ray 1→target0, ray2→target1 (Orc).
    expect(screen.getByLabelText('ray 2 target')).toHaveValue('e2');
    rollRay(2, 10);
    // Ray 3 clamps to the last target (Orc).
    expect(screen.getByLabelText('ray 3 target')).toHaveValue('e2');
  });

  it('takes the map tap order as the per-ray default (#1749 OQ-2b)', () => {
    // Tapped Orc first, then Goblin — tap order IS ray order.
    render(<MultiRayResolver rayCount={2} enemyTargets={targets} rollBonus={9} tapOrder={['e2', 'e1']} />);
    expect(screen.getByLabelText('ray 1 target')).toHaveValue('e2');
    rollRay(1, 10);
    expect(screen.getByLabelText('ray 2 target')).toHaveValue('e1');
  });

  it('ignores a tap-order id that is no longer a target, and rays past the end', () => {
    render(<MultiRayResolver rayCount={2} enemyTargets={targets} rollBonus={9} tapOrder={['e-gone']} />);
    // Falls straight back to the pre-existing "ray i → target i" rule.
    expect(screen.getByLabelText('ray 1 target')).toHaveValue('e1');
    rollRay(1, 10);
    expect(screen.getByLabelText('ray 2 target')).toHaveValue('e2');
  });

  it('hides the per-ray target select when only one target is selected', () => {
    render(<MultiRayResolver rayCount={2} enemyTargets={[targets[0]]} rollBonus={9} />);
    expect(screen.queryByLabelText(/ray 1 target/)).not.toBeInTheDocument();
  });

  it('changing a ray target re-scopes that ray before it is rolled', () => {
    const ref = createRef();
    render(<MultiRayResolver ref={ref} rayCount={1} enemyTargets={targets} rollBonus={9} />);
    fireEvent.change(screen.getByLabelText('ray 1 target'), { target: { value: 'e2' } });
    rollRay(1, 10);
    expect(ref.current.getResults()[0].results[0]).toMatchObject({ name: 'Orc' });
  });

  it('getResults returns one entry per COMMITTED ray with the chosen target, sequentially', () => {
    const ref = createRef();
    render(<MultiRayResolver ref={ref} rayCount={2} enemyTargets={targets} rollBonus={9} />);
    expect(ref.current.getResults()).toHaveLength(0); // nothing rolled yet

    rollRay(1, 10); // 10 + 9 = 19 vs Goblin AC 15 → hit
    let res = ref.current.getResults();
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ rayIndex: 0 });
    expect(res[0].results[0]).toMatchObject({ name: 'Goblin', degree: 'success', total: 19 });

    rollRay(2, 10); // vs Orc AC 18 → 19 hit too
    res = ref.current.getResults();
    expect(res).toHaveLength(2);
    expect(res[1].results[0]).toMatchObject({ name: 'Orc' });
  });

  it('drops rays with no d20 entered — getResults reflects only committed rays', () => {
    const ref = createRef();
    render(<MultiRayResolver ref={ref} rayCount={2} enemyTargets={targets} rollBonus={9} />);
    rollRay(1, 10);
    // Ray 2 is never rolled — getResults stays at length 1.
    const res = ref.current.getResults();
    expect(res).toHaveLength(1);
    expect(res[0].rayIndex).toBe(0);
    expect(ref.current.isComplete()).toBe(false);
  });

  it('isComplete flips true once every ray has been rolled', () => {
    const ref = createRef();
    render(<MultiRayResolver ref={ref} rayCount={2} enemyTargets={targets} rollBonus={9} />);
    rollRay(1, 10);
    expect(ref.current.isComplete()).toBe(false);
    rollRay(2, 10);
    expect(ref.current.isComplete()).toBe(true);
  });

  it('shows the grouped damage entry only once every ray has been rolled (#222)', () => {
    render(
      <MultiRayResolver
        rayCount={2} enemyTargets={targets} rollBonus={9}
        damage={{ expression: '2d6', typeLabel: 'fire', riders: [] }}
      />
    );
    expect(screen.queryAllByLabelText('rolled damage total')).toHaveLength(0);
    rollRay(1, 10);
    expect(screen.queryAllByLabelText('rolled damage total')).toHaveLength(0);
    rollRay(2, 10);
    // Both rays hit → two grouped damage rows appear together.
    expect(screen.getAllByLabelText('rolled damage total')).toHaveLength(2);
  });

  it('forwards the authored degree-text map to the note line (#222)', () => {
    render(
      <MultiRayResolver
        rayCount={1} enemyTargets={targets} rollBonus={9}
        degrees={{ Success: 'zap' }}
      />
    );
    rollRay(1, 10);
    expect(screen.getByText(/zap/)).toBeInTheDocument();
  });

  it('forwards the conditional toggles to the current ray, independently per ray (#274)', () => {
    const toggles = [{ id: 'effect-Limned-limned target', label: 'Limned (vs limned target)', bonus: 1 }];
    render(<MultiRayResolver rayCount={2} enemyTargets={targets} rollBonus={9} toggles={toggles} />);
    expect(screen.getByRole('button', { name: /Limned \(vs limned target\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Limned \(vs limned target\)/ }));
    rollRay(1, 10);
    // Ray 2's toggle starts fresh (unpressed) — independent per-ray state.
    expect(screen.getByRole('button', { name: /Limned \(vs limned target\)/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports progress via onProgress as each ray commits', () => {
    const onProgress = vi.fn();
    render(<MultiRayResolver rayCount={2} enemyTargets={targets} rollBonus={9} onProgress={onProgress} />);
    rollRay(1, 10);
    expect(onProgress).toHaveBeenLastCalledWith(1, 2);
    rollRay(2, 10);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
