import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { rkKeyFor } from '../../utils/recallKnowledge';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { useBestiaryNotes } from '../../hooks/useBestiaryNotes';
import { useExploitVulnerability } from '../../hooks/useExploitVulnerability';
import { useGmAuth } from '../../hooks/useGmAuth';
import BestiaryEntry from '../bestiary/BestiaryEntry';
import RecallKnowledgeResolver from './RecallKnowledgeResolver';
import './BestiaryModal.css';

const EnemyDetail = ({ enemy, members = [enemy], actingCharId, actingCharName, themeColor }) => {
  const rkKey = rkKeyFor(enemy);
  const { recordFor, clearLock } = useRecallKnowledge();
  const { noteFor } = useBestiaryNotes();
  const { exploitFor } = useExploitVulnerability();
  const { isGm } = useGmAuth();

  // 'none' | 'rk'
  const [resolverOpen, setResolverOpen] = useState('none');

  const record = recordFor(rkKey);
  const exploit = exploitFor(actingCharId);
  const activeExploit = exploit?.targetEntryId === rkKey ? exploit : null;

  const lockedForMe = !!(record.lockedOut?.[actingCharId]);

  // Active exploit badge — slotted into the shared entry below the RK-DC box.
  const exploitBadge = activeExploit ? (
    <div className="bm-exploit-badge" data-testid="bm-exploit-badge">
      <span className="bm-exploit-label">
        {activeExploit.type === 'mortal'
          ? `Mortal Weakness — ${activeExploit.weaknessType} ${activeExploit.value}`
          : `Personal Antithesis — weakness ${activeExploit.value}`}
        {activeExploit.magical ? ' · magical' : ''}
      </span>
    </div>
  ) : null;

  return (
    <>
      <BestiaryEntry
        enemy={enemy}
        members={members}
        record={record}
        badge={exploitBadge}
        variant="compact"
        note={noteFor(enemy.creatureKey)}
      />

      {/* Recall Knowledge + Exploit Vulnerability triggers */}
      <div className="bm-rk-section">
        {resolverOpen === 'rk' && (
          <RecallKnowledgeResolver
            enemy={enemy}
            actingCharId={actingCharId}
            actingCharName={actingCharName}
            themeColor={themeColor}
            onDone={() => setResolverOpen('none')}
          />
        )}
        {resolverOpen === 'none' && (
          <>
            <div className="bm-action-row">
              <button
                type="button"
                className="btn-secondary bm-rk-btn"
                onClick={() => setResolverOpen('rk')}
                disabled={lockedForMe}
                aria-label="Recall Knowledge"
              >
                Recall Knowledge
              </button>
            </div>
            {lockedForMe && (
              <p className="bm-rk-locked" data-testid="bm-rk-locked">
                You can&apos;t recall more about this creature.
              </p>
            )}
            {/* GM unlock — show locked-out character names */}
            {isGm && Object.keys(record.lockedOut || {}).length > 0 && (
              <div className="bm-rk-gm-locks" data-testid="bm-rk-gm-locks">
                <span className="bm-rk-gm-label">Locked out:</span>
                {Object.keys(record.lockedOut).map((charId) => (
                  <button
                    key={charId}
                    type="button"
                    className="bm-rk-unlock-btn"
                    aria-label={`Clear lockout for ${charId}`}
                    onClick={() => clearLock(rkKey, charId)}
                  >
                    {charId} ×
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

const BestiaryModal = ({ isOpen, onClose, enemies, themeColor, actingCharId, actingCharName }) => {
  const [focusKey, setFocusKey] = useState(null);

  // Collapse same-type enemies into one row per creatureKey, preserving order.
  // Each group: { key, rep (representative type-level block), members (per-token) }.
  const groups = useMemo(() => {
    const byKey = new Map();
    (enemies || []).forEach((enemy) => {
      const key = rkKeyFor(enemy) ?? enemy.entryId;
      if (byKey.has(key)) {
        byKey.get(key).members.push(enemy);
      } else {
        byKey.set(key, { key, rep: enemy, members: [enemy] });
      }
    });
    return [...byKey.values()];
  }, [enemies]);

  // Open-only: seed focus to the first group. Re-running on `groups` changes
  // would yank the player's focus when enemies update mid-fight.
  useEffect(() => {
    if (isOpen) {
      setFocusKey(groups[0]?.key ?? null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusedGroup = groups.find((g) => g.key === focusKey) || groups[0] || null;

  const { recordFor } = useRecallKnowledge();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bestiary"
      themeColor={themeColor}
      maxWidth="820px"
    >
      <div className="bm-layout">
        <div className="bm-list" role="listbox" aria-label="Enemy list">
          {groups.map((group) => {
            const { rep, members } = group;
            const isFocused = group.key === (focusedGroup?.key ?? null);
            const record    = recordFor(group.key);
            const identityRevealed = record.identity;
            return (
              <button
                key={group.key}
                type="button"
                role="option"
                aria-selected={isFocused}
                className={`bm-list-item${isFocused ? ' bm-list-item--active' : ''}`}
                onClick={() => setFocusKey(group.key)}
              >
                {rep.bestiary?.img && (
                  <img
                    className="bm-thumb"
                    src={rep.bestiary.img}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <span className="bm-list-name">
                  {identityRevealed
                    ? rep.name
                    : <span className="bm-redacted bm-redacted--inline" style={{ width: '7ch' }} aria-label="name redacted" aria-hidden="true" />}
                </span>
                {members.length > 1 && (
                  <span className="bm-list-count" aria-label={`${members.length} of this type`}>
                    ×{members.length}
                  </span>
                )}
                {rep.bestiary?.level != null && identityRevealed && (
                  <span className="bm-list-level">CR {rep.bestiary.level}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bm-detail-pane">
          {focusedGroup
            ? (
              <EnemyDetail
                enemy={focusedGroup.rep}
                members={focusedGroup.members}
                actingCharId={actingCharId}
                actingCharName={actingCharName}
                themeColor={themeColor}
              />
            )
            : <p className="bm-empty">No enemies in this encounter.</p>
          }
        </div>
      </div>
    </Modal>
  );
};

export default BestiaryModal;
