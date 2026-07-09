import { useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useGmAuth } from './useGmAuth';
import { useSessionLog } from './useSessionLog';
import { useGameDate } from '../contexts/GameDateContext';
import { toGameSeconds } from '../utils/gameTime';
import { newEntryUid } from '../utils/uid';
import { resolveExpireAt } from '../utils/expiry';
import { MINUTE_ROUNDS } from '../utils/whetstone';
import { RELAY, APP, syncKey, globalKey } from '../sync/keys';

// HP-threshold whetstone triggers (#1216 — Valorous Coin). An active whetstone
// effect carrying `effect.hpTrigger` fires once when the wielder drops below
// the HP fraction: temp HP (= level × tempHpPerLevel) plus a 1-minute catalog
// buff, and the whetstone's remaining duration collapses to that same minute
// (per the item text, everything ends together).
//
// HP is written from many places (AdjustHpModal, damage flows, the Foundry
// bridge), so this watches the synced hp key instead of instrumenting writers.
// GM-only writer mirroring useAuraKoSweep: one client owns the write; the
// `fired` flag on the entry stops re-firing.
export function useWhetstoneHpTrigger(character) {
  const charId = character?.id || 'none';
  const name = character?.name || charId;
  const level = character?.level || 0;
  const [hp, setHp] = useSyncedState(syncKey(RELAY.HP, charId), null);
  const [effects, setEffects] = useSyncedState(syncKey(APP.EFFECTS, charId), []);
  const [encounter] = useSyncedState(globalKey(RELAY.ENCOUNTER), null);
  const { isGm } = useGmAuth();
  const { appendEvent } = useSessionLog();
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });

  useEffect(() => {
    if (!isGm) return;
    const armed = (effects || []).filter(
      (e) => e?.whetstone?.effect?.hpTrigger && !e.whetstone.fired
    );
    if (!armed.length) return;
    if (typeof hp?.current !== 'number' || typeof hp?.max !== 'number' || hp.max <= 0) return;

    const firing = armed.filter((e) => {
      const frac = e.whetstone.effect.hpTrigger.belowFraction ?? 0.25;
      return hp.current < hp.max * frac;
    });
    if (!firing.length) return;

    // One-minute expiry for the buff AND the fired coin: round-ticked in an
    // active encounter, game-clock otherwise (same algebra as apply time).
    const inEncounter = !!encounter?.active;
    const selfEntryId = (encounter?.order || []).find(
      (e) => e.kind === 'pc' && e.charId === charId
    )?.entryId || null;
    const expireAt = inEncounter
      ? resolveExpireAt({ until: 'rounds', rounds: MINUTE_ROUNDS }, encounter, selfEntryId)
      : null;
    const expiry = expireAt
      ? { expireAt, expireAtSecs: undefined }
      : { expireAt: undefined, expireAtSecs: nowSecs + 60 };

    const tempGain = firing.reduce(
      (best, e) => Math.max(best, level * (e.whetstone.effect.hpTrigger.tempHpPerLevel ?? 1)),
      0
    );
    if (tempGain > 0) {
      setHp({ ...hp, temp: Math.max(hp.temp || 0, tempGain) });
    }

    const firingIds = new Set(firing.map((e) => e.id));
    const buffEntries = firing
      .filter((e) => e.whetstone.effect.hpTrigger.effectId)
      .map((e) => ({
        id: newEntryUid(),
        effectId: e.whetstone.effect.hpTrigger.effectId,
        appliedBy: charId,
        source: e.whetstone.itemName,
        ...expiry,
        ts: Date.now(),
      }));
    setEffects((cur) => [
      ...(cur || []).map((e) =>
        firingIds.has(e.id)
          ? { ...e, whetstone: { ...e.whetstone, fired: true }, ...expiry }
          : e
      ),
      ...buffEntries,
    ]);

    firing.forEach((e) => {
      const note = e.whetstone.effect.hpTrigger.note;
      appendEvent({
        type: 'action',
        text: `${e.whetstone.itemName} triggers — ${name} drops below ¼ HP: ${tempGain} temp HP + determination for 1 minute${note ? ` (${note})` : ''}`,
      });
    });
  }, [isGm, hp, effects, encounter, nowSecs, charId, name, level, setHp, setEffects, appendEvent]);
}

export default useWhetstoneHpTrigger;
