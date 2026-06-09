import React, { useState } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';

const SAVE_OPTIONS = ['fortitude', 'reflex', 'will'];
const SAVE_LABELS  = { fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' };

let _reqCounter = 0;

/**
 * Lets the GM push a save prompt to one or all PCs in the encounter.
 *
 * @param {Array} pcEntries - encounter order entries where kind === 'pc' and charId is set
 */
const GmSaveRequest = ({ pcEntries = [] }) => {
  const { sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const [save,       setSave]       = useState('reflex');
  const [dc,         setDc]         = useState('');
  const [effectName, setEffectName] = useState('');
  const [basic,      setBasic]      = useState(false);
  const [target,     setTarget]     = useState('all');

  const canSend = dc !== '' && parseInt(dc, 10) > 0 && pcEntries.length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const dcNum = parseInt(dc, 10);
    const reqIdBase = `save-${Date.now()}-${++_reqCounter}`;
    const targets = target === 'all'
      ? pcEntries
      : pcEntries.filter((e) => e.charId === target);

    for (const entry of targets) {
      sendUpdate(entry.charId, 'saveprompt', {
        reqId: `${reqIdBase}-${entry.charId}`,
        save,
        dc: dcNum,
        effectName: effectName.trim() || undefined,
        basic,
      });
    }
    const saveLabel = SAVE_LABELS[save] || save;
    const targetLabel = target === 'all' ? 'all PCs' : (targets[0]?.name ?? target);
    const nameStr = effectName.trim() ? ` — ${effectName.trim()}` : '';
    appendEvent({ type: 'save', text: `${saveLabel} DC ${dcNum}${nameStr} → ${targetLabel}` });
    setEffectName('');
  };

  if (pcEntries.length === 0) return null;

  return (
    <div className="gm-save-request">
      <h3>Request Save</h3>

      <div className="gm-save-row">
        <label>
          Save
          <select value={save} onChange={(e) => setSave(e.target.value)} aria-label="save type">
            {SAVE_OPTIONS.map((s) => (
              <option key={s} value={s}>{SAVE_LABELS[s]}</option>
            ))}
          </select>
        </label>

        <label>
          DC
          <input
            type="number"
            min="1"
            className="gm-save-dc"
            placeholder="DC"
            aria-label="save DC"
            value={dc}
            onChange={(e) => setDc(e.target.value)}
          />
        </label>

        <label className="gm-save-basic">
          <input
            type="checkbox"
            checked={basic}
            onChange={(e) => setBasic(e.target.checked)}
            aria-label="basic save"
          />
          Basic
        </label>
      </div>

      <div className="gm-save-row">
        <label>
          Effect (optional)
          <input
            type="text"
            className="gm-save-effect"
            placeholder="e.g. Fireball"
            aria-label="effect name"
            value={effectName}
            onChange={(e) => setEffectName(e.target.value)}
          />
        </label>

        <label>
          Target
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="save target">
            <option value="all">All PCs</option>
            {pcEntries.map((e) => (
              <option key={e.charId} value={e.charId}>{e.name}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        className="btn-primary"
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Request save"
      >
        Request Save
      </button>
    </div>
  );
};

export default GmSaveRequest;
