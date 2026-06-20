// Crafting GM-grant (#588, Slice E) — turns a confirmed crafting result into a
// durable inventory item on the character's document.
//
// The crafted item is appended to the RAW character doc's inventory as a catalog
// ref entry (not a resolved item — that would inline the catalog) and persisted
// to the DO via saveDocument. Refreshing content then re-resolves the doc, so
// the item shows up through the normal inventory pipeline. Single write path →
// no double-counting (we deliberately do not also stage it in the acquired
// overlay, which would need reconciliation).

import { newEntryUid } from './uid';

// The catalog ref entry to append to a character doc's inventory.
export function buildInventoryEntry(entry) {
  const e = { ref: entry.ref, quantity: 1, uid: newEntryUid() };
  if (entry.level != null) e.level = entry.level;
  return e;
}

/**
 * Grants a confirmed crafting result to the character's document.
 *
 * @param {object}   entry         - a 'crafting' result from the queue
 * @param {Array}    rawCharacters - ContentContext.rawCharacters (authored docs)
 * @param {Function} saveDocument  - gmApi.saveDocument(collection, id, doc)
 * @param {Function} [refresh]     - ContentContext.refresh (reload snapshot)
 * @param {Function} [appendLog]   - ({ type, charId, text }) => void
 * @returns {Promise<boolean>} true if the doc was found and saved
 */
export async function grantCraftedItem({ entry, rawCharacters, saveDocument, refresh, appendLog }) {
  const doc = (rawCharacters || []).find((c) => String(c.id) === String(entry.charId));
  if (!doc) return false;

  const updated = {
    ...doc,
    inventory: [...(Array.isArray(doc.inventory) ? doc.inventory : []), buildInventoryEntry(entry)],
  };

  await saveDocument('character', String(entry.charId), updated);
  if (refresh) await refresh();

  if (appendLog) {
    appendLog({
      type: 'action',
      charId: entry.charId,
      text: `${entry.charName || 'A character'} crafted ${entry.itemName} — added to inventory`,
    });
  }
  return true;
}
