// src/components/spells/SpellMechanics.jsx
// Display-only render of a spell's full rules text — trait chips, the
// label/value detail grid (Actions · Defense · Range · Area · Targets ·
// Duration), an optional Trigger, the description, Degrees of Success, and
// Heightened entries. Shared so any surface that needs to show what a spell
// actually does renders it identically.
//
// SpellDetailModal is the encounter-context sibling: it wraps this same field
// set with character-specific chrome (Cast button, prepared/signature/blood-
// magic notes, scroll/wand/innate indicators). This component is the pure,
// context-free core, currently reused by the shop's Scroll/Wand preview (#992
// follow-up) so a buyer sees the whole spell before purchasing.
import React from 'react';
import TraitTag from '../shared/TraitTag';
import ActionSymbol from '../shared/ActionSymbol';
import './SpellMechanics.css';

const SpellMechanics = ({ spell }) => {
  if (!spell) return null;

  const details = [
    spell.actions && { key: 'actions', label: 'Actions', value: <ActionSymbol cost={spell.actions} /> },
    spell.defense && { key: 'defense', label: 'Defense', value: spell.defense },
    spell.range && { key: 'range', label: 'Range', value: spell.range },
    spell.area && { key: 'area', label: 'Area', value: spell.area },
    spell.targets && { key: 'targets', label: 'Targets', value: spell.targets },
    spell.duration && { key: 'duration', label: 'Duration', value: spell.duration },
  ].filter(Boolean);

  return (
    <div className="spell-mechanics">
      {spell.traits?.length > 0 && (
        <div className="spell-detail-traits">
          {spell.traits.map((t, i) => <TraitTag key={i} trait={t} />)}
        </div>
      )}

      {details.length > 0 && (
        <div className="spell-details">
          {details.map((d) => (
            <div key={d.key} className={`spell-${d.key}`}>
              <span className="detail-label">{d.label}:</span>
              <span className="detail-value">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {spell.trigger && (
        <div className="reaction-trigger">
          <span className="trigger-label">Trigger</span>
          <span className="trigger-text">{spell.trigger}</span>
        </div>
      )}

      {spell.description && <div className="spell-description">{spell.description}</div>}

      {spell.degrees && (
        <div className="spell-degrees">
          <span className="degrees-label">Degrees of Success:</span>
          {Object.entries(spell.degrees).map(([degree, effect], index) => (
            <div key={index} className="degree-entry">
              <span className="degree-level">{degree}:</span>
              <span className="degree-effect">{effect}</span>
            </div>
          ))}
        </div>
      )}

      {spell.heightened && (
        <div className="spell-heightened">
          <span className="heightened-label">Heightened:</span>
          {Object.entries(spell.heightened).map(([level, effect], index) => (
            <div key={index} className="heightened-entry">
              <span className="heightened-level">{level}:</span>
              <span className="heightened-effect">{effect}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SpellMechanics;
