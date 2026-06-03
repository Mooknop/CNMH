import React, { useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import { recallKnowledgeDC } from '../../utils/recallKnowledge';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { useGmAuth } from '../../hooks/useGmAuth';
import RecallKnowledgeResolver from './RecallKnowledgeResolver';
import './BestiaryModal.css';

// A solid redacted bar in place of a hidden value.
const Redacted = ({ width = '4ch', label = 'redacted' }) => (
  <span
    className="bm-redacted"
    style={{ width }}
    aria-label={label}
    aria-hidden="true"
  />
);

const StatRow = ({ label, value, revealed, redactWidth = '4ch' }) => {
  if (!revealed) {
    return (
      <div className="bm-stat-row">
        <span className="bm-stat-label">{label}</span>
        <Redacted width={redactWidth} />
      </div>
    );
  }
  return value != null ? (
    <div className="bm-stat-row">
      <span className="bm-stat-label">{label}</span>
      <span className="bm-stat-value">{value}</span>
    </div>
  ) : null;
};

const SignedMod = ({ value, revealed }) => {
  if (!revealed) return <Redacted width="3ch" />;
  if (value == null) return <span className="bm-stat-value">—</span>;
  return <span className="bm-stat-value">{value >= 0 ? `+${value}` : value}</span>;
};

const EnemyDetail = ({ enemy, actingCharId, actingCharName, themeColor }) => {
  const { bestiary, defenses, name, entryId } = enemy;
  const { recordFor, clearLock } = useRecallKnowledge();
  const { isGm } = useGmAuth();
  const [resolverOpen, setResolverOpen] = useState(false);

  const record = recordFor(entryId);
  const all    = record.all;
  const lockedForMe = !!(record.lockedOut?.[actingCharId]);

  if (!bestiary && !defenses) {
    return (
      <div className="bm-detail" data-testid="bm-detail">
        <h3 className="bm-detail-name">{name}</h3>
        <p className="bm-no-statblock">No Foundry stat block available for this combatant.</p>
      </div>
    );
  }

  const rkDC = bestiary?.level != null
    ? recallKnowledgeDC(bestiary.level, bestiary.rarity)
    : null;

  return (
    <div className="bm-detail" data-testid="bm-detail">
      {/* Image — always visible */}
      {bestiary?.img && (
        <div className="bm-img-wrap">
          <img
            className="bm-creature-img"
            src={bestiary.img}
            alt={name}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Name — redacted until crit success */}
      <h3 className="bm-detail-name">
        {all ? name : <Redacted width="8ch" label={`${name} name redacted`} />}
      </h3>

      {bestiary?.level != null && (
        <div className="bm-level">
          {all ? `Creature ${bestiary.level}` : <Redacted width="6ch" />}
        </div>
      )}

      {/* Traits */}
      {bestiary?.traits?.length > 0 && (
        <div className="bm-traits">
          {all
            ? bestiary.traits.map((t) => <TraitTag key={t} trait={t} />)
            : <Redacted width="10ch" />}
        </div>
      )}

      {/* RK DC box — only shown once fully revealed */}
      {rkDC != null && all && (
        <div className="bm-rk-dc" data-testid="bm-rk-dc">
          <span className="bm-rk-label">Recall Knowledge DC</span>
          <span className="bm-rk-value">{rkDC}</span>
          {bestiary.rarity !== 'common' && (
            <span className="bm-rarity-tag">{bestiary.rarity}</span>
          )}
        </div>
      )}

      <div className="bm-stats-grid">
        <StatRow label="AC"         value={defenses?.ac ?? null} revealed={all} redactWidth="3ch" />
        {bestiary?.hp != null && (
          <StatRow
            label="HP"
            value={`${bestiary.hp.current} / ${bestiary.hp.max}`}
            revealed={record.hp || all}
          />
        )}
        {bestiary?.perception != null && (
          <div className="bm-stat-row">
            <span className="bm-stat-label">Perception</span>
            <SignedMod value={bestiary.perception} revealed={all} />
          </div>
        )}
        {bestiary?.speed != null && (
          <StatRow label="Speed" value={`${bestiary.speed} ft.`} revealed={all} />
        )}
      </div>

      {/* Saves */}
      {defenses?.saves && (
        <div className="bm-saves">
          <span className="bm-saves-label">Saves</span>
          <div className="bm-saves-row">
            <span className="bm-save-item">
              <span className="bm-save-name">Fort</span>
              <SignedMod value={defenses.saves.fortitude} revealed={record.saves?.fortitude || all} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Ref</span>
              <SignedMod value={defenses.saves.reflex} revealed={record.saves?.reflex || all} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Will</span>
              <SignedMod value={defenses.saves.will} revealed={record.saves?.will || all} />
            </span>
          </div>
        </div>
      )}

      {/* IWR */}
      {defenses?.immunities?.length > 0 && (record.iwr?.immunities || all) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <span className="bm-iwr-values">{defenses.immunities.join(', ')}</span>
        </div>
      )}
      {defenses?.immunities?.length > 0 && !(record.iwr?.immunities || all) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <Redacted width="8ch" />
        </div>
      )}

      {defenses?.resistances?.length > 0 && (record.iwr?.resistances || all) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <span className="bm-iwr-values">
            {defenses.resistances.map((r) => `${r.type} ${r.value}`).join(', ')}
          </span>
        </div>
      )}
      {defenses?.resistances?.length > 0 && !(record.iwr?.resistances || all) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <Redacted width="8ch" />
        </div>
      )}

      {defenses?.weaknesses?.length > 0 && (record.iwr?.weaknesses || all) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Weaknesses</span>
          <span className="bm-iwr-values">
            {defenses.weaknesses.map((w) => `${w.type} ${w.value}`).join(', ')}
          </span>
        </div>
      )}
      {defenses?.weaknesses?.length > 0 && !(record.iwr?.weaknesses || all) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Weaknesses</span>
          <Redacted width="8ch" />
        </div>
      )}

      {/* Description */}
      {(record.description || all)
        ? bestiary?.description && (
            <p className="bm-description">{bestiary.description}</p>
          )
        : <Redacted width="100%" label="description redacted" />
      }

      {/* Recall Knowledge trigger */}
      <div className="bm-rk-section">
        {resolverOpen ? (
          <RecallKnowledgeResolver
            enemy={enemy}
            actingCharId={actingCharId}
            actingCharName={actingCharName}
            themeColor={themeColor}
            onDone={() => setResolverOpen(false)}
          />
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary bm-rk-btn"
              onClick={() => setResolverOpen(true)}
              disabled={lockedForMe}
              aria-label="Recall Knowledge"
            >
              Recall Knowledge
            </button>
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
                    onClick={() => clearLock(entryId, charId)}
                  >
                    {charId} ×
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const BestiaryModal = ({ isOpen, onClose, enemies, themeColor, actingCharId, actingCharName }) => {
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setFocusId(enemies?.[0]?.entryId ?? null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const focused = (enemies || []).find((e) => e.entryId === focusId) || enemies?.[0] || null;

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
          {(enemies || []).map((enemy) => {
            const isFocused = enemy.entryId === (focused?.entryId ?? null);
            const record    = recordFor(enemy.entryId);
            const allRevealed = record.all;
            return (
              <button
                key={enemy.entryId}
                type="button"
                role="option"
                aria-selected={isFocused}
                className={`bm-list-item${isFocused ? ' bm-list-item--active' : ''}`}
                onClick={() => setFocusId(enemy.entryId)}
              >
                {enemy.bestiary?.img && (
                  <img
                    className="bm-thumb"
                    src={enemy.bestiary.img}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <span className="bm-list-name">
                  {allRevealed
                    ? enemy.name
                    : <span className="bm-redacted bm-redacted--inline" style={{ width: '7ch' }} aria-label="name redacted" aria-hidden="true" />}
                </span>
                {enemy.bestiary?.level != null && allRevealed && (
                  <span className="bm-list-level">CR {enemy.bestiary.level}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bm-detail-pane">
          {focused
            ? (
              <EnemyDetail
                enemy={focused}
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
