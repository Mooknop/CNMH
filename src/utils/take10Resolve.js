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
// of what each character spent the block doing. Item-targeted consumables
// (10-minute oils, talisman affixing) surface as activities in a follow-up.

export const REFOCUS_ID = 'refocus';

/**
 * Resolve every party member's Take 10 allocation for the live beat.
 * @param {Object}   args
 * @param {Array}    args.characters - party characters ({ id, name })
 * @param {number}   args.openedAt   - the live beat stamp (only matching allocs resolve)
 * @param {Function} args.getState   - (id, key) => value
 * @param {Function} args.sendUpdate - (id, key, value) => void
 * @param {Function} args.appendLog  - ({ type, text }) => void
 */
export function resolveTake10({ characters, openedAt, getState, sendUpdate, appendLog }) {
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

    // Per-player session-log summary of the block.
    if (appendLog) {
      const labels = activities.map((a) => a.label).join(', ');
      const mins = activities.reduce((s, a) => s + (a.minutes || 0), 0);
      appendLog({ type: 'activity', text: `${c.name} (${mins} min): ${labels}` });
    }
  });
}

export default resolveTake10;
