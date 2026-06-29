import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useGameDate } from '../contexts/GameDateContext';
import { useSessionLog } from './useSessionLog';
import { docGold } from '../utils/gold';
import { toGameSeconds } from '../utils/gameTime';
import { createWorkOrder, createHandoffOrder, isOrderReady, foldRuneIntoWeapon, applyRunesToGear } from '../utils/runeWorkOrder';

// Rune work orders (#802). "Etch" pays the rune's price, takes the weapon from
// the owner (an authored entry is masked via `cnmh_removed_`, a bought one is
// spliced from `cnmh_acquired_` — same as a give), and records an order in
// `cnmh_runework_<charId>`. "Collect" — available once the order is ready (24h
// elapsed AND back in the shop's town) — credits the runed weapon back onto the
// acquired overlay and clears the order. Gold debit mirrors useBuyItems.
export const useRuneWork = (charId) => {
  const { connected, foundryConnected } = useSession();
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { appendEvent } = useSessionLog();

  const byId = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c])),
    [characters],
  );

  const [orders, setOrders] = useSyncedState(`cnmh_runework_${charId || 'none'}`, []);
  const [gold, setGold] = useSyncedState(`cnmh_gold_${charId || 'none'}`, docGold(byId[charId]));
  const [acquired, setAcquired] = useSyncedState(`cnmh_acquired_${charId || 'none'}`, []);
  const [, setRemoved] = useSyncedState(`cnmh_removed_${charId || 'none'}`, []);
  const [campaign] = useSyncedState('cnmh_campaign_global', { locationLoreId: '' });

  const offline = connected && !foundryConnected;
  const nowSeconds = toGameSeconds({ ...gameDate, ...time });
  const locationId = campaign?.locationLoreId || '';

  const list = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  // Pay to etch `rune` onto `weapon`. Records the order first (holding the
  // weapon snapshot), then pulls the weapon and debits gold — so a mid-flight
  // failure can only duplicate (recoverable), never strand the weapon with no
  // order. Returns the new order, or null when rejected.
  const etch = useCallback(
    (weapon, rune, shopTitle) => {
      if (offline || !charId) return null;
      const price = Number(rune?.price) || 0;
      if (!weapon || weapon.uid == null || !rune || rune.id == null) return null;
      if (price > gold) return null;

      const order = createWorkOrder({ weapon, rune, shopTitle, locationId, now: { ...gameDate, ...time }, price });
      setOrders([...list, order]);

      // Pull the weapon: splice it if it's a bought (acquired) entry, else mask
      // the authored uid via the removed overlay.
      const mine = Array.isArray(acquired) ? acquired : [];
      const isAcquired = mine.some((e) => e && e.uid === weapon.uid);
      if (isAcquired) {
        setAcquired(mine.filter((e) => !(e && e.uid === weapon.uid)));
      } else {
        setRemoved((cur) => {
          const set = Array.isArray(cur) ? cur : [];
          return set.includes(weapon.uid) ? set : [...set, weapon.uid];
        });
      }

      setGold(gold - price);
      appendEvent({
        type: 'action',
        text: `${byId[charId]?.name || 'Someone'} left ${weapon.name || 'a weapon'} with ${
          shopTitle || 'a shop'
        } to etch ${rune.name} for ${price} gp`,
      });
      return order;
    },
    [offline, charId, gold, locationId, gameDate, time, list, acquired, setOrders, setAcquired, setRemoved, setGold, appendEvent, byId],
  );

  // Hand staged gear to the smith (#857 S7a). `handoffs` = [{ gear, runes }];
  // commits all in one transaction — N orders recorded, each gear pulled
  // (acquired-splice or removed-mask, as etch does), and the combined rune total
  // debited ONCE. A separate action from the ware cart so the two never write the
  // shared gold/acquired overlays in the same handler. Returns the new orders, or
  // null when rejected (offline, none staged, over balance).
  const commitHandoff = useCallback(
    (handoffs, shopTitle) => {
      if (offline || !charId) return null;
      const valid = (Array.isArray(handoffs) ? handoffs : []).filter(
        (h) => h && h.gear && h.gear.uid != null && Array.isArray(h.runes) && h.runes.length
      );
      if (!valid.length) return null;
      const total = valid.reduce((sum, h) => sum + h.runes.reduce((x, r) => x + (Number(r?.price) || 0), 0), 0);
      if (total > gold) return null;

      const now = { ...gameDate, ...time };
      const newOrders = valid.map((h) =>
        createHandoffOrder({ gear: h.gear, runes: h.runes, shopTitle, locationId, now })
      );
      setOrders([...list, ...newOrders]);

      // Pull each gear: splice the bought (acquired) ones, mask the authored ones.
      const uids = new Set(valid.map((h) => h.gear.uid));
      const mine = Array.isArray(acquired) ? acquired : [];
      const acquiredUids = new Set(mine.filter((e) => e && uids.has(e.uid)).map((e) => e.uid));
      if (acquiredUids.size) setAcquired(mine.filter((e) => !(e && acquiredUids.has(e.uid))));
      const authored = [...uids].filter((u) => !acquiredUids.has(u));
      if (authored.length) {
        setRemoved((cur) => {
          const set = Array.isArray(cur) ? cur : [];
          const add = authored.filter((u) => !set.includes(u));
          return add.length ? [...set, ...add] : set;
        });
      }

      setGold(gold - total);
      appendEvent({
        type: 'action',
        text: `${byId[charId]?.name || 'Someone'} left ${valid.length} item${valid.length === 1 ? '' : 's'} with ${
          shopTitle || 'a shop'
        } to be runed for ${total} gp`,
      });
      return newOrders;
    },
    [offline, charId, gold, locationId, gameDate, time, list, acquired, setOrders, setAcquired, setRemoved, setGold, appendEvent, byId],
  );

  // Collect a ready order: credit the runed weapon back and clear the order.
  // Returns true on success, false when the order is missing or not yet ready.
  const collect = useCallback(
    (orderId) => {
      if (offline || !charId) return false;
      const order = list.find((o) => o && o.id === orderId);
      if (!order || !isOrderReady(order, nowSeconds, locationId)) return false;

      // Multi-rune handoff orders (#857 S7a) apply the whole staged array; legacy
      // single-rune orders (#802) keep the property-only fold.
      const runed = Array.isArray(order.runes) && order.runes.length
        ? applyRunesToGear(order.weapon, order.runes)
        : foldRuneIntoWeapon(order.weapon, order.runeRef);
      setAcquired([...(Array.isArray(acquired) ? acquired : []), runed]);
      setOrders(list.filter((o) => o && o.id !== orderId));
      appendEvent({
        type: 'action',
        text: `${byId[charId]?.name || 'Someone'} collected ${order.weaponName} with the ${order.runeName} rune etched`,
      });
      return true;
    },
    [offline, charId, list, nowSeconds, locationId, acquired, setAcquired, setOrders, appendEvent, byId],
  );

  return { orders: list, etch, commitHandoff, collect, nowSeconds, locationId };
};

export default useRuneWork;
