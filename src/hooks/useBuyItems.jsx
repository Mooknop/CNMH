import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useSessionLog } from './useSessionLog';
import { docGold } from '../utils/gold';
import { newEntryUid } from '../utils/uid';

// Shop purchase (#696 S6, the keystone). Mirrors the proven transfer primitives
// (#654): the buyer credits items onto their own additive `cnmh_acquired_`
// overlay, then debits their live `cnmh_gold_` balance by the cart total.
// Purchased items reach inventory through the existing acquired→doc
// reconciliation (#665) — no inventory-write code lives here. Both overlays
// default to the buyer's committed doc value (#670) so an unset balance reflects
// real gold rather than 0.
//
// Credit items BEFORE debiting gold so a mid-purchase failure can only duplicate
// (visible in the session log), never silently take gold with nothing bought.

// Deep-clone a ware into a clean inventory entry: strip live/loadout-only fields
// and mint fresh uids throughout (including any container contents) so a bought
// copy can't collide with an entry the buyer already owns. The buyer's effective
// tree re-derives placement. Same shape as useGiveItem's reuid, plus the
// shop-only `wareKey` and the multi-level `variants` ladder (#798) — a bought
// variant already carries its own merged name/price/effect, so the ladder is
// dead weight on the inventory entry.
const reuid = (item) => {
  // A bought Runestone (#801) lands as a clean ref entry, not a fat inline copy:
  // resolveInventoryItem re-derives its name/value from the rune catalog (R1),
  // and the ref shape is what R4's move-rune flow operates on.
  if (item && item.runestone) {
    const stone = { ref: 'runestone', uid: newEntryUid() };
    if (item.runestone.runeRef != null) stone.runeRef = item.runestone.runeRef;
    return stone;
  }
  // A bought Scroll/Wand (#812 S9) lands as a minimal, re-resolvable ref entry,
  // not a fat inline copy: finishItem re-derives its name/level/price/traits from
  // the embedded spell on resolution (S2), so only the spell ref (+ any cast-rank
  // override) needs to persist — mirroring the Runestone treatment above.
  if (item && (item.scroll || item.wand)) {
    const kind = item.scroll ? 'scroll' : 'wand';
    const block = item[kind] || {};
    const entry = { uid: newEntryUid(), [kind]: {} };
    if (block.spellRef != null) entry[kind].spellRef = block.spellRef;
    if (block.rank != null) entry[kind].rank = block.rank;
    return entry;
  }
  const { state, hand, stock, wareKey, variants, ...rest } = item || {};
  const next = { ...rest, uid: newEntryUid() };
  if (next.container && Array.isArray(next.container.contents)) {
    next.container = {
      ...next.container,
      contents: next.container.contents.map((c) => reuid(c)),
    };
  }
  return next;
};

// A purchase line: { item: <resolved ware>, qty }. `item.price` is the resolved
// per-shop price (set by resolveShopWares). Returns the floored, positive qty or
// 0 when the line is unusable.
const lineQty = (p) => {
  const n = Math.floor(Number(p?.qty));
  return p && p.item && Number.isFinite(n) && n > 0 ? n : 0;
};

export const useBuyItems = (buyerId) => {
  const { connected, foundryConnected } = useSession();
  const { characters } = useContent();
  const { appendEvent } = useSessionLog();
  const byId = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c])),
    [characters],
  );
  const [acquired, setAcquired] = useSyncedState(`cnmh_acquired_${buyerId || 'none'}`, []);
  const [myGold, setMyGold] = useSyncedState(`cnmh_gold_${buyerId || 'none'}`, docGold(byId[buyerId]));

  const offline = connected && !foundryConnected;

  // Commit a cart. `purchases` = [{ item, qty }]; `shopName` is logged. Returns a
  // receipt { total, count } on success, or null when rejected (offline, no
  // buyer, empty cart, or total over balance) — nothing is written on rejection.
  const buy = useCallback(
    (purchases, shopName) => {
      if (offline || !buyerId) return null;

      const lines = (Array.isArray(purchases) ? purchases : [])
        .map((p) => ({ item: p?.item, qty: lineQty(p) }))
        .filter((p) => p.qty > 0);
      if (lines.length === 0) return null;

      const total = lines.reduce((sum, p) => sum + (Number(p.item.price) || 0) * p.qty, 0);
      if (total > myGold) return null;

      // Credit: a fresh-uid'd inline copy per unit (× qty) so runes / variant /
      // scroll data carry over verbatim and duplicates stay independently
      // trackable, exactly like a gifted item.
      const additions = [];
      lines.forEach(({ item, qty }) => {
        for (let i = 0; i < qty; i += 1) additions.push(reuid(item));
      });
      setAcquired([...(Array.isArray(acquired) ? acquired : []), ...additions]); // credit first
      setMyGold(myGold - total); // debit after

      const summary = lines.map(({ item, qty }) => `${qty}× ${item.name}`).join(', ');
      appendEvent({
        type: 'action',
        text: `${byId[buyerId]?.name || 'Someone'} bought ${summary} from ${
          shopName || 'a shop'
        } for ${total} gp`,
      });

      return { total, count: additions.length };
    },
    [offline, buyerId, myGold, acquired, setAcquired, setMyGold, appendEvent, byId],
  );

  return { myGold, buy };
};

export default useBuyItems;
