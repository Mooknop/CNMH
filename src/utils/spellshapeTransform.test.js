import { applyChainTransform, chainTransformCostNote } from './spellshapeTransform';

describe('applyChainTransform', () => {
  it('reduces a numeric action cost by the delta, clamped to the minimum', () => {
    expect(applyChainTransform(3, { actionDelta: -1 })).toBe(2);
    expect(applyChainTransform(2, { actionDelta: -1 })).toBe(1);
    expect(applyChainTransform(1, { actionDelta: -1 })).toBe(1); // min 1 default
  });

  it('honours an explicit minActions floor', () => {
    expect(applyChainTransform(2, { actionDelta: -3, minActions: 0 })).toBe(0);
    expect(applyChainTransform(2, { actionDelta: -3 })).toBe(1);
  });

  it('supports a positive delta too', () => {
    expect(applyChainTransform(1, { actionDelta: 1 })).toBe(2);
  });

  it('is a no-op without a numeric actionDelta', () => {
    expect(applyChainTransform(2, null)).toBe(2);
    expect(applyChainTransform(2, {})).toBe(2);
    expect(applyChainTransform(2, { actionDelta: 'x' })).toBe(2);
  });

  it('passes non-numeric costs through unchanged', () => {
    expect(applyChainTransform('reaction', { actionDelta: -1 })).toBe('reaction');
    expect(applyChainTransform('free', { actionDelta: -1 })).toBe('free');
  });
});

describe('chainTransformCostNote', () => {
  it('describes a reduction', () => {
    expect(chainTransformCostNote(2, { actionDelta: -1 })).toBe('Spellshape: −1 action (now 1)');
    expect(chainTransformCostNote(3, { actionDelta: -1 })).toBe('Spellshape: −1 action (now 2)');
  });

  it('returns null when the cost does not change', () => {
    expect(chainTransformCostNote(1, { actionDelta: -1 })).toBeNull(); // clamped, no change
    expect(chainTransformCostNote(2, null)).toBeNull();
    expect(chainTransformCostNote('reaction', { actionDelta: -1 })).toBeNull();
  });
});
