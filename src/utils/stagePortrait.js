// Resolve the portrait art for an encounter order entry (#473).
//   · PC  → the content character's uploaded image (/api/images/<id>), plus its
//           authored crop (imagePosition), resolved by charId.
//   · foe → the bridge-relayed token URL on the entry's bestiary block, which is
//           already a stable app-origin URL (or null until the upload resolves).
// Pure so it can be unit-tested and reused by the banner now and reactor avatars
// later (#476). Returns { src, imagePosition }; src is null when no art is
// available, so the caller falls back to a monogram.
export const entryPortrait = (entry, characters = []) => {
  if (!entry) return { src: null, imagePosition: null };

  if (entry.kind === 'pc' && entry.charId) {
    const character = (characters || []).find((c) => c && c.id === entry.charId);
    if (character?.image) {
      return {
        src: `/api/images/${character.image}`,
        imagePosition: character.imagePosition || null,
      };
    }
    return { src: null, imagePosition: null };
  }

  // Enemy / non-PC: the bridge stamps a resolved token URL (null until ready).
  return { src: entry.bestiary?.img || null, imagePosition: null };
};

export default entryPortrait;
