import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import useCharacter from '../../hooks/useCharacter';
import { flattenInventory } from '../../utils/InventoryUtils';
import {
  isTalisman, validAffixHosts, affixedHostUid, affix, unaffix, itemUidOf,
} from '../../utils/affix';
import {
  isShieldAttachment, validAttachHosts, attachedHostUid, attach, unattach,
} from '../../utils/shieldAttach';
import './CharacterStateModal.css';

// GM Gear management (#gm-gear). Bind/unbind a character's talismans and shield
// attachments directly — exempt from the player-side 10-minute activity, and
// (like CharacterStateModal) written via sendUpdate straight to the DO so it also
// works in the offline sandbox where player writes are frozen. Every change logs
// a GM audit line. Weapon/armor rune management is a follow-up slice.

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

const GmGearModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
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

  // Local mirrors of the two overlays, seeded from the live snapshot; writes go
  // straight to the DO (sandbox-exempt) and we update the mirror optimistically.
  const [affixed, setAffixedLocal] = useState({});
  const [attached, setAttachedLocal] = useState({});
  useEffect(() => {
    if (!isOpen || !selectedId) return;
    setAffixedLocal(getState(selectedId, 'affixed') || {});
    setAttachedLocal(getState(selectedId, 'attached') || {});
  }, [isOpen, selectedId, getState]);

  const write = (type, next, logText) => {
    try {
      window.localStorage.setItem(`cnmh_${type}_${selectedId}`, JSON.stringify(next));
    } catch { /* quota — sync still carries it */ }
    sendUpdate(selectedId, type, next);
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

  const hasGear = talismans.length > 0 || attachments.length > 0;

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
          <p className="cs-empty gm-help">This character has no talismans or shield attachments.</p>
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
      </div>
    </Modal>
  );
};

export default GmGearModal;
