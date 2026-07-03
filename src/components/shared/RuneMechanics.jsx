import React from 'react';
import TraitTag from './TraitTag';
import ActionSymbol from './ActionSymbol';
import ItemActivations from './ItemActivations';
import { runeModifierText, runeUsageText, ACCESSORY_RUNE_NOTE } from '../../utils/runeDisplay';
import { runeTarget } from '../../utils/runeClassify';

// Shared, display-only render of a rune doc's FULL effect (#1055 S1): flavor
// description, rarity, the etch-usage line, passive modifiers as prose, rider
// notes, the actuated activation card, the shield-block rider, and any
// actions/reactions/free actions — so every purchase surface (storefront ware
// preview, etch socket picker, runestone ItemModal) tells the buyer what the
// rune actually does, not just its flavor text. Callers render the rune's
// name/level/price themselves; like ItemActivations, the container themes the
// `rune-mech-*` classes within its own scope.
const RuneMechanics = ({ rune }) => {
  if (!rune || typeof rune !== 'object') return null;
  const modifierLines = (Array.isArray(rune.modifiers) ? rune.modifiers : [])
    .map(runeModifierText)
    .filter(Boolean);
  const riders = (Array.isArray(rune.riders) ? rune.riders : []).filter((r) => r && r.text);
  const usage = runeUsageText(rune);
  const rarity = rune.rarity && String(rune.rarity).toLowerCase() !== 'common' ? rune.rarity : null;
  const actuated = rune.actuated && typeof rune.actuated === 'object' ? rune.actuated : null;

  return (
    <div className="rune-mech">
      {rune.description && <p className="rune-mech-desc">{rune.description}</p>}
      {(usage || rarity) && (
        <p className="rune-mech-usage">
          {rarity && <span className="rune-mech-rarity">{rarity}</span>}
          {usage}
        </p>
      )}
      {modifierLines.length > 0 && (
        <ul className="rune-mech-mods" aria-label="passive effects">
          {modifierLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {riders.length > 0 && (
        <ul className="rune-mech-riders" aria-label="in-play notes">
          {riders.map((r) => <li key={r.id || r.text}>{r.text}</li>)}
        </ul>
      )}
      {actuated && (
        <div className="rune-mech-act" data-testid="rune-mech-actuated">
          <div className="rune-mech-act-head">
            <span className="rune-mech-act-name">{actuated.name || 'Activate'}</span>
            <ActionSymbol cost={typeof actuated.actionCount === 'number' ? actuated.actionCount : 'free'} />
          </div>
          {Array.isArray(actuated.traits) && actuated.traits.length > 0 && (
            <div className="rune-mech-act-traits">
              {actuated.traits.map((t) => <TraitTag key={t} trait={t} />)}
            </div>
          )}
          {actuated.frequency && <p className="rune-mech-act-freq">Frequency {actuated.frequency}</p>}
          {actuated.description && <p className="rune-mech-act-desc">{actuated.description}</p>}
        </div>
      )}
      {/* The onBlock string is the actuated card's one-line summary on the
          three shield runes that declare both — only render it alone. */}
      {!actuated && rune.onBlock && (
        <p className="rune-mech-onblock"><strong>On Shield Block</strong> {rune.onBlock}</p>
      )}
      {runeTarget(rune) === 'accessory' && (
        <p className="rune-mech-note">{ACCESSORY_RUNE_NOTE}</p>
      )}
      <ItemActivations item={rune} />
    </div>
  );
};

export default RuneMechanics;
