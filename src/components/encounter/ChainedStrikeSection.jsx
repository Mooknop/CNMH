// ChainedStrikeSection — renders the sub-action picker for abilities that chain
// into a Strike or Flurry of Blows (e.g. Inner Upheaval).
//
// Exposes getResults() via ref, mirroring TargetRollResolver, so UseAbilityModal
// can read the chosen strike + roll results at confirm time.

import React, { useState, useImperativeHandle, forwardRef, useRef } from 'react';
import TargetRollResolver from './TargetRollResolver';
import { useCharacter } from '../../hooks/useCharacter';
import { resolveActionRoll } from '../../utils/rollResolution';
import { formatModifier } from '../../utils/CharacterUtils';
import { mapPenaltyFor } from '../../utils/map';

const ChainedStrikeSection = forwardRef(({
  character,
  chain,
  enemyTargets,
  conditions,
  effects,
  mapStep = 0,
}, ref) => {
  const { strikes } = useCharacter(character);

  const filteredStrikes = chain.strikeTrait
    ? strikes.filter((s) => Array.isArray(s.traits) && s.traits.includes(chain.strikeTrait))
    : strikes;

  const modes = Array.isArray(chain.modes) && chain.modes.length > 0 ? chain.modes : ['strike'];
  const [selectedMode, setSelectedMode] = useState(modes[0]);
  const [selectedStrikeName, setSelectedStrikeName] = useState(
    filteredStrikes.length > 0 ? filteredStrikes[0].name : ''
  );

  const resolver1Ref = useRef(null);
  const resolver2Ref = useRef(null);

  const selectedStrike = filteredStrikes.find((s) => s.name === selectedStrikeName) ?? filteredStrikes[0] ?? null;

  const baseRoll = selectedStrike
    ? resolveActionRoll(selectedStrike, character, { conditions, effects, mapStep })
    : { mode: 'none', bonus: null };

  const augmentedBonus = baseRoll.bonus != null
    ? baseRoll.bonus + (chain.attackBonus || 0)
    : null;

  // Flurry strike 2 is one MAP step deeper (agile-aware via the strike's traits).
  const strike2Step = Math.min(mapStep + 1, 2);
  const strike2Roll = selectedStrike
    ? resolveActionRoll(selectedStrike, character, { conditions, effects, mapStep: strike2Step })
    : { mode: 'none', bonus: null };
  const strike2Bonus = strike2Roll.bonus != null
    ? strike2Roll.bonus + (chain.attackBonus || 0)
    : null;
  const strike2Penalty = selectedStrike ? mapPenaltyFor(selectedStrike, strike2Step) : 0;

  const augmentedDamage = selectedStrike
    ? (chain.damageBonus ? `${selectedStrike.damage} + ${chain.damageBonus}` : selectedStrike.damage)
    : '';

  useImperativeHandle(ref, () => ({
    getResults: () => {
      if (!selectedStrike) return null;
      const rolls = [resolver1Ref.current?.getResults() ?? null];
      if (selectedMode === 'flurry') {
        rolls.push(resolver2Ref.current?.getResults() ?? null);
      }
      return {
        mode: selectedMode,
        strikeName: selectedStrike.name,
        attackBonus: augmentedBonus,
        damage: augmentedDamage,
        rolls: rolls.filter(Boolean),
      };
    },
  }));

  if (filteredStrikes.length === 0) {
    return (
      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
        No qualifying strikes{chain.strikeTrait ? ` with trait "${chain.strikeTrait}"` : ''} available.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {modes.length > 1 && (
        <div style={{ marginBottom: '0.5rem' }}>
          {modes.map((m) => (
            <label key={m} style={{ marginRight: '12px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="chain-mode"
                value={m}
                checked={selectedMode === m}
                onChange={() => setSelectedMode(m)}
                aria-label={m === 'strike' ? 'Strike' : 'Flurry of Blows'}
                style={{ marginRight: '4px' }}
              />
              {m === 'strike' ? 'Strike' : 'Flurry of Blows'}
            </label>
          ))}
        </div>
      )}

      <select
        aria-label="strike picker"
        value={selectedStrikeName}
        onChange={(e) => setSelectedStrikeName(e.target.value)}
        style={{ marginBottom: '0.5rem', width: '100%', fontSize: '0.85rem' }}
      >
        {filteredStrikes.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </select>

      {selectedStrike && (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          <span>
            Attack: <strong>{augmentedBonus != null ? formatModifier(augmentedBonus) : '?'}</strong>
            {chain.attackBonus
              ? ` (base ${formatModifier(baseRoll.bonus ?? 0)} + ${chain.attackBonus} status)`
              : null}
          </span>
          <span style={{ marginLeft: '12px' }}>
            Damage: <strong>{augmentedDamage}</strong>
          </span>
        </div>
      )}

      <TargetRollResolver
        ref={resolver1Ref}
        enemyTargets={enemyTargets}
        targetDefense="ac"
        rollBonus={augmentedBonus}
      />

      {selectedMode === 'flurry' && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
            Strike 2 (MAP {formatModifier(strike2Penalty)}):
          </div>
          <TargetRollResolver
            ref={resolver2Ref}
            enemyTargets={enemyTargets}
            targetDefense="ac"
            rollBonus={strike2Bonus}
          />
        </div>
      )}
    </div>
  );
});

ChainedStrikeSection.displayName = 'ChainedStrikeSection';

export default ChainedStrikeSection;
