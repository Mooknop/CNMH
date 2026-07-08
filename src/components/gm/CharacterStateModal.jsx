import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { DEFAULT_CLOCK } from '../../contexts/GameDateContext';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { useCharacter } from '../../hooks/useCharacter';
import { formatSpeedBreakdown } from '../../utils/speed';
import { partitionLiveState } from '../../utils/liveStateRegistry';
import { performDailyPrep } from '../../utils/dailyPrep';
import { defaultTurnState } from '../../hooks/useTurnState';
import { toGameSeconds } from '../../utils/gameTime';
import './CharacterStateModal.css';

// A new turn at full economy — matches useTurnState.resetForNewTurn.
const freshTurnState = () => ({
  ...defaultTurnState(),
  reactionAvailable: true,
  hasStartedFirstTurn: true,
});

const arr = (v) => (Array.isArray(v) ? v : []);

// ─── Per-row editors (dispatched by entry.edit.kind) ─────────
// Each calls onWrite(nextValue, logText) — the parent persists + logs.

const PoolEditor = ({ entry, character, onWrite }) => {
  const { spent, max } = entry.edit.read(entry.value, character);
  if (max != null) {
    const remaining = Math.max(0, max - spent);
    const setRemaining = (n) => {
      const r = Math.max(0, Math.min(max, n));
      onWrite(entry.edit.write(max - r), `set ${entry.label} to ${r}/${max}`);
    };
    return (
      <span className="cs-step">
        <button type="button" className="cs-step-btn" aria-label={`spend ${entry.label}`}
          disabled={remaining <= 0} onClick={() => setRemaining(remaining - 1)}>−</button>
        <span className="cs-step-val">{remaining}/{max}</span>
        <button type="button" className="cs-step-btn" aria-label={`restore ${entry.label}`}
          disabled={remaining >= max} onClick={() => setRemaining(remaining + 1)}>+</button>
      </span>
    );
  }
  // No known max (e.g. staff) — edit the raw "spent" count directly.
  const setSpent = (n) => {
    const s = Math.max(0, n);
    onWrite(entry.edit.write(s), `set ${entry.label} to ${s} spent`);
  };
  return (
    <span className="cs-step">
      <button type="button" className="cs-step-btn" aria-label={`reduce ${entry.label}`}
        disabled={spent <= 0} onClick={() => setSpent(spent - 1)}>−</button>
      <span className="cs-step-val">{spent} spent</span>
      <button type="button" className="cs-step-btn" aria-label={`increase ${entry.label}`}
        onClick={() => setSpent(spent + 1)}>+</button>
    </span>
  );
};

const PoolMapEditor = ({ entry, character, onWrite }) => {
  const rows = entry.edit.read(entry.value, character);
  if (!rows.length) return <span className="cs-value">no slots</span>;
  return (
    <span className="cs-poolmap">
      {rows.map(({ key, spent, max }) => {
        const remaining = Math.max(0, max - spent);
        const setRemaining = (n) => {
          const r = Math.max(0, Math.min(max, n));
          onWrite(entry.edit.write(entry.value, key, max - r), `set ${entry.label} R${key} to ${r}/${max}`);
        };
        return (
          <span className="cs-step" key={key}>
            <span className="cs-step-rank">R{key}</span>
            <button type="button" className="cs-step-btn" aria-label={`spend R${key} slot`}
              disabled={remaining <= 0} onClick={() => setRemaining(remaining - 1)}>−</button>
            <span className="cs-step-val">{remaining}/{max}</span>
            <button type="button" className="cs-step-btn" aria-label={`restore R${key} slot`}
              disabled={remaining >= max} onClick={() => setRemaining(remaining + 1)}>+</button>
          </span>
        );
      })}
    </span>
  );
};

const CountEditor = ({ entry, onWrite }) => {
  const n = entry.edit.read(entry.value);
  const set = (next) => {
    const v = Math.max(0, next);
    onWrite(entry.edit.write(v), `set ${entry.label} to ${v}`);
  };
  return (
    <span className="cs-step">
      <button type="button" className="cs-step-btn" aria-label={`decrease ${entry.label}`}
        disabled={n <= 0} onClick={() => set(n - 1)}>−</button>
      <span className="cs-step-val">{n}</span>
      <button type="button" className="cs-step-btn" aria-label={`increase ${entry.label}`}
        onClick={() => set(n + 1)}>+</button>
    </span>
  );
};

const ToggleEditor = ({ entry, onWrite }) => {
  const on = entry.edit.isOn(entry.value);
  return (
    <button
      type="button"
      className={`cs-toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={`toggle ${entry.label}`}
      onClick={() => onWrite(entry.edit.write(entry.value, !on), `turned ${entry.label} ${on ? 'off' : 'on'}`)}
    >
      {on ? 'On' : 'Off'}
    </button>
  );
};

const ClearEditor = ({ entry, onWrite }) => {
  const empty = entry.formatted === 'none';
  return (
    <span className="cs-clear-row">
      <span className="cs-value">{entry.formatted}</span>
      <button type="button" className="cs-clear-btn" aria-label={`clear ${entry.label}`}
        disabled={empty} onClick={() => onWrite(entry.edit.write(), `cleared ${entry.label}`)}>
        Clear
      </button>
    </span>
  );
};

const ListEditor = ({ entry, onWrite }) => {
  const items = arr(entry.value);
  if (!items.length) return <span className="cs-value">none</span>;
  return (
    <ul className="cs-items">
      {items.map((it, i) => {
        const label = entry.edit.itemLabel(it);
        return (
          <li className="cs-item" key={i}>
            <span className="cs-item-label">{label}</span>
            <button type="button" className="cs-item-remove" aria-label={`remove ${label}`}
              onClick={() => onWrite(entry.edit.write(entry.value, i), `removed ${label} from ${entry.label}`)}>
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
};

const TextEditor = ({ entry, onWrite }) => {
  const [draft, setDraft] = useState(entry.edit.read(entry.value));
  useEffect(() => { setDraft(entry.edit.read(entry.value)); }, [entry.value, entry.edit]);
  const dirty = draft !== entry.edit.read(entry.value);
  return (
    <span className="cs-text-row">
      <input className="cs-text-input" value={draft} aria-label={`${entry.label} value`}
        onChange={(e) => setDraft(e.target.value)} />
      <button type="button" className="cs-save-btn" disabled={!dirty}
        onClick={() => onWrite(entry.edit.write(entry.value, draft), `set ${entry.label} to ${draft || '(none)'}`)}>
        Save
      </button>
    </span>
  );
};

const RawJsonEditor = ({ type, label, value, onWrite }) => {
  const initial = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(null);
  useEffect(() => { setDraft(JSON.stringify(value, null, 2)); setError(null); }, [value]);

  const save = () => {
    let parsed;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError('Invalid JSON');
      return;
    }
    setError(null);
    onWrite(parsed, `edited ${label || type} (raw)`);
  };

  return (
    <details className="cs-raw-edit">
      <summary>Edit raw JSON</summary>
      <textarea className="cs-raw-textarea" value={draft} aria-label={`${label || type} raw json`}
        spellCheck={false} onChange={(e) => setDraft(e.target.value)} />
      {error && <p className="cs-error" role="alert">{error}</p>}
      <button type="button" className="cs-save-btn" onClick={save}>Save</button>
    </details>
  );
};

const renderEditor = (entry, character, onWrite) => {
  switch (entry.edit?.kind) {
    case 'pool':    return <PoolEditor entry={entry} character={character} onWrite={onWrite} />;
    case 'poolMap': return <PoolMapEditor entry={entry} character={character} onWrite={onWrite} />;
    case 'count':   return <CountEditor entry={entry} onWrite={onWrite} />;
    case 'toggle':  return <ToggleEditor entry={entry} onWrite={onWrite} />;
    case 'clear':   return <ClearEditor entry={entry} onWrite={onWrite} />;
    case 'list':    return <ListEditor entry={entry} onWrite={onWrite} />;
    case 'text':    return <TextEditor entry={entry} onWrite={onWrite} />;
    default:
      return (
        <div className="cs-raw-wrap">
          <span className="cs-value">{entry.formatted}</span>
          <RawJsonEditor type={entry.type} label={entry.label} value={entry.value} onWrite={onWrite} />
        </div>
      );
  }
};

const isBlockEditor = (kind) => kind === 'list' || kind == null;

// GM Character-State inspector + remediation (#229). Read every live synced key
// for one PC (via liveStateRegistry), edit any pool/flag inline, run reset
// presets, and log every correction so it's auditable.
const CharacterStateModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { getState, sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const [selectedId, setSelectedId] = useState('');
  const [confirm, setConfirm] = useState(null);
  const { liveState, refresh } = useCharacterLiveState(selectedId || null);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const character = useMemo(
    () => (characters || []).find((c) => c.id === selectedId) || null,
    [characters, selectedId],
  );
  const charName = character?.name || selectedId;

  // Derived Speed (#1223) — read-only spine output with the labeled breakdown,
  // so the GM sees WHY a PC is at 15 ft (armor + encumbered) while inspecting.
  const derivedSpeed = useCharacter(character)?.speed ?? null;

  const { groups, unrecognized } = useMemo(
    () => partitionLiveState(liveState, character),
    [liveState, character],
  );
  const hasAny = groups.length > 0 || unrecognized.length > 0;

  // Persist a single key + log, then re-snapshot so the view reflects it.
  const pushState = useCallback((type, value) => {
    try {
      window.localStorage.setItem(`cnmh_${type}_${selectedId}`, JSON.stringify(value));
    } catch { /* quota / serialization — sync still carries it */ }
    sendUpdate(selectedId, type, value);
  }, [selectedId, sendUpdate]);

  const writeFor = useCallback((type) => (value, logText) => {
    pushState(type, value);
    if (logText) appendEvent({ type: 'gm', text: `GM: ${charName} — ${logText}` });
    refresh();
  }, [pushState, appendEvent, charName, refresh]);

  // ── Presets ──
  const resetTurn = () => {
    pushState('turnstate', freshTurnState());
    appendEvent({ type: 'gm', text: `GM: reset ${charName}'s turn` });
    refresh();
  };

  const fullRestore = () => {
    setConfirm(null);
    // Read the shared clock straight off the session (cnmh_clock_global) so the
    // modal doesn't depend on GameDateProvider being mounted above it.
    const nowSecs = toGameSeconds(getState('global', 'clock') || DEFAULT_CLOCK);
    const { summary } = performDailyPrep({
      character,
      getState,
      sendUpdate,
      nowSecs,
      eldChoice: getState(selectedId, 'eldattune') || undefined,
    });
    appendEvent({ type: 'gm', text: `GM: daily preparations for ${charName} — ${summary}` });
    refresh();
  };

  const clearCombat = () => {
    setConfirm(null);
    pushState('turnstate', freshTurnState());
    pushState('shieldraise', { raised: false, ts: 0 });
    pushState('stance', { active: false, name: null, ts: 0 });
    pushState('aura', { active: false, ts: 0 });
    pushState('huntprey', null);
    pushState('sustains', []);
    appendEvent({ type: 'gm', text: `GM: cleared combat state for ${charName}` });
    refresh();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Character State" maxWidth="560px">
      <div className="cs-body">
        <div className="cs-char-row">
          <label htmlFor="cs-char">Character</label>
          <select
            id="cs-char"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="select character"
          >
            <option value="">— pick a character —</option>
            {(characters || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {selectedId && (
          <div className="cs-presets" role="group" aria-label="reset presets">
            <button type="button" className="cs-preset-btn" onClick={resetTurn}>Reset turn</button>
            <button type="button" className="cs-preset-btn"
              onClick={() => setConfirm({ kind: 'restore' })}>Full restore</button>
            <button type="button" className="cs-preset-btn"
              onClick={() => setConfirm({ kind: 'combat' })}>Clear combat state</button>
          </div>
        )}

        {selectedId && !hasAny && (
          <p className="cs-empty gm-help">No live state recorded for this character yet.</p>
        )}

        {selectedId && derivedSpeed && derivedSpeed.total > 0 && (
          <section className="cs-group" aria-label="Derived">
            <h3 className="cs-group-title">Derived</h3>
            <ul className="cs-list">
              <li className="cs-row" data-testid="cs-row-speed">
                <span className="cs-label">Speed</span>
                <div className="cs-control">
                  <span className="cs-value">
                    {derivedSpeed.total} ft
                    {derivedSpeed.breakdown.length > 1 && (
                      <span className="cs-value-detail"> — {formatSpeedBreakdown(derivedSpeed)}</span>
                    )}
                  </span>
                </div>
              </li>
            </ul>
          </section>
        )}

        {selectedId && groups.map((g) => (
          <section className="cs-group" key={g.key} aria-label={g.label}>
            <h3 className="cs-group-title">{g.label}</h3>
            <ul className="cs-list">
              {g.entries.map((e) => (
                <li
                  className={`cs-row${isBlockEditor(e.edit?.kind) ? ' cs-row--block' : ''}`}
                  key={e.type}
                  data-testid={`cs-row-${e.type}`}
                >
                  <span className="cs-label">{e.label}</span>
                  <div className="cs-control">{renderEditor(e, character, writeFor(e.type))}</div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {selectedId && unrecognized.length > 0 && (
          <section className="cs-group cs-group--raw" aria-label="Unrecognized">
            <h3 className="cs-group-title">Unrecognized</h3>
            <p className="cs-raw-note gm-help">
              Live keys with no display rule yet — edit raw.
            </p>
            <ul className="cs-list">
              {unrecognized.map((u) => (
                <li className="cs-row cs-row--block" key={u.type} data-testid={`cs-raw-${u.type}`}>
                  <span className="cs-label">{u.type}</span>
                  <div className="cs-control">
                    <RawJsonEditor type={u.type} value={u.value} onWrite={writeFor(u.type)} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm?.kind === 'restore'}
        title="Full restore"
        message={`Run daily preparations for ${charName}: restore spell slots, focus, staff charges, wand uses and daily abilities, clear Hunt Prey, and expire until-daily-prep effects. The existing Eld attunement is kept.`}
        confirmLabel="Restore"
        danger={false}
        onConfirm={fullRestore}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'combat'}
        title="Clear combat state"
        message={`Clear ${charName}'s turn economy, shield raise, stance, aura, Hunt Prey, and sustained spells. Conditions and effects are left untouched.`}
        confirmLabel="Clear"
        danger={false}
        onConfirm={clearCombat}
        onCancel={() => setConfirm(null)}
      />
    </Modal>
  );
};

export default CharacterStateModal;
