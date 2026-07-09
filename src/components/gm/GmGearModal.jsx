import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useCharacter } from '../../hooks/useCharacter';
import { flattenInventory } from '../../utils/InventoryUtils';
import {
  isTalisman, validAffixHosts, affixedHostUid, affix, unaffix, itemUidOf,
} from '../../utils/affix';
import {
  isShieldAttachment, validAttachHosts, attachedHostUid, attach, unattach,
} from '../../utils/shieldAttach';
import { gearSockets, compatibleRunes, applyRune } from '../../utils/runeSockets';
import { reinforcingRuneDocs, clearedGearEntry, applyGearEntry } from '../../utils/gmRunes';
import { STRIKING } from '../../utils/weaponRunes';
import { RESILIENT } from '../../utils/armorRunes';
import { REINFORCING } from '../../utils/shieldRunes';
import './CharacterStateModal.css';
import { APP, syncKey } from '../../sync/keys';

// GM Gear management (#gm-gear). Bind/unbind a character's talismans and shield
// attachments AND edit the runes on any valid rune target (weapon / armor / ring /
// shield / accessory) directly — exempt from the player-side activities (the
// 10-minute affix, the smith's work order + 24h + gold), and (like
// CharacterStateModal) written via sendUpdate straight to the DO so it also works
// in the offline sandbox where player writes are frozen. Every change logs a GM
// audit line. Rune edits mint a runed copy onto the acquired overlay and mask the
// original via removed (the useRuneWork / useMoveRune model).

// One binding row: a host <select> (the current binding + every valid host) that
// rebinds/unbinds on change.
const BindingRow = ({ label, sub, currentHostUid, hosts, noneLabel, onBind }) => (
  <li className="cs-row" data-testid={`gear-row-${label}`}>
    <span className="cs-label">
      {label}
      {sub && <span className="gm-help"> — {sub}</span>}
    </span>
    <div className="cs-control">
      <select
        aria-label={`host for ${label}`}
        value={currentHostUid || ''}
        onChange={(e) => onBind(e.target.value || null)}
      >
        <option value="">{noneLabel}</option>
        {hosts.map((h) => (
          <option key={itemUidOf(h)} value={itemUidOf(h)}>{h.name}</option>
        ))}
      </select>
    </div>
  </li>
);

// Display metadata for the socket board.
const SOCKET_LABEL = {
  potency: 'Potency', striking: 'Striking', resilient: 'Resilient',
  reinforcing: 'Reinforcing', property: 'Property', accessory: 'Accessory',
};
// Stable key for a socket within a gear card (fundamentals are singletons; a
// property socket is keyed by its index).
const socketKey = (s) => (s.type === 'property' ? `property-${s.index}` : s.type);

// What a filled socket currently holds, as a display string (null when empty).
const socketContent = (s) => {
  switch (s.type) {
    case 'potency': return s.value ? `+${s.value}` : null;
    case 'striking': return s.value ? (STRIKING[s.value]?.label || s.value) : null;
    case 'resilient': return s.value ? (RESILIENT[s.value]?.label || s.value) : null;
    case 'reinforcing': return s.value ? (REINFORCING[s.value]?.label || s.value) : null;
    case 'property':
    case 'accessory':
      return s.rune ? (typeof s.rune === 'string' ? s.rune : s.rune.name) : null;
    default: return null;
  }
};

// One rune socket: what it holds, a picker of the runes that could fill/upgrade
// it, and — when filled — a clear button. A rune that carries `choices` (e.g.
// Energy-Resistant's damage type, #1196 G3) can't apply until a choice is made,
// so selecting it reveals a second picker; onFill fires with the chosen value.
const RuneSocketRow = ({ item, socket, options, onFill, onClear }) => {
  const [pending, setPending] = useState(null); // a choices-rune awaiting its choice
  const held = socketContent(socket);

  const pick = (rune) => {
    if (!rune) return;
    if (Array.isArray(rune.choices) && rune.choices.length) setPending(rune);
    else onFill(item, socket, rune);
  };

  return (
    <li className="cs-row" data-testid={`rune-socket-${item.name}-${socketKey(socket)}`}>
      <span className="cs-label">
        {SOCKET_LABEL[socket.type]}
        <span className="gm-help"> — {held || 'empty'}</span>
      </span>
      <div className="cs-control cs-clear-row">
        {options.length > 0 && (
          <select
            aria-label={`${socket.type} rune for ${item.name}`}
            value=""
            onChange={(e) => pick(options.find((o) => String(o.id) === e.target.value))}
          >
            <option value="">{socket.filled ? '— upgrade —' : '— set —'}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}
        {pending && (
          <select
            aria-label={`${pending.name} choice for ${item.name}`}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              onFill(item, socket, pending, e.target.value);
              setPending(null);
            }}
          >
            <option value="">— {pending.name} type —</option>
            {pending.choices.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {socket.filled && (
          <button
            type="button"
            className="cs-item-remove"
            aria-label={`clear ${socket.type} on ${item.name}`}
            onClick={() => onClear(item, socket)}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
};

// One rune-target item and its sockets. All edits are instant (onFill / onClear
// write straight through).
const RuneItemCard = ({ item, stock, onFill, onClear }) => (
  <li className="cs-item gm-rune-item" data-testid={`rune-item-${item.name}`}>
    <span className="cs-item-label gm-rune-item-name">{item.name}</span>
    <ul className="cs-list gm-rune-sockets">
      {gearSockets(item).map((s) => (
        <RuneSocketRow
          key={socketKey(s)}
          item={item}
          socket={s}
          options={compatibleRunes(item, s.type, stock)}
          onFill={onFill}
          onClear={onClear}
        />
      ))}
    </ul>
  </li>
);

const GmGearModal = ({ isOpen, onClose }) => {
  const { characters, runes: catalogRunes } = useContent();
  const { getState, sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const [selectedId, setSelectedId] = useState('');

  const character = useMemo(
    () => (characters || []).find((c) => c.id === selectedId) || null,
    [characters, selectedId],
  );
  const charName = character?.name || selectedId;
  const charData = useCharacter(character);
  const flatInventory = useMemo(
    () => flattenInventory(charData?.inventory || []),
    [charData],
  );

  // Local mirrors of the overlays we write, seeded from the live snapshot; writes
  // go straight to the DO (sandbox-exempt) and we update the mirror optimistically
  // so chained edits (e.g. fill then upgrade) read the latest value. The runed-
  // item display re-derives from useCharacter as the DO echoes acquired/removed.
  const [affixed, setAffixedLocal] = useState({});
  const [attached, setAttachedLocal] = useState({});
  const [acquired, setAcquiredLocal] = useState([]);
  const [removed, setRemovedLocal] = useState([]);
  useEffect(() => {
    if (!isOpen || !selectedId) return;
    setAffixedLocal(getState(selectedId, APP.AFFIXED) || {});
    setAttachedLocal(getState(selectedId, APP.ATTACHED) || {});
    setAcquiredLocal(getState(selectedId, APP.ACQUIRED) || []);
    setRemovedLocal(getState(selectedId, APP.REMOVED) || []);
  }, [isOpen, selectedId, getState]);

  const writeState = (type, next) => {
    try {
      window.localStorage.setItem(syncKey(type, selectedId), JSON.stringify(next));
    } catch { /* quota — sync still carries it */ }
    // GM authoring must survive the offline-sandbox freeze (DO up, Foundry down):
    // `force` bypasses sendUpdate's per-character write-gate, the same way the
    // dashboard's authoritative gold write does. Without it these affix/attach/
    // rune writes are silently dropped and revert on reload (#gm-gear).
    sendUpdate(selectedId, type, next, { force: true });
  };
  const write = (type, next, logText) => {
    writeState(type, next);
    appendEvent({ type: 'gm', text: `GM: ${charName} — ${logText}` });
  };

  const talismans = useMemo(() => flatInventory.filter(isTalisman), [flatInventory]);
  const attachments = useMemo(() => flatInventory.filter(isShieldAttachment), [flatInventory]);

  const byUid = useMemo(
    () => new Map(flatInventory.map((it) => [itemUidOf(it), it])),
    [flatInventory],
  );
  const hostName = (uid) => byUid.get(uid)?.name || null;

  const bindTalisman = (talisman, hostUid) => {
    const tUid = itemUidOf(talisman);
    const next = hostUid ? affix(affixed, tUid, hostUid) : unaffix(affixed, tUid);
    setAffixedLocal(next);
    write('affixed', next,
      hostUid ? `affixed ${talisman.name} to ${hostName(hostUid)}` : `removed ${talisman.name} from its host`);
  };

  const bindAttachment = (attachment, shieldUid) => {
    const aUid = itemUidOf(attachment);
    const next = shieldUid ? attach(attached, aUid, shieldUid) : unattach(attached, aUid);
    setAttachedLocal(next);
    write('attached', next,
      shieldUid ? `attached ${attachment.name} to ${hostName(shieldUid)}` : `removed ${attachment.name} from its shield`);
  };

  // Every inventory item with at least one rune socket (weapon / armor / ring /
  // shield / accessory host). The rune stock is the full catalog plus the shield
  // reinforcing docs the catalog doesn't carry, so every socket has real options.
  const runeItems = useMemo(
    () => flatInventory.filter((it) => gearSockets(it).length > 0),
    [flatInventory],
  );
  const runeStock = useMemo(
    () => [...(Array.isArray(catalogRunes) ? catalogRunes : []), ...reinforcingRuneDocs()],
    [catalogRunes],
  );

  // Commit a runed copy of `item`: mint it onto acquired, mask/splice the
  // original via removed, mirror both, and log. Instant + sandbox-exempt.
  const editRune = (item, entry, logText) => {
    if (!entry) return;
    const { acquired: nextAcq, removed: nextRem } = applyGearEntry(
      acquired, removed, itemUidOf(item), entry,
    );
    setAcquiredLocal(nextAcq);
    setRemovedLocal(nextRem);
    writeState('acquired', nextAcq);
    writeState('removed', nextRem);
    appendEvent({ type: 'gm', text: `GM: ${charName} — ${logText}` });
  };

  const fillSocket = (item, socket, rune, choice) =>
    editRune(
      item,
      applyRune(item, rune, choice ? { choice } : {}),
      `etched ${rune.name}${choice ? ` (${choice})` : ''} onto ${item.name}`,
    );

  const clearSocket = (item, socket) =>
    editRune(item, clearedGearEntry(item, socket),
      `cleared the ${(SOCKET_LABEL[socket.type] || socket.type).toLowerCase()} rune from ${item.name}`);

  const hasGear = talismans.length > 0 || attachments.length > 0 || runeItems.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Gear" maxWidth="560px">
      <div className="cs-body">
        <div className="cs-char-row">
          <label htmlFor="gear-char">Character</label>
          <select
            id="gear-char"
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
          <p className="cs-raw-note gm-help">
            Binding here is instant — it skips the 10-minute activity and works even in the offline sandbox.
          </p>
        )}

        {selectedId && !hasGear && (
          <p className="cs-empty gm-help">This character has no talismans, shield attachments, or runable gear.</p>
        )}

        {selectedId && talismans.length > 0 && (
          <section className="cs-group" aria-label="Talismans">
            <h3 className="cs-group-title">Talismans</h3>
            <ul className="cs-list">
              {talismans.map((t) => (
                <BindingRow
                  key={itemUidOf(t)}
                  label={t.name}
                  sub={hostName(affixedHostUid(affixed, itemUidOf(t))) ? `on ${hostName(affixedHostUid(affixed, itemUidOf(t)))}` : 'unaffixed'}
                  currentHostUid={affixedHostUid(affixed, itemUidOf(t))}
                  hosts={validAffixHosts(flatInventory, t)}
                  noneLabel="— unaffixed —"
                  onBind={(hostUid) => bindTalisman(t, hostUid)}
                />
              ))}
            </ul>
          </section>
        )}

        {selectedId && attachments.length > 0 && (
          <section className="cs-group" aria-label="Shield attachments">
            <h3 className="cs-group-title">Shield Attachments</h3>
            <ul className="cs-list">
              {attachments.map((a) => (
                <BindingRow
                  key={itemUidOf(a)}
                  label={a.name}
                  sub={hostName(attachedHostUid(attached, itemUidOf(a))) ? `on ${hostName(attachedHostUid(attached, itemUidOf(a)))}` : 'detached'}
                  currentHostUid={attachedHostUid(attached, itemUidOf(a))}
                  hosts={validAttachHosts(flatInventory, a)}
                  noneLabel="— detached —"
                  onBind={(shieldUid) => bindAttachment(a, shieldUid)}
                />
              ))}
            </ul>
          </section>
        )}

        {selectedId && runeItems.length > 0 && (
          <section className="cs-group" aria-label="Runes">
            <h3 className="cs-group-title">Runes</h3>
            <ul className="cs-items gm-rune-list">
              {runeItems.map((it) => (
                <RuneItemCard
                  key={itemUidOf(it)}
                  item={it}
                  stock={runeStock}
                  onFill={fillSocket}
                  onClear={clearSocket}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
};

export default GmGearModal;
