import { describe, it, expect } from 'vitest';
import { entryPortrait } from './stagePortrait';

const characters = [
  { id: 'kestrel', name: 'Kestrel', image: 'kestrel.png', imagePosition: { x: 40, y: 10 } },
  { id: 'brakk', name: 'Brakk' }, // no image
];

describe('entryPortrait', () => {
  it('resolves a PC entry to its content image + crop', () => {
    expect(entryPortrait({ kind: 'pc', charId: 'kestrel' }, characters)).toEqual({
      src: '/api/images/kestrel.png',
      imagePosition: { x: 40, y: 10 },
    });
  });

  it('returns no src for a PC without an image (→ monogram fallback)', () => {
    expect(entryPortrait({ kind: 'pc', charId: 'brakk' }, characters)).toEqual({
      src: null,
      imagePosition: null,
    });
  });

  it('returns no src for an unknown PC id', () => {
    expect(entryPortrait({ kind: 'pc', charId: 'ghost' }, characters).src).toBeNull();
  });

  it('uses the bridge-relayed token URL for an enemy', () => {
    expect(
      entryPortrait({ kind: 'enemy', name: 'Ogre', bestiary: { img: '/api/images/tok-ogre.png' } }, characters)
    ).toEqual({ src: '/api/images/tok-ogre.png', imagePosition: null });
  });

  it('returns no src for an enemy whose token has not resolved yet (img null)', () => {
    expect(entryPortrait({ kind: 'enemy', name: 'Ogre', bestiary: { img: null } }, characters).src).toBeNull();
    expect(entryPortrait({ kind: 'enemy', name: 'Ogre' }, characters).src).toBeNull();
  });

  it('tolerates a null entry / empty characters', () => {
    expect(entryPortrait(null)).toEqual({ src: null, imagePosition: null });
    expect(entryPortrait({ kind: 'pc', charId: 'kestrel' }).src).toBeNull();
  });
});
