import React, { useState } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useShield } from '../../hooks/useShield';
import { computeSaveDegree } from '../../utils/saveDegree';
import { isShieldBroken } from '../../utils/InventoryUtils';
import { repairHp, repairDc, repairTimeLabel } from '../../utils/repair';
import './RepairShieldPanel.css';

const DEGREE_LABEL = {
  criticalSuccess: 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Critical Failure',
};

// Repair the held shield (#579, shield-only interim). A Crafting check vs the
// shield's level DC restores HP by degree + Crafting rank; Quick Repair just
// cuts the time cost. Targets the shield currently in a hand (hold it to repair
// it); the durability epic (#539) generalizes Repair to other items later.
const RepairShieldPanel = ({ character }) => {
  const charData = useCharacter(character);
  const craftRank = charData?.skillProficiencies?.crafting || 0;
  const hasQuickRepair = (charData?.feats || []).some((f) => f.name === 'Quick Repair');
  const { heldShield, repairShield } = useShield(character?.id, charData?.inventory);

  const [d20, setD20] = useState('');
  const [total, setTotal] = useState('');
  const [result, setResult] = useState(null);

  const timeLabel = repairTimeLabel({ rank: craftRank, quick: hasQuickRepair });

  if (!heldShield) {
    return (
      <div className="rs-wrap">
        <div className="rs-header">
          <span className="rs-title">Repair Shield</span>
          <span className="rs-cost">{timeLabel}</span>
        </div>
        <p className="rs-hint">Hold a shield to repair it.</p>
      </div>
    );
  }

  const cur = heldShield.shield?.hp ?? 0;
  const max = heldShield.maxHp ?? cur;
  const broken = isShieldBroken(heldShield.shield);
  const dc = repairDc(heldShield.shield?.level);
  const full = cur >= max;

  const d20Num = parseInt(d20, 10);
  const totalNum = parseInt(total, 10);
  const checkValid = d20Num >= 1 && d20Num <= 20 && Number.isFinite(totalNum);
  const canRepair = !full && craftRank >= 1 && checkValid;

  const resolve = () => {
    if (!canRepair) return;
    const degree = computeSaveDegree({ d20: d20Num, total: totalNum, dc });
    const restored = repairHp({ rank: craftRank, degree });
    const newHp = repairShield(restored);
    setResult({ degree, restored, newHp: newHp ?? cur });
    setD20('');
    setTotal('');
  };

  return (
    <div className="rs-wrap">
      <div className="rs-header">
        <span className="rs-title">Repair Shield</span>
        <span className="rs-cost">{hasQuickRepair ? `Quick Repair · ${timeLabel}` : timeLabel}</span>
      </div>

      <div className="rs-shield">
        <span className="rs-shield-name">{heldShield.name}</span>
        <span className="rs-shield-hp" data-broken={broken}>
          {cur} / {max} HP{broken ? ' · Broken' : ''}
        </span>
      </div>

      {full ? (
        <p className="rs-hint">Shield is at full HP.</p>
      ) : craftRank < 1 ? (
        <p className="rs-hint">Repair requires trained Crafting.</p>
      ) : (
        <>
          <p className="rs-dc">Crafting vs <strong>DC {dc}</strong>.</p>
          <div className="rs-roll-row">
            <label className="rs-field">
              d20
              <input
                type="number" className="rs-input" min={1} max={20}
                value={d20} onChange={(e) => setD20(e.target.value)}
                placeholder="—" aria-label="Raw d20 die"
              />
            </label>
            <label className="rs-field">
              Total
              <input
                type="number" className="rs-input"
                value={total} onChange={(e) => setTotal(e.target.value)}
                placeholder="—" aria-label="Check total"
              />
            </label>
          </div>
          <button className="rs-repair-btn" onClick={resolve} disabled={!canRepair}>
            Repair
          </button>
        </>
      )}

      {result && (
        <div className={`rs-result rs-result--${result.degree}`} role="status">
          <span className="rs-result-degree">{DEGREE_LABEL[result.degree]}</span>
          <span className="rs-result-note">
            {result.restored > 0 ? `Restored ${result.restored} HP (now ${result.newHp}).` : 'No HP restored.'}
          </span>
        </div>
      )}
    </div>
  );
};

export default RepairShieldPanel;
