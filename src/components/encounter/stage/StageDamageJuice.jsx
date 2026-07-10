// Stage damage juice (#1354, epic #1343). Combat feedback on the off-turn
// stage: when damage is confirmed in either direction, every watching device
// sees a short typed burst — and can tell dealt from taken at a glance.
//
//   DEALT  — cnmh_dmgapply_global (the damage step's confirm-time relay,
//            already typed per enemy target). Anchored top-right over the
//            acting banner, accent-colored, rises: the actor's accomplishment.
//   TAKEN  — a PC's cnmh_hp_<charId> current dropping (any writer: bridge,
//            GM Adjust HP, save flows). Anchored left, peril-colored, sinks;
//            the viewer's own PC gets the bigger shaking variant. Type comes
//            from the payload's transient damageType (GM typed flow) and falls
//            back to the untyped burst — #1355 upgrades Foundry hits to typed.
//
// One-shots ≤ 600ms, compositor-only, pointer-events: none, aria-hidden (the
// action feed and encounter log carry the durable record). Replay-guarded via
// useRelayEvent (dealt) / useValueFlash's hydration baseline (taken), so
// reconnects and page loads never fire ghost bursts.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useValueFlash, FX_FLASH_MS } from '../../../hooks/useValueFlash';
import { useRelayEvent } from '../../../hooks/useRelayEvent';
import { HpFxSymbol, symbolTypeFor } from '../../shared/hpFxSymbols';
import { RELAY, globalKey, syncKey } from '../../../sync/keys';
import { entryPortrait } from '../../../utils/stagePortrait';
import StagePortrait from './StagePortrait';
import './StageDamageJuice.css';

const MAX_BURSTS = 3; // concurrent cards — a fireball is one grouped card, not five
const MAX_HIT_LINES = 3;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Renderless watcher — one per PC in the encounter order, so each subscribes
// to its own hp key at the top level. useValueFlash's baseline skip means a
// mount mid-encounter never fires for hydrated state, and it returns null
// under prefers-reduced-motion.
const TakenHpWatcher = ({ charId, onTaken }) => {
  const [hp] = useSyncedState(syncKey(RELAY.HP, charId), null);
  const flash = useValueFlash(hp?.current, (prev, next) => (next < prev ? 'damage' : null));
  const seenKeyRef = useRef(0);
  const typeRef = useRef(undefined);
  typeRef.current = hp?.damageType;

  useEffect(() => {
    if (!flash || flash.key === seenKeyRef.current) return;
    seenKeyRef.current = flash.key;
    onTaken({ charId, amount: -flash.delta, damageType: typeRef.current });
  }, [flash, charId, onTaken]);

  return null;
};

// One damage packet: type glyph + amount. Multi-instance hits (a flaming
// rune's fire beside the base piercing) render one packet per instance.
const HitLine = ({ hit }) => {
  const instances =
    Array.isArray(hit.instances) && hit.instances.length
      ? hit.instances
      : [{ amount: hit.amount, type: hit.type }];
  return (
    <div className="stage-juice-hit">
      {instances.map((inst, i) => (
        <span className="stage-juice-packet" key={i}>
          <HpFxSymbol type={symbolTypeFor(inst.type)} />
          {inst.amount}
        </span>
      ))}
      <span className="stage-juice-target">{hit.name || 'target'}</span>
    </div>
  );
};

const TakenCard = ({ burst, characters, self }) => {
  const character = (characters || []).find((c) => c && c.id === burst.charId);
  const name = character?.name || burst.charId;
  const art = entryPortrait({ kind: 'pc', charId: burst.charId }, characters);
  return (
    <div
      className={`stage-juice-card stage-juice-card--taken${self ? ' stage-juice-card--self' : ''}`}
      data-testid="juice-taken"
    >
      <StagePortrait
        className="stage-juice-avatar"
        src={art.src}
        name={name}
        imagePosition={art.imagePosition}
      />
      <span className="stage-juice-target">{name}</span>
      <span className="stage-juice-packet">
        <HpFxSymbol type={symbolTypeFor(burst.damageType)} />
        −{burst.amount}
      </span>
    </div>
  );
};

const StageDamageJuice = ({ order, characters, viewerCharId }) => {
  const [bursts, setBursts] = useState([]);
  const seqRef = useRef(0);
  const timersRef = useRef(new Set());

  const pushBurst = useCallback((burst) => {
    const key = ++seqRef.current;
    setBursts((cur) => [...cur.slice(-(MAX_BURSTS - 1)), { ...burst, key }]);
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      setBursts((cur) => cur.filter((b) => b.key !== key));
    }, FX_FLASH_MS);
    timersRef.current.add(t);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useRelayEvent(
    globalKey(RELAY.DMGAPPLY),
    useCallback(
      (payload) => {
        if (prefersReducedMotion()) return;
        const hits = (payload.hits || []).filter((h) => h && h.amount > 0);
        if (!hits.length) return;
        pushBurst({
          kind: 'dealt',
          sourceName: payload.sourceName,
          hits: hits.slice(0, MAX_HIT_LINES),
          more: Math.max(0, hits.length - MAX_HIT_LINES),
        });
      },
      [pushBurst]
    )
  );

  const onTaken = useCallback(
    ({ charId, amount, damageType }) => {
      pushBurst({ kind: 'taken', charId, amount, damageType });
    },
    [pushBurst]
  );

  const pcs = (order || []).filter((e) => e && e.kind === 'pc' && e.charId);

  return (
    <>
      {pcs.map((e) => (
        <TakenHpWatcher key={e.charId} charId={e.charId} onTaken={onTaken} />
      ))}
      {bursts.length > 0 && (
        <div className="stage-juice" aria-hidden="true">
          {bursts.map((b) =>
            b.kind === 'dealt' ? (
              <div
                key={b.key}
                className="stage-juice-card stage-juice-card--dealt"
                data-testid="juice-dealt"
              >
                {b.sourceName && <div className="stage-juice-source">{b.sourceName}</div>}
                {b.hits.map((h, i) => (
                  <HitLine hit={h} key={i} />
                ))}
                {b.more > 0 && <div className="stage-juice-more">+{b.more} more</div>}
              </div>
            ) : (
              <TakenCard
                key={b.key}
                burst={b}
                characters={characters}
                self={b.charId === viewerCharId}
              />
            )
          )}
        </div>
      )}
    </>
  );
};

export default StageDamageJuice;
