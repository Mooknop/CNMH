import React from 'react';
import { useFxBloom } from '../../hooks/useFxChannel';
import Flourish from '../fx/Flourish';
import './CharacterCard.css';

// Sigil card face — the locked card design from the player-dashboard handoff.
// Renders the inner chrome only; the carousel owns the positioned/animated wrapper.
// Juice (#1346): the card blooms in its own accent (--c, bridged to the fx
// vocabulary in CharacterCard.css) when this character uses an ability on any
// device. Children are stateless, so the bloom-key remount is free.
const CharacterCard = ({ character, accent }) => {
  const kicker = [character.ancestry, character.class].filter(Boolean).join(' · ');
  const monogram = (character.name || '').trim().charAt(0).toUpperCase();
  const bloom = useFxBloom(character?.id);
  // Data-driven crop point; the CSS default (50% 0%) applies when unset.
  const objectPosition = character.imagePosition
    ? `${character.imagePosition.x ?? 50}% ${character.imagePosition.y ?? 0}%`
    : undefined;

  return (
    <div
      key={bloom ? bloom.key : 'idle'}
      className="sigil-card-inner"
      style={{ '--c': accent }}
      data-fx={bloom ? 'bloom' : undefined}
    >
      <div className="sigil-band" aria-hidden="true" />

      <div className="sigil-portrait">
        {character.image ? (
          <img
            src={`/api/images/${character.image}`}
            alt={`Portrait of ${character.name}`}
            className="sigil-portrait-img"
            style={objectPosition ? { '--portrait-pos': objectPosition } : undefined}
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

      {/* Signature flourish (#1347) — last child so it paints over the chrome;
          unknown/missing id renders nothing and the accent bloom carries. */}
      {bloom && <Flourish id={bloom.flourish} />}
    </div>
  );
};

export default CharacterCard;
