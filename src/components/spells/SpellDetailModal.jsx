// src/components/spells/SpellDetailModal.js
// Detail modal opened when a SpellCard is tapped. Mirrors the Encounter
// ActionDetailModal pattern: plain-header Modal with trait chips, a detail
// grid, degrees-of-success, heightened box, and (in encounter mode) a Cast
// button wired to the existing onCast flow.
import React from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import ActionSymbol from '../shared/ActionSymbol';
import UseActionChip from '../shared/UseActionChip';
import { parseActionCount, getVariableActionRange } from '../../utils/actionIconUtils';
import './SpellDetailModal.css';

const SpellDetailModal = ({
  spell,
  isOpen,
  onClose,
  themeColor,
  character,
  encounterMode,
  onCast,
  castResources,
}) => {
  if (!isOpen || !spell) return null;

  const inactive = spell.active === false;
  const rawCost = spell.actions ? parseActionCount(spell.actions) : null;
  const spellCost = rawCost === -1 ? 'reaction' : rawCost === -2 ? 0 : rawCost;
  // Variable-cost spells (#215): also recognise an actions-string range
  // ("One to Three Actions") so the chip offers the count dropdown.
  const variableRange = getVariableActionRange(spell);
  const isVariable = variableRange != null;

  const showCast = encounterMode && !inactive && onCast && (isVariable || spellCost !== null);

  // Non-encounter repertoire cast (#961): outside the encounter cast flow the
  // repertoire host passes castResources so a slot spend is one tap. Only real
  // spell-slot options qualify — cantrips/innate are free (no ledger to touch),
  // so they filter out and no Cast control shows. Signature spells surface each
  // eligible heighten rank; everything else spends its native rank.
  const slotOptions = (!encounterMode && castResources && !inactive)
    ? castResources.optionsFor(spell, 'slot').filter((o) => o.type === 'slot')
    : [];
  const showSlotCast = slotOptions.length > 0;
  const handleSlotCast = (option) => {
    if (!option?.enabled) return;
    castResources.spend(option);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={spell.name} themeColor={themeColor} highZ>
      <div className="spell-detail-body">
        {/* Trait chips */}
        {spell.traits?.length > 0 && (
          <div className="spell-detail-traits">
            {spell.traits.map((t, i) => <TraitTag key={i} trait={t} />)}
          </div>
        )}

        {inactive && (
          <div className="ability-inactive-hint">
            Not in hand — hold {spell.scrollName || spell.wandName || 'this item'} to cast this spell.
          </div>
        )}

        {/* Label / value detail grid */}
        <div className="spell-details">
          {spell.actions && (
            <div className="spell-actions">
              <span className="detail-label">Actions:</span>
              <span className="detail-value"><ActionSymbol cost={spell.actions} /></span>
            </div>
          )}
          {spell.defense && (
            <div className="spell-defense">
              <span className="detail-label">Defense:</span>
              <span className="detail-value">{spell.defense}</span>
            </div>
          )}
          {spell.range && (
            <div className="spell-range">
              <span className="detail-label">Range:</span>
              <span className="detail-value">{spell.range}</span>
            </div>
          )}
          {spell.area && (
            <div className="spell-range">
              <span className="detail-label">Area:</span>
              <span className="detail-value">{spell.area}</span>
            </div>
          )}
          {spell.targets && (
            <div className="spell-targets">
              <span className="detail-label">Targets:</span>
              <span className="detail-value">{spell.targets}</span>
            </div>
          )}
          {spell.duration && (
            <div className="spell-duration">
              <span className="detail-label">Duration:</span>
              <span className="detail-value">{spell.duration}</span>
            </div>
          )}
        </div>

        {spell.prepared !== undefined && (
          <div className={`prepared-indicator ${spell.prepared ? 'prepared' : 'not-prepared'}`}>
            {spell.prepared ? 'Prepared' : 'Not Prepared'}
          </div>
        )}

        {spell.fromScroll && <div className="scroll-indicator">{spell.scrollName}</div>}
        {spell.fromWand && <div className="wand-indicator">{spell.wandName}</div>}
        {spell.fromInnate && <div className="innate-indicator">Innate</div>}

        {spell.trigger && (
          <div className="reaction-trigger">
            <span className="trigger-label">Trigger</span>
            <span className="trigger-text">{spell.trigger}</span>
          </div>
        )}

        {spell.bloodline && character?.spellcasting?.bloodline?.blood_magic && (
          <div className="spell-blood-magic">
            <span className="blood-magic-label">Blood Magic:</span>
            <p className="blood-magic-effect">{character.spellcasting.bloodline.blood_magic}</p>
          </div>
        )}

        {spell.signature && (
          <div className="signature-explanation">
            <span className="signature-label">Signature Spell:</span>
            <p className="signature-effect">
              As a signature spell, you can cast this at any rank up to your highest available spell rank
              without knowing it in a specific Rank.
            </p>
          </div>
        )}

        <div className="spell-description">{spell.description}</div>

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

        {spell.fromInnate && spell.innateSource && (
          <div className="innate-source">
            <span>Source: {spell.innateSource}</span>
          </div>
        )}

        {showCast && (
          <div className="spell-detail-footer">
            <UseActionChip
              cost={spellCost === 0 ? 'free' : spellCost}
              verb="Cast"
              name={spell.name}
              variableRange={isVariable ? variableRange : undefined}
              onUse={(c) => { onCast(spell, c); onClose(); }}
            />
          </div>
        )}

        {showSlotCast && (
          <div className="spell-detail-footer spell-slot-cast">
            {slotOptions.length > 1 && (
              <span className="slot-cast-label">Cast at:</span>
            )}
            {slotOptions.map((o) => (
              <button
                key={o.rank}
                type="button"
                className="btn-primary btn-small"
                disabled={!o.enabled}
                onClick={() => handleSlotCast(o)}
              >
                {slotOptions.length > 1 ? o.label : `Cast — ${o.label}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SpellDetailModal;
