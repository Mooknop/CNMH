import React, { useMemo } from 'react';
import ActionSymbol from '../shared/ActionSymbol';
import TraitTag from '../shared/TraitTag';
import { useItemActivation } from '../../hooks/useItemActivation';
import { itemUidOf } from '../../utils/affix';
import { shieldPropertyRunes } from '../../utils/shieldRunes';
import { actuatedCastsSpell } from '../../utils/runeSpellCast';

// Shield property-rune activations (#1196 G3/G4 wiring). The item modal's single
// `actuated` card only surfaces the item's OWN block (or an accessory rune's) —
// a shield's PROPERTY runes each carry their own `actuated` block, and a shield
// can hold several, so this renders one activation card per rune.
//
// Every shield-rune activation is cost:'none' (frequency-gated, no slot sacrifice
// / overload / repair), so each card drives useItemActivation via a SYNTHETIC
// item whose uid is `${hostUid}:${runeId}` — a distinct `${uid}:actuated`
// frequency-ledger key per rune, so their once/day (or /minute, /hour) uses don't
// collide. Spell-casting runes (Gusting → Gust of Wind, #1240) open the cast
// modal via `onActivate`; everything else spends the gate and logs.

const RuneActivationCard = ({ character, hostItem, rune, nowSecs, spells, onActivate }) => {
  const synthItem = useMemo(
    () => ({ uid: `${itemUidOf(hostItem)}:${rune.id}`, actuated: rune.actuated }),
    [hostItem, rune],
  );
  const act = useItemActivation(character, synthItem, { nowSecs });
  const a = rune.actuated;
  const spellDoc = actuatedCastsSpell(a) ? (spells || []).find((s) => s.id === a.spellRef) || null : null;

  const fire = () => {
    const r = act.activation.activate();
    if (r.ok) onActivate(rune, spellDoc);
  };

  return (
    <div className="item-action actuated-card" data-testid={`shield-rune-activation-${rune.id}`}>
      <div className="action-header">
        <span className="action-name">{a.name}</span>
        <div className="action-count">{a.actionCount && <ActionSymbol cost={a.actionCount} />}</div>
      </div>
      {a.traits && a.traits.length > 0 && (
        <div className="action-traits">
          {a.traits.map((t, i) => <TraitTag key={i} trait={t} />)}
        </div>
      )}
      {a.description && <p className="action-description">{a.description}</p>}
      <p className="actuated-cost">Frequency: {a.frequency || 'once per day'}</p>
      {act.activation.canActivate ? (
        <div className="actuated-controls">
          <button
            type="button"
            className="btn-small btn-primary"
            data-testid={`shield-rune-activate-${rune.id}`}
            onClick={fire}
          >
            {spellDoc ? `Cast ${spellDoc.name}` : 'Activate'}
          </button>
        </div>
      ) : (
        <p className="actuated-hint" data-testid={`shield-rune-unavailable-${rune.id}`}>
          {act.gate.available ? 'Unavailable' : 'Used — the clock frees it up.'}
        </p>
      )}
    </div>
  );
};

const ShieldRuneActivations = ({ character, item, nowSecs, spells, onActivate }) => {
  const activatable = shieldPropertyRunes(item).filter((r) => r && r.actuated);
  if (!activatable.length) return null;
  return (
    <div className="shield-rune-activations" data-testid="shield-rune-activations">
      <h3>Shield Rune Activations</h3>
      {activatable.map((rune, i) => (
        <RuneActivationCard
          key={`${rune.id}-${rune.choice ?? i}`}
          character={character}
          hostItem={item}
          rune={rune}
          nowSecs={nowSecs}
          spells={spells}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
};

export default ShieldRuneActivations;
