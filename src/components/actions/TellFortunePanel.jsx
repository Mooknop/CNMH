import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { toGameSeconds } from '../../utils/gameTime';
import { computeSaveDegree } from '../../utils/saveDegree';
import { expiryLabelSecs } from '../../utils/expiry';
import {
  hardDcForLevel,
  auguryOutcome,
  creatureKey,
  ledgerBlocks,
  pruneTellFortuneLedger,
  tellFortuneImmunityEntry,
} from '../../utils/tellFortune';
import './TellFortunePanel.css';
import { APP, syncKey } from '../../sync/keys';

// Jade's Tell Fortune (#578): a 1-hour reading — Fortune-Telling Lore vs a hard
// DC of the target's level produces an augury on a success. Targets can be a
// party PC or a GM-named creature; either way the target becomes immune to her
// Tell Fortune for a week (tracked in the caster-side ledger).
const TellFortunePanel = ({ character }) => {
  const charId = character?.id || 'none';
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });

  const [ledger, setLedger] = useSyncedState(syncKey(APP.TELLFORTUNE, charId), {});

  const [targetSel, setTargetSel] = useState('');
  const [creatureName, setCreatureName] = useState('');
  const [creatureLevel, setCreatureLevel] = useState('');
  const [d20, setD20] = useState('');
  const [total, setTotal] = useState('');
  const [reading, setReading] = useState(null);

  const party = (characters || []).filter((c) => c.id !== character?.id);

  const isOther = targetSel === 'other';
  const pc = party.find((c) => c.id === targetSel);
  const targetLabel = isOther ? creatureName.trim() : (pc?.name || '');
  const targetKey = isOther
    ? (creatureName.trim() ? creatureKey(creatureName) : '')
    : (pc ? pc.id : '');
  const targetLevel = isOther
    ? (creatureLevel === '' ? null : parseInt(creatureLevel, 10))
    : (pc?.level ?? null);

  const dc = targetLevel != null && Number.isFinite(targetLevel) ? hardDcForLevel(targetLevel) : null;
  const blocked = ledgerBlocks(ledger, targetKey, charId, nowSecs);
  const blockedUntil = blocked ? expiryLabelSecs(ledger[targetKey].expireAtSecs, nowSecs) : null;

  const d20Num = parseInt(d20, 10);
  const totalNum = parseInt(total, 10);
  const checkValid = d20Num >= 1 && d20Num <= 20 && Number.isFinite(totalNum);
  const canResolve = !!targetKey && dc != null && !blocked && checkValid;

  const resolve = () => {
    if (!canResolve) return;
    const degree = computeSaveDegree({ d20: d20Num, total: totalNum, dc });
    setReading({ label: targetLabel, degree, outcome: auguryOutcome(degree) });
    // Immune regardless of result — stamp the 1-week entry and prune stale ones.
    setLedger((prev) => ({
      ...pruneTellFortuneLedger(prev, nowSecs),
      [targetKey]: tellFortuneImmunityEntry(charId, nowSecs),
    }));
    setD20('');
    setTotal('');
  };

  const resetTarget = (val) => {
    setTargetSel(val);
    setCreatureName('');
    setCreatureLevel('');
    setReading(null);
  };

  return (
    <div className="tf-wrap">
      <div className="tf-header">
        <span className="tf-title">Tell Fortune</span>
        <span className="tf-cost">1 hour</span>
      </div>

      <label className="tf-field">
        Target
        <select
          className="tf-select"
          value={targetSel}
          onChange={(e) => resetTarget(e.target.value)}
          aria-label="Tell Fortune target"
        >
          <option value="">— select target —</option>
          {party.map((c) => (
            <option key={c.id} value={c.id}>{c.name} (Lvl {c.level})</option>
          ))}
          <option value="other">Other creature…</option>
        </select>
      </label>

      {isOther && (
        <div className="tf-creature-row">
          <label className="tf-field tf-field--grow">
            Name
            <input
              className="tf-input"
              value={creatureName}
              onChange={(e) => setCreatureName(e.target.value)}
              placeholder="e.g. Goblin Warchief"
              aria-label="Creature name"
            />
          </label>
          <label className="tf-field tf-field--narrow">
            Level
            <input
              type="number"
              className="tf-input"
              value={creatureLevel}
              onChange={(e) => setCreatureLevel(e.target.value)}
              placeholder="—"
              aria-label="Creature level"
            />
          </label>
        </div>
      )}

      {targetKey && dc != null && (
        <p className="tf-dc">Fortune-Telling Lore vs <strong>hard DC {dc}</strong> (Lvl {targetLevel}).</p>
      )}

      {blocked ? (
        <p className="tf-immune" role="status">
          {targetLabel || 'That creature'} is already immune to your Tell Fortune — {blockedUntil}.
        </p>
      ) : (
        <>
          <div className="tf-roll-row">
            <label className="tf-field tf-field--narrow">
              d20
              <input
                type="number"
                className="tf-input"
                min={1}
                max={20}
                value={d20}
                onChange={(e) => setD20(e.target.value)}
                placeholder="—"
                aria-label="Raw d20 die"
              />
            </label>
            <label className="tf-field tf-field--narrow">
              Total
              <input
                type="number"
                className="tf-input"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="—"
                aria-label="Check total"
              />
            </label>
          </div>
          <button className="tf-resolve-btn" onClick={resolve} disabled={!canResolve}>
            Tell fortune
          </button>
        </>
      )}

      {reading && (
        <div className={`tf-result tf-result--${reading.outcome.reading ? 'reading' : 'none'}`} role="status">
          <span className="tf-result-degree">{reading.outcome.label}</span>
          <span className="tf-result-note">{reading.outcome.note}</span>
          <span className="tf-result-tail">{reading.label} is now immune for 1 week.</span>
        </div>
      )}
    </div>
  );
};

export default TellFortunePanel;
