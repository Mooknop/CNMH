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
import { stockByWareKey, decrementWareStock } from '../utils/shopUtils';
import { APP, syncKey, globalKey } from '../sync/keys';

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

  const [gold, setGold] = useSyncedState(syncKey(APP.GOLD, charId || 'none'), docGold(byId[charId]));
  const [acquired, setAcquired] = useSyncedState(syncKey(APP.ACQUIRED, charId || 'none'), []);
  const [, setRemoved] = useSyncedState(syncKey(APP.REMOVED, charId || 'none'), []);
  const [orders, setOrders] = useSyncedState(syncKey(APP.RUNEWORK, charId || 'none'), []);
  const [campaign] = useSyncedState(globalKey(APP.CAMPAIGN), { locationLoreId: '' });
  // The shop store, written at purchase time (#1138/#1139): a bought one-of-a-
  // kind sale ware is struck from its shelf, and a bought STOCKED ware has its
  // stock decremented — both in the same transaction as the gold debit.
  const [shops, setShops] = useSyncedState(globalKey(APP.SHOPS), {});

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

      // Stocked-ware guard + decrement plan (#1139). Every non-sale line whose
      // wareKey matches a stored ware carrying a numeric stock is checked against
      // the CURRENT stock — a line over it (another buyer got there first, or the
      // GM restocked lower mid-browse) rejects the whole checkout and writes
      // nothing, mirroring the stale-shelf guard. Reject-not-clamp: at home-game
      // scale the last committer refreshing their cart is the simple, honest
      // outcome. Lines that pass become the decrement plan `boughtStock`.
      // Generative offerings never appear in the stock map, so they stay
      // unlimited; sale lines are the shelf guard's business above.
      const stocks = loreId ? stockByWareKey(shops?.[loreId]) : new Map();
      const boughtStock = new Map();
      if (stocks.size) {
        for (const { item, qty } of lines) {
          if (item.saleId != null || item.wareKey == null) continue;
          const key = String(item.wareKey);
          if (!stocks.has(key)) continue;
          if (qty > stocks.get(key)) return { rejected: 'stale-stock' };
          boughtStock.set(key, qty);
        }
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

      // Strike the bought sale wares from the shop's shelf AND decrement bought
      // stocked wares (#1139) — one composed store write. A sold-out ware stays
      // in the wares list at stock 0 (displayed sold out), never deleted.
      if ((saleIds.length || boughtStock.size) && loreId) {
        const bought = new Set(saleIds);
        setShops((cur) => {
          const store = cur && typeof cur === 'object' ? cur : {};
          let entry = store[loreId];
          if (!entry) return cur;
          if (bought.size && Array.isArray(entry.saleShelf)) {
            entry = { ...entry, saleShelf: entry.saleShelf.filter((w) => !(w && bought.has(w.saleId))) };
          }
          entry = decrementWareStock(entry, boughtStock);
          return entry === store[loreId] ? cur : { ...store, [loreId]: entry };
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
