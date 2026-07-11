// Training GM-grant (#1191 S2) — turns a confirmed training result into a
// durable ability on the character's document.
//
// ⚠️ The grant is appended to a dedicated `trained[]` field, NOT feats[] /
// reactions[]: those are AUTHORED fields, and applyCharacterContentDiff
// field-merges them from the bundle on every content apply — a grant written
// there would be silently reverted by the next apply from a stale seed (the
// 2026-07-02 image-wipe failure mode). `trained` is in LIVE_CHARACTER_FIELDS
// (gmApi.js), so the live doc wins; resolveCharacterItems folds the entries
// into feats/reactions at content-resolve time, so the sheet and automation
// see them like authored abilities.

// The trained[] entry for a confirmed training queue entry: the grant payload
// ({ kind, feat | reaction }) plus provenance.
export function buildTrainedEntry(entry) {
  return {
    ...entry.grant,
    vendorId: entry.vendorId,
    offeringId: entry.offeringId,
    choiceId: entry.choiceId ?? null,
    grantedAt: Date.now(),
  };
}

/**
 * Grants a confirmed training result to the character's document.
 *
 * @param {object}   entry         - a 'training' result from the queue
 * @param {Array}    rawCharacters - ContentContext.rawCharacters (authored docs)
 * @param {Function} saveDocument  - gmApi.saveDocument(collection, id, doc)
 * @param {Function} [refresh]     - ContentContext.refresh (reload snapshot)
 * @param {Function} [appendLog]   - ({ type, charId, text }) => void
 * @returns {Promise<boolean>} true if the doc was found and saved
 */
export async function grantTrainedAbility({ entry, rawCharacters, saveDocument, refresh, appendLog }) {
  const doc = (rawCharacters || []).find((c) => String(c.id) === String(entry.charId));
  if (!doc || !entry.grant) return false;

  const updated = {
    ...doc,
    trained: [...(Array.isArray(doc.trained) ? doc.trained : []), buildTrainedEntry(entry)],
  };

  await saveDocument('character', String(entry.charId), updated);
  if (refresh) await refresh();

  if (appendLog) {
    const ability = entry.choiceName || entry.offeringName;
    appendLog({
      type: 'action',
      charId: entry.charId,
      text: `${entry.charName || 'A character'} completed training at ${entry.vendorName}: ${ability} learned`,
    });
  }
  return true;
}
