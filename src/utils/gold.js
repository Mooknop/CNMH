// Personal gold lives in the live `cnmh_gold_<id>` session overlay; the
// character doc gained a durable `gold` field via the reconciliation epic
// (#558). The doc's gold is the baseline and the overlay is the live value on
// top of it. `docGold` is used as the overlay's DEFAULT everywhere gold is read
// (#670): `useSyncedState`/seed logic only fall back to it when neither the
// session nor localStorage has a value — i.e. on a fresh load or right after a
// reseed clears the overlay — so committed gold shows through instead of 0.
// Until gold is actually committed to a doc, `character.gold` is absent and this
// returns 0, exactly matching the old literal default.
export const docGold = (character) => {
  const g = character?.gold;
  return typeof g === 'number' && Number.isFinite(g) ? g : 0;
};

export default docGold;
