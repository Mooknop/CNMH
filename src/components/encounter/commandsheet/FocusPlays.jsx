// src/components/encounter/commandsheet/FocusPlays.jsx
// The contextual play list (#1502 S4) — the rows under the Dossier that answer
// "how do I engage the focused combatant?": ◆ Against this target / ✚ Support
// this ally / ◈ On yourself. Rows are focusPlays() entries over the deck's own
// tile catalog; tapping one hands the tile to the deck's ConfirmSheet →
// resolver path, exactly like tapping it in its segment.
import React from 'react';
import ActionSymbol from '../../shared/ActionSymbol';
import './FocusPlays.css';

const HEADINGS = {
  foe: { glyph: '◆', label: 'Against this target' },
  ally: { glyph: '✚', label: 'Support this ally' },
  self: { glyph: '◈', label: 'On yourself' },
};

const FocusPlays = ({ mode, identified = true, plays, onSelect }) => {
  if (!plays || plays.length === 0) return null;
  const head = HEADINGS[mode] || HEADINGS.foe;

  return (
    <section className="focus-plays" aria-label={head.label}>
      <h3 className="focus-plays-head">
        <span aria-hidden="true">{head.glyph}</span> {head.label}
      </h3>
      {mode === 'foe' && !identified && (
        <p className="focus-plays-hint">
          You can still attack — you just don&rsquo;t know its defenses yet.
        </p>
      )}
      <div className="focus-plays-rows">
        {plays.map(({ tile, note, sub, tag }) => (
          <button
            key={tile.id}
            type="button"
            className={`focus-play${note?.tone === 'verdant' ? ' focus-play--verdant' : ''}`}
            onClick={() => onSelect(tile)}
            aria-label={tile.name}
          >
            <span className="focus-play-cost">
              <ActionSymbol cost={tile.variableActionCount ? tile.variableActionCount.min : tile.cost} />
            </span>
            <span className="focus-play-main">
              <span className="focus-play-title">
                <b className="focus-play-name">{tile.name}</b>
                {note && (
                  <span className={`focus-play-note focus-play-note--${note.tone}`}>{note.text}</span>
                )}
              </span>
              {sub && <span className="focus-play-sub">{sub}</span>}
            </span>
            {tag && (
              <span className={`focus-play-tag focus-play-tag--${tag.tone}`}>{tag.text}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};

export default FocusPlays;
