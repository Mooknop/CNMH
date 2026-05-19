import {
  costToForm,
  costFromForm,
  strikeToForm,
  strikeFromForm,
} from './AbilitySubforms';
import { sampleCharacters, items } from '../../data';
import { renderActionIcons } from '../../utils/actionIconUtils';

describe('costToForm / costFromForm', () => {
  it('maps a numeric action (item style) to the canonical actionCount', () => {
    expect(costToForm({ action: 2 })).toMatchObject({ mode: '2' });
    expect(costFromForm(costToForm({ action: 2 }))).toEqual({ actionCount: 2 });
  });

  it('maps a numeric actionCount through unchanged', () => {
    expect(costFromForm(costToForm({ actionCount: 3 }))).toEqual({ actionCount: 3 });
  });

  it('parses a string "One to Two" range into Variable', () => {
    const c = costToForm({ actionCount: 'One to Two' });
    expect(c).toMatchObject({ mode: 'V', v1: true, v2: true, v3: false });
    expect(costFromForm(c)).toEqual({
      variableActionCount: { min: 1, max: 2 },
      actionCount: '1 to 2',
    });
  });

  it('reads a variableActionCount object', () => {
    const c = costToForm({ variableActionCount: { min: 1, max: 3 } });
    expect(c).toMatchObject({ mode: 'V', v1: true, v2: true, v3: true });
    expect(costFromForm(c)).toEqual({
      variableActionCount: { min: 1, max: 3 },
      actionCount: '1 to 3',
    });
  });

  it('recognises a reaction from the actions string', () => {
    expect(costToForm({ actions: 'Reaction' })).toMatchObject({ mode: 'R' });
    expect(costFromForm(costToForm({ actions: 'Reaction' }))).toEqual({ actions: 'Reaction' });
  });

  it('recognises "Two Actions" text', () => {
    expect(costFromForm(costToForm({ actions: 'Two Actions' }))).toEqual({ actionCount: 2 });
  });

  it('treats an unrecognised cost as unset (caller preserves it)', () => {
    expect(costToForm({ actions: 'Special' })).toMatchObject({ mode: '' });
    expect(costFromForm({ mode: '' })).toBeNull();
  });
});

describe('strikeToForm / strikeFromForm', () => {
  it('round-trips every managed scalar and preserves unknown keys', () => {
    const src = {
      name: 'Hammer Throw',
      proficiency: 'martial',
      type: 'ranged',
      range: '20ft',
      action: 1,
      damage: '1d6',
      traits: ['Attack', 'Thrown'],
      description: 'Chuck it.',
      attackBonus: 12, // unknown key — must survive
    };
    const out = strikeFromForm(strikeToForm(src));
    expect(out).toEqual({
      name: 'Hammer Throw',
      proficiency: 'martial',
      type: 'ranged',
      range: '20ft',
      damage: '1d6',
      traits: ['Attack', 'Thrown'],
      description: 'Chuck it.',
      attackBonus: 12,
      actionCount: 1, // canonical (was `action: 1`)
    });
  });

  it('preserves an exotic, unmodelled cost verbatim', () => {
    const out = strikeFromForm(strikeToForm({ name: 'X', actions: 'Special' }));
    expect(out).toEqual({ name: 'X', actions: 'Special' });
  });

  it('keeps a variable action cost renderable', () => {
    const out = strikeFromForm(strikeToForm({ name: 'Blast', actionCount: 'One to Two' }));
    expect(out.variableActionCount).toEqual({ min: 1, max: 2 });
  });
});

// The canonical cost re-emit changes the stored key but must NOT change what a
// player sees. Compare the consumer-rendered action descriptor (StrikesList /
// ActionCardList both resolve via this same precedence) plus every non-cost
// field, for every real bundled strike.
const COST_KEYS = ['action', 'actionCount', 'variableActionCount', 'actions'];
const stripCost = (o) => {
  const r = { ...o };
  COST_KEYS.forEach((k) => delete r[k]);
  return r;
};
const actionText = (s) => {
  if (s.actions) return s.actions;
  if (s.variableActionCount) {
    const { min, max } = s.variableActionCount;
    return `${min} to ${max} Actions`;
  }
  const n = s.actionCount || s.action || 1;
  return `${n} Action${n !== 1 ? 's' : ''}`;
};

describe('bundled strike resolve-parity (Slice 1 gate)', () => {
  const bundledStrikeLists = [];
  sampleCharacters.forEach((c) => {
    if (Array.isArray(c.strikes) && c.strikes.length) {
      bundledStrikeLists.push([`character ${c.id}`, c.strikes]);
    }
  });
  items.forEach((it) => {
    if (it.strikes) {
      bundledStrikeLists.push([
        `item ${it.id}`,
        Array.isArray(it.strikes) ? it.strikes : [it.strikes],
      ]);
    }
  });

  it('covers real bundled strikes', () => {
    expect(bundledStrikeLists.length).toBeGreaterThan(0);
  });

  it.each(bundledStrikeLists)('%s round-trips losslessly for the player', (_label, strikes) => {
    strikes.forEach((src) => {
      const out = strikeFromForm(strikeToForm(src));
      expect(stripCost(out)).toEqual(stripCost(src));
      expect(renderActionIcons(actionText(out))).toEqual(renderActionIcons(actionText(src)));
    });
  });
});
