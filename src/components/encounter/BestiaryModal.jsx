import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import { recallKnowledgeDC, rkKeyFor } from '../../utils/recallKnowledge';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { useExploitVulnerability } from '../../hooks/useExploitVulnerability';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useContent } from '../../contexts/ContentContext';
import { useCharacter } from '../../hooks/useCharacter';
import RecallKnowledgeResolver from './RecallKnowledgeResolver';
import ExploitVulnerabilityResolver from './ExploitVulnerabilityResolver';
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

const EnemyDetail = ({ enemy, members = [enemy], actingCharId, actingCharName, themeColor }) => {
  const { bestiary, defenses, name } = enemy;
  const rkKey = rkKeyFor(enemy);
  const { recordFor, clearLock } = useRecallKnowledge();
  const { exploitFor } = useExploitVulnerability();
  const { isGm } = useGmAuth();
  const { characters, monsters } = useContent();
  const rawActingChar = characters.find((c) => c.id === actingCharId) || null;
  const actingCharModel = useCharacter(rawActingChar);
  const isThaumaturge = actingCharModel?.flags?.isThaumaturge ?? false;

  // Override controls content; RK controls visibility.
  // override present → use descriptionOverride (empty = GM redacted);
  // no override → fall back to imported bestiary.description.
  const monsterOverride = enemy.creatureKey
    ? (monsters || []).find((m) => String(m.id) === String(enemy.creatureKey))
    : null;
  const effectiveDescription = monsterOverride
    ? monsterOverride.descriptionOverride
    : bestiary?.description;

  // 'none' | 'rk' | 'ev'
  const [resolverOpen, setResolverOpen] = useState('none');

  const record = recordFor(rkKey);
  const exploit = exploitFor(actingCharId);
  const activeExploit = exploit?.targetEntryId === rkKey ? exploit : null;

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

  // Granular reveal flags.
  const identityRevealed     = !!(record.identity);
  const descriptionRevealed  = !!(record.description);
  const hpRevealed           = !!(record.hp);
  const acRevealed           = !!(record.ac);
  const perceptionRevealed   = !!(record.perception);
  const speedRevealed        = !!(record.speed);

  // Partial weakness reveal from Exploit Vulnerability (per-type).
  const weaknessesFullyRevealed = !!(record.iwr?.weaknesses);
  const partialWeaknesses = !weaknessesFullyRevealed
    ? (defenses?.weaknesses || []).filter((w) => record.weaknessesRevealed?.[w.type])
    : [];
  const anyWeaknessRevealed = weaknessesFullyRevealed || partialWeaknesses.length > 0;

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

      {/* Name — redacted until identity revealed */}
      <h3 className="bm-detail-name">
        {identityRevealed ? name : <Redacted width="8ch" label={`${name} name redacted`} />}
      </h3>

      {bestiary?.level != null && (
        <div className="bm-level">
          {identityRevealed ? `Creature ${bestiary.level}` : <Redacted width="6ch" />}
        </div>
      )}

      {/* Traits */}
      {bestiary?.traits?.length > 0 && (
        <div className="bm-traits">
          {identityRevealed
            ? bestiary.traits.map((t) => <TraitTag key={t} trait={t} />)
            : <Redacted width="10ch" />}
        </div>
      )}

      {/* RK DC box — shown once identity is known */}
      {rkDC != null && identityRevealed && (
        <div className="bm-rk-dc" data-testid="bm-rk-dc">
          <span className="bm-rk-label">Recall Knowledge DC</span>
          <span className="bm-rk-value">{rkDC}</span>
          {bestiary.rarity !== 'common' && (
            <span className="bm-rarity-tag">{bestiary.rarity}</span>
          )}
        </div>
      )}

      {/* Active exploit badge */}
      {activeExploit && (
        <div className="bm-exploit-badge" data-testid="bm-exploit-badge">
          <span className="bm-exploit-label">
            {activeExploit.type === 'mortal'
              ? `Mortal Weakness — ${activeExploit.weaknessType} ${activeExploit.value}`
              : `Personal Antithesis — weakness ${activeExploit.value}`}
            {activeExploit.magical ? ' · magical' : ''}
          </span>
        </div>
      )}

      <div className="bm-stats-grid">
        <StatRow label="AC"   value={defenses?.ac ?? null} revealed={acRevealed} redactWidth="3ch" />
        {bestiary?.hp != null && members.length === 1 && (
          <StatRow
            label="HP"
            value={`${bestiary.hp.current} / ${bestiary.hp.max}`}
            revealed={hpRevealed}
          />
        )}
        {/* Multiple same-type tokens: HP is per-token, so list each one. */}
        {members.length > 1 && (
          <div className="bm-hp-list" data-testid="bm-hp-list">
            <span className="bm-stat-label">HP</span>
            {hpRevealed ? (
              <ul className="bm-hp-tokens">
                {members.map((m) => (
                  <li key={m.entryId} className="bm-hp-token">
                    <span className="bm-hp-token-name">{m.name}</span>
                    <span className="bm-stat-value">
                      {m.bestiary?.hp != null
                        ? `${m.bestiary.hp.current} / ${m.bestiary.hp.max}`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Redacted width="6ch" />
            )}
          </div>
        )}
        {bestiary?.perception != null && (
          <div className="bm-stat-row">
            <span className="bm-stat-label">Perception</span>
            <SignedMod value={bestiary.perception} revealed={perceptionRevealed} />
          </div>
        )}
        {bestiary?.speed != null && (
          <StatRow label="Speed" value={`${bestiary.speed} ft.`} revealed={speedRevealed} />
        )}
      </div>

      {/* Saves */}
      {defenses?.saves && (
        <div className="bm-saves">
          <span className="bm-saves-label">Saves</span>
          <div className="bm-saves-row">
            <span className="bm-save-item">
              <span className="bm-save-name">Fort</span>
              <SignedMod value={defenses.saves.fortitude} revealed={record.saves?.fortitude} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Ref</span>
              <SignedMod value={defenses.saves.reflex} revealed={record.saves?.reflex} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Will</span>
              <SignedMod value={defenses.saves.will} revealed={record.saves?.will} />
            </span>
          </div>
        </div>
      )}

      {/* IWR */}
      {defenses?.immunities?.length > 0 && (record.iwr?.immunities) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <span className="bm-iwr-values">{defenses.immunities.join(', ')}</span>
        </div>
      )}
      {defenses?.immunities?.length > 0 && !(record.iwr?.immunities) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <Redacted width="8ch" />
        </div>
      )}

      {defenses?.resistances?.length > 0 && (record.iwr?.resistances) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <span className="bm-iwr-values">
            {defenses.resistances.map((r) => `${r.type} ${r.value}`).join(', ')}
          </span>
        </div>
      )}
      {defenses?.resistances?.length > 0 && !(record.iwr?.resistances) && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <Redacted width="8ch" />
        </div>
      )}

      {/* Weaknesses — supports full reveal (iwr.weaknesses) or partial (weaknessesRevealed) */}
      {defenses?.weaknesses?.length > 0 && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Weaknesses</span>
          {anyWeaknessRevealed ? (
            <span className="bm-iwr-values">
              {weaknessesFullyRevealed
                ? defenses.weaknesses.map((w) => `${w.type} ${w.value}`).join(', ')
                : partialWeaknesses.map((w) => `${w.type} ${w.value}`).join(', ')}
            </span>
          ) : (
            <Redacted width="8ch" />
          )}
        </div>
      )}

      {/* Description — content from override if present, else imported; visibility gated by RK */}
      {descriptionRevealed
        ? effectiveDescription && (
            <p className="bm-description">{effectiveDescription}</p>
          )
        : <Redacted width="100%" label="description redacted" />
      }

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
        {resolverOpen === 'ev' && (
          <ExploitVulnerabilityResolver
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
              {isThaumaturge && (
                <button
                  type="button"
                  className="btn-secondary bm-rk-btn"
                  onClick={() => setResolverOpen('ev')}
                  aria-label="Exploit Vulnerability"
                  data-testid="bm-ev-btn"
                >
                  Exploit Vulnerability
                </button>
              )}
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
    </div>
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
