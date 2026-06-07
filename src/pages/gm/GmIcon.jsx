import React from 'react';

// Minimal stroke-icon set for the GM Tools shell (top nav, World/Catalog
// subrail, and the play-mode flag). Tabler-ish 24x24 glyphs built from plain
// squares/lines/circles — no illustrative art. Kept as JSX (not raw markup)
// so it stays lint-clean and tree-shakeable.

const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </>
  ),
  catalog: <path d="M4 5a1 1 0 0 1 1-1h5v16H5a1 1 0 0 1-1-1zM14 4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M15 20a6 6 0 0 1 6-3.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2c0-1.5 1-2 2-2h1a3 3 0 0 0 3-3 9 9 0 0 0-9-9z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="9.5" cy="7" r="1" />
      <circle cx="14.5" cy="7" r="1" />
    </>
  ),
  sword: (
    <>
      <path d="M14.5 3.5 21 3l-.5 6.5-9 9-2 2-3.5-3.5 2-2 9-9z" />
      <path d="M5 16l3 3M3.5 20.5 6 18" />
    </>
  ),
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />,
  home: <path d="M4 11 12 4l8 7M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />,
  scroll: (
    <>
      <path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 0-2-2z" />
      <path d="M9 8h7M9 12h7M9 16h4" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  book: (
    <>
      <path d="M5 4h11a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5z" />
      <path d="M5 4v14a2 2 0 0 0 2 2h11" />
    </>
  ),
  bag: <path d="M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0" />,
  wand: <path d="M6 21 21 6M16 5l3-3M19 8l2-1M14 3l-1-2M9 14l-2-1M5 18l-2-1" />,
  spark: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M3 16l5-4 4 3 3-2 6 5" />
    </>
  ),
};

const GmIcon = ({ name, className = '' }) => {
  const glyph = PATHS[name];
  if (!glyph) return null;
  return (
    <svg
      className={`gm-ico ${className}`.trim()}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
};

export default GmIcon;
