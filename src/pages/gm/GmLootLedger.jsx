import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { usePartyGold } from '../../hooks/usePartyGold';
import {
  characterWealth,
  lumpSumFor,
  wealthBand,
  WEALTH_BANDS,
  FLUSH_RATIO,
  partyExpected,
  partyLevel,
  levelBudget,
} from '../../utils/wealthBenchmark';
import './GmLootLedger.css';

// World → Loot Ledger (#1281 WB3). Compares each PC's held wealth (live gold +
// inventory value) against the GM Core Table 10-10 lump sum for their level —
// the low estimate of on-level wealth, so anyone under it is genuinely
// underequipped. The party rollup expresses the total surplus/deficit in
// "levels of treasure" (Table 10-9 total value at the party's level, adjusted
// for party size) to make the number actionable.

const gp = (n) => `${parseFloat((Number(n) || 0).toFixed(2)).toLocaleString()} gp`;

// Bar geometry: the track spans 0 → 2× the lump sum, so the benchmark tick
// sits mid-track and the flush tick at FLUSH_RATIO/2 of the width.
const BAR_SCALE = 2;
const barWidth = (total, target) =>
  `${Math.min(100, (target > 0 ? total / target : 0) / BAR_SCALE * 100)}%`;

const BAND_LABEL = {
  [WEALTH_BANDS.BEHIND]: 'Behind',
  [WEALTH_BANDS.HEALTHY]: 'Healthy',
  [WEALTH_BANDS.FLUSH]: 'Flush',
};

const GmLootLedger = () => {
  const { characters = [] } = useContent();
  const { goldById } = usePartyGold(characters);

  const rows = characters.map((c) => {
    const wealth = characterWealth(c, goldById[c.id]);
    const target = lumpSumFor(c.level);
    return { character: c, wealth, target, band: wealthBand(wealth.total, c.level) };
  });

  const partyTotal = rows.reduce((sum, r) => sum + r.wealth.total, 0);
  const expected = partyExpected(characters);
  const delta = partyTotal - expected;
  const level = partyLevel(characters);
  const budget = levelBudget(level, characters.length);
  const deltaLevels = budget.totalValue > 0 ? delta / budget.totalValue : 0;

  const richest = rows.reduce((a, b) => (b.wealth.total > (a?.wealth.total ?? -1) ? b : a), null);
  const poorest = rows.reduce((a, b) => (b.wealth.total < (a?.wealth.total ?? Infinity) ? b : a), null);
  const spread = richest && poorest ? richest.wealth.total - poorest.wealth.total : 0;

  return (
    <div className="gm-ledger">
      <header className="gm-ledger-head">
        <h1>Loot Ledger</h1>
        <p className="gm-help">
          Each PC's held wealth (gold + item value) against the Character Wealth
          benchmark for their level. The benchmark is the <em>low</em> estimate —
          a freshly made character of that level starts with this much — so
          anyone below it is underequipped. Above ×{FLUSH_RATIO} counts as flush.
        </p>
      </header>

      <section className="gm-ledger-panel" aria-label="Party wealth summary">
        <div className="gm-ledger-summary">
          <div className="gm-ledger-stat">
            <span className="gm-ledger-stat-label">Party wealth</span>
            <span className="gm-ledger-stat-value">{gp(partyTotal)}</span>
          </div>
          <div className="gm-ledger-stat">
            <span className="gm-ledger-stat-label">Benchmark (level {level})</span>
            <span className="gm-ledger-stat-value">{gp(expected)}</span>
          </div>
          <div className="gm-ledger-stat">
            <span className="gm-ledger-stat-label">Delta</span>
            <span className={`gm-ledger-stat-value ${delta < 0 ? 'is-behind' : 'is-ahead'}`}>
              {delta >= 0 ? '+' : '−'}{gp(Math.abs(delta))}
              <span className="gm-ledger-stat-sub">
                {' '}≈ {Math.abs(deltaLevels).toFixed(1)} level{Math.abs(deltaLevels) >= 1.05 ? 's' : ''} of
                treasure {delta < 0 ? 'owed' : 'ahead'}
              </span>
            </span>
          </div>
          <div className="gm-ledger-stat">
            <span className="gm-ledger-stat-label">Spread</span>
            <span className="gm-ledger-stat-value">
              {gp(spread)}
              {richest && poorest && richest !== poorest && (
                <span className="gm-ledger-stat-sub">
                  {' '}{richest.character.name} ↔ {poorest.character.name}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="gm-ledger-panel" aria-label="Per-character wealth">
        <ul className="gm-ledger-rows">
          {rows.map(({ character: c, wealth, target, band }) => (
            <li key={c.id} className={`gm-ledger-row band-${band}`}>
              <div className="gm-ledger-row-head">
                <span className="gm-ledger-name">{c.name}</span>
                <span className="gm-ledger-level">Lvl {c.level}</span>
                <span className={`gm-ledger-band band-${band}`}>{BAND_LABEL[band]}</span>
                <span className="gm-ledger-amounts">
                  <strong>{gp(wealth.total)}</strong> / {gp(target)}
                </span>
              </div>
              <div
                className="gm-ledger-bar"
                role="meter"
                aria-label={`${c.name} wealth vs benchmark`}
                aria-valuenow={Math.round(wealth.total)}
                aria-valuemin={0}
                aria-valuemax={Math.round(target * BAR_SCALE)}
              >
                <div className="gm-ledger-bar-fill" style={{ width: barWidth(wealth.total, target) }} />
                <div className="gm-ledger-bar-tick tick-benchmark" title={`Benchmark ${gp(target)}`} />
                <div
                  className="gm-ledger-bar-tick tick-flush"
                  style={{ left: `${(FLUSH_RATIO / BAR_SCALE) * 100}%` }}
                  title={`Flush above ${gp(target * FLUSH_RATIO)}`}
                />
              </div>
              <div className="gm-ledger-breakdown">
                {gp(wealth.gold)} coin · {gp(wealth.items)} in items
              </div>
            </li>
          ))}
        </ul>
        {!rows.length && <p className="gm-help">No characters loaded yet.</p>}
      </section>
    </div>
  );
};

export default GmLootLedger;
