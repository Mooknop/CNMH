import React from 'react';
import { GAME_GLYPHS } from '../../utils/gameGlyphs';
import './Flourish.css';

// Signature-ability flourishes (#1347, epic #1343) — bespoke one-shot SVG
// overlays, ported 1:1 from the tuned scoping preview (flourish.html). Each is
// a self-contained component: inline SVG animated purely by CSS keyframes on
// transform/opacity/filter (no JS animation loop, no particle engine —
// Pellias's "particles" are eight keyframed flake paths). Per-element stagger
// angles/delays live in Flourish.css as nth-of-type custom properties, so the
// markup stays style-free.
//
// The overlay is pure garnish: aria-hidden, pointer-events none, absolutely
// positioned over a positioned receiver root, and removed by the receiver's
// bloom self-clear (FX_FLASH_MS) — the longest keyframe finishes first.
// Unknown id → null → the receiver's plain data-fx bloom is all that plays.

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ashka (Thaumaturge) — dark purple wisps curl up over the card and dissipate.
const ShadowTendrils = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <path className="flx-wisp flx-wisp-dk" strokeWidth="3.2" d="M18 102 C16 84 26 78 22 62 S30 44 26 34" />
    <path className="flx-wisp" strokeWidth="2.4" d="M38 102 C42 82 32 72 38 56 S34 40 40 28" />
    <path className="flx-wisp flx-wisp-dk" strokeWidth="3" d="M62 102 C58 86 68 74 62 60 S68 42 62 32" />
    <path className="flx-wisp" strokeWidth="2.2" d="M82 102 C86 84 76 76 80 60 S74 46 79 36" />
  </svg>
);

// Blu (Monk) — electric-blue bolts crackle across the card, staggered flicker.
const BOLTS = [
  'M20 6 L34 34 L26 38 L44 66 L36 68 L54 96',
  'M62 4 L52 28 L60 30 L46 58 L56 60 L40 92',
  'M84 12 L72 36 L80 40 L62 70',
];
const DragonLightning = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    {BOLTS.map((d) => (
      <g key={d} className="flx-bolt">
        <path className="flx-bolt-glow" d={d} />
        <path className="flx-bolt-core" d={d} />
      </g>
    ))}
  </svg>
);

// Izzy (Bard) — the focusBard treble clef pops with overshoot, eighth-notes fly.
const EighthNote = () => (
  <>
    <ellipse cx="0" cy="0" rx="3.1" ry="2.3" transform="rotate(-20)" />
    <path d="M2.6 -.8 V-13 h1.4 V-.8z" />
    <path d="M4 -13 c3.6 1 5 3.6 3.6 7 c-.4-2.6-1.6-3.8-3.6-4.2z" />
  </>
);
const NOTE_KEYS = ['a', 'b', 'c', 'd', 'e'];
const CompositionBurst = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <g transform="translate(50 50)">
      <g className="flx-ctr flx-clef">
        <g transform="scale(0.085) translate(-256 -256)"><path d={GAME_GLYPHS.focusBard} /></g>
      </g>
      {NOTE_KEYS.map((k) => (
        <g key={k} className="flx-ctr flx-note"><EighthNote /></g>
      ))}
    </g>
  </svg>
);

// Jade (Sorcerer) — the focusSorcerer nova spins up in crimson: a blurred deep
// glow layer under a bright core (the dark/light-theme contrast recipe). The
// loud variant (repertoire cast + blood-magic rider together) scales wider and
// adds an expanding shock ring.
const BloodSwirl = ({ loud = false }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={loud ? 'flx-loud' : undefined}>
    <g transform="translate(50 50)">
      {loud && <circle className="flx-ctr flx-shockring" r="30" />}
      <g className="flx-ctr flx-swirl-glow">
        <g transform={loud ? 'scale(0.115) translate(-256 -256)' : 'scale(0.1) translate(-256 -256)'}>
          <path d={GAME_GLYPHS.focusSorcerer} />
        </g>
      </g>
      <g className="flx-ctr flx-swirl-core">
        <g transform={loud ? 'scale(0.104) translate(-256 -256)' : 'scale(0.09) translate(-256 -256)'}>
          <path d={GAME_GLYPHS.focusSorcerer} />
        </g>
      </g>
    </g>
  </svg>
);
const BloodSwirlLoud = () => <BloodSwirl loud />;

// Pellias (Champion / Kineticist archetype) — dashed rust ring expands while
// oxide flakes tumble radially outward.
const FLAKE_A = 'M-2.2 0 L-.4 -2.4 L2.4 -.6 L.8 2.2 Z';
const FLAKE_B = 'M-2 -.6 L.6 -2.2 L2.2 .4 L-.6 2.2 Z';
const FLAKES = [
  { k: 'f1', d: FLAKE_A, fill: '#b45309' },
  { k: 'f2', d: FLAKE_B, fill: '#92400e' },
  { k: 'f3', d: FLAKE_A, fill: '#d97706' },
  { k: 'f4', d: FLAKE_B, fill: '#b45309' },
  { k: 'f5', d: FLAKE_A, fill: '#92400e' },
  { k: 'f6', d: FLAKE_B, fill: '#d97706' },
  { k: 'f7', d: FLAKE_A, fill: '#b45309' },
  { k: 'f8', d: FLAKE_B, fill: '#92400e' },
];
const RustBloom = () => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <g transform="translate(50 50)">
      <circle className="flx-ctr flx-rustring" r="30" />
      {FLAKES.map((f) => (
        <g key={f.k} className="flx-ctr flx-flake" fill={f.fill}><path d={f.d} /></g>
      ))}
    </g>
  </svg>
);

export const FLOURISHES = {
  'shadow-tendrils': ShadowTendrils,
  'dragon-lightning': DragonLightning,
  'composition-burst': CompositionBurst,
  'blood-swirl': BloodSwirl,
  'blood-swirl-loud': BloodSwirlLoud,
  'rust-bloom': RustBloom,
};

const Flourish = ({ id }) => {
  const Art = id ? FLOURISHES[id] : null;
  if (!Art || prefersReducedMotion()) return null;
  return (
    <div className="fx-flourish" aria-hidden="true" data-flourish={id}>
      <Art />
    </div>
  );
};

export default Flourish;
