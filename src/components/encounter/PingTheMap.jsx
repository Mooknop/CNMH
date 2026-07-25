import React, { useCallback, useState } from 'react';
import Modal from '../shared/Modal';
import MapSnapshotViewer from './MapSnapshotViewer';
import { useSceneSnapshot } from '../../hooks/useSceneSnapshot';
import { useEncounter } from '../../hooks/useEncounter';
import { worldPointFromTap } from '../../utils/snapshotGeometry';
import './PingTheMap.css';

// Ping the Map (#1573 B2) — the first surface on the snapshot rail, and the
// end-to-end proof of it: ask the GM client for a photo of the battlefield,
// tap where you mean, and Foundry pulses a ping there for the whole table.
//
// Players have no canvas, so "over there, past the pillar" has never been
// expressible from the app before. The same viewer becomes the placement
// surface for area spells in B3.
//
// The button self-hides unless the bridge can both capture and ping — an older
// module keeps every other rail working and simply never offers this.
const PingTheMap = ({ character, themeColor }) => {
  const { available, canPing, request, requesting, ping } = useSceneSnapshot();
  const { appendLog } = useEncounter();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [marker, setMarker] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pinged, setPinged] = useState(false);

  const openAndCapture = useCallback(async () => {
    setOpen(true);
    setSnapshot(null);
    setMarker(null);
    setFailed(false);
    setPinged(false);
    const snap = await request();
    if (snap) setSnapshot(snap); else setFailed(true);
  }, [request]);

  const recapture = useCallback(async () => {
    setMarker(null);
    setPinged(false);
    setFailed(false);
    const snap = await request();
    if (snap) setSnapshot(snap); else setFailed(true);
  }, [request]);

  const confirmPing = useCallback(() => {
    const world = worldPointFromTap(snapshot, marker?.nx, marker?.ny);
    if (!world) return;
    ping({ x: world.x, y: world.y, sceneId: snapshot?.capture?.sceneId, name: character?.name });
    appendLog?.({ type: 'note', text: `${character?.name || 'A player'} pinged the map` });
    setPinged(true);
  }, [snapshot, marker, ping, appendLog, character]);

  if (!available || !canPing) return null;

  return (
    <>
      <button
        type="button"
        className="ptm-btn"
        onClick={openAndCapture}
        aria-label="Ping the map"
      >
        <span aria-hidden="true">📍</span> Ping the map
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Ping the map"
        themeColor={themeColor}
        maxWidth="640px"
        placement="bottom"
        highZ
      >
        {requesting && !snapshot && (
          <p className="ptm-status" role="status">Asking the GM screen for a snapshot…</p>
        )}

        {failed && !requesting && (
          <div className="ptm-status ptm-status--fail" role="status">
            <p>No snapshot came back — the GM client may be busy or between scenes.</p>
            <button type="button" className="btn-secondary" onClick={recapture}>Try again</button>
          </div>
        )}

        {snapshot && (
          <>
            <MapSnapshotViewer
              src={snapshot.url}
              marker={marker}
              onPick={(point) => { setMarker(point); setPinged(false); }}
            />
            <div className="ptm-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={recapture}
                disabled={requesting}
              >
                {requesting ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmPing}
                disabled={!marker || pinged}
              >
                {pinged ? 'Pinged ✓' : 'Ping here'}
              </button>
            </div>
            {pinged && (
              <p className="ptm-status" role="status">
                Ping sent — everyone at the table can see it on the map.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
};

export default PingTheMap;
