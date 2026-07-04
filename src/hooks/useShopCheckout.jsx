import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useGameDate } from '../contexts/GameDateContext';
import { useSessionLog } from './useSessionLog';
import { docGold } from '../utils/gold';
import { toGameSeconds } from '../utils/gameTime';
import { createHandoffOrder } from '../utils/runeWorkOrder';
import { expandWare, lineQty } from '../utils/shopPurchase';

// Unified shop checkout (#878). One hook that owns ALL the overlays a single
// storefront transaction touches — gold, acquired, removed, and rune work orders
// — through ONE useSyncedState instance each, so a combined ware-buy + rune-
// handoff checkout writes each key exactly once.
//
// Why this exists: useBuyItems and useRuneWork each own their OWN useSyncedState
// for the shared `cnmh_gold_`/`cnmh_acquired_` keys, so calling both in one
// handler clobbers a write (each sees a stale local copy; cross-instance sync
// only lands between user actions). Routing everything through this single
// instance lets `checkout` debit gold once and credit/pull items once, using
// functional updaters so the sequential overlay writes compose.
//
// Reads (myGold, orders) feed the storefront purse + benched tickets; collecting
// a ready order still lives in useRuneWork (Downtime). Items reach inventory via
// the existing acquired→doc reconciliation (#665) — no inventory write here.
export const useShopCheckout = (charId) => {
  const { connected, foundryConnected } = useSession();
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { appendEvent } = useSessionLog();

  const byId = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c])),
    [characters],
  );

  const [gold, setGold] = useSyncedState(`cnmh_gold_${charId || 'none'}`, docGold(byId[charId]));
  const [acquired, setAcquired] = useSyncedState(`cnmh_acquired_${charId || 'none'}`, []);
  const [, setRemoved] = useSyncedState(`cnmh_removed_${charId || 'none'}`, []);
  const [orders, setOrders] = useSyncedState(`cnmh_runework_${charId || 'none'}`, []);
  const [campaign] = useSyncedState('cnmh_campaign_global', { locationLoreId: '' });
  // Sale Shelf decrement (#1138): the shop store, so a bought one-of-a-kind sale
  // ware is struck from its shelf in the same transaction. The ONLY purchase-time
  // write to this key today — regular stocked wares stay cap-only (follow-up).
  const [shops, setShops] = useSyncedState('cnmh_shops_global', {});

  const offline = connected && !foundryConnected;
  const nowSeconds = toGameSeconds({ ...gameDate, ...time });
  const locationId = campaign?.locationLoreId || '';
  const orderList = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  // Commit a whole storefront cart: `purchases` = [{ item, qty }] (wares) and
  // `handoffs` = [{ gear, runes }] (runes staged onto gear). One transaction:
  // credit ware copies, record one work order per handoff gear, pull each handed-
  // over gear (acquired-splice or removed-mask), and debit the combined total
  // ONCE. Returns a receipt, or null when rejected (offline, empty, over balance)
  // — nothing is written on rejection.
  const checkout = useCallback(
    ({ purchases, handoffs, shopTitle, loreId } = {}) => {
      if (offline || !charId) return null;

      const lines = (Array.isArray(purchases) ? purchases : [])
        .map((p) => ({ item: p?.item, qty: lineQty(p) }))
        .filter((p) => p.qty > 0);
      const hs = (Array.isArray(handoffs) ? handoffs : []).filter(
        (h) => h && h.gear && h.gear.uid != null && Array.isArray(h.runes) && h.runes.length
      );
      if (lines.length === 0 && hs.length === 0) return null;

      // Sale Shelf lines (#1138): a bought one-of-a-kind ware carries a saleId.
      // Stale-shelf guard — re-check each against the shop's CURRENT shelf, so a
      // deal already gone (another buyer, or a GM reroll mid-browse) rejects the
      // whole checkout and writes nothing, like the over-balance case.
      const saleIds = lines.map(({ item }) => item.saleId).filter((id) => id != null);
      if (saleIds.length) {
        const shelf = (loreId && Array.isArray(shops?.[loreId]?.saleShelf)) ? shops[loreId].saleShelf : [];
        const live = new Set(shelf.map((w) => w && w.saleId));
        if (saleIds.some((id) => !live.has(id))) return { rejected: 'stale-shelf' };
      }

      const wareTotal = lines.reduce((sum, p) => sum + (Number(p.item.price) || 0) * p.qty, 0);
      const handoffTotal = hs.reduce((sum, h) => sum + h.runes.reduce((x, r) => x + (Number(r?.price) || 0), 0), 0);
      const total = wareTotal + handoffTotal;
      if (total > gold) return null;

      // Ware copies to credit — one entry per unit, expanded by kind (#1138: a
      // scroll pack lands as four scrolls, a rune item as a ref+runes entry).
      const additions = [];
      lines.forEach(({ item, qty }) => { for (let i = 0; i < qty; i += 1) additions.push(...expandWare(item)); });

      // Split handed-over gear: a bought (acquired) entry is spliced from the
      // acquired overlay; an authored one is masked via removed. Decided against
      // the render-time acquired list.
      const mine = Array.isArray(acquired) ? acquired : [];
      const acquiredGearUids = new Set(hs.filter((h) => mine.some((e) => e && e.uid === h.gear.uid)).map((h) => h.gear.uid));
      const authoredGearUids = hs.map((h) => h.gear.uid).filter((u) => !acquiredGearUids.has(u));

      // acquired: credit ware copies AND splice any handed-over acquired gear, in
      // one functional update (so neither write is lost).
      setAcquired((cur) => {
        const arr = Array.isArray(cur) ? cur : [];
        const credited = additions.length ? [...arr, ...additions] : arr;
        return acquiredGearUids.size ? credited.filter((e) => !(e && acquiredGearUids.has(e.uid))) : credited;
      });

      if (hs.length) {
        const now = { ...gameDate, ...time };
        const newOrders = hs.map((h) => createHandoffOrder({ gear: h.gear, runes: h.runes, shopTitle, locationId, now }));
        setOrders((cur) => [...(Array.isArray(cur) ? cur : []), ...newOrders]);
        if (authoredGearUids.length) {
          setRemoved((cur) => {
            const set = Array.isArray(cur) ? cur : [];
            const add = authoredGearUids.filter((u) => !set.includes(u));
            return add.length ? [...set, ...add] : set;
          });
        }
      }

      setGold((g) => (Number.isFinite(g) ? g : gold) - total);

      // Strike the bought sale wares from the shop's shelf — one composed write.
      if (saleIds.length && loreId) {
        const bought = new Set(saleIds);
        setShops((cur) => {
          const store = cur && typeof cur === 'object' ? cur : {};
          const entry = store[loreId];
          if (!entry || !Array.isArray(entry.saleShelf)) return cur;
          return { ...store, [loreId]: { ...entry, saleShelf: entry.saleShelf.filter((w) => !(w && bought.has(w.saleId))) } };
        });
      }

      const parts = [];
      if (lines.length) parts.push(lines.map(({ item, qty }) => `${qty}× ${item.name}`).join(', '));
      if (hs.length) parts.push(`${hs.length} item${hs.length === 1 ? '' : 's'} left to be runed`);
      appendEvent({
        type: 'action',
        text: `${byId[charId]?.name || 'Someone'} checked out ${parts.join(' + ')} at ${shopTitle || 'a shop'} for ${total} gp`,
      });

      return { total, wareCount: additions.length, handoffCount: hs.length };
    },
    [offline, charId, gold, acquired, gameDate, time, locationId, shops, setAcquired, setOrders, setRemoved, setGold, setShops, appendEvent, byId],
  );

  return { myGold: gold, orders: orderList, nowSeconds, locationId, checkout };
};

export default useShopCheckout;
