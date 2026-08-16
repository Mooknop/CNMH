import { hitTestMarkers, DEFAULT_HIT_TOLERANCE_PX } from './markerHitTest';

// A 900px-wide rendered pane (the epic's own worked example — maxWidth 900),
// square footprints in a flat 0..1 normalized space so px math stays simple:
// 900px pane → 1 normalized unit == 900 CSS px on the x axis (600 on y here,
// to keep the two axes honestly different — a non-square pane is the
// common case for a phone viewport).
const PANE = { paneWidthPx: 900, paneHeightPx: 600 };

const squareFootprint = (nx0, ny0, nx1, ny1) => [
  { nx: nx0, ny: ny0 },
  { nx: nx1, ny: ny0 },
  { nx: nx1, ny: ny1 },
  { nx: nx0, ny: ny1 },
];

const marker = (entryId, { center, footprint = null }) => ({ entryId, center, footprint });

describe('hitTestMarkers (#1749 OQ-1)', () => {
  it('returns null with no markers', () => {
    expect(hitTestMarkers({ nx: 0.5, ny: 0.5 }, [], PANE)).toBeNull();
  });

  it('returns null for a non-finite tap', () => {
    const markers = [marker('a', { center: { nx: 0.5, ny: 0.5 } })];
    expect(hitTestMarkers(null, markers, PANE)).toBeNull();
    expect(hitTestMarkers({ nx: NaN, ny: 0.5 }, markers, PANE)).toBeNull();
  });

  it('a direct hit inside a footprint wins even without a pane size', () => {
    const markers = [
      marker('ogre', { center: { nx: 0.3, ny: 0.3 }, footprint: squareFootprint(0.2, 0.2, 0.4, 0.4) }),
    ];
    const hit = hitTestMarkers({ nx: 0.35, ny: 0.35 }, markers); // no toleranceCssPx/paneWidthPx at all
    expect(hit.entryId).toBe('ogre');
  });

  it('a direct hit wins even when a DIFFERENT marker\'s center is closer', () => {
    const markers = [
      // Center far from the tap, but its footprint contains the tap.
      marker('ogre', { center: { nx: 0.1, ny: 0.1 }, footprint: squareFootprint(0.2, 0.2, 0.6, 0.6) }),
      // Center much nearer the tap, but no footprint reaches it.
      marker('goblin', { center: { nx: 0.31, ny: 0.31 } }),
    ];
    const hit = hitTestMarkers({ nx: 0.3, ny: 0.3 }, markers, PANE);
    expect(hit.entryId).toBe('ogre');
  });

  it('falls back to nearest-center-within-tolerance with no direct hit', () => {
    const markers = [
      marker('near', { center: { nx: 0.502, ny: 0.5 } }), // ~1.8px away on x
      marker('far', { center: { nx: 0.55, ny: 0.5 } }), // ~45px away — outside default tolerance
    ];
    const hit = hitTestMarkers({ nx: 0.5, ny: 0.5 }, markers, PANE);
    expect(hit.entryId).toBe('near');
  });

  it('respects an explicit tolerance — outside it resolves to null', () => {
    const markers = [marker('goblin', { center: { nx: 0.5, ny: 0.5 } })];
    // dx = 0.02 * 900 = 18px, dy = 0
    const justInside = hitTestMarkers({ nx: 0.52, ny: 0.5 }, markers, { ...PANE, toleranceCssPx: 20 });
    expect(justInside.entryId).toBe('goblin');
    const justOutside = hitTestMarkers({ nx: 0.52, ny: 0.5 }, markers, { ...PANE, toleranceCssPx: 10 });
    expect(justOutside).toBeNull();
  });

  it('uses DEFAULT_HIT_TOLERANCE_PX when none is given', () => {
    const markers = [marker('goblin', { center: { nx: 0.5, ny: 0.5 } })];
    const dxNorm = (DEFAULT_HIT_TOLERANCE_PX - 1) / PANE.paneWidthPx;
    const inside = hitTestMarkers({ nx: 0.5 + dxNorm, ny: 0.5 }, markers, PANE);
    expect(inside.entryId).toBe('goblin');

    const dxNormOutside = (DEFAULT_HIT_TOLERANCE_PX + 5) / PANE.paneWidthPx;
    const outside = hitTestMarkers({ nx: 0.5 + dxNormOutside, ny: 0.5 }, markers, PANE);
    expect(outside).toBeNull();
  });

  it('ambiguity — two markers within tolerance resolves to the nearer one', () => {
    const markers = [
      marker('goblin', { center: { nx: 0.5 + 15 / 900, ny: 0.5 } }), // 15px away
      marker('orc', { center: { nx: 0.5 + 5 / 900, ny: 0.5 } }), // 5px away
    ];
    const hit = hitTestMarkers({ nx: 0.5, ny: 0.5 }, markers, PANE);
    expect(hit.entryId).toBe('orc');
  });

  it('an exact distance tie resolves to the first marker in the input order', () => {
    const markers = [
      marker('first', { center: { nx: 0.5 + 10 / 900, ny: 0.5 } }),
      marker('second', { center: { nx: 0.5 - 10 / 900, ny: 0.5 } }),
    ];
    const hit = hitTestMarkers({ nx: 0.5, ny: 0.5 }, markers, PANE);
    expect(hit.entryId).toBe('first');
  });

  it('without a pane size, the tolerance pass (no direct hit) returns null rather than guessing', () => {
    const markers = [marker('goblin', { center: { nx: 0.5, ny: 0.5 } })];
    expect(hitTestMarkers({ nx: 0.5001, ny: 0.5 }, markers)).toBeNull();
  });

  it('two overlapping footprints both containing the tap resolve to the nearer center', () => {
    const markers = [
      marker('big', {
        center: { nx: 0.4, ny: 0.4 },
        footprint: squareFootprint(0.1, 0.1, 0.7, 0.7),
      }),
      marker('small', {
        center: { nx: 0.5, ny: 0.5 },
        footprint: squareFootprint(0.45, 0.45, 0.55, 0.55),
      }),
    ];
    const hit = hitTestMarkers({ nx: 0.5, ny: 0.5 }, markers, PANE);
    expect(hit.entryId).toBe('small');
  });
});
