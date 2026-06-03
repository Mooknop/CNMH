import React, { useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import { recallKnowledgeDC } from '../../utils/recallKnowledge';
import './BestiaryModal.css';

const StatRow = ({ label, value }) =>
  value != null ? (
    <div className="bm-stat-row">
      <span className="bm-stat-label">{label}</span>
      <span className="bm-stat-value">{value}</span>
    </div>
  ) : null;

const SignedMod = ({ value }) => {
  if (value == null) return <span className="bm-stat-value">—</span>;
  return <span className="bm-stat-value">{value >= 0 ? `+${value}` : value}</span>;
};

const EnemyDetail = ({ enemy }) => {
  const { bestiary, defenses, name } = enemy;

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

      <h3 className="bm-detail-name">{name}</h3>

      {bestiary?.level != null && (
        <div className="bm-level">Creature {bestiary.level}</div>
      )}

      {bestiary?.traits?.length > 0 && (
        <div className="bm-traits">
          {bestiary.traits.map((t) => (
            <TraitTag key={t} trait={t} />
          ))}
        </div>
      )}

      {rkDC != null && (
        <div className="bm-rk-dc" data-testid="bm-rk-dc">
          <span className="bm-rk-label">Recall Knowledge DC</span>
          <span className="bm-rk-value">{rkDC}</span>
          {bestiary.rarity !== 'common' && (
            <span className="bm-rarity-tag">{bestiary.rarity}</span>
          )}
        </div>
      )}

      <div className="bm-stats-grid">
        <StatRow label="AC" value={defenses?.ac ?? null} />
        {bestiary?.hp != null && (
          <StatRow label="HP" value={`${bestiary.hp.current} / ${bestiary.hp.max}`} />
        )}
        {bestiary?.perception != null && (
          <div className="bm-stat-row">
            <span className="bm-stat-label">Perception</span>
            <SignedMod value={bestiary.perception} />
          </div>
        )}
        {bestiary?.speed != null && (
          <StatRow label="Speed" value={`${bestiary.speed} ft.`} />
        )}
      </div>

      {defenses?.saves && (
        <div className="bm-saves">
          <span className="bm-saves-label">Saves</span>
          <div className="bm-saves-row">
            <span className="bm-save-item">
              <span className="bm-save-name">Fort</span>
              <SignedMod value={defenses.saves.fortitude} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Ref</span>
              <SignedMod value={defenses.saves.reflex} />
            </span>
            <span className="bm-save-item">
              <span className="bm-save-name">Will</span>
              <SignedMod value={defenses.saves.will} />
            </span>
          </div>
        </div>
      )}

      {defenses?.immunities?.length > 0 && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Immunities</span>
          <span className="bm-iwr-values">{defenses.immunities.join(', ')}</span>
        </div>
      )}
      {defenses?.resistances?.length > 0 && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Resistances</span>
          <span className="bm-iwr-values">
            {defenses.resistances.map((r) => `${r.type} ${r.value}`).join(', ')}
          </span>
        </div>
      )}
      {defenses?.weaknesses?.length > 0 && (
        <div className="bm-iwr">
          <span className="bm-iwr-label">Weaknesses</span>
          <span className="bm-iwr-values">
            {defenses.weaknesses.map((w) => `${w.type} ${w.value}`).join(', ')}
          </span>
        </div>
      )}

      {bestiary?.description && (
        <p className="bm-description">{bestiary.description}</p>
      )}
    </div>
  );
};

const BestiaryModal = ({ isOpen, onClose, enemies, themeColor }) => {
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setFocusId(enemies?.[0]?.entryId ?? null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const focused = (enemies || []).find((e) => e.entryId === focusId) || enemies?.[0] || null;

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
                <span className="bm-list-name">{enemy.name}</span>
                {enemy.bestiary?.level != null && (
                  <span className="bm-list-level">CR {enemy.bestiary.level}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bm-detail-pane">
          {focused
            ? <EnemyDetail enemy={focused} />
            : <p className="bm-empty">No enemies in this encounter.</p>
          }
        </div>
      </div>
    </Modal>
  );
};

export default BestiaryModal;
