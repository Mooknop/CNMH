// GM rune management (#gm-gear S2) — the pure spine behind the Manage Gear
// modal's Runes section. The GM edits the runes on any valid rune target in a
// character's inventory INSTANTLY: no work order, no 24h turnaround, no gold.
//
// Persistence mirrors useRuneWork / useMoveRune: a rune change mints a fresh-uid
// runed copy credited to the character's `cnmh_acquired_` overlay, and the item
// it replaces is either spliced (if it already lived in acquired) or masked via
// `cnmh_removed_` (an authored entry). The socket derivation + the add path stay
// in runeSockets.js (gearSockets / compatibleRunes / applyRune); this module adds
// the CLEAR path (which those helpers don't cover) plus the shield reinforcing
// rune docs and the overlay-splice helper the modal writes.

import { newEntryUid } from './uid';
import { REINFORCING, REINFORCING_TIERS } from './shieldRunes';

// Reinforcing rune docs (shield fundamentals) in the buyable-doc shape
// compatibleRunes expects. FUNDAMENTAL_RUNES covers only weapon/armor, and the
// rune catalog carries no reinforcing form, so a shield's one socket has nothing
// to offer without this — the shield mirror of data/fundamentalRunes.js.
export const reinforcingRuneDocs = () =>
  REINFORCING_TIERS.map((key) => ({
    id: `reinforcing-${key}`,
    type: 'fundamental',
    fundamental: 'reinforcing',
    target: 'shield',
    tierKey: key,
    name: REINFORCING[key].label,
    level: REINFORCING[key].level,
    price: REINFORCING[key].price,
  }));

// Empty one socket on a piece of gear, returning a fresh-uid runed copy to credit
// back (the inverse of applyRune). Clearing potency also drops every property
// rune — losing the +N closes the property slots those runes rode in, so an
// orphaned property rune can't linger. Transient loadout fields are dropped so
// the owner's tree re-derives placement. Returns null for an unknown socket.
export const clearedGearEntry = (item, socket) => {
  if (!item || !socket) return null;
  const runes = item.runes && typeof item.runes === 'object' ? item.runes : {};
  const next = { ...runes };
  switch (socket.type) {
    case 'potency':
      delete next.potency;
      delete next.property;
      break;
    case 'striking':
      delete next.striking;
      break;
    case 'resilient':
      delete next.resilient;
      break;
    case 'reinforcing':
      delete next.reinforcing;
      break;
    case 'accessory':
      delete next.accessory;
      delete next.accessoryConfig;
      break;
    case 'property': {
      const property = Array.isArray(next.property) ? next.property : [];
      next.property = property.filter((_, i) => i !== socket.index);
      break;
    }
    default:
      return null;
  }
  const { state, hand, ...rest } = item;
  return { ...rest, uid: newEntryUid(), runes: next };
};

// Fold a runed entry into a character's inventory overlays, replacing the item at
// `oldUid`: a bought entry (already in `acquired`) is spliced; an authored one is
// masked via `removed`. The runed copy is always credited to `acquired`. Returns
// the next { acquired, removed } arrays; the caller writes both to the DO.
export const applyGearEntry = (acquired, removed, oldUid, entry) => {
  const mine = Array.isArray(acquired) ? acquired : [];
  const rem = Array.isArray(removed) ? removed : [];
  const wasAcquired = mine.some((e) => e && e.uid === oldUid);
  const nextAcquired = wasAcquired
    ? [...mine.filter((e) => !(e && e.uid === oldUid)), entry]
    : [...mine, entry];
  const nextRemoved = wasAcquired || rem.includes(oldUid) ? rem : [...rem, oldUid];
  return { acquired: nextAcquired, removed: nextRemoved };
};
