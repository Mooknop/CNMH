import React, { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import {
  toInt,
  toNum,
  rollToForm,
  rollFromForm,
  frequencyRuleToForm,
  frequencyRuleFromForm,
  immunityToForm,
  immunityFromForm,
  variantsToForm,
  variantsFromForm,
  VariantsControl,
  FrequencyRuleControl,
} from './AbilitySubforms';

// First coverage for the GM ability-authoring subforms (#1311 proving ground):
// the to/from-form codecs carry the authored ability JSON round trip, so a
// regression here silently corrupts abilities on the next GM save.

describe('numeric coercers', () => {
  it('toInt/toNum parse and fall back to 0 on garbage', () => {
    expect(toInt('7')).toBe(7);
    expect(toInt('x')).toBe(0);
    expect(toNum('2.5')).toBe(2.5);
    expect(toNum('')).toBe(0);
  });
});

describe('roll codec', () => {
  it('round-trips a skill roll config', () => {
    const authored = { type: 'skill', skill: 'athletics', bonus: 2 };
    expect(rollFromForm(rollToForm(authored))).toEqual(authored);
  });

  it('emits null when no type is set (existing actions unaffected)', () => {
    expect(rollFromForm(rollToForm(undefined))).toBeNull();
    expect(rollFromForm({ type: '', skill: 'athletics', bonus: '3' })).toBeNull();
  });

  it('drops skill for non-skill types and unparseable bonuses', () => {
    expect(rollFromForm({ type: 'flat', skill: 'athletics', bonus: 'nope' })).toEqual({ type: 'flat' });
  });
});

describe('frequencyRule codec', () => {
  it('round-trips { per, uses }', () => {
    const authored = { per: 'day', uses: 3 };
    expect(frequencyRuleFromForm(frequencyRuleToForm(authored))).toEqual(authored);
  });

  it('normalizes an unknown per to untracked (null)', () => {
    expect(frequencyRuleFromForm(frequencyRuleToForm({ per: 'fortnight', uses: 2 }))).toBeNull();
  });

  it('clamps invalid uses back to 1', () => {
    expect(frequencyRuleFromForm({ per: 'hour', uses: '0' })).toEqual({ per: 'hour', uses: 1 });
  });
});

describe('immunity codec', () => {
  it('round-trips duration + per-caster scope', () => {
    const authored = { duration: { value: 10, unit: 'minute' }, scope: 'per-caster' };
    expect(immunityFromForm(immunityToForm(authored))).toEqual(authored);
  });

  it('omits scope for the default any-caster immunity', () => {
    expect(immunityFromForm({ value: '1', unit: 'day', scope: 'any' })).toEqual({
      duration: { value: 1, unit: 'day' },
    });
  });

  it('rejects zero/negative/blank durations', () => {
    expect(immunityFromForm({ value: '0', unit: 'day', scope: 'any' })).toBeNull();
    expect(immunityFromForm({ value: '', unit: 'day', scope: 'any' })).toBeNull();
  });
});

describe('variants codec', () => {
  it('round-trips rows and preserves unmodelled per-row keys via rest', () => {
    const authored = [{ actions: 2, note: '+Con to damage', dcDelta: -10, custom: 'ride-along' }];
    expect(variantsFromForm(variantsToForm(authored))).toEqual(authored);
  });

  it('drops information-free rows (bare action count) and empty lists', () => {
    expect(variantsFromForm([{ actions: '2', note: '', dcDelta: '', rest: {} }])).toBeNull();
    expect(variantsFromForm([])).toBeNull();
  });

  it('rejects out-of-range action counts', () => {
    expect(variantsFromForm([{ actions: '4', note: 'big', dcDelta: '', rest: {} }])).toBeNull();
  });
});

// Controlled-component harness: owns the form state like GmCharacters does.
const VariantsHarness = () => {
  const [rows, setRows] = useState([]);
  return (
    <div>
      <VariantsControl value={rows} onChange={setRows} idPrefix="t" />
      <output data-testid="authored">{JSON.stringify(variantsFromForm(rows))}</output>
    </div>
  );
};

describe('VariantsControl', () => {
  it('adds a row, edits it, and emits the authored shape', () => {
    renderWithProviders(<VariantsHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    fireEvent.change(screen.getByLabelText('t-variant-0-actions'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('t-variant-0-note'), { target: { value: '+Con to damage' } });
    fireEvent.change(screen.getByLabelText('t-variant-0-dc'), { target: { value: '-10' } });
    expect(JSON.parse(screen.getByTestId('authored').textContent)).toEqual([
      { actions: 2, note: '+Con to damage', dcDelta: -10 },
    ]);
  });

  it('removes a row', () => {
    renderWithProviders(<VariantsHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByTestId('authored')).toHaveTextContent('null');
  });
});

const FrequencyHarness = () => {
  const [form, setForm] = useState(frequencyRuleToForm(null));
  return (
    <div>
      <FrequencyRuleControl value={form} onChange={setForm} idPrefix="t" />
      <output data-testid="authored">{JSON.stringify(frequencyRuleFromForm(form))}</output>
    </div>
  );
};

describe('FrequencyRuleControl', () => {
  it('reveals the uses field only once a period is picked, and emits the rule', () => {
    renderWithProviders(<FrequencyHarness />);
    expect(screen.queryByLabelText('t-frequency-uses')).toBeNull();
    fireEvent.change(screen.getByLabelText('t-frequency-per'), { target: { value: 'day' } });
    fireEvent.change(screen.getByLabelText('t-frequency-uses'), { target: { value: '3' } });
    expect(JSON.parse(screen.getByTestId('authored').textContent)).toEqual({ per: 'day', uses: 3 });
  });
});
