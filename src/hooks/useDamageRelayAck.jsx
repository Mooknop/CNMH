import { useEffect, useRef } from 'react';
import { useEncounter } from './useEncounter';
import { useGmAuth } from './useGmAuth';
import { useSyncedState } from './useSyncedState';
import { DMGDONE_KEY } from '../utils/damageRelay';

// Ack window: dmgdone is a persisted synced key, so a fresh mount hydrates
// with the LAST ack ever sent — indistinguishable from a live one by id alone.
// Only acks stamped within this window count as live (bridge and GM device
// share a table/LAN, so clock skew is negligible next to 15s).
const ACK_FRESH_MS = 15_000;

// Typed-damage-relay ack mirror (#1016). The bridge applies relayed damage via
// PF2e's actor.applyDamage and acks on cnmh_dmgdone_global; this hook mirrors
// that ack into the encounter log so the table sees "applied in Foundry"
// alongside the resolver's own damage line. GM-only writer (one client owns
// the log append, like usePersistentReminders); mounted app-wide via
// PersistentSync.
export function useDamageRelayAck() {
  const { appendLog } = useEncounter();
  const { isGm } = useGmAuth();
  const [done] = useSyncedState(DMGDONE_KEY, null);
  const lastIdRef = useRef(null);

  useEffect(() => {
    if (!isGm || !done?.id || done.id === lastIdRef.current) return;
    lastIdRef.current = done.id;
    if (typeof done.ts !== 'number' || Date.now() - done.ts > ACK_FRESH_MS) return;

    const source = done.sourceName ? `${done.sourceName}: ` : '';
    (done.applied || []).forEach((a) => {
      // Multi-instance hits (#1019) itemize per type: '13 piercing + 4 fire'.
      const typed = Array.isArray(a.instances) && a.instances.length
        ? a.instances.map((i) => (i.type ? `${i.amount} ${i.type}` : `${i.amount}`)).join(' + ')
        : a.type ? `${a.amount} ${a.type}` : `${a.amount}`;
      appendLog({
        type: 'system',
        text: `Foundry: ${source}${typed} damage applied to ${a.name || a.entryId}`,
      });
    });
    if (done.failed?.length) {
      const names = done.failed.map((f) => f.name || f.entryId).join(', ');
      appendLog({
        type: 'system',
        text: `Foundry: ${source}damage NOT applied to ${names} — apply by hand`,
      });
    }
  }, [done, isGm, appendLog]);
}

export default useDamageRelayAck;
