import {
  DEGREE_LABELS,
  ATTACK_DEGREE_LABELS,
  DEGREE_CLASS,
  degreeLabel,
  degreeClass,
} from './degreeDisplay';

const DEGREES = ['criticalSuccess', 'success', 'failure', 'criticalFailure'];

describe('degreeDisplay', () => {
  it('covers all four degrees in every map', () => {
    for (const map of [DEGREE_LABELS, ATTACK_DEGREE_LABELS, DEGREE_CLASS]) {
      expect(Object.keys(map).sort()).toEqual([...DEGREES].sort());
    }
  });

  it('degreeLabel speaks save flavor by default and Hit/Miss for attacks', () => {
    expect(degreeLabel('criticalSuccess')).toBe('Critical Success');
    expect(degreeLabel('failure')).toBe('Failure');
    expect(degreeLabel('criticalSuccess', { attack: true })).toBe('Critical Hit');
    expect(degreeLabel('failure', { attack: true })).toBe('Miss');
  });

  it('degreeClass maps to the shared save-* styling hooks', () => {
    expect(degreeClass('criticalSuccess')).toBe('save-crit-success');
    expect(degreeClass('criticalFailure')).toBe('save-crit-failure');
  });

  it('unknown degrees degrade gracefully', () => {
    expect(degreeLabel('mystery')).toBe('mystery');
    expect(degreeClass('mystery')).toBe('');
  });
});
