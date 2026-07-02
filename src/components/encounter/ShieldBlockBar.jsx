import React, { useState } from 'react';
import { useShield } from '../../hooks/useShield';
import { useTurnState } from '../../hooks/useTurnState';
import { useEncounter } from '../../hooks/useEncounter';
import { accessoryRuneOf } from '../../utils/accessoryRunes';
import './ShieldBlockBar.css';

/**
 * Shield Block damage-split bar — extracted from TurnTrackerPanel so the
 * reaction trigger prompt (#221) can run the same flow when the GM fires a
 * "PC was damaged" event. The player enters the incoming hit; applyBlock runs
 * the Hardness/HP math, the reaction is spent, and the outcome is logged.
 *
 * Self-contained: renders null unless a held shield is raised (and unbroken
 * shields only get the bonus, but a block can break the shield mid-flow).
 */
const ShieldBlockBar = ({ charId, characterName, inventory = [] }) => {
  const { heldShield, raised, broken, lowerShield, applyBlock } = useShield(charId, inventory);
  const { turnState, spendReaction } = useTurnState(charId);
  const { appendLog } = useEncounter();
  const [blockDamage, setBlockDamage] = useState('');

  if (!heldShield || !raised) return null;

  // An accessory rune on the blocking shield (#1033 S2) — Retaliation, Catching
  // — declares an `onBlock` reminder. heldShield is the normalized shield view,
  // so the rune doc is read off the full inventory entry by uid. The app only
  // SURFACES the follow-up (enemy HP lives in Foundry); the activation itself is
  // spent from the item modal's frequency-gated card.
  const blockRune = accessoryRuneOf(
    (inventory || []).find((e) => e && e.uid === heldShield.uid)
  );
  const onBlock = blockRune?.onBlock || null;

  const { reactionAvailable, reactionSpent, hasStartedFirstTurn } = turnState;

  const canShieldBlock =
    raised && !broken && hasStartedFirstTurn && reactionAvailable && !reactionSpent;

  const handleShieldBlock = () => {
    const dealt = parseInt(blockDamage, 10);
    if (!canShieldBlock || isNaN(dealt) || dealt < 0) return;
    const result = applyBlock(dealt);
    if (!result) return;
    spendReaction('Shield Block');
    setBlockDamage('');
    if (result.broken) lowerShield();
    const detail = result.broken
      ? `shield broke! (${result.prevented} prevented)`
      : `${result.prevented} prevented, shield → ${result.shieldHpAfter} HP`;
    const runeNote = onBlock ? ` · ${blockRune.name}: ${onBlock}` : '';
    appendLog({ type: 'action', charId, text: `${characterName} Shield Blocked: ${detail}${runeNote}` });
  };

  return (
    <div className="ttp-shieldblock-bar">
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
      {onBlock && (
        <div className="ttp-shieldblock-rider" data-testid="shieldblock-rune-rider">
          ✦ {blockRune.name}: {onBlock}
        </div>
      )}
    </div>
  );
};

export default ShieldBlockBar;
