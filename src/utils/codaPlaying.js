// Coda staves' "while playing" bonuses (#935). Each Coda instrument grants its
// skill (and, for the Drums of War, Speed) bonuses only while the holder is
// playing (a Composition cantrip sustained — utils/playing.js). The staff's
// catalog item carries a `playingEffect` ref into the effect catalog (+1 defs;
// the Major grade's variant overrides it to the +2 def), and the watcher
// (useCodaPlayingSweep) writes REAL entries into cnmh_effects_<charId> — not
// synthetic sheet-only effects — so roll-time consumers (resolveActionRoll's
// Performance/Demoralize checks) see the bonus, not just the sheet.
//
// Managed entries are tagged `grantedBy: 'playing'`; reconcile only ever
// touches those, so authored/cast effects are never disturbed.

import { flattenInventory } from './InventoryUtils';
import { newEntryUid } from './uid';

export const PLAYING_GRANT = 'playing';

// The playing-gated effect refs granted by the character's held gear. Reads the
// resolved inventory, so a Major staff's variant override has already replaced
// the ref with the +2 def.
export const playingEffectRefs = (inventory) => {
  const refs = flattenInventory(inventory)
    .filter((it) => typeof it?.playingEffect === 'string' && it.playingEffect)
    .map((it) => it.playingEffect);
  return [...new Set(refs)];
};

/**
 * Reconcile the character's active effects with the playing-gated refs they
 * should currently have (empty when not playing). Adds missing refs, removes
 * managed entries whose ref no longer applies, and returns the next array —
 * or null when nothing changed.
 */
export const reconcileCodaPlayingEffects = (effects, refs) => {
  const list = Array.isArray(effects) ? effects : [];
  const want = new Set(refs || []);

  const kept = list.filter((e) => e?.grantedBy !== PLAYING_GRANT || want.has(e.effectId));
  const have = new Set(
    list.filter((e) => e?.grantedBy === PLAYING_GRANT).map((e) => e.effectId)
  );
  const added = [...want]
    .filter((ref) => !have.has(ref))
    .map((ref) => ({
      id: newEntryUid(),
      effectId: ref,
      grantedBy: PLAYING_GRANT,
      source: 'Playing',
      ts: Date.now(),
    }));

  if (kept.length === list.length && added.length === 0) return null;
  return [...kept, ...added];
};
