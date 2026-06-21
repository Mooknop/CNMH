// Given-away overlay (#656). `cnmh_removed_<characterId>` is an array of entry
// uids the player has handed to another PC. Authored inventory is immutable
// from the client, so a given-away authored item is masked here — filtered out
// of the effective tree (and therefore Bulk) before the loadout layer runs.
// Acquired-overlay items are removed by splicing their array instead, so they
// never reach this overlay; applying it to the merged list is still harmless.
//
// The walk is recursive so a Stowed item (which lives inside a container's
// contents) can be masked too. Containers are rebuilt immutably — the shared
// resolved objects are never mutated.
export const applyRemovedOverlay = (inventory, removed) => {
  const gone =
    removed instanceof Set ? removed : new Set(Array.isArray(removed) ? removed : []);
  if (gone.size === 0) return Array.isArray(inventory) ? inventory : [];

  const filter = (list) =>
    (Array.isArray(list) ? list : []).reduce((acc, entry) => {
      if (!entry || typeof entry !== 'object') {
        acc.push(entry);
        return acc;
      }
      if (entry.uid != null && gone.has(entry.uid)) return acc;
      if (entry.container && Array.isArray(entry.container.contents)) {
        acc.push({
          ...entry,
          container: { ...entry.container, contents: filter(entry.container.contents) },
        });
      } else {
        acc.push(entry);
      }
      return acc;
    }, []);

  return filter(inventory);
};

export default applyRemovedOverlay;
