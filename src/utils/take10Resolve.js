// Resolution pass for a completed "Take 10" (#562, epic #536).
//
// Fired GM-side (PlayModeControl) the moment every party PC is ready, alongside
// the single central clock advance. The GM client is the single writer, so this
// runs exactly once per beat. React-free: it takes hooks' return values as
// plain args (like consumables.js / itemEffects.js).
//
// Per the campaign's house rule, Refocus restores ALL of a character's Focus
// Points (the out-of-combat auto-refill was removed, so Refocus is now the real
// recovery mechanism). Focus is stored as "points spent" in cnmh_focus_<id>
// (0 = full), so restoring all = writing 0.
//
// Skill/utility activities (Treat Wounds, Repair, Identify Magic, Learn a Spell,
// the generic slot) still resolve through their own interactive surfaces — here
// they're recorded as a per-player session-log summary so the table has a record
// of what each character spent the block doing.
//
// Item-targeted consumables (#566) DO resolve here, through the same machinery
// the inventory surfaces use: an `oil` entry runs applyItemEffect (and marks the
// oil used in cnmh_consumed_<id>); a `talisman` entry writes the affix overlay
// (cnmh_affixed_<id>). Affixing does not consume — talismans are consumed on
// activation, a combat action outside this block. `nowSecs` is the block-END
// game time (the GM advances the clock by the block length right after this), so
// an oil's duration runs from when its 10-minute application finishes, not when
// it starts.

import { applyItemEffect } from './itemEffects';
import { affix } from './affix';

export const REFOCUS_ID = 'refocus';

/**
 * Resolve every party member's Take 10 allocation for the live beat.
 * @param {Object}   args
 * @param {Array}    args.characters - party characters ({ id, name })
 * @param {number}   args.openedAt   - the live beat stamp (only matching allocs resolve)
 * @param {number}   [args.nowSecs]  - block-END absolute game seconds (stamps oil expiry)
 * @param {Function} args.getState   - (id, key) => value
 * @param {Function} args.sendUpdate - (id, key, value) => void
 * @param {Function} args.appendLog  - ({ type, text }) => void
 */
export function resolveTake10({ characters, openedAt, nowSecs, getState, sendUpdate, appendLog }) {
  (characters || []).forEach((c) => {
    const alloc = getState(c.id, 'take10alloc');
    if (!alloc || alloc.beatAt !== openedAt) return;
    const activities = Array.isArray(alloc.activities) ? alloc.activities : [];
    if (activities.length === 0) return;

    // Refocus → restore ALL Focus Points (spent back to 0).
    if (activities.some((a) => a.id === REFOCUS_ID)) {
      const spent = Number(getState(c.id, 'focus')) || 0;
      if (spent > 0 && sendUpdate) sendUpdate(c.id, 'focus', 0);
    }

    // Item-targeted consumables resolve through the inventory machinery. getState
    // reflects sendUpdate synchronously (SessionContext writes the ref in place),
    // so stacking two of the same kind accumulates correctly.
    activities.forEach((a) => {
      if (a.kind === 'oil') {
        applyItemEffect({
          user: { id: c.id, name: c.name },
          targetItem: { id: a.targetUid, name: a.targetName },
          itemName: a.itemName,
          meta: a.meta,
          nowSecs,
          getState,
          sendUpdate,
          appendLog,
        });
        // Mark the oil used (player-writable overlay; the GM is the live writer).
        if (sendUpdate) {
          const consumed = getState(c.id, 'consumed') || {};
          sendUpdate(c.id, 'consumed', {
            ...consumed,
            [a.itemName]: (consumed[a.itemName] || 0) + 1,
          });
        }
      } else if (a.kind === 'talisman') {
        // Affix the talisman to its chosen host; activation (which consumes it)
        // is a combat action, not part of the block.
        if (sendUpdate) {
          const overlay = getState(c.id, 'affixed') || {};
          sendUpdate(c.id, 'affixed', affix(overlay, a.talismanUid, a.hostUid));
        }
      }
    });

    // Per-player session-log summary of the block.
    if (appendLog) {
      const labels = activities.map((a) => a.label).join(', ');
      const mins = activities.reduce((s, a) => s + (a.minutes || 0), 0);
      appendLog({ type: 'activity', text: `${c.name} (${mins} min): ${labels}` });
    }
  });
}

export default resolveTake10;
