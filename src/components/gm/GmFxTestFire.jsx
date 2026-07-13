import React, { useState } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { RELAY } from '../../sync/keys';
import { newEntryUid } from '../../utils/uid';
import { FX_SHAPES } from '../../../foundry-bridge/animations';

/**
 * GM FX test-fire panel (#1456, epic #1414). Fires an arbitrary animation
 * recipe onto cnmh_fxplay_global — the tuning loop for catalog work (dial in
 * scale/tint/file for a rule in seconds instead of a strike round-trip) and
 * the diagnostic for "why didn't X animate" (a recipe fired from here isolates
 * catalog resolution from the bridge/Sequencer half).
 *
 * The payload mirrors emitStrikeFxPlay (utils/fxPlay.js) exactly; `shape`
 * options come from the bridge's own vocabulary export so the dropdown can
 * never drift from what the bridge implements.
 *
 * @param {Array} entries - the FULL encounter order (all kinds — enemies make
 *                          the natural targets, but any combatant works)
 */
const GmFxTestFire = ({ entries = [] }) => {
  const { sendUpdate } = useSession();
  const [shape, setShape]   = useState(FX_SHAPES[0]);
  const [file, setFile]     = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [scale, setScale]   = useState('');
  const [tint, setTint]     = useState('');

  if (entries.length === 0) return null;

  const sourceId = source || entries[0]?.entryId;
  const targetId = target || entries.find((e) => e.entryId !== sourceId)?.entryId;
  const canFire = !!(file.trim() && sourceId && targetId);

  const handleFire = () => {
    if (!canFire) return;
    const opts = {
      ...(scale.trim() && !Number.isNaN(Number(scale)) ? { scale: Number(scale) } : {}),
      ...(tint.trim() ? { tint: tint.trim() } : {}),
    };
    sendUpdate('global', RELAY.FXPLAY, {
      id: newEntryUid(),
      ts: Date.now(),
      shape,
      file: file.trim(),
      source: sourceId,
      targets: [targetId],
      ...(Object.keys(opts).length ? { opts } : {}),
    });
  };

  return (
    <div className="gm-save-request gm-fx-testfire">
      <h3>FX Test Fire</h3>

      <div className="gm-save-row">
        <label>
          Shape
          <select value={shape} onChange={(e) => setShape(e.target.value)} aria-label="fx shape">
            {FX_SHAPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label>
          Source
          <select value={sourceId} onChange={(e) => setSource(e.target.value)} aria-label="fx source">
            {entries.map((e) => (
              <option key={e.entryId} value={e.entryId}>{e.name}</option>
            ))}
          </select>
        </label>

        <label>
          Target
          <select value={targetId} onChange={(e) => setTarget(e.target.value)} aria-label="fx target">
            {entries.map((e) => (
              <option key={e.entryId} value={e.entryId}>{e.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="gm-save-row">
        <label>
          Sequencer key
          <input
            type="text"
            className="gm-save-effect"
            placeholder="jb2a.melee_generic.slash.01.orange"
            aria-label="fx file key"
            value={file}
            onChange={(e) => setFile(e.target.value)}
          />
        </label>

        <label>
          Scale (optional)
          <input
            type="text"
            className="gm-save-dc"
            placeholder="2"
            aria-label="fx scale"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          />
        </label>

        <label>
          Tint (optional)
          <input
            type="text"
            className="gm-save-dc"
            placeholder="#ffd700"
            aria-label="fx tint"
            value={tint}
            onChange={(e) => setTint(e.target.value)}
          />
        </label>
      </div>

      <p className="gm-help">
        Plays on every connected Foundry client via the bridge — needs Sequencer + JB2A
        in the world. Keys: Sequencer&apos;s Database Viewer, or
        scripts/data/jb2a-free-database-paths.json.
      </p>

      <button
        className="btn-primary"
        onClick={handleFire}
        disabled={!canFire}
        aria-label="Fire FX"
      >
        Fire FX
      </button>
    </div>
  );
};

export default GmFxTestFire;
