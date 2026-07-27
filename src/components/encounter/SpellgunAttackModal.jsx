import React, { useEffect, useRef, useState } from 'react';
import RollSheet from './RollSheet';
import { useAttackRollSheet } from '../../hooks/useAttackRollSheet';
import { useSession } from '../../contexts/SessionContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useIwrReveal } from '../../hooks/useIwrReveal';
import { useSyncedState } from '../../hooks/useSyncedState';
import { buildDamageProfile, formatDamageBreakdown } from '../../utils/damage';
import { rangeIncrementResult } from '../../utils/rangeIncrement';
import { collectDamageHits, buildDamageApply } from '../../utils/damageRelay';
import { defenseDC, DEFENSE_LABELS } from '../../utils/defense';
import {
  spellgunMeta,
  spellgunDefense,
  spellgunRangeIncrementFt,
  spellgunAttackOptions,
  spellgunOutcome,
  spellgunActiveDice,
  spellgunHasNightDice,
  spellgunRiderNote,
} from '../../utils/spellgun';
import { formatModifier } from '../../utils/CharacterUtils';
import { DEGREE_LABELS, ATTACK_DEGREE_LABELS } from '../../utils/degreeDisplay';
import { itemUidOf } from '../../utils/affix';
import { recordConsumed } from '../../utils/consumedLedger';
import { absorbedKey, retrieve as retrieveAbsorbed } from '../../utils/spellgunHost';
import './SpellgunAttackModal.css';
import { RELAY, APP, syncKey, globalKey } from '../../sync/keys';

// Per-defense degree vocabulary: AC speaks attack terms, Reflex speaks save terms.
const DEFENSE_DEGREE_LABELS = {
  ac:     ATTACK_DEGREE_LABELS,
  reflex: DEGREE_LABELS,
};

/**
 * Fire a spellgun (Magic+ arsenal M1b, epic #1206 / #1207), on the two-phase
 * RollSheet (Roll Resolution redesign successor arc — off TargetRollResolver/
 * DamagePanel). A spellgun is a one-shot Consumable that Activates as a
 * 2-action attack: the wielder CHOOSES a spell attack roll or a firearm attack
 * roll (RAW: simple-firearms proficiency), resolved vs the target's AC
 * (Howl/Torrent/Sparking/Moonlit) or Reflex DC (Verdant Bola).
 *
 * Commit is one moment: the device is consumed (+ its absorbed-host binding
 * released, #1208) and the actions spent there. The log line, the outgoing
 * typed-damage relay (#1016) and the IWR reveal (#1014) all read the entered
 * damage total, so on a hit they defer to the sheet's finish transition, same
 * split as UseAbilityModal's attack path (#1687); a miss — or the damage-less
 * Bola — logs at the commit with identical text. Closing a committed sheet
 * flushes the deferred steps with no totals so the roll line is never lost.
 *
 * On-hit riders (Speed penalty, knockback, dazzled/blinded, persistent,
 * grabbed/restrained) stay GM-facing log notes — the authoritative degree
 * text lives on the item's activation card, and enemy-condition auto-apply
 * stays GM-side, exactly like the minion strike flow.
 *
 * @param {Object} item      - resolved, grade-merged spellgun inventory item
 * @param {Object} character - the firing PC
 */
const SpellgunAttackSheet = ({ onClose, item, character, themeColor }) => {
  const { sendUpdate } = useSession();
  const { encounter, appendLog } = useEncounter();
  const { appendEvent } = useSessionLog();
  const { spendActions } = useTurnState(character?.id || 'nobody');
  const { revealFiredIwr } = useIwrReveal();
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id || ''), {});
  const [, setAbsorbed] = useSyncedState(absorbedKey(character?.id || ''), {});
  const [profChoice, setProfChoice] = useSyncedState(syncKey(APP.SPELLGUNATK, character?.id || ''), null);
  const [positionsState] = useSyncedState(globalKey(RELAY.POSITIONS), null);

  const order = encounter?.order || [];
  const { selectable } = useTargeting(character?.id || '', order);
  const enemyTargets = selectable.filter((e) => e.kind === 'enemy' && e.defenses);

  const [pickedId, setPickedId] = useState(null);
  const [night, setNight] = useState(false);
  const deriveAttackSheet = useAttackRollSheet();
  // Deferred-finish bookkeeping (#1687 pattern): `deferredRef` marks a commit
  // whose log/relay/IWR steps await the amount step; `finishedRef` makes the
  // finish exactly-once (Apply damage, then Modal-chrome close, can both reach it).
  const deferredRef = useRef(false);
  const finishedRef = useRef(false);

  // Ranged attack: ask the bridge for fresh combatant positions so range
  // increments aren't judged off a stale snapshot (degrades to no gating).
  // The sheet mounts per open (see the outer gate), so once per open.
  useEffect(() => {
    sendUpdate('global', RELAY.POSITIONSREQ, { ts: Date.now() });
  }, [sendUpdate]);

  const meta = spellgunMeta(item);
  const defense = spellgunDefense(item); // 'ac' | 'reflex'
  const attackOptions = spellgunAttackOptions(character);

  // Proficiency choice (persisted per character): default to the higher bonus.
  const bestId = [...attackOptions].sort((a, b) => b.bonus - a.bonus)[0]?.id || null;
  const chosenId = profChoice || bestId;
  const chosen = attackOptions.find((o) => o.id === chosenId) || attackOptions[0] || null;
  const rollBonus = chosen ? chosen.bonus : null;

  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const remaining = item?.quantity ?? 1;
  const log = encounter?.active ? appendLog : ({ type, text }) => appendEvent({ type, text });

  const target = enemyTargets.find((e) => e.entryId === pickedId) || null;
  const resolverTargets = target ? [target] : [];

  // Damage profile — impact dice + type (AC damage spellguns only; the Bola is
  // a control spellgun with no damage). Moonlit swaps to night dice.
  const activeDice = spellgunActiveDice(item, { night });
  const damageProfile = (defense === 'ac' && activeDice)
    ? buildDamageProfile(
        { damage: activeDice, damageType: meta?.damageType, type: 'ranged', traits: item?.traits || [] },
        character,
        { enemyEntries: resolverTargets, order }
      )
    : null;

  // Range increment vs the picked target (#527) — measured from the bridge
  // positions; degrades to no gating when positions are absent.
  const casterEntry = order.find((e) => e.kind === 'pc' && e.charId === character?.id);
  const rangeFt = spellgunRangeIncrementFt(item);
  const positions = positionsState?.positions || null;
  const rangeFrom = rangeFt && positions && casterEntry ? positions[casterEntry.entryId] : null;
  const rangeByEntry = {};
  if (rangeFrom && target) {
    const to = positions[target.entryId];
    if (to) rangeByEntry[target.entryId] = rangeIncrementResult({ from: rangeFrom, to, incrementFt: rangeFt });
  }
  const hasRangeData = Object.keys(rangeByEntry).length > 0;
  const targetOutOfRange = !!(target && rangeByEntry[target.entryId]?.beyondMaxRange);

  const attackSheet = deriveAttackSheet({
    rollBonus,
    enemyTargets: resolverTargets,
    defense,
    rangeByEntry: hasRangeData ? rangeByEntry : null,
    damageProfile,
  });

  const rollFlavor = `Fire: ${item?.name ?? 'Spellgun'}`;

  // The log line + typed-damage relay + IWR reveal — everything that reads the
  // (possibly entered) damage. Runs at the commit when no amount step follows,
  // else at the finish.
  const finishFire = (results) => {
    const degreeMap = DEFENSE_DEGREE_LABELS[defense] || DEFENSE_DEGREE_LABELS.ac;
    const defLabel = DEFENSE_LABELS[defense] || defense;

    results.forEach((r) => {
      const degreeLabel = r.degree ? degreeMap[r.degree] : null;
      const outcome = r.degree ? spellgunOutcome(meta.against, r.degree) : null;
      const dmgSuffix = r.damage?.final != null ? ` · damage ${formatDamageBreakdown(r.damage)}` : '';
      const rider = outcome ? spellgunRiderNote(item, outcome) : null;
      const riderSuffix = rider ? ` · ${rider}` : '';
      const text = degreeLabel
        ? `${character.name} fires ${item.name} vs ${r.name} (${defLabel} ${r.dc}): ${r.total} → ${degreeLabel}${dmgSuffix}${riderSuffix}`
        : `${character.name} fires ${item.name} vs ${r.name}: ${r.total}`;
      log({ type: 'action', charId: character.id, text });
    });

    // Typed damage relay (#1016): push raw enemy damage to the bridge, which
    // applies it through PF2e (monster IWR nets there). Enemies only.
    const enemyIds = new Set((order || []).filter((e) => e.kind === 'enemy').map((e) => e.entryId));
    const hits = collectDamageHits([{ rayIndex: null, results }], null, {
      typeLabel: damageProfile?.typeLabel ?? null,
      allowedEntryIds: enemyIds,
    });
    if (hits.length) {
      sendUpdate('global', RELAY.DMGAPPLY, buildDamageApply({ hits, sourceName: item.name }));
    }

    // Reveal any monster IWR that just modified the applied damage (#1014).
    revealFiredIwr(results);
  };

  const runFinish = (amounts) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    finishFire(attackSheet.resolveWithAmounts(amounts));
  };

  const summaryLine = [
    target ? target.name : null,
    chosen ? `${chosen.label} ${formatModifier(chosen.bonus)}` : null,
    `×${remaining} remaining`,
  ].filter(Boolean).join(' · ');

  let blockLine = null;
  if (remaining <= 0) blockLine = 'None remaining — the device is spent.';
  else if (!target) blockLine = 'Pick a target first — open Edit.';
  else if (targetOutOfRange) blockLine = `${target.name} is out of range.`;

  const dcLine = ['nothing rolled yet', ...resolverTargets.map((e) => {
    const dc = defenseDC(e.defenses, defense);
    return dc != null ? `${e.name} ${DEFENSE_LABELS[defense] || defense} ${dc}` : null;
  }).filter(Boolean)].join(' · ');

  const editPanel = (
    <div className="sgm-body">
      <div className="sgm-summary">
        <span className="sgm-remaining" aria-label="remaining count">×{remaining} remaining</span>
        <span className="sgm-def">vs {DEFENSE_LABELS[defense] || defense} · {rangeFt} ft increment</span>
      </div>

      {/* Attack-roll proficiency choice — persisted per character */}
      <div className="sgm-field">
        <label className="sgm-label">Attack roll</label>
        <div className="sgm-picks" role="radiogroup" aria-label="Attack roll type">
          {attackOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`sgm-pick${chosenId === o.id ? ' sgm-pick--active' : ''}`}
              aria-pressed={chosenId === o.id}
              onClick={() => setProfChoice(o.id)}
            >
              {o.label} {formatModifier(o.bonus)}
            </button>
          ))}
        </div>
      </div>

      {/* Moonlit deals more damage at night */}
      {spellgunHasNightDice(item) && (
        <div className="sgm-field">
          <label className="sgm-label">Time of day</label>
          <div className="sgm-picks" role="radiogroup" aria-label="Time of day">
            <button
              type="button"
              className={`sgm-pick${!night ? ' sgm-pick--active' : ''}`}
              aria-pressed={!night}
              onClick={() => setNight(false)}
            >
              Day ({item.dice})
            </button>
            <button
              type="button"
              className={`sgm-pick${night ? ' sgm-pick--active' : ''}`}
              aria-pressed={night}
              onClick={() => setNight(true)}
            >
              Night ({item.diceNight})
            </button>
          </div>
        </div>
      )}

      {/* Target */}
      <div className="sgm-field">
        <label className="sgm-label">Target</label>
        <div className="sgm-picks">
          {enemyTargets.length === 0 ? (
            <span className="sgm-empty">No enemies in the encounter.</span>
          ) : (
            enemyTargets.map((e) => (
              <button
                key={e.entryId}
                type="button"
                className={`sgm-pick${pickedId === e.entryId ? ' sgm-pick--active' : ''}`}
                onClick={() => setPickedId(e.entryId)}
              >
                {e.name}
              </button>
            ))
          )}
        </div>
      </div>

      {attackSheet.togglesRow}
    </div>
  );

  return (
    <RollSheet
      // Modal chrome (overlay / × / Escape) can leave a committed sheet at the
      // amount screen; the commit already consumed the device and spent the
      // actions, so flush the deferred log/relay with no totals rather than
      // lose the roll line.
      onClose={() => { if (deferredRef.current) runFinish({}); onClose(); }}
      title={`Fire ${item.name}`}
      themeColor={themeColor}
      maxWidth="440px"
      summaryLine={summaryLine}
      blockLine={blockLine}
      editPanel={editPanel}
      charId={character?.id}
      flavor={rollFlavor}
      bonus={attackSheet.bonus}
      bonusLabel={defense === 'ac' ? 'attack' : 'check'}
      dcLine={dcLine}
      commitLabel={`Fire${encounterMode ? ` (${meta.actionCount || 2} act)` : ''}`}
      attack={defense === 'ac'}
      // Commit is ONE moment: the consume, the absorbed-host release and the
      // action spend fire here; the rows it hands back are frozen for the rest
      // of the sheet's life.
      onCommit={(face) => {
        const results = attackSheet.commit(face);
        const hits = results.some((r) => r.degree === 'success' || r.degree === 'criticalSuccess');
        const willAskAmount = !!attackSheet.damageParts && hits;
        if (!willAskAmount) finishFire(results);
        deferredRef.current = willAskAmount;

        // Consume the spellgun (one-shot; the device melts) — the player-writable
        // consumed overlay, same mechanism potions use. Keyed by uid (#1659).
        setConsumed((cur) => recordConsumed(cur, item));
        // If the fired spellgun was absorbed into a host glove (#1208), consuming it
        // clears its binding so the glove slot frees up. Idempotent when unbound.
        setAbsorbed((cur) => retrieveAbsorbed(cur, itemUidOf(item)));

        if (encounterMode) spendActions(meta.actionCount || 2, `Fire ${item.name}`);
        return attackSheet.rowsFor(results);
      }}
      damageParts={attackSheet.damageParts}
      amountExtras={attackSheet.amountExtras}
      breakdownFor={attackSheet.breakdownFor}
      onFinish={runFinish}
      costLabel={encounterMode ? `${meta.actionCount || 2} actions` : ''}
    />
  );
};

// Open gate stays out here so a close UNMOUNTS the sheet — RollSheet's frozen
// commit, the picker/night state and the deferred-finish refs all reset for
// free on the next open (the parents keep this component mounted with
// isOpen=false). The persisted proficiency choice rides synced state, so it
// survives the unmount by design.
const SpellgunAttackModal = ({ isOpen, onClose, item, character, themeColor }) => {
  if (!isOpen || !item || !character || !spellgunMeta(item)) return null;
  return (
    <SpellgunAttackSheet
      onClose={onClose}
      item={item}
      character={character}
      themeColor={themeColor}
    />
  );
};

export default SpellgunAttackModal;
