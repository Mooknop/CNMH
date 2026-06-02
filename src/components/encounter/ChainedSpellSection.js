// ChainedSpellSection — renders the sub-action picker for Spellshape abilities
// (e.g. Reach Spell, Harrow Casting) that chain into "Cast a Spell" with an
// additive action cost. Shows the spell picker, modifier note, total cost, and
// the inline roll/save section for the chosen spell.
//
// Exposes getResults() and getTotalCost() via ref so UseAbilityModal can read
// the chosen spell, roll results, and total cost at confirm time.

import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useMemo } from 'react';
import TargetRollResolver from './TargetRollResolver';
import { resolveActionRoll } from '../../utils/rollResolution';
import { DEFENSE_LABELS } from '../../utils/defense';

// Same parser as UseAbilityModal — avoids a circular import.
const parseSpellCost = (actionsText) => {
  if (!actionsText) return 1;
  const t = String(actionsText).toLowerCase();
  if (t.includes('free')) return 0;
  if (t.includes('reaction')) return 'reaction';
  if (t.includes('three') || t === '3') return 3;
  if (t.includes('two') || t === '2') return 2;
  if (t.includes('one') || t === '1') return 1;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? 1 : n;
};

const costLabel = (cost) => {
  if (cost === 'reaction') return 'R';
  if (cost === 0) return 'Free';
  return String(cost);
};

const ChainedSpellSection = forwardRef(({
  character,
  chain,
  parentCost,
  enemyTargets,
  conditions,
  effects,
  onTotalCostChange,
}, ref) => {
  const filteredSpells = useMemo(() => {
    const spells = character?.spellcasting?.spells || [];
    if (chain.spellFilter === 'has-range') {
      return spells.filter(
        (s) => s.range && s.range.trim() !== '' && s.range.toLowerCase() !== 'touch'
      );
    }
    return spells;
  }, [character, chain.spellFilter]);

  const [selectedSpellId, setSelectedSpellId] = useState(
    filteredSpells.length > 0 ? filteredSpells[0].id : ''
  );

  const resolverRef = useRef(null);

  const selectedSpell = filteredSpells.find((s) => s.id === selectedSpellId) ?? filteredSpells[0] ?? null;

  const spellCost = selectedSpell ? parseSpellCost(selectedSpell.actions) : 0;
  const parentNum = typeof parentCost === 'number' ? parentCost : 1;
  const totalCost = typeof spellCost === 'number' ? parentNum + spellCost : parentCost;

  const rollProfile = useMemo(() => selectedSpell
    ? resolveActionRoll(selectedSpell, character, { conditions, effects })
    : { mode: 'none', bonus: null, dc: null, defense: null },
  [selectedSpell, character, conditions, effects]);

  const resolverTargets = rollProfile.mode === 'actor-roll'
    ? enemyTargets.filter((e) => e.defenses)
    : [];

  const saveTargets = rollProfile.mode === 'target-save' ? enemyTargets : [];

  // Notify parent whenever totalCost changes so the confirm button can reflect it.
  useEffect(() => {
    onTotalCostChange?.(totalCost);
  }, [totalCost, onTotalCostChange]);

  useImperativeHandle(ref, () => ({
    getResults: () => {
      if (!selectedSpell) return null;
      return {
        spellId:     selectedSpell.id,
        spellName:   selectedSpell.name,
        spellCost,
        totalCost,
        rollResults: resolverRef.current?.getResults() ?? null,
        saveTargets: saveTargets.length > 0 ? saveTargets : null,
        rollProfile,
      };
    },
    getTotalCost: () => totalCost,
  }));

  if (filteredSpells.length === 0) {
    return (
      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
        No qualifying spells{chain.spellFilter === 'has-range' ? ' with a range' : ''} available.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <select
        aria-label="spell picker"
        value={selectedSpellId}
        onChange={(e) => setSelectedSpellId(e.target.value)}
        style={{ width: '100%', fontSize: '0.85rem', marginBottom: '0.4rem' }}
      >
        {filteredSpells.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.actions || '?'})
          </option>
        ))}
      </select>

      {chain.modifier && selectedSpell && (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontStyle: 'italic' }}>
          {chain.modifier}
        </div>
      )}

      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
        Total: {costLabel(totalCost)} action{typeof totalCost === 'number' && totalCost !== 1 ? 's' : ''}
        <span style={{ fontWeight: 'normal', marginLeft: '6px', color: 'var(--color-text-muted)' }}>
          ({costLabel(parentCost)} + {costLabel(spellCost)})
        </span>
      </div>

      {resolverTargets.length > 0 && (
        <TargetRollResolver
          ref={resolverRef}
          enemyTargets={resolverTargets}
          targetDefense={rollProfile.defense || 'ac'}
          rollBonus={rollProfile.bonus}
        />
      )}

      {saveTargets.length > 0 && (
        <div className="ct-save-request-preview" style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          <strong>Save request → GM:</strong> {DEFENSE_LABELS[rollProfile.defense] || rollProfile.defense} DC {rollProfile.dc}
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {saveTargets.map((e) => <li key={e.entryId}>{e.name}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
});

ChainedSpellSection.displayName = 'ChainedSpellSection';

export default ChainedSpellSection;
