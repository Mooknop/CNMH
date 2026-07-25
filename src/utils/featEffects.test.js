import { featSpeedEffects } from './featEffects';
import { computeEffectBonuses } from './EffectUtils';

const blessing = (overrides = {}) => ({
  id: 'feat-14',
  name: 'Blessing of the Devoted',
  source: 'Champion',
  level: 3,
  modifiers: [{ stat: 'speed', kind: 'status', amount: 5 }],
  ...overrides,
});

describe('featSpeedEffects', () => {
  it('synthesizes an entry/def pair for a feat with a speed modifier', () => {
    const out = featSpeedEffects({ feats: [blessing()] });
    expect(out).toHaveLength(1);
    expect(out[0].entry).toEqual({
      id: 'featspeed-feat-14',
      effectId: 'featspeed-feat-14',
    });
    expect(out[0].def).toEqual({
      id: 'featspeed-feat-14',
      name: 'Blessing of the Devoted',
      modifiers: [{ stat: 'speed', kind: 'status', amount: 5 }],
    });
  });

  it('carries ONLY the speed modifiers of a multi-stat feat', () => {
    const multi = blessing({
      modifiers: [
        { stat: 'speed', kind: 'status', amount: 5 },
        { stat: 'ac', kind: 'status', amount: 1 },
      ],
    });
    expect(featSpeedEffects({ feats: [multi] })[0].def.modifiers).toEqual([
      { stat: 'speed', kind: 'status', amount: 5 },
    ]);
  });

  it('falls back to a name slug for feats authored without an id', () => {
    const boon = blessing({ id: undefined, name: 'Rust Blessing' });
    expect(featSpeedEffects({ feats: [boon] })[0].entry.effectId)
      .toBe('featspeed-rust-blessing');
  });

  it('contributes nothing for feats with no modifiers, or no character', () => {
    expect(featSpeedEffects({ feats: [blessing({ modifiers: undefined })] })).toEqual([]);
    expect(featSpeedEffects({ feats: [blessing({ modifiers: [{ stat: 'ac', kind: 'status', amount: 1 }] })] })).toEqual([]);
    expect(featSpeedEffects({ feats: [] })).toEqual([]);
    expect(featSpeedEffects({})).toEqual([]);
    expect(featSpeedEffects(null)).toEqual([]);
  });

  it('nets through computeEffectBonuses under PF2e status stacking', () => {
    const [synth] = featSpeedEffects({ feats: [blessing()] });
    // Best status bonus wins (not 5 + 10)…
    const vsStatus = computeEffectBonuses(
      [synth.entry, { id: 'q', effectId: 'quicksilver' }],
      [synth.def, {
        id: 'quicksilver', name: 'Quicksilver Mutagen',
        modifiers: [{ stat: 'speed', kind: 'status', amount: 10 }],
      }],
    );
    expect(vsStatus.speed.total).toBe(10);

    // …but a different bonus type stacks with it.
    const vsItem = computeEffectBonuses(
      [synth.entry, { id: 'b', effectId: 'boots' }],
      [synth.def, {
        id: 'boots', name: 'Boots of Bounding',
        modifiers: [{ stat: 'speed', kind: 'item', amount: 5 }],
      }],
    );
    expect(vsItem.speed.total).toBe(10);
  });
});
