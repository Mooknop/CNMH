// src/components/spells/SpellCard.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import ActionSymbol from '../shared/ActionSymbol';
import UseActionChip from '../shared/UseActionChip';
import { parseActionCount } from '../../utils/actionIconUtils';

const SpellCard = ({ spell, themeColor, characterLevel, character, encounterMode, onCast }) => {
  // Scroll/wand spells are gated on the item being held (see
  // itemState.itemAbilitiesActive). active === false ⇒ show but disabled;
  // undefined/true (repertoire, innate, focus) ⇒ always castable.
  const inactive = spell.active === false;

  const rawCost = spell.actions ? parseActionCount(spell.actions) : null;
  // parseActionCount returns -1 for reaction, -2 for free action
  const spellCost = rawCost === -1 ? 'reaction' : rawCost === -2 ? 0 : rawCost;
  const isVariable = spell.variableActionCount != null;

  let headerRight = null;
  if (encounterMode && !inactive && onCast) {
    if (isVariable || spellCost !== null) {
      headerRight = (
        <UseActionChip
          cost={spellCost === 0 ? 'free' : spellCost}
          verb="Cast"
          name={spell.name}
          variableRange={isVariable ? spell.variableActionCount : undefined}
          onUse={(c) => onCast(spell, c)}
        />
      );
    }
  }

  const metaParts = [spell.defense, spell.range, spell.area].filter(Boolean);

  const header = (
    <div className="spell-header-compact">
      <div className="spell-header-top">
        <h3 className="spell-name" style={{ color: themeColor }}>
          {spell.name}
          {spell.signature && <span className="spell-sig-glyph" title="Signature Spell"> ★</span>}
          {spell.bloodline && !spell.signature && <span className="spell-bloodline-glyph" title="Bloodline Spell"> ✦</span>}
        </h3>
        <div className="spell-header-icons">
          {spell.actions && (
            <ActionIcon actionText={spell.actions} color={themeColor} size="small" />
          )}
          <span className="spell-rank-badge" style={{ color: themeColor }}>
            {spell.level === 0
              ? `C${Math.ceil((characterLevel || 1) / 2)}`
              : `R${spell.level}`}
          </span>
        </div>
      </div>
      {(spell.traits?.length > 0 || metaParts.length > 0) && (
        <div className="spell-header-detail">
          {spell.traits?.map((t, i) => <TraitTag key={i} trait={t} />)}
          {metaParts.length > 0 && (
            <span className="spell-meta-inline">{metaParts.join(' · ')}</span>
          )}
          {inactive && <span className="not-in-hand-badge">Not in hand</span>}
        </div>
      )}
    </div>
  );

  const content = (
    <>
      {inactive && (
        <div className="ability-inactive-hint">
          Not in hand — hold {spell.scrollName || spell.wandName || 'this item'} to cast this spell.
        </div>
      )}

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

      {spell.fromScroll && (
        <div className="scroll-indicator">{spell.scrollName}</div>
      )}
      {spell.fromWand && (
        <div className="wand-indicator">{spell.wandName}</div>
      )}
      {spell.fromInnate && (
        <div className="innate-indicator">Innate</div>
      )}

      {spell.trigger && (
        <div className="reaction-trigger">
          <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
          <span className="trigger-text">{spell.trigger}</span>
        </div>
      )}

      {spell.bloodline && character?.spellcasting?.bloodline?.blood_magic && (
        <div className="spell-blood-magic">
          <span className="blood-magic-label" style={{ color: themeColor }}>Blood Magic:</span>
          <p className="blood-magic-effect">{character.spellcasting.bloodline.blood_magic}</p>
        </div>
      )}

      {spell.signature && (
        <div className="signature-explanation">
          <span className="signature-label" style={{ color: themeColor }}>Signature Spell:</span>
          <p className="signature-effect">
            As a signature spell, you can cast this at any rank up to your highest available spell rank
            without knowing it in a specific Rank.
          </p>
        </div>
      )}

      <div className="spell-description">{spell.description}</div>

      {spell.degrees && (
        <div className="spell-degrees">
          <span className="degrees-label" style={{ color: themeColor }}>Degrees of Success:</span>
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
          <span className="heightened-label" style={{ color: themeColor }}>Heightened:</span>
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

    </>
  );

  return (
    <CollapsibleCard
      key={spell.id + (spell.fromScroll ? '-scroll' : '')}
      className={`spell-card${spell.bloodline ? ' bloodline-spell' : ''}${spell.signature ? ' signature-spell' : ''}${inactive ? ' is-inactive' : ''}`}
      header={header}
      headerRight={headerRight}
      themeColor={themeColor}
      initialExpanded={false}
    >
      {content}
    </CollapsibleCard>
  );
};

export default SpellCard;
