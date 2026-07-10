import React from 'react';
import { useValueFlash } from '../../hooks/useValueFlash';
import './HpFx.css';

// Damage ≥ 25% of max escalates to the shake variant (big-hit garnish).
const BIG_HIT_FRACTION = 0.25;

// Real minus sign — the ASCII hyphen reads as a dash at floating-number sizes.
const formatDelta = (delta) => (delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`);

// Shared HP juice wrapper (#1345, epic #1343). Drop-in replacement for an HP
// display's container div: pass the synced hp object and the site's existing
// className/children — the wrapper watches `hp.current` and `hp.temp` locally
// (each client animates the transition no matter who wrote the key) and plays:
//   - damage → fx-flash-bad (or the shake variant on hits ≥ 25% of max)
//     + a floating −N that rises and fades
//   - healing → fx-glow-good + floating +N
//   - temp HP gained → shimmer on the site's temp segment, which opts in by
//     carrying the `hp-fx-temp` class (no cascade guessing across sites)
// The floating number is absolutely positioned (never affects layout) and is
// keyed by the flash sequence so rapid double-writes restart it cleanly.
// Under prefers-reduced-motion useValueFlash returns null, so nothing —
// including the floating number — renders at all.
const HpFx = ({ hp, className = '', children, ...rest }) => {
  const max = hp?.max || 0;
  const flash = useValueFlash(hp?.current, (prev, next) =>
    next < prev
      ? max > 0 && prev - next >= max * BIG_HIT_FRACTION
        ? 'bighit'
        : 'damage'
      : 'heal'
  );
  const tempFlash = useValueFlash(hp?.temp, (prev, next) =>
    next > prev ? 'shimmer' : null
  );

  return (
    <div
      className={`hp-fx ${className}`.trim()}
      data-fx={flash ? flash.fx : undefined}
      data-fx-temp={tempFlash ? tempFlash.fx : undefined}
      {...rest}
    >
      {children}
      {flash && typeof flash.delta === 'number' && (
        <span
          key={flash.key}
          className={`hp-fx-float ${flash.delta < 0 ? 'hp-fx-float--down' : 'hp-fx-float--up'}`}
          aria-hidden="true"
        >
          {formatDelta(flash.delta)}
        </span>
      )}
    </div>
  );
};

export default HpFx;
