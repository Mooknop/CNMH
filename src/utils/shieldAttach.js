// Shield attachments (#1165 Track 2, S6).
//
// A shield attachment (Shield Spikes, Shield Boss, …) is its OWN weapon that
// AFFIXES to a shield and holds its own weapon runes (weaponRunes.js). This
// complements the reinforcing rune (Track 1): the SHIELD holds only reinforcing;
// the ATTACHMENT is the weapon-rune target. Attaching/removing is a 10-minute
// activity (S7); unlike a talisman the attachment is reusable and never consumed.
//
// The attach relationship is item→item, stored in a per-character overlay keyed
// by the attachment's inventory uid — at most ONE attachment per shield:
//
//   cnmh_attached_<charId> = { [attachmentUid]: shieldUid }
//
// When the host shield is HELD, useCharacter injects the attachment's resolved
// Strike (mirroring bladeStrikes), so the shield bash comes from the attachment.

import { isHeldState } from './itemState';
import { itemUidOf } from './affix';
import { flattenInventory } from './InventoryUtils';
import { resolveItemStrikes } from './strikeUtils';
import { shieldHasFinesse } from './shieldRunes';
import { APP, syncKey } from '../sync/keys';

/** Synced-state key for a character's shield-attachment overlay. */
export const attachedKey = (charId) => syncKey(APP.ATTACHED, charId);

/**
 * Whether an item is a shield attachment: a weapon (carries `strikes`) marked
 * either with an `attachment: { to: 'shield' }` block or an `Attached` trait. It
 * has no `shield` block of its own, so gearTarget classifies it as a weapon and
 * it takes weapon runes.
 */
export const isShieldAttachment = (item) =>
  !!item && !!item.strikes && (
    item.attachment?.to === 'shield' ||
    (Array.isArray(item.traits) && item.traits.some((t) => String(t).toLowerCase() === 'attached'))
  );

/** Valid host shields for an attachment (shields only; excludes itself). */
export const validAttachHosts = (items, attachment) => {
  const selfUid = itemUidOf(attachment);
  return (Array.isArray(items) ? items : []).filter(
    (it) => it && it.shield && itemUidOf(it) !== selfUid
  );
};

/** The shield uid an attachment is bound to, or null. */
export const attachedHostUid = (overlay, attachmentUid) =>
  (overlay && typeof overlay === 'object' ? overlay[attachmentUid] : undefined) ?? null;

/** The attachment uid currently bound to a given shield, or null (one per shield). */
export const attachmentOnShield = (overlay, shieldUid) => {
  for (const [aUid, sUid] of Object.entries(overlay && typeof overlay === 'object' ? overlay : {})) {
    if (sUid === shieldUid) return aUid;
  }
  return null;
};

/**
 * Bind an attachment to a shield, returning the next overlay (immutable). At most
 * one attachment per shield: any attachment already on that shield is displaced.
 */
export const attach = (overlay, attachmentUid, shieldUid) => {
  const next = { ...(overlay && typeof overlay === 'object' ? overlay : {}) };
  for (const [aUid, sUid] of Object.entries(next)) {
    if (sUid === shieldUid) delete next[aUid];
  }
  next[attachmentUid] = shieldUid;
  return next;
};

/** Remove an attachment's binding, returning the next overlay (immutable). */
export const unattach = (overlay, attachmentUid) => {
  const next = { ...(overlay && typeof overlay === 'object' ? overlay : {}) };
  delete next[attachmentUid];
  return next;
};

/** Set of attachment uids currently bound (for filtering displays). */
export const attachedUidSet = (overlay) =>
  new Set(Object.keys(overlay && typeof overlay === 'object' ? overlay : {}));

/**
 * Group bound attachments by host shield uid, resolving uids from a flat item
 * list: { [shieldUid]: [attachmentItem, …] }. Bindings whose attachment uid no
 * longer resolves (stale) are skipped.
 */
export const attachmentsByHost = (overlay, flatItems) => {
  const byUid = new Map((Array.isArray(flatItems) ? flatItems : []).map((it) => [itemUidOf(it), it]));
  const out = {};
  for (const [aUid, sUid] of Object.entries(overlay && typeof overlay === 'object' ? overlay : {})) {
    const item = byUid.get(aUid);
    if (!item) continue;
    (out[sUid] = out[sUid] || []).push(item);
  }
  return out;
};

/**
 * Resolved Strike(s) contributed by attachments bound to a HELD shield. Each
 * attachment is a real weapon item, so its strikes resolve through
 * resolveItemStrikes with its own runes; each is tagged `shieldAttachment: true`
 * and `hostUid`. The injected Strike is available because the host shield is held
 * (the attachment needs no hand of its own).
 *
 * @param {Object} character - resolved character (inventory inlined)
 * @param {Object} overlay   - cnmh_attached_<charId>
 * @returns {Array} resolved strike objects
 */
export const attachmentStrikes = (character, overlay) => {
  if (!overlay || typeof overlay !== 'object' || !Object.keys(overlay).length) return [];
  const flat = flattenInventory(character?.inventory || []);
  const byUid = new Map(flat.map((i) => [itemUidOf(i), i]));
  const heldShieldUids = new Set(
    flat.filter((i) => i && i.shield && isHeldState(i.state)).map((i) => itemUidOf(i))
  );
  const out = [];
  for (const [aUid, sUid] of Object.entries(overlay)) {
    if (!heldShieldUids.has(sUid)) continue;
    const attachment = byUid.get(aUid);
    if (!isShieldAttachment(attachment)) continue;
    // A finesse host shield (Targe / Shield Gauntlet base trait, or the Feather
    // rune, #1196 G3) lends finesse to its attachment's Strike — so it uses the
    // better of Str/Dex (per the finesse trait; computeStrike honors it).
    const finesse = shieldHasFinesse(byUid.get(sUid));
    const resolved = resolveItemStrikes({ ...attachment, noHandRequired: true }, character);
    out.push(...resolved.map((s) => {
      const traits = Array.isArray(s.traits) ? s.traits : [];
      const withFinesse = finesse && !traits.some((t) => String(t).toLowerCase() === 'finesse')
        ? [...traits, 'Finesse']
        : traits;
      return { ...s, traits: withFinesse, shieldAttachment: true, hostUid: sUid };
    }));
  }
  return out;
};
