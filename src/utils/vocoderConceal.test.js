import { describe, it, expect } from 'vitest';
import { hasVocoder, withVocoderConcealed, withoutVocoderConcealed, VOCODER_ID } from './vocoderConceal';

const vocoder = { id: VOCODER_ID, name: 'Vocoder of Invisibility' };
const lute = { id: 'entertainers-lute', name: "Entertainer's Lute" };
const vocoderConcealed = { id: 'concealed', value: null, source: 'vocoder' };
const manualConcealed = { id: 'concealed', value: null };

describe('hasVocoder', () => {
  it('finds the vocoder at top level and inside containers', () => {
    expect(hasVocoder([lute, vocoder])).toBe(true);
    expect(hasVocoder([
      { id: 'backpack', container: { capacity: 4, contents: [vocoder] } },
    ])).toBe(true);
  });

  it('false without it (or with no inventory at all)', () => {
    expect(hasVocoder([lute])).toBe(false);
    expect(hasVocoder([])).toBe(false);
    expect(hasVocoder(undefined)).toBe(false);
  });
});

describe('withVocoderConcealed', () => {
  it('appends the tagged concealed entry', () => {
    expect(withVocoderConcealed([{ id: 'frightened', value: 1 }])).toEqual([
      { id: 'frightened', value: 1 },
      vocoderConcealed,
    ]);
    expect(withVocoderConcealed(undefined)).toEqual([vocoderConcealed]);
  });

  it('null when already concealed — by the vocoder or a manual toggle', () => {
    expect(withVocoderConcealed([vocoderConcealed])).toBeNull();
    expect(withVocoderConcealed([manualConcealed])).toBeNull();
  });
});

describe('withoutVocoderConcealed', () => {
  it('removes only the vocoder-tagged entry', () => {
    expect(withoutVocoderConcealed([{ id: 'frightened', value: 1 }, vocoderConcealed]))
      .toEqual([{ id: 'frightened', value: 1 }]);
  });

  it('null when there is nothing to remove; a manual Concealed is left alone', () => {
    expect(withoutVocoderConcealed([manualConcealed])).toBeNull();
    expect(withoutVocoderConcealed([])).toBeNull();
    expect(withoutVocoderConcealed(undefined)).toBeNull();
  });
});
