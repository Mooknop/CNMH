// src/components/encounter/commandsheet/ConfirmSheet.jsx
// Confirm / resolve bottom sheet (encounter UI redesign, Region 5). Tapping any
// deck tile opens this spaced, structured preview — cost + name, target chip,
// then a resolution readout of (MAP) [net bonus] vs [defense] / trait chips /
// [damage] [type] / effect text — with a contextual confirm verb.
//
// This is an intent/preview step IN FRONT of the existing resolvers, not a
// replacement: confirming simply routes to the same onUse/skill-action path a
// direct tap used to take, and the resolvers keep sole ownership of action
// spends, MAP recording, and chamber writes — nothing is double-counted here.
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';
import TraitTag from '../../shared/TraitTag';
import { useRecallKnowledge } from '../../../hooks/useRecallKnowledge';
import { formatModifier } from '../../../utils/CharacterUtils';
import { defenseDC } from '../../../utils/defense';
import { rkKeyFor, isFieldRevealed, isSaveRevealed } from '../../../utils/recallKnowledge';
import { consumableVerb, consumableSave } from '../../../utils/consumables';
import './ConfirmSheet.css';

const DEF_LABEL = { ac: 'AC', fortitude: 'Fort', reflex: 'Ref', will: 'Will', perception: 'Perc' };

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Reveal gating matches FocusBanner: numbers show only once Recall Knowledge
// (or damage-triggered reveals) has surfaced them.
const defenseRevealed = (rec, key) =>
  key === 'ac' || key === 'perception' ? isFieldRevealed(rec, key) : isSaveRevealed(rec, key);

// Contextual confirm verb (design: "Roll attack", "Cast", "Stride", "Reload",
// "Drink", "Enter stance", "Ready", …).
export const verbFor = (tile) => {
  const raw = tile.raw || {};
  if (tile.kind === 'reload') return raw.nock ? 'Nock' : 'Reload';
  if (tile.kind === 'consumable') return consumableVerb(raw);
  if (raw.traits?.includes('Stance')) return 'Enter stance';
  if (raw.controller === 'move') return tile.name;
  if (tile.cost === 'reaction') return 'Ready';
  if (tile.origin === 'strike') return 'Roll attack';
  if (raw.highlightSkill) return `Roll ${capitalize(raw.highlightSkill)}`;
  if (raw.attackMod !== undefined) return 'Roll attack';
  return `Use ${tile.name}`;
};

/**
 * Pure preview derivation — everything the sheet displays, computed from the
 * catalog tile + live context. Exported for unit tests.
 * @param {Object} tile        buildActionCatalog tile (or a skill-action pseudo-tile)
 * @param {Object} ctx
 * @param {Object} ctx.focusEnemy   focused foe entry (or null)
 * @param {Object} ctx.focusAlly    focused ally entry (or null)
 * @param {number} ctx.attacksMade  attacks this turn (drives the MAP preview)
 * @param {Object} ctx.rec          Recall Knowledge record for the focused foe
 */
export function buildPreview(tile, { focusEnemy = null, focusAlly = null, attacksMade = 0, rec = null } = {}) {
  const raw = tile.raw || {};
  const traits = tile.traits || [];
  const lower = traits.map((t) => String(t).toLowerCase());

  // MAP participates on strikes + Attack-trait maneuvers; agile softens it.
  const isAttack = tile.origin === 'strike' || lower.includes('attack');
  const agile = lower.includes('agile');
  const pen = isAttack ? Math.min(attacksMade, 2) * (agile ? 4 : 5) : 0;

  const bonus = raw.attackMod !== undefined ? formatModifier(raw.attackMod - pen) : null;

  // "vs <defense> <dc>" — DC value only when the foe is focused AND revealed.
  // A save-forcing consumable states its own fixed DC instead.
  let vsLabel = null;
  const save = tile.kind === 'consumable' ? consumableSave(raw) : null;
  if (save?.defense) {
    vsLabel = `DC ${save.dc ?? '?'} · ${capitalize(save.defense)} save`;
  } else {
    const defense = raw.targetDefense || (isAttack && raw.attackMod !== undefined ? 'ac' : null);
    if (defense) {
      const dc = focusEnemy?.defenses && rec && defenseRevealed(rec, defense)
        ? defenseDC(focusEnemy.defenses, defense)
        : null;
      vsLabel = `vs ${DEF_LABEL[defense] || capitalize(defense)}${dc != null ? ` ${dc}` : ''}`;
    }
  }

  // Effect text: the draw/retrieve surcharge cue, then the action's own prose.
  const effectParts = [];
  if (tile.kind === 'consumable' && tile.drawCost > 0) {
    effectParts.push(
      raw.state === 'stowed'
        ? 'Stowed — costs +2 actions to retrieve first.'
        : 'Worn — costs +1 action to draw.'
    );
  }
  if (raw.description) effectParts.push(raw.description);

  return {
    name: tile.name,
    glyphCost: tile.variableActionCount ? tile.variableActionCount.min : tile.cost,
    targetName: tile.needsTarget && focusEnemy
      ? focusEnemy.name
      : (tile.supports && focusAlly ? focusAlly.name : null),
    mapChip: pen > 0 ? `MAP −${pen}` : null,
    bonus,
    vsLabel,
    traits,
    damage: raw.damage || null,
    damageType: raw.damageType || null,
    effect: effectParts.join(' '),
    verb: verbFor(tile),
  };
}

const ConfirmSheet = ({ tile, focusEnemy, focusAlly, attacksMade = 0, onConfirm, onClose }) => {
  const { recordFor } = useRecallKnowledge();
  const rec = focusEnemy ? recordFor(rkKeyFor(focusEnemy)) : null;
  const p = buildPreview(tile, { focusEnemy, focusAlly, attacksMade, rec });

  return (
    <>
      <div className="deck-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="deck-sheet" role="dialog" aria-label={`Confirm ${p.name}`}>
        <div className="deck-sheet-handle" aria-hidden="true" />
        <div className="deck-sheet-eyebrow">Confirm action</div>

        <div className="deck-sheet-title">
          <span className="deck-sheet-glyph"><ActionSymbol cost={p.glyphCost} /></span>
          <span className="deck-sheet-name">{p.name}</span>
        </div>

        {p.targetName && (
          <div className="deck-sheet-target">
            <span aria-hidden="true">🎯</span> {p.targetName}
          </div>
        )}

        {(p.vsLabel || p.traits.length > 0 || p.damage || p.effect) && (
          <div className="deck-sheet-readout">
            {p.vsLabel && (
              <div className="deck-sheet-roll">
                {p.mapChip && <span className="deck-sheet-map">{p.mapChip}</span>}
                {p.bonus && <span className="deck-sheet-bonus">{p.bonus}</span>}
                <span className="deck-sheet-vs">{p.vsLabel}</span>
              </div>
            )}
            {p.traits.length > 0 && (
              <div className="deck-sheet-traits">
                {p.traits.map((t) => (
                  <TraitTag key={t} trait={t} className={String(t).toLowerCase()} />
                ))}
              </div>
            )}
            {p.damage && (
              <div className="deck-sheet-damage">
                <span className="deck-sheet-dice">{p.damage}</span>
                {p.damageType && <span className="deck-sheet-dtype">{p.damageType}</span>}
              </div>
            )}
            {p.effect && <div className="deck-sheet-effect">{p.effect}</div>}
          </div>
        )}

        <div className="deck-sheet-buttons">
          <button
            type="button"
            className="deck-sheet-confirm"
            onClick={onConfirm}
            aria-label={`Confirm ${p.name}`}
          >
            {p.verb}
          </button>
          <button type="button" className="deck-sheet-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
};

export default ConfirmSheet;
