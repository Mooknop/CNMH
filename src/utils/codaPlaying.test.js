import { describe, it, expect } from 'vitest';
import { playingEffectRefs, reconcileCodaPlayingEffects } from './codaPlaying';

const bagpipes = { id: 'bagpipes-of-turmoil', name: 'Bagpipes of Turmoil', playingEffect: 'coda-bagpipes-playing' };
const bagpipesMajor = { ...bagpipes, playingEffect: 'coda-bagpipes-playing-major' };
const lute = { id: 'entertainers-lute', name: "Entertainer's Lute", playingEffect: 'coda-lute-playing' };
const sword = { id: 'longsword', name: 'Longsword' };

const managed = (effectId) => expect.objectContaining({ effectId, grantedBy: 'playing' });

describe('playingEffectRefs', () => {
  it('collects refs from held gear, deduped, containers included', () => {
    expect(playingEffectRefs([sword, bagpipes, lute])).toEqual([
      'coda-bagpipes-playing', 'coda-lute-playing',
    ]);
    expect(playingEffectRefs([
      { id: 'case', container: { capacity: 2, contents: [lute] } },
    ])).toEqual(['coda-lute-playing']);
    expect(playingEffectRefs([bagpipes, bagpipes])).toEqual(['coda-bagpipes-playing']);
  });

  it('a Major staff resolves to the overridden ref (upstream applyVariant)', () => {
    expect(playingEffectRefs([bagpipesMajor])).toEqual(['coda-bagpipes-playing-major']);
  });

  it('empty without instruments (or with no inventory at all)', () => {
    expect(playingEffectRefs([sword])).toEqual([]);
    expect(playingEffectRefs(undefined)).toEqual([]);
  });
});

describe('reconcileCodaPlayingEffects', () => {
  const cast = { id: 'x1', effectId: 'heroism-1', appliedBy: 'Izzy' };

  it('adds missing managed entries while playing', () => {
    const next = reconcileCodaPlayingEffects([cast], ['coda-bagpipes-playing']);
    expect(next).toEqual([cast, managed('coda-bagpipes-playing')]);
  });

  it('removes managed entries when playing lapses (refs empty), keeping cast effects', () => {
    const next = reconcileCodaPlayingEffects(
      [cast, { id: 'p1', effectId: 'coda-bagpipes-playing', grantedBy: 'playing' }],
      [],
    );
    expect(next).toEqual([cast]);
  });

  it('swaps refs when the grade changes mid-performance', () => {
    const next = reconcileCodaPlayingEffects(
      [{ id: 'p1', effectId: 'coda-bagpipes-playing', grantedBy: 'playing' }],
      ['coda-bagpipes-playing-major'],
    );
    expect(next).toEqual([managed('coda-bagpipes-playing-major')]);
  });

  it('null when already reconciled — both directions', () => {
    expect(reconcileCodaPlayingEffects(
      [{ id: 'p1', effectId: 'coda-bagpipes-playing', grantedBy: 'playing' }],
      ['coda-bagpipes-playing'],
    )).toBeNull();
    expect(reconcileCodaPlayingEffects([cast], [])).toBeNull();
    expect(reconcileCodaPlayingEffects(undefined, [])).toBeNull();
  });

  it('never touches an identical effectId that it does not manage', () => {
    const authored = { id: 'a1', effectId: 'coda-bagpipes-playing' }; // no grantedBy
    const next = reconcileCodaPlayingEffects([authored], []);
    expect(next).toBeNull();
  });
});
