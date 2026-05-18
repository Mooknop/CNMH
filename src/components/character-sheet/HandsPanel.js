import React, { useMemo, useState } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import ActionIcon from '../shared/ActionIcon';
import ConfirmDialog from '../shared/ConfirmDialog';
import { ITEM_STATE_LABEL } from '../../utils/itemState';
import './HandsPanel.css';

// Slice 3: live, player-driven loadout. Reads the effective tree from
// useCharacter (authored ⊕ loadout) and writes per-entry overrides into the
// durable session map cnmh_loadout_<characterId> = { [uid]: {state,container} }.
// Setting an explicit state implies the item is on-person (container:null), so
// it doubles as "retrieve from a container". Bulk updates live for everyone
// because useCharacter recomputes from the same key.

const STATE_OPTS = ['worn', 'held1', 'held2', 'dropped'];

const HandsPanel = ({ character, characterColor }) => {
  const charData = useCharacter(character);
  const cid = charData ? charData.id : (character && character.id);
  const [, setLoadout] = useSyncedState(`cnmh_loadout_${cid || 'none'}`, {});
  const [confirmReset, setConfirmReset] = useState(false);

  const inventory = useMemo(
    () => (charData ? charData.inventory : []),
    [charData]
  );

  // Top-level containers are the valid stow targets (depth-1 model).
  const containers = useMemo(
    () => inventory.filter((e) => e && e.container && Array.isArray(e.container.contents)),
    [inventory]
  );

  // uid -> the container uid it currently sits in (for the location select).
  const parentOf = useMemo(() => {
    const m = {};
    containers.forEach((c) =>
      (c.container.contents || []).forEach((ch) => {
        if (ch && ch.uid != null) m[ch.uid] = c.uid;
      })
    );
    return m;
  }, [containers]);

  if (!charData) return null;

  const patch = (uid, p) =>
    setLoadout((cur) => ({ ...(cur || {}), [uid]: { ...((cur || {})[uid] || {}), ...p } }));

  // Any explicit state lands the item on-person (also retrieves it).
  const setState = (uid, state) => patch(uid, { state, container: null });
  const moveTo = (uid, containerUid) =>
    patch(uid, { container: containerUid || null });

  const handsRows = inventory.filter((e) => e && (e.state === 'held1' || e.state === 'held2'));
  const handsUsed = handsRows.reduce((n, e) => n + (e.state === 'held2' ? 2 : 1), 0);

  const containerOptions = (selfUid) =>
    containers
      .filter((c) => c.uid !== selfUid)
      .map((c) => ({ value: c.uid, label: c.name || c.uid }));

  const Row = ({ entry, stowed }) => {
    const uid = entry.uid;
    const isC = !!(entry.container && Array.isArray(entry.container.contents));
    return (
      <div className="hands-row" data-testid={`hands-${uid}`}>
        <div className="hands-row-main">
          <span className="hands-name">{entry.name}</span>
          <span className="hands-state" data-testid={`hands-${uid}-badge`}>
            {ITEM_STATE_LABEL[entry.state] || ITEM_STATE_LABEL.worn}
          </span>
        </div>
        <div className="hands-row-controls">
          {stowed ? (
            <button
              className="btn-small btn-secondary"
              data-testid={`hands-${uid}-retrieve`}
              onClick={() => setState(uid, 'worn')}
              title="Retrieve to your person (2 actions)"
            >
              Retrieve <ActionIcon actionText="Two Actions" size="small" showTooltip={false} />
            </button>
          ) : (
            <>
              <label className="hands-ctl">
                <span className="hands-ctl-label">State</span>
                <select
                  aria-label={`hands-${uid}-state`}
                  value={STATE_OPTS.includes(entry.state) ? entry.state : 'worn'}
                  onChange={(e) => setState(uid, e.target.value)}
                >
                  {STATE_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {ITEM_STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              {!isC && containers.length > 0 && (
                <label className="hands-ctl">
                  <span className="hands-ctl-label">Location</span>
                  <select
                    aria-label={`hands-${uid}-location`}
                    value={parentOf[uid] || ''}
                    onChange={(e) => moveTo(uid, e.target.value)}
                  >
                    <option value="">Carried (on person)</option>
                    {containerOptions(uid).map((o) => (
                      <option key={o.value} value={o.value}>
                        Stow in {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="hands-panel" aria-label="hands and loadout">
      <div className="hands-header">
        <h3 style={{ color: characterColor }}>Hands &amp; Loadout</h3>
        <button
          className="btn-small btn-danger"
          data-testid="hands-reset"
          onClick={() => setConfirmReset(true)}
        >
          Reset to GM loadout
        </button>
      </div>

      <div className="hands-summary" data-testid="hands-summary">
        {handsRows.length === 0 ? (
          <span>Both hands free.</span>
        ) : (
          <>
            <strong>In hand{handsRows.length > 1 ? 's' : ''}:</strong>{' '}
            {handsRows.map((e) => `${e.name} (${ITEM_STATE_LABEL[e.state]})`).join(', ')}
            {handsUsed > 2 && (
              <span className="hands-warn"> — more than 2 hands' worth held!</span>
            )}
          </>
        )}
      </div>

      <div className="hands-legend">
        <ActionIcon actionText="One Action" size="small" showTooltip={false} /> draw / sheathe /
        change a carried item&nbsp;·&nbsp;
        <ActionIcon actionText="Two Actions" size="small" showTooltip={false} /> stow into or
        retrieve from a container
      </div>

      <div className="hands-list">
        {inventory.map((entry) => (
          <React.Fragment key={entry.uid || entry.name}>
            <Row entry={entry} stowed={false} />
            {entry.container &&
              Array.isArray(entry.container.contents) &&
              entry.container.contents.map((ch) => (
                <div className="hands-indent" key={ch.uid || ch.name}>
                  <Row entry={ch} stowed />
                </div>
              ))}
          </React.Fragment>
        ))}
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        title="Reset to GM loadout"
        message="Discard all live hand/placement changes for this character and return to the GM-authored loadout? This cannot be undone."
        confirmLabel="Reset"
        onConfirm={() => {
          setLoadout({});
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </section>
  );
};

export default HandsPanel;
