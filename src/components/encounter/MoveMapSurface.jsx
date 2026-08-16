// src/components/encounter/MoveMapSurface.jsx
// Shared grid/map surface toggle + map body (#1744 S7) — factored out of
// MoveActionSheet's original map-mode block (#1744 S4/WS-3/WS-4) once three
// more surfaces (ExplorationMove, MinionMove, DockEnemyPane) needed the exact
// same copy-paste-shaped JSX: a device-sticky Grid/Map toggle, the battlefield
// snapshot with the viewer's own route drawn on it via SnapshotRouteOverlay,
// other movers' route ghosts alongside it, and the loading/unavailable status
// notes while a mover-centered capture is in flight.
//
// Purely presentational — every surface still owns its own useMoverMapSurface/
// usePathPreview wiring (see useMoveMapMode) and its own plan/confirm state;
// this component only renders what that state produces. The plan/confirm
// protocol, MoveGridPicker fallback, and MoveConfirmBar are unaffected and
// stay with each caller.
import React from 'react';
import MapSnapshotViewer from './MapSnapshotViewer';
import SnapshotRouteOverlay from './SnapshotRouteOverlay';
import './MoveMapSurface.css';

const MoveMapSurface = ({
  mapEligible,
  surfacePref,
  onSurfaceChange,
  showBody,
  status,
  snapshot,
  origin,
  plannedPath,
  ghosts = [],
  onMapTap,
  onCancel,
  cancelLabel = 'Cancel',
  hint = 'Tap the map to choose a destination.',
}) => {
  if (!mapEligible) return null;

  const useMapSurface = surfacePref === 'map';
  const destination = plannedPath?.path?.length
    ? plannedPath.path[plannedPath.path.length - 1]
    : null;

  return (
    <>
      <div className="mvms-toggle" role="group" aria-label="Movement surface">
        <button
          type="button"
          className="btn-secondary mvms-toggle-btn"
          aria-pressed={surfacePref !== 'map'}
          onClick={() => onSurfaceChange('grid')}
        >
          Grid
        </button>
        <button
          type="button"
          className="btn-secondary mvms-toggle-btn"
          aria-pressed={surfacePref === 'map'}
          onClick={() => onSurfaceChange('map')}
        >
          Map
        </button>
      </div>

      {showBody && useMapSurface && status === 'ready' && snapshot && (
        <>
          <MapSnapshotViewer
            src={snapshot.url}
            onPick={onMapTap}
            overlay={(
              <>
                <SnapshotRouteOverlay
                  snapshot={snapshot}
                  origin={origin}
                  cells={plannedPath?.path}
                  destination={destination}
                  showLattice
                />
                {ghosts.map((ghost) => (
                  <SnapshotRouteOverlay
                    key={ghost.tokenId}
                    snapshot={snapshot}
                    origin={ghost.origin}
                    cells={ghost.path}
                    destination={ghost.path?.length ? ghost.path[ghost.path.length - 1] : null}
                    variant="ghost"
                  />
                ))}
              </>
            )}
          />
          <p className="mvms-hint">{hint}</p>
          {onCancel && (
            <button type="button" className="btn-secondary mvms-cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
        </>
      )}

      {showBody && useMapSurface && status === 'loading' && (
        <div className="mvms-status" role="status">Loading map…</div>
      )}
      {showBody && useMapSurface && status === 'unavailable' && (
        <div className="mvms-status" role="status">Map unavailable — using the grid.</div>
      )}
    </>
  );
};

export default MoveMapSurface;
