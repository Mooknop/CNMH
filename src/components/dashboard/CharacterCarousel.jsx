import React, { useEffect, useRef, useState } from 'react';
import CharacterCard from './CharacterCard';
import { getCharacterColor } from '../../utils/CharacterUtils';
import {
  clampIndex,
  dragFraction,
  resolveRelease,
  cardStyleForOffset,
} from './carouselMath';
import './CharacterCarousel.css';

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// Swipeable carousel of character cards. `active` is owned by the parent so the
// page chrome can retint to the centered character; drag state stays local.
const CharacterCarousel = ({ characters, active, setActive, onOpen }) => {
  const drag = useRef({ active: false, startX: 0, moved: false });
  const [frac, setFrac] = useState(0);
  const [dragging, setDragging] = useState(false);
  const n = characters.length;

  const pointerX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  const onDown = (e) => {
    drag.current = { active: true, startX: pointerX(e), moved: false };
    setDragging(true);
  };

  const onMove = (e) => {
    if (!drag.current.active) return;
    const dx = pointerX(e) - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    setFrac(dragFraction(dx, active, n));
  };

  const onUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    setActive(resolveRelease(active, frac, n));
    setFrac(0);
  };

  // Release can land outside the stage, so listen on the window.
  useEffect(() => {
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  });

  const handleCardClick = (i) => {
    if (drag.current.moved) return; // ignore the click that ends a drag
    if (i === active) onOpen(i);
    else setActive(i);
  };

  return (
    <section className="character-carousel">
      <div className="cc-head">
        <span className="cc-kicker">Your Party</span>
        <span className="cc-count">
          {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
        </span>
      </div>

      <div
        className={`cc-stage${dragging ? ' dragging' : ''}`}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onTouchStart={onDown}
        onTouchMove={onMove}
      >
        <div className="cc-track">
          {characters.map((ch, i) => {
            const o = i - active - frac;
            const s = cardStyleForOffset(o);
            if (s.culled) return null;
            return (
              <div
                key={ch.id}
                className="cc-card"
                onClick={() => handleCardClick(i)}
                style={{
                  '--cc-x': `${s.translateX}px`,
                  '--cc-scale': s.scale,
                  '--cc-opacity': s.opacity,
                  '--cc-z': s.zIndex,
                  '--cc-filter': s.blur
                    ? `brightness(${s.brightness}) blur(${s.blur}px)`
                    : `brightness(${s.brightness})`,
                }}
              >
                <CharacterCard character={ch} accent={getCharacterColor(i)} />
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="cc-arrow prev"
          onClick={() => setActive(clampIndex(active - 1, n))}
          aria-label="Previous character"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="cc-arrow next"
          onClick={() => setActive(clampIndex(active + 1, n))}
          aria-label="Next character"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="cc-dots">
        {characters.map((ch, i) => (
          <button
            type="button"
            key={ch.id}
            className={`cc-dot${i === active ? ' active' : ''}`}
            style={i === active ? { '--cc-dot-c': getCharacterColor(i) } : undefined}
            onClick={() => setActive(i)}
            aria-label={`Go to ${ch.name}`}
            aria-current={i === active}
          />
        ))}
      </div>
    </section>
  );
};

export default CharacterCarousel;
