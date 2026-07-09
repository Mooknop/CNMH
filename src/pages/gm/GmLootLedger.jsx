import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { usePartyGold } from '../../hooks/usePartyGold';
import { useSyncedState } from '../../hooks/useSyncedState';
import {
  characterWealth,
  wealthTargetFor,
  wealthBand,
  WEALTH_BANDS,
  FLUSH_RATIO,
  partyExpected,
  partyLevel,
  levelBudget,
} from '../../utils/wealthBenchmark';
import { groupRoomsByArea, areaLootSummary } from '../../utils/lootAreas';
import './GmLootLedger.css';
import { APP, globalKey } from '../../sync/keys';

// World → Loot Ledger (#1281 WB3). Compares each PC's held wealth (live gold +
// inventory value) against the GM Core Table 10-10 lump sum for the level
// ABOVE theirs — treasure earned while playing a level carries a PC to the
// next level's baseline, and the lump sum is the low estimate, so anyone under
// it is genuinely underequipped. The party rollup expresses the total
// surplus/deficit in "levels of treasure" (Table 10-9 total value at the
// party's level, adjusted for party size) to make the number actionable.

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

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

const GmLootLedger = () => {
  const { characters = [], rooms = [], items = [], runes = [] } = useContent();
  const { goldById } = usePartyGold(characters);
  // GM-assigned Dungeon Level per area letter ({ A: 4, ... }) — synced so every
  // GM device agrees; players never read it.
  const [areaLevels, setAreaLevels] = useSyncedState(globalKey(APP.LOOTAREAS), {});

  // Same item+rune merge as the treasure editor/claims, for pricing cache lines.
  const catalogById = useMemo(() => {
    const m = new Map();
    for (const r of runes || []) m.set(r.id, r);
    for (const i of items || []) m.set(i.id, i);
    return m;
  }, [items, runes]);

  const areas = useMemo(() => groupRoomsByArea(rooms), [rooms]);

  const setAreaLevel = (key, raw) => {
    const next = { ...(areaLevels || {}) };
    const lvl = Number(raw);
    if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 20) next[key] = lvl;
    else delete next[key];
    setAreaLevels(next);
  };

  const rows = characters.map((c) => {
    const wealth = characterWealth(c, goldById[c.id]);
    const target = wealthTargetFor(c.level);
    return { character: c, wealth, target, band: wealthBand(wealth.total, c.level) };
  });

  const partyTotal = rows.reduce((sum, r) => sum + r.wealth.total, 0);
  const expected = partyExpected(characters);
  const delta = partyTotal - expected;
  const level = partyLevel(characters);
  const budget = levelBudget(level, characters.length);
  const deltaLevels = budget.totalValue > 0 ? delta / budget.totalValue : 0;

  // WB5: the award-budget reference card. Defaults to the derived party level;
  // the GM can peek ahead/behind without touching the roster.
  const [budgetLevelOverride, setBudgetLevelOverride] = useState(null);
  const budgetLevel = budgetLevelOverride ?? level;
  const awardBudget = levelBudget(budgetLevel, characters.length);

  const richest = rows.reduce((a, b) => (b.wealth.total > (a?.wealth.total ?? -1) ? b : a), null);
  const poorest = rows.reduce((a, b) => (b.wealth.total < (a?.wealth.total ?? Infinity) ? b : a), null);
  const spread = richest && poorest ? richest.wealth.total - poorest.wealth.total : 0;

  return (
    <div className="gm-ledger">
      <header className="gm-ledger-head">
        <h1>Loot Ledger</h1>
        <p className="gm-help">
          Each PC's held wealth (gold + item value) against the Character Wealth
          benchmark for the level <em>above</em> theirs — treasure earned while
          playing a level carries a PC toward the next level's baseline, so a
          level-4 PC is measured against the level-5 amount. Anyone below it is
          underequipped; above ×{FLUSH_RATIO} counts as flush.
        </p>
      </header>

      <section className="gm-ledger-panel" aria-label="Party wealth summary">
        <div className="gm-ledger-summary">
          <div className="gm-ledger-stat">
            <span className="gm-ledger-stat-label">Party wealth</span>
            <span className="gm-ledger-stat-value">{gp(partyTotal)}</span>
          </div>
          <div className="gm-ledger-stat">
            <span className="gm-ledger-stat-label">Benchmark (next level)</span>
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

      <section className="gm-ledger-panel" aria-label="Level loot budget">
        <div className="gm-ledger-budget-head">
          <h2 className="gm-ledger-section-title">Loot budget for level</h2>
          <select
            value={budgetLevel}
            onChange={(e) => setBudgetLevelOverride(Number(e.target.value))}
            aria-label="Budget level"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {budgetLevelOverride != null && budgetLevelOverride !== level && (
            <button type="button" className="btn-secondary" onClick={() => setBudgetLevelOverride(null)}>
              Back to party level ({level})
            </button>
          )}
        </div>
        <p className="gm-help">
          Award this much treasure while the party works through level {budgetLevel}
          {characters.length > 4 && `, adjusted for ${characters.length} PCs`}. Hand
          it out through room caches, shops, and rewards.
        </p>
        <dl className="gm-ledger-budget">
          <div className="gm-ledger-budget-item">
            <dt>Total value</dt>
            <dd>{gp(awardBudget.totalValue)}</dd>
          </div>
          <div className="gm-ledger-budget-item">
            <dt>Permanent items</dt>
            <dd>
              {awardBudget.permanentItems.map((p) => `${p.qty}× level ${p.rank}`).join(', ')}
              {awardBudget.extraPermanentItems > 0 && (
                <span className="gm-ledger-budget-extra">
                  {' '}+{awardBudget.extraPermanentItems} at level {awardBudget.level}
                  {awardBudget.level < 20 ? ` or ${awardBudget.level + 1}` : ''} (extra PC)
                </span>
              )}
            </dd>
          </div>
          <div className="gm-ledger-budget-item">
            <dt>Consumables</dt>
            <dd>
              {awardBudget.consumables.map((c) => `${c.qty}× level ${c.rank}`).join(', ')}
              {awardBudget.extraConsumables > 0 && (
                <span className="gm-ledger-budget-extra">
                  {' '}+{awardBudget.extraConsumables} at level {awardBudget.level}
                  {awardBudget.level < 20 ? `–${awardBudget.level + 1}` : ''} (extra PC)
                </span>
              )}
            </dd>
          </div>
          <div className="gm-ledger-budget-item">
            <dt>Currency</dt>
            <dd>
              {gp(awardBudget.currency)}
              {awardBudget.extraPcs > 0 && (
                <span className="gm-ledger-budget-extra">
                  {' '}(includes the extra-PC share)
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {areas.length > 0 && (
        <section className="gm-ledger-panel" aria-label="Area loot budgets">
          <h2 className="gm-ledger-section-title">Areas</h2>
          <p className="gm-help">
            Loot stocked per dungeon area (rooms grouped by code letter). Assign
            an area a level to check its total against the Party Treasure by
            Level budget for a {characters.length}-PC party. The bar shows how
            much of the area's loot the party has already claimed.
          </p>
          <ul className="gm-ledger-areas">
            {areas.map((area) => {
              const summary = areaLootSummary(area.rooms, catalogById);
              const level = (areaLevels || {})[area.key];
              const budget = level ? levelBudget(level, characters.length) : null;
              const budgetPct = budget && budget.totalValue > 0
                ? Math.round((summary.total / budget.totalValue) * 100)
                : null;
              const claimedPct = summary.total > 0
                ? Math.round((summary.claimed / summary.total) * 100)
                : 0;
              return (
                <li key={area.key} className="gm-ledger-area">
                  <div className="gm-ledger-area-head">
                    <span className="gm-ledger-area-key">{area.key}</span>
                    <span className="gm-ledger-area-site">{area.site || 'Unknown site'}</span>
                    <label className="gm-ledger-area-level">
                      Dungeon Level
                      <select
                        value={level || ''}
                        onChange={(e) => setAreaLevel(area.key, e.target.value)}
                        aria-label={`Area ${area.key} dungeon level`}
                      >
                        <option value="">—</option>
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="gm-ledger-area-stats">
                    <span className="gm-ledger-area-total"><strong>{gp(summary.total)}</strong> stocked</span>
                    <span>{gp(summary.claimed)} claimed · {gp(summary.remaining)} unclaimed</span>
                    <span>
                      {summary.distributedRooms} of {summary.lootRooms} loot room
                      {summary.lootRooms === 1 ? '' : 's'} distributed
                    </span>
                  </div>
                  {summary.total > 0 && (
                    <div
                      className="gm-ledger-bar gm-ledger-area-bar"
                      role="meter"
                      aria-label={`Area ${area.key} claimed loot`}
                      aria-valuenow={claimedPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="gm-ledger-bar-fill" style={{ width: `${claimedPct}%` }} />
                    </div>
                  )}
                  {budget && (
                    <div className={`gm-ledger-area-budget${summary.total < budget.totalValue ? ' is-behind' : ''}`}>
                      {gp(summary.total)} of the {gp(budget.totalValue)} level-{level} budget stocked
                      {budgetPct != null && ` (${budgetPct}%)`}
                      {summary.total < budget.totalValue && ` — ${gp(budget.totalValue - summary.total)} short`}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};

export default GmLootLedger;
