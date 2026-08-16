import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MoveMapSurface from './MoveMapSurface';

// Identity 800x600 capture over a 100 ft grid — mirrors the fixture
// MoveActionSheet.mapMode.test.jsx / MoveActionSheet.pathpreviewGhosts.test.jsx use.
const SNAPSHOT = {
  url: '/api/images/mover.webp',
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600, sceneId: 'scene-1' },
  worldRect: { x1: 0, y1: 0, x2: 800, y2: 600 },
  gridSize: 100,
};

const baseProps = {
  mapEligible: true,
  surfacePref: 'grid',
  onSurfaceChange: vi.fn(),
  showBody: true,
  status: 'idle',
  snapshot: null,
  origin: { col: 5, row: 5 },
  plannedPath: null,
  ghosts: [],
  onMapTap: vi.fn(),
  onCancel: vi.fn(),
};

describe('MoveMapSurface (#1744 S7 — factored out of MoveActionSheet)', () => {
  it('renders nothing at all when not eligible', () => {
    const { container } = render(<MoveMapSurface {...baseProps} mapEligible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the Grid/Map toggle with the current preference pressed', () => {
    render(<MoveMapSurface {...baseProps} />);
    expect(screen.getByRole('group', { name: 'Movement surface' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking Grid/Map calls onSurfaceChange with the target preference', () => {
    const onSurfaceChange = vi.fn();
    render(<MoveMapSurface {...baseProps} onSurfaceChange={onSurfaceChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(onSurfaceChange).toHaveBeenCalledWith('map');
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(onSurfaceChange).toHaveBeenCalledWith('grid');
  });

  it('shows the toggle but no body while the surface preference stays on Grid', () => {
    render(<MoveMapSurface {...baseProps} surfacePref="grid" status="ready" snapshot={SNAPSHOT} />);
    expect(screen.queryByAltText('Battlefield snapshot')).toBeNull();
    expect(screen.queryByText('Loading map…')).toBeNull();
  });

  it('shows a loading note while a mover-centered capture is in flight', () => {
    render(<MoveMapSurface {...baseProps} surfacePref="map" status="loading" />);
    expect(screen.getByText('Loading map…')).toBeInTheDocument();
    expect(screen.queryByAltText('Battlefield snapshot')).toBeNull();
  });

  it('shows the fallback note when no capture is available', () => {
    render(<MoveMapSurface {...baseProps} surfacePref="map" status="unavailable" />);
    expect(screen.getByText('Map unavailable — using the grid.')).toBeInTheDocument();
  });

  it('renders the snapshot, the hint, and a Cancel control once ready', () => {
    const onCancel = vi.fn();
    render(
      <MoveMapSurface
        {...baseProps}
        surfacePref="map"
        status="ready"
        snapshot={SNAPSHOT}
        onCancel={onCancel}
        cancelLabel="Done"
      />
    );
    expect(screen.getByAltText('Battlefield snapshot')).toHaveAttribute('src', SNAPSHOT.url);
    expect(screen.getByText('Tap the map to choose a destination.')).toBeInTheDocument();
    const cancelBtn = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('omits the Cancel control when the caller passes none', () => {
    render(<MoveMapSurface {...baseProps} surfacePref="map" status="ready" snapshot={SNAPSHOT} onCancel={null} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('draws the viewer\'s own overlay plus one ghost overlay per entry', () => {
    render(
      <MoveMapSurface
        {...baseProps}
        surfacePref="map"
        status="ready"
        snapshot={SNAPSHOT}
        plannedPath={{ path: [{ col: 6, row: 5 }], costFeet: 5, clipped: false }}
        ghosts={[
          { tokenId: 'tok-a', origin: { col: 1, row: 1 }, path: [{ col: 2, row: 1 }] },
          { tokenId: 'tok-b', origin: { col: 3, row: 3 }, path: [{ col: 4, row: 3 }] },
        ]}
      />
    );
    expect(document.querySelectorAll('.sro--own').length).toBe(1);
    expect(document.querySelectorAll('.sro--ghost').length).toBe(2);
  });

  it('never shows the body while showBody is false, even when ready', () => {
    render(<MoveMapSurface {...baseProps} showBody={false} surfacePref="map" status="ready" snapshot={SNAPSHOT} />);
    expect(screen.queryByAltText('Battlefield snapshot')).toBeNull();
    expect(screen.queryByText('Loading map…')).toBeNull();
  });

  it('a tap on the snapshot forwards {nx, ny} to onMapTap', () => {
    const onMapTap = vi.fn();
    render(<MoveMapSurface {...baseProps} surfacePref="map" status="ready" snapshot={SNAPSHOT} onMapTap={onMapTap} />);
    const img = document.querySelector('.msv-img');
    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
    const frame = screen.getByTestId('map-snapshot-frame');
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 50, clientY: 50 });
    // The pane size rides along too (#1749 S4) — additive, and the movement
    // flow simply ignores it.
    expect(onMapTap).toHaveBeenCalledWith(expect.objectContaining({ nx: 0.5, ny: 0.5 }));
  });
});
