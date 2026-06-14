import React from 'react';
import './CharacterCard.css';

// Sigil card face — the locked card design from the player-dashboard handoff.
// Renders the inner chrome only; the carousel owns the positioned/animated wrapper.
const CharacterCard = ({ character, accent }) => {
  const kicker = [character.ancestry, character.class].filter(Boolean).join(' · ');
  const monogram = (character.name || '').trim().charAt(0).toUpperCase();
  const objectPosition = character.imagePosition
    ? `${character.imagePosition.x ?? 50}% ${character.imagePosition.y ?? 0}%`
    : '50% 0%';

  return (
    <div className="sigil-card-inner" style={{ '--c': accent }}>
      <div className="sigil-band" aria-hidden="true" />

      <div className="sigil-portrait">
        {character.image ? (
          <img
            src={`/api/images/${character.image}`}
            alt={`Portrait of ${character.name}`}
            className="sigil-portrait-img"
            style={{ objectPosition }}
          />
        ) : (
          <div className="sigil-mono" aria-hidden="true">{monogram}</div>
        )}
      </div>

      <div className="sigil-cut" aria-hidden="true" />
      <div className="sigil-edge" aria-hidden="true" />
      <div className="sigil-glow" aria-hidden="true" />

      <div className="sigil-badge">
        <span className="sigil-badge-t">Lvl</span>
        <span className="sigil-badge-n">{character.level}</span>
      </div>

      <div className="sigil-caption">
        <div className="sigil-name">{character.name}</div>
        {kicker && <div className="sigil-kicker">{kicker}</div>}
      </div>
    </div>
  );
};

export default CharacterCard;
