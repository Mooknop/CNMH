import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../shared/Modal';
import TargetRollResolver from './TargetRollResolver';
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
import { DEFENSE_LABELS } from '../../utils/defense';
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
import { absorbedKey, retrieve as retrieveAbsorbed } from '../../utils/spellgunHost';
import './SpellgunAttackModal.css';
import { RELAY, APP, syncKey, globalKey } from '../../sync/keys';

// Per-defense degree vocabulary: AC speaks attack terms, Reflex speaks save terms.
const DEFENSE_DEGREE_LABELS = {
  ac:     ATTACK_DEGREE_LABELS,
  reflex: DEGREE_LABELS,
};

/**
 * Fire a spellgun (Magic+ arsenal M1b, epic #1206 / #1207). A spellgun is a
 * one-shot Consumable that Activates as a 2-action attack: the wielder CHOOSES a
 * spell attack roll or a firearm attack roll (RAW: simple-firearms proficiency),
 * resolved vs the target's AC (Howl/Torrent/Sparking/Moonlit) or Reflex DC
 * (Verdant Bola). Damage rides the shared TargetRollResolver (monster IWR nets
 * the applied total, #1014) and the outgoing-damage relay (#1016); the device is
 * consumed on use.
 *
 * On-hit riders (Speed penalty, knockback, dazzled/blinded, persistent,
 * grabbed/restrained) are logged as GM-facing notes — the authoritative degree
 * text lives on the item's activation card, and enemy-condition auto-apply stays
 * GM-side, exactly like the minion strike flow.
 *
 * @param {Object} item      - resolved, grade-merged spellgun inventory item
 * @param {Object} character - the firing PC
 */
const SpellgunAttackModal = ({ isOpen, onClose, item, character, themeColor }) => {
  const { sendUpdate } = useSession();
  const { encounter, appendLog } = useEncounter();
  const { appendEvent } = useSessionLog();
  const { spendActions } = useTurnState(character?.id || 'nobody');
  const { revealFiredIwr } = useIwrReveal();
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id || ''), {});
  const [, setAbsorbed] = useSyncedState(absorbedKey(character?.id || ''), {});
  const [profChoice, setProfChoice] = useSyncedState(syncKey(APP.SPELLGUNATK, character?.id || ''), null);
  const [positionsState] = useSyncedState(globalKey(RELAY.POSITIONS), null);

  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(character?.id || '', order);
  const enemyTargets = useMemo(
    () => selectable.filter((e) => e.kind === 'enemy' && e.defenses),
    [selectable]
  );

  const [pickedId, setPickedId] = useState(null);
  const [night, setNight] = useState(false);
  const [resolved, setResolved] = useState(false);
  const resolverRef = useRef(null);

  // Ranged attack: ask the bridge for fresh combatant positions so range
  // increments aren't judged off a stale snapshot (degrades to no gating).
  useEffect(() => {
    if (isOpen) sendUpdate('global', RELAY.POSITIONSREQ, { ts: Date.now() });
  }, [isOpen, sendUpdate]);

  const meta = spellgunMeta(item);
  const defense = spellgunDefense(item); // 'ac' | 'reflex'
  const attackOptions = useMemo(() => spellgunAttackOptions(character), [character]);

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

  const handleConfirm = () => {
    const results = resolverRef.current?.getResults();
    if (!results || results.length === 0) return;

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

    // Consume the spellgun (one-shot; the device melts) — the player-writable
    // consumed overlay, same mechanism potions use. Keyed by the (grade) name.
    setConsumed((cur) => ({ ...(cur || {}), [item.name]: ((cur || {})[item.name] || 0) + 1 }));
    // If the fired spellgun was absorbed into a host glove (#1208), consuming it
    // clears its binding so the glove slot frees up. Idempotent when unbound.
    setAbsorbed((cur) => retrieveAbsorbed(cur, itemUidOf(item)));

    if (encounterMode) spendActions(meta.actionCount || 2, `Fire ${item.name}`);
    setResolved(true);
  };

  const handleClose = () => {
    setPickedId(null);
    setNight(false);
    setResolved(false);
    onClose();
  };

  if (!isOpen || !item || !character || !meta) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Fire ${item.name}`}
      themeColor={themeColor}
      maxWidth="440px"
      placement="bottom"
      highZ
    >
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
                onClick={() => { setProfChoice(o.id); setResolved(false); }}
                disabled={resolved}
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
                onClick={() => { setNight(false); setResolved(false); }}
                disabled={resolved}
              >
                Day ({item.dice})
              </button>
              <button
                type="button"
                className={`sgm-pick${night ? ' sgm-pick--active' : ''}`}
                aria-pressed={night}
                onClick={() => { setNight(true); setResolved(false); }}
                disabled={resolved}
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
                  onClick={() => { setPickedId(e.entryId); setResolved(false); }}
                  disabled={resolved}
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        </div>

        {target && (
          <TargetRollResolver
            ref={resolverRef}
            enemyTargets={resolverTargets}
            targetDefense={defense}
            rollBonus={rollBonus}
            damage={damageProfile}
            rangeByEntry={hasRangeData ? rangeByEntry : null}
            charId={character?.id}
            rollFlavor={`Fire: ${item?.name ?? 'Spellgun'}`}
          />
        )}

        <div className="sgm-actions">
          <button
            type="button"
            className="btn-primary sgm-confirm"
            data-testid="sgm-fire"
            onClick={handleConfirm}
            disabled={!target || resolved || remaining <= 0 || targetOutOfRange}
            title={targetOutOfRange ? 'Target is out of range' : undefined}
          >
            {resolved ? 'Fired' : targetOutOfRange ? 'Out of range' : `Fire${encounterMode ? ` (${meta.actionCount || 2} act)` : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SpellgunAttackModal;
