// src/components/spells/SpellCard.js
import React, { useState } from 'react';
import TraitTag from '../shared/TraitTag';
import ActionSymbol from '../shared/ActionSymbol';
import SpellDetailModal from './SpellDetailModal';

/**
 * Compact spell card. Shows name + rank badge + action glyph + a slim trait/meta
 * row, with an arcane left border. Tapping the card opens SpellDetailModal with
 * the full detail (mirrors the Encounter ActionRow → ActionDetailModal pattern).
 */
const SpellCard = ({ spell, themeColor, characterLevel, character, encounterMode, onCast, castResources }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Scroll/wand spells are gated on the item being held (see
  // itemState.itemAbilitiesActive). active === false ⇒ show but disabled.
  const inactive = spell.active === false;
  const metaParts = [spell.defense, spell.range, spell.area].filter(Boolean);

  const cardClass = [
    'spell-card',
    spell.bloodline ? 'bloodline-spell' : '',
    spell.signature ? 'signature-spell' : '',
    inactive ? 'is-inactive' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <button
        type="button"
        className={cardClass}
        onClick={() => setIsOpen(true)}
        data-testid="spell-card"
      >
        <div className="spell-header-compact">
          <div className="spell-header-top">
            <h3 className="spell-name">
              {spell.name}
              {spell.signature && <span className="spell-sig-glyph" title="Signature Spell"> ★</span>}
              {spell.bloodline && !spell.signature && <span className="spell-bloodline-glyph" title="Bloodline Spell"> ✦</span>}
            </h3>
            <div className="spell-header-icons">
              {spell.actions && (
                <ActionSymbol actionText={spell.actions} size="small" showTooltip={false} />
              )}
              <span className="spell-rank-badge">
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
        <span className="spell-card-chevron" aria-hidden="true">›</span>
      </button>

      <SpellDetailModal
        spell={spell}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        themeColor={themeColor}
        character={character}
        encounterMode={encounterMode}
        onCast={onCast}
        castResources={castResources}
      />
    </>
  );
};

export default SpellCard;
