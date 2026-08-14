import React, { useCallback, useRef, useState } from 'react';
import './MapSnapshotViewer.css';

// Scene-snapshot viewer (#1573 B2) — the battlefield for players who have no
// Foundry client. Pinch or use the zoom controls, drag to pan, tap to pick a
// point; the host turns the normalized (nx, ny) into world coordinates.
//
// Normalization rides getBoundingClientRect on the IMAGE, which already
// reflects the zoom/pan transform — so a tap maps correctly at any zoom without
// the component doing inverse-transform math of its own.
//
// Gesture discipline: a pan or a pinch must never leave a ping behind, so a
// pointer sequence only counts as a tap when it stayed under DRAG_SLOP and no
// second finger joined (the accidental-ping trap this ports from).
//
// Props:
//   src        image URL from the snapdone ack
//   marker     { nx, ny } | null — the picked point, drawn as a pin
//   onPick     ({ nx, ny }) => void
//   disabled   suppress picking (post-confirm states)
//   overlay    optional React node (#1744 S2), rendered inside `.msv-pane`
//              alongside the image — the same percentage-positioned trick the
//              `marker` pin below uses, so it inherits the pan/zoom transform
//              for free. Purely presentational (SnapshotRouteOverlay); this
//              component neither knows nor cares what it draws.

const DRAG_SLOP = 8;      // px of movement that turns a tap into a pan
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

const MapSnapshotViewer = ({ src, marker = null, onPick, disabled = false, overlay = null }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ moved: 0, pinched: false, last: null, pinchStart: null });

  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 1) {
      gesture.current = { moved: 0, pinched: false, last: { x: e.clientX, y: e.clientY }, pinchStart: null };
    } else if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      gesture.current.pinched = true;
      gesture.current.pinchStart = { dist: Math.hypot(p2.x - p1.x, p2.y - p1.y), zoom };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && gesture.current.pinchStart) {
      const [p1, p2] = [...pointers.current.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const { dist: startDist, zoom: startZoom } = gesture.current.pinchStart;
      if (startDist > 0) setZoom(clampZoom((startZoom * dist) / startDist));
      return;
    }

    const last = gesture.current.last;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    gesture.current.moved += Math.hypot(dx, dy);
    gesture.current.last = { x: e.clientX, y: e.clientY };
    // Panning only makes sense once zoomed past the frame.
    if (zoom > 1) setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const endPointer = (e) => {
    const wasTap =
      pointers.current.size === 1 &&
      !gesture.current.pinched &&
      gesture.current.moved < DRAG_SLOP;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinchStart = null;
    if (!wasTap || disabled || !onPick) return;

    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;  // tap landed in the letterbox
    onPick({ nx, ny });
  };

  const nudgeZoom = useCallback((delta) => {
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  return (
    <div className="msv">
      <div
        className="msv-frame"
        data-testid="map-snapshot-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); }}
      >
        <div
          className="msv-pane"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <img ref={imgRef} className="msv-img" src={src} alt="Battlefield snapshot" draggable="false" />
          {overlay}
          {marker && (
            <span
              className="msv-pin"
              data-testid="map-snapshot-pin"
              style={{ left: `${marker.nx * 100}%`, top: `${marker.ny * 100}%` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
      <div className="msv-controls">
        <button type="button" className="btn-secondary" onClick={() => nudgeZoom(-0.5)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
        <span className="msv-zoom" aria-live="polite">{zoom.toFixed(1)}×</span>
        <button type="button" className="btn-secondary" onClick={() => nudgeZoom(0.5)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
      </div>
      <p className="msv-hint">Pinch or use −/+ to zoom, drag to pan, tap to mark a spot.</p>
    </div>
  );
};

export default MapSnapshotViewer;
