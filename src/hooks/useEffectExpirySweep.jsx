import { useEffect, useRef } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useGameDate } from '../contexts/GameDateContext';
import { useGmAuth } from './useGmAuth';
import { useSessionLog } from './useSessionLog';
import { toGameSeconds } from '../utils/gameTime';
import { pruneExpiredItemEffects, itemEffectsKey } from '../utils/itemEffects';
import { APP, syncKey } from '../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Clock-driven immunity/effect expiry (#218). Effects carrying an absolute
// game-seconds expiry (expireAtSecs — stamped by immunity timers and Treat
// Wounds) clear themselves when the master clock passes their end. Encounter-
// boundary effects (expireAt) are untouched; those are swept by advanceTurn.
//
// GM-only writer, mirroring useEncounterClock: one client owns the write so
// the same removal isn't broadcast by every tab. Mounted once app-wide via
// EffectExpirySync. Reads each character's effects from the synced cache and
// writes the pruned list back through sendUpdate (+ localStorage fallback).
export function useEffectExpirySweep() {
  const { getState, sendUpdate } = useSession();
  const { characters, effects: effectCatalog } = useContent();
  const { gameDate, time } = useGameDate();
  const { isGm } = useGmAuth();
  const { appendEvent } = useSessionLog();

  const nowSecs = toGameSeconds({ ...gameDate, ...time });

  // Avoid re-sweeping the same clock value (effect fires on other dep changes).
  const lastSweptRef = useRef(null);

  useEffect(() => {
    if (!isGm) return;
    if (lastSweptRef.current === nowSecs) return;
    lastSweptRef.current = nowSecs;

    (characters || []).forEach((c) => {
      const effects = getState(c.id, APP.EFFECTS);
      if (Array.isArray(effects) && effects.length > 0) {
        const expired = effects.filter(
          (e) => typeof e.expireAtSecs === 'number' && e.expireAtSecs <= nowSecs,
        );
        if (expired.length > 0) {
          const next = effects.filter((e) => !expired.includes(e));
          writeLocal(syncKey(APP.EFFECTS, c.id), next);
          sendUpdate(c.id, APP.EFFECTS, next);

          expired.forEach((e) => {
            const def = (effectCatalog || []).find((d) => d.id === e.effectId);
            const label = def?.name || e.effectId;
            const what = e.source ? `${label} (${e.source})` : label;
            appendEvent({ type: 'expire', text: `${what} expired on ${c.name}` });
          });
        }
      }

      // Item-target effects (#339) — same clock expiry on a parallel overlay.
      const itemFx = getState(c.id, APP.ITEMEFFECTS);
      const { next: nextItemFx, expired: expiredItemFx } = pruneExpiredItemEffects(itemFx, nowSecs);
      if (expiredItemFx.length > 0) {
        writeLocal(itemEffectsKey(c.id), nextItemFx);
        sendUpdate(c.id, APP.ITEMEFFECTS, nextItemFx);
        expiredItemFx.forEach((e) => {
          appendEvent({ type: 'expire', text: `${e.label} (${e.source}) expired on ${e.itemName}` });
        });
      }
    });
  }, [isGm, nowSecs, characters, effectCatalog, getState, sendUpdate, appendEvent]);
}

export default useEffectExpirySweep;
