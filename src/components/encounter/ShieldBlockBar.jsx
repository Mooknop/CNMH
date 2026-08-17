import React, { useState } from 'react';
import { useShield } from '../../hooks/useShield';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { useFrequency } from '../../hooks/useFrequency';
import { useGameDate } from '../../contexts/GameDateContext';
import { toGameSeconds } from '../../utils/gameTime';
import { itemUidOf } from '../../utils/affix';
import { accessoryRuneOf, runeOnBlock } from '../../utils/accessoryRunes';
import { shieldPropertyRunes } from '../../utils/shieldRunes';
import { REVERBERATING } from '../../utils/shieldRuneStrike';
import { computeSaveDegree } from '../../utils/saveDegree';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import { visibleOrder } from '../../utils/encounterUtils';
// Bare name, not DEFENSE_LABELS (#1639): the retaliation log leads with its own
// "DC <n>" and closes on the save, so the DC-flavoured label tails the sentence
// with a stray "DC" ("DC 20 basic Reflex DC").
import { DEFENSE_NAMES } from '../../utils/defense';
import './ShieldBlockBar.css';

/**
 * Shield Block damage-split bar — extracted from TurnTrackerPanel so the
 * reaction trigger prompt (#221) can run the same flow when the GM fires a
 * "PC was damaged" event. The player enters the incoming hit; applyBlock runs
 * the Hardness/HP math, the reaction is spent, and the outcome is logged.
 *
 * Self-contained: renders null unless a held shield is raised (and unbroken
 * shields only get the bonus, but a block can break the shield mid-flow).
 *
 * Accessory-rune onBlock riders (#1055 S2): a structured rider on the blocking
 * shield's rune ARMS after a successful block —
 *  - Retaliation (`damage`+`save`): pick the attacker, enter the rolled dice,
 *    and a save request goes to the GM; RequestedSaves derives per-degree
 *    damage, nets monster IWR, and relays the result to Foundry.
 *  - Catching (`check`): pick the attacker, enter the Disarm check total; the
 *    outcome is derived against the enemy's Reflex DC when its saves were
 *    captured, and logged for the GM to adjudicate.
 * Either follow-up is the rune's free action, spent from the shared hourly
 * frequency ledger (the same one the item modal's activation card ticks).
 * A legacy prose-string rider stays a display-only reminder.
 *
 * The block itself ends the raise (#1341), so an armed follow-up outlives
 * `raised`: the bar stays mounted showing ONLY the follow-up strip until the
 * rider is fired or skipped. A DESTROYING block is the exception — the rider
 * is lost with the arm and nothing arms.
 */
const ShieldBlockBar = ({ charId, characterName, inventory = [] }) => {
  const { heldShield, raised, lowerShield, applyBlock } = useShield(charId, inventory);
  const { turnState, spendReaction } = useTurnState(charId);
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { gameDate, time } = useGameDate();
  const [blockDamage, setBlockDamage] = useState('');
  // Deflecting shields (#1196 G1) add +2 effective Hardness against ranged
  // attacks. There's no attack-type context on this bar, so the player flags
  // "the triggering attack was ranged" — off by default.
  const [ranged, setRanged] = useState(false);
  // Protecting rune (#1246): once per minute, reduce the triggering physical
  // damage by the shield's Hardness BEFORE the Shield Block ("If you also use
  // your Shield Block reaction against the attack, this applies before your
  // Shield Block"). Opt-in per block; off by default.
  const [useProtecting, setUseProtecting] = useState(false);
  // Armed rider follow-up (#1055 S2) — set by a successful block, cleared on
  // use or dismissal.
  const [armed, setArmed] = useState(false);
  const [riderTarget, setRiderTarget] = useState('');
  const [riderInput, setRiderInput] = useState('');

  // The rune doc lives on the full inventory entry; heldShield is the
  // normalized shield view, so read it back by uid.
  const hostItem = (inventory || []).find((e) => e && e.uid === heldShield?.uid) || null;
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const { gateFor, record } = useFrequency(charId);

  const blockRune = accessoryRuneOf(hostItem);
  const rider = runeOnBlock(blockRune);
  // The rune's free action spends from the SAME hourly ledger entry as the
  // item modal's activation card — the `${uid}:actuated` key useItemActivation
  // derives for a cost:'none' actuated block (#1033 S2).
  const actuated = hostItem?.actuated || blockRune?.actuated || null;
  const freqAbility = {
    id: itemUidOf(hostItem) ? `${itemUidOf(hostItem)}:actuated` : null,
    name: actuated?.name,
    frequency: actuated?.frequency || 'once per day',
  };
  const gate = gateFor(freqAbility, { nowSecs });
  // A structured rider can actually fire; a prose one only reminds.
  const liveRider = rider && (rider.damage || rider.check) ? rider : null;

  // Self-side property runes on the blocking shield (#1246). Protecting rides
  // its own once-per-minute ledger entry — the SAME `${uid}:protecting:actuated`
  // key its ShieldRuneActivations card spends, so the two surfaces share one
  // clock. Reverberating only needs recognizing here: a block stores its charge.
  const propRunes = shieldPropertyRunes(hostItem);
  const protecting = propRunes.find((r) => r.id === 'protecting') || null;
  const protectingAbility = {
    id: itemUidOf(hostItem) ? `${itemUidOf(hostItem)}:protecting:actuated` : null,
    name: protecting?.actuated?.name || 'Protecting',
    frequency: protecting?.actuated?.frequency || 'once per minute',
  };
  const protectingGate = gateFor(protectingAbility, { nowSecs });
  const reverberating = propRunes.find((r) => REVERBERATING[r.id]) || null;

  const { reactionAvailable, reactionSpent, hasStartedFirstTurn } = turnState;

  // `raised` already folds in usability (a broken shield stays raised only for
  // a Rust-Blessed wielder; a destroyed one never does).
  const canShieldBlock =
    raised && hasStartedFirstTurn && reactionAvailable && !reactionSpent;

  // #1749 ruling addendum: a hidden combatant must not be nameable as a
  // retaliation/catching target (mirrors useTargeting.selectable / #1753's
  // positions filter). `target` below re-derives from this filtered list every
  // render, so a riderTarget that TURNS hidden mid-flow drops the same way a
  // stale useTargeting selection does — no separate cleanup needed.
  const enemies = visibleOrder(encounter?.order).filter((e) => e && e.kind === 'enemy');
  const riderReady = liveRider && gate.available;
  const followupLive = armed && riderReady;

  // The bar exists while the shield is raised — OR while an armed follow-up is
  // pending, because the block that armed it also ended the raise (#1341) and
  // the rider must not vanish with it. Losing the shield itself (stowed,
  // dropped) still takes the rider with the arm.
  if (!heldShield || (!raised && !followupLive)) return null;

  // A deflecting shield gets +2 effective Hardness against ranged attacks; the
  // trait rides on the host inventory entry (heldShield is the normalized view).
  const hasDeflecting = (hostItem?.traits || []).some(
    (t) => String(t).toLowerCase() === 'deflecting'
  );
  const deflectBonus = hasDeflecting && ranged ? 2 : 0;

  const handleShieldBlock = () => {
    const dealt = parseInt(blockDamage, 10);
    if (!canShieldBlock || isNaN(dealt) || dealt < 0) return;
    // Protecting (#1246): the rune's field absorbs Hardness-worth of the
    // triggering damage first; the Shield Block then runs on the remainder.
    const hardness = heldShield?.shield?.hardness || 0;
    const protectingActive =
      !!protecting && useProtecting && protectingGate.available && hardness > 0;
    const preReduced = protectingActive ? Math.min(dealt, hardness) : 0;
    const result = applyBlock(dealt - preReduced, { hardnessBonus: deflectBonus });
    if (!result) return;
    if (protectingActive) record(protectingAbility, { nowSecs });
    spendReaction('Shield Block');
    setBlockDamage('');
    setRanged(false);
    setUseProtecting(false);
    // Table rule: using a reaction that requires a raised shield (Shield Block
    // today; the #1191 shield reactions will share this) ends the raise —
    // whether or not the shield broke. Re-raising costs the action as normal
    // (and Rust Blessing is what lets a broken shield be re-raised at all).
    lowerShield();
    const detail = result.destroyed
      ? `shield DESTROYED! (${result.prevented} prevented)`
      : result.broken
      ? `shield broke! (${result.prevented} prevented)`
      : `${result.prevented} prevented, shield → ${result.shieldHpAfter} HP · shield lowered`;
    const runeNote = rider ? ` · ${blockRune.name}: ${rider.summary || 'rune follow-up'}` : '';
    const deflectNote = deflectBonus ? ' · deflecting +2 Hardness (ranged)' : '';
    const protectNote = protectingActive
      ? ` · Protecting: −${preReduced} before the block (once per minute)` : '';
    appendLog({ type: 'action', charId, text: `${characterName} Shield Blocked: ${detail}${protectNote}${deflectNote}${runeNote}` });
    // Reverberating (#1246): the block stores the shockwave for 1 round. The
    // release is the opt-in sonic rider on the shield's own Strikes — remind
    // the player where to spend the charge. A destroyed shield stores nothing.
    if (reverberating && !result.destroyed) {
      appendLog({
        type: 'system',
        text: `${reverberating.name}: the shockwave is stored for 1 round — `
          + "toggle the rune's sonic rider on your next hit with this shield.",
      });
    }
    // A destroying block loses the rider with the arm; otherwise the follow-up
    // arms and outlives the lowered raise (see the mount guard above).
    if (riderReady && !result.destroyed) setArmed(true);
  };

  const clearRider = () => {
    setArmed(false);
    setRiderTarget('');
    setRiderInput('');
  };

  const target = enemies.find((e) => e.entryId === riderTarget) || null;
  const riderNum = parseInt(riderInput, 10);
  const riderValid = target && !isNaN(riderNum) && gate.available;

  // Retaliation: spend the free action, then hand the GM a save request — the
  // caster's rolled total travels with it exactly like an ability's (#270).
  const fireDamageRider = () => {
    if (!riderValid || !liveRider.damage || liveRider.dc == null) return;
    record(freqAbility, { nowSecs });
    addSaveRequest({
      casterId: charId,
      casterName: characterName,
      abilityName: blockRune.name,
      save: liveRider.save,
      dc: liveRider.dc,
      basic: !!liveRider.basic,
      targets: [{
        entryId: target.entryId,
        name: target.name,
        saveMod: target.defenses?.saves?.[liveRider.save] ?? null,
      }],
      damage: {
        entered: riderNum,
        expression: liveRider.damage.expression ?? null,
        typeLabel: liveRider.damage.typeLabel ?? null,
        riders: [],
      },
    });
    appendLog({
      type: 'action',
      charId,
      text: `${characterName} unleashes ${blockRune.name} at ${target.name} — `
        + `${liveRider.damage.expression} ${liveRider.damage.typeLabel}, `
        + `DC ${liveRider.dc} ${liveRider.basic ? 'basic ' : ''}${DEFENSE_NAMES[liveRider.save] || liveRider.save} save`,
    });
    clearRider();
  };

  // Catching: spend the free action and log the Disarm attempt. The outcome
  // derives against the enemy's Reflex DC (10 + captured save mod) when known;
  // the Disarm's effect (drop/loosen the weapon) stays GM-adjudicated.
  const fireCheckRider = () => {
    if (!riderValid || !liveRider.check) return;
    record(freqAbility, { nowSecs });
    const reflexMod = target.defenses?.saves?.reflex;
    const dc = typeof reflexMod === 'number' ? 10 + reflexMod : null;
    const outcome = dc != null
      ? ` vs Reflex DC ${dc} → ${DEGREE_LABELS[computeSaveDegree({ d20: null, total: riderNum, dc })]}`
      : ' (GM adjudicates)';
    appendLog({
      type: 'action',
      charId,
      text: `${characterName}'s ${blockRune.name}: Disarm attempt vs ${target.name} — `
        + `${liveRider.check.skill === 'athletics' ? 'Athletics' : liveRider.check.skill} ${riderNum}`
        + `${liveRider.check.bonus ? ` (incl. +${liveRider.check.bonus} circumstance)` : ''}${outcome}`,
    });
    clearRider();
  };

  return (
    <div className="ttp-shieldblock-bar">
      {raised && (
        <>
          <input
            type="number"
            min="0"
            className="ttp-shieldblock-input"
            placeholder="Damage taken"
            aria-label="Shield Block damage"
            value={blockDamage}
            onChange={(e) => setBlockDamage(e.target.value)}
          />
          <button
            className="btn-secondary ttp-shieldblock"
            onClick={handleShieldBlock}
            disabled={!canShieldBlock || blockDamage === '' || parseInt(blockDamage, 10) < 0}
            aria-label="Shield Block"
            title={
              !canShieldBlock
                ? (reactionSpent ? 'Reaction already spent' : 'Reaction not yet available')
                : 'Block this damage with your shield (reaction)'
            }
          >
            🛡 Block ↩
          </button>
          {hasDeflecting && (
            <label className="ttp-shieldblock-ranged" title="Deflecting: +2 Hardness against ranged attacks">
              <input
                type="checkbox"
                checked={ranged}
                onChange={(e) => setRanged(e.target.checked)}
                aria-label="Triggering attack was ranged (deflecting +2 Hardness)"
              />
              ranged (+2 Hard.)
            </label>
          )}
          {protecting && protectingGate.available && (
            <label
              className="ttp-shieldblock-ranged"
              title="Protecting (once per minute): the shield's field reduces the triggering physical damage by its Hardness before the Shield Block"
            >
              <input
                type="checkbox"
                checked={useProtecting}
                onChange={(e) => setUseProtecting(e.target.checked)}
                aria-label={`Use Protecting (reduce damage by ${heldShield?.shield?.hardness || 0} before the block)`}
              />
              ✦ Protecting (−{heldShield?.shield?.hardness || 0})
            </label>
          )}
          {protecting && !protectingGate.available && (
            <span className="ttp-shieldblock-rider-spent" data-testid="shieldblock-protecting-spent">
              Protecting used — the clock frees it up
            </span>
          )}
          {rider && rider.summary && (
            <div className="ttp-shieldblock-rider" data-testid="shieldblock-rune-rider">
              ✦ {blockRune.name}: {rider.summary}
              {liveRider && !gate.available && (
                <span className="ttp-shieldblock-rider-spent"> (used — the clock frees it up)</span>
              )}
            </div>
          )}
        </>
      )}
      {followupLive && (
        <div className="ttp-shieldblock-followup" data-testid="shieldblock-rune-followup">
          <select
            aria-label={`${blockRune.name} target`}
            value={riderTarget}
            onChange={(e) => setRiderTarget(e.target.value)}
          >
            <option value="">Attacker…</option>
            {enemies.map((e) => (
              <option key={e.entryId} value={e.entryId}>{e.name}</option>
            ))}
          </select>
          <input
            type="number"
            aria-label={liveRider.damage ? `${blockRune.name} rolled damage` : `${blockRune.name} check total`}
            placeholder={liveRider.damage ? `${liveRider.damage.expression} →` : 'Check total'}
            value={riderInput}
            onChange={(e) => setRiderInput(e.target.value)}
          />
          <button
            className="btn-secondary ttp-shieldblock-fire"
            disabled={!riderValid}
            onClick={liveRider.damage ? fireDamageRider : fireCheckRider}
            aria-label={`use ${blockRune.name}`}
          >
            {liveRider.damage ? '↯ Unleash' : '⚔ Disarm'}
          </button>
          <button
            type="button"
            className="ttp-shieldblock-skip"
            onClick={clearRider}
            aria-label={`skip ${blockRune.name}`}
          >
            skip
          </button>
        </div>
      )}
    </div>
  );
};

export default ShieldBlockBar;
