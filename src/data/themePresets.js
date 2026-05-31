// Curated palette presets. Each palette entry maps to a key in DEFAULT_THEME.palette.
// Values are chosen so the four categorical accents remain distinguishable under
// the named color-vision deficiency. The contrast checker in GmTheme validates
// these against the surface.

export const COLORBLIND_PRESETS = [
  {
    id: 'ember',
    name: 'Ember',
    tag: 'Warm dark (default)',
    palette: {
      accent: '#c0440e',
      accentMid: '#e85d1a',
      gold: '#c49a2e',
      arcane: '#7a54ba',
      verdant: '#3d9458',
      peril: '#ef5350',
    },
  },
  {
    id: 'deuter',
    name: 'Deuteranopia',
    tag: 'Red-green safe',
    palette: {
      accent: '#1f6fb2',
      accentMid: '#3d8fd4',
      gold: '#e8b500',
      arcane: '#6b4fa0',
      verdant: '#8a8d91',
      peril: '#d45f00',
    },
  },
  {
    id: 'protan',
    name: 'Protanopia',
    tag: 'Red-weak safe',
    palette: {
      accent: '#0072b2',
      accentMid: '#2e90cf',
      gold: '#e69f00',
      arcane: '#56564f',
      verdant: '#cc79a7',
      peril: '#d55e00',
    },
  },
  {
    id: 'tritan',
    name: 'Tritanopia',
    tag: 'Blue-yellow safe',
    palette: {
      accent: '#c2185b',
      accentMid: '#d84a7f',
      gold: '#00897b',
      arcane: '#5e35b1',
      verdant: '#9e9e9e',
      peril: '#e53935',
    },
  },
  {
    id: 'highcontrast',
    name: 'High contrast',
    tag: 'Max legibility',
    palette: {
      accent: '#ff7a33',
      accentMid: '#ff9966',
      gold: '#ffd24d',
      arcane: '#b388ff',
      verdant: '#69f0ae',
      peril: '#ff5252',
    },
  },
];
