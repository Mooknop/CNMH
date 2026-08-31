// Item-transfer mechanics, shared by the player-side give (hooks/useGiveItem)
// and the GM-side party inventory dock (#1859).
//
// `reuid` and `subtreeUids` were extracted VERBATIM from useGiveItem so the two
// surfaces can never drift apart; `useGiveItem` now imports them from here.
//
// THE INVARIANT both callers keep: always credit the recipient BEFORE debiting
// the giver, so a mid-transfer failure can only duplicate the item (visible in
// the session log, trivially fixed at the table) and never destroy it.
//
// THE TWO-LAYER MODEL this operates on: authored inventory is immutable from
// the client, so an authored entry leaves its owner by being masked in the
// `cnmh_removed_<id>` overlay; an entry that arrived through the additive
// `cnmh_acquired_<id>` overlay is spliced out of that array instead. Both
// arrive at the recipient the same way — a deep, freshly-uid'd clone appended
// to THEIR acquired overlay, stored inline (no catalog ref) so runes, scroll /
// wand data and variant fields carry over verbatim.
import { newEntryUid } from './uid';
import { isBodyBound } from './itemState';
import { isContainer } from './InventoryUtils';
import { affixedHostUid } from './affix';
import { APP } from '../sync/keys';

// Deep-clone for the recipient: strip live/loadout-only fields and mint fresh
// uids throughout (including a container's contents) so a gift can't collide
// with an entry the recipient already owns. The recipient's effective tree
// re-derives placement (container → Worn, contents → Stowed).
//
// Dropping `state`/`hand` is also what "a held item is unhanded on transfer"
// means concretely — the recipient receives it Worn, in no hand.
export const reuid = (item) => {
  const { state, hand, ...rest } = item || {};
  const next = { ...rest, uid: newEntryUid() };
  if (next.container && Array.isArray(next.container.contents)) {
    next.container = {
      ...next.container,
      contents: next.container.contents.map((c) => reuid(c)),
    };
  }
  return next;
};

// Every uid in an item's subtree (the entry itself + any container contents) —
// the full set that must leave the giver when a container is handed over.
export const subtreeUids = (item) => {
  const out = item?.uid != null ? [item.uid] : [];
  if (item?.container && Array.isArray(item.container.contents)) {
    item.container.contents.forEach((c) => out.push(...subtreeUids(c)));
  }
  return out;
};

/**
 * Why this item can never change owners, or null when it can.
 *
 * Mirrors ItemModal's `givable` gate, minus the mode/placement conditions the
 * GM deliberately doesn't observe (see gmTransferItem): a tattoo is inked on
 * its owner, and anything tangled in the affix overlay — a talisman affixed to
 * a host, or an item hosting one — would strand that overlay's entries on the
 * giver if it left. The player unaffixes deliberately first; so does the GM.
 *
 * @param {Object} item     effective inventory entry
 * @param {Object} affixed  the owner's cnmh_affixed_<id> overlay
 * @returns {string|null} a player-facing reason, or null when transferable
 */
export const transferBlockReason = (item, affixed) => {
  if (!item) return 'Nothing to move.';
  if (item.uid == null) return `${item.name || 'That item'} has no entry id — it can't be moved.`;
  if (isBodyBound(item)) return `${item.name} is tattooed on the body — it can't change hands.`;
  const overlay = affixed && typeof affixed === 'object' ? affixed : {};
  const hosts = Object.values(overlay);
  const tangled = subtreeUids(item).some(
    (u) => affixedHostUid(overlay, u) != null || hosts.includes(u),
  );
  if (tangled) return `${item.name} is affixed to (or carrying) a talisman — unaffix it first.`;
  return null;
};

/**
 * Why this item can't go into a hand, or null when it can.
 * Containers are the one hard no — a backpack is worn, not wielded, and
 * `wieldableWorn` already excludes them from every other hand surface.
 */
export const handBlockReason = (item) => {
  if (!item) return 'Nothing to move.';
  if (isBodyBound(item)) return `${item.name} is tattooed on the body — it can't be held.`;
  if (isContainer(item)) return `${item.name} is a container — it's worn, not held.`;
  return null;
};

// Read an overlay through the session, tolerating an absent/!array value.
const listAt = (getState, charId, type) => {
  const cur = getState(charId, type);
  return Array.isArray(cur) ? cur : [];
};

/**
 * GM-side item move between two PCs (#1859).
 *
 * Same credit-before-debit mechanics as `useGiveItem.give`, with three
 * deliberate differences — this is a GM surface, not a player one:
 *
 *   1. Every write carries `{ force: true }`, so the move works while Foundry
 *      is offline (the sandbox write freeze would otherwise drop it silently).
 *   2. NO play-mode gate. The player give is exploration/downtime-only; the GM
 *      moves anything at any time.
 *   3. Held items are allowed — `reuid` strips `state`/`hand`, so the item
 *      arrives Worn and unhanded. The giver's now-orphaned loadout entry is
 *      left alone on purpose: its uid is masked/spliced, so the entry can never
 *      resurface, and a second write would only add a failure window.
 *
 * Body-bound and affix-entangled items are refused (see transferBlockReason) —
 * callers should surface the reason inline rather than failing silently.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export const gmTransferItem = ({ getState, sendUpdate, fromId, toId, item, affixed }) => {
  if (!fromId || !toId || fromId === toId) return { ok: false, reason: 'Pick a different character.' };
  const reason = transferBlockReason(item, affixed);
  if (reason) return { ok: false, reason };

  // ── Credit first ────────────────────────────────────────────────────────
  sendUpdate(toId, APP.ACQUIRED, [...listAt(getState, toId, APP.ACQUIRED), reuid(item)], {
    force: true,
  });

  // ── Then debit ──────────────────────────────────────────────────────────
  const uids = subtreeUids(item);
  const mine = listAt(getState, fromId, APP.ACQUIRED);
  const acquiredUids = new Set(mine.map((e) => e && e.uid).filter((u) => u != null));
  const toSplice = uids.filter((u) => acquiredUids.has(u));
  const toMask = uids.filter((u) => !acquiredUids.has(u));

  if (toSplice.length) {
    sendUpdate(
      fromId,
      APP.ACQUIRED,
      mine.filter((e) => !(e && toSplice.includes(e.uid))),
      { force: true },
    );
  }
  if (toMask.length) {
    const removed = listAt(getState, fromId, APP.REMOVED);
    const add = toMask.filter((u) => !removed.includes(u));
    if (add.length) sendUpdate(fromId, APP.REMOVED, [...removed, ...add], { force: true });
  }
  return { ok: true };
};

/**
 * GM-side placement write: merge one entry's patch into a PC's
 * `cnmh_loadout_<id>` overlay through the session (read-modify-write — the dock
 * can't call a per-character hook for an arbitrary roster PC).
 *
 * `force: true` for consistency with the rest of this module; `loadout` IS in
 * SANDBOX_WRITABLE_TYPES, so this is belt rather than braces.
 *
 * @param {Object} patch fields to set on loadout[uid]; a key set to `undefined`
 *                       is DELETED (that's how `hand` is cleared on a stow).
 */
export const gmSetLoadoutEntry = ({ getState, sendUpdate, charId, uid, patch }) => {
  if (!charId || uid == null) return { ok: false, reason: 'Nothing to move.' };
  const cur = getState(charId, APP.LOADOUT);
  const map = cur && typeof cur === 'object' ? cur : {};
  const next = { ...(map[uid] || {}), ...patch };
  Object.keys(patch || {}).forEach((k) => {
    if (patch[k] === undefined) delete next[k];
  });
  sendUpdate(charId, APP.LOADOUT, { ...map, [uid]: next }, { force: true });
  return { ok: true };
};
