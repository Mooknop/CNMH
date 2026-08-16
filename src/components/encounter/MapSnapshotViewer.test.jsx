import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MapSnapshotViewer from './MapSnapshotViewer';

// The image occupies a known rect so a tap's normalized position is exact.
// (jsdom lays nothing out; the component reads getBoundingClientRect, which
// in the browser already reflects the zoom/pan transform.)
const IMG_RECT = { left: 100, top: 50, width: 400, height: 300 };

const mountViewer = (props = {}) => {
  const onPick = vi.fn();
  const utils = render(<MapSnapshotViewer src="/api/images/snap.webp" onPick={onPick} {...props} />);
  const img = utils.container.querySelector('.msv-img');
  img.getBoundingClientRect = () => ({ ...IMG_RECT, right: 500, bottom: 350 });
  return { onPick, img, frame: screen.getByTestId('map-snapshot-frame'), ...utils };
};

// A clean tap: down and up at the same point, one pointer.
const tap = (frame, x, y, pointerId = 1) => {
  fireEvent.pointerDown(frame, { pointerId, clientX: x, clientY: y });
  fireEvent.pointerUp(frame, { pointerId, clientX: x, clientY: y });
};

describe('MapSnapshotViewer (#1573 B2)', () => {
  it('a tap reports its normalized position within the image', () => {
    const { onPick, frame } = mountViewer();
    // Centre of the rect → (0.5, 0.5).
    tap(frame, 300, 200);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ nx: 0.5, ny: 0.5 })
    );

    // A quarter in from the top-left.
    onPick.mockClear();
    tap(frame, 200, 125, 2);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ nx: 0.25, ny: 0.25 })
    );
  });

  it("a tap also reports the image's on-screen size (#1749 S4)", () => {
    // The CSS-px marker snap radius the targeting hit test uses can only be
    // converted against a normalized delta with this number, and only this
    // component knows it — the rect it reads already includes the live zoom.
    const { onPick, frame } = mountViewer();
    tap(frame, 300, 200);
    expect(onPick).toHaveBeenCalledWith({
      nx: 0.5, ny: 0.5, paneWidthPx: IMG_RECT.width, paneHeightPx: IMG_RECT.height,
    });
  });

  it('a drag pans instead of picking (no accidental ping)', () => {
    const { onPick, frame } = mountViewer();
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 340, clientY: 230 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 340, clientY: 230 });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a pinch zooms and never picks, even when the fingers barely move', () => {
    const { onPick, frame, container } = mountViewer();
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 280, clientY: 200 });
    fireEvent.pointerDown(frame, { pointerId: 2, clientX: 320, clientY: 200 });
    // Spread the fingers: 40px apart → 80px apart = 2x.
    fireEvent.pointerMove(frame, { pointerId: 2, clientX: 360, clientY: 200 });
    fireEvent.pointerUp(frame, { pointerId: 2, clientX: 360, clientY: 200 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 280, clientY: 200 });

    expect(onPick).not.toHaveBeenCalled();
    expect(container.querySelector('.msv-pane').style.transform).toContain('scale(2)');
  });

  it('taps in the letterbox outside the image are ignored', () => {
    const { onPick, frame } = mountViewer();
    tap(frame, 40, 200);   // left of the image rect
    tap(frame, 300, 500, 2); // below it
    expect(onPick).not.toHaveBeenCalled();
  });

  it('the zoom controls clamp and reset the pan at 1x', () => {
    const { container } = mountViewer();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const pane = () => container.querySelector('.msv-pane').style.transform;

    expect(zoomOut).toBeDisabled();          // already at the 1x floor
    fireEvent.click(zoomIn);
    expect(pane()).toContain('scale(1.5)');

    fireEvent.click(zoomOut);
    expect(pane()).toContain('scale(1)');
    expect(pane()).toContain('translate(0px, 0px)');
  });

  it('renders the marker pin at the picked position and suppresses picks when disabled', () => {
    const { onPick, frame } = mountViewer({ marker: { nx: 0.25, ny: 0.75 }, disabled: true });
    const pin = screen.getByTestId('map-snapshot-pin');
    expect(pin).toHaveStyle({ left: '25%', top: '75%' });

    tap(frame, 300, 200);
    expect(onPick).not.toHaveBeenCalled();
  });
});
