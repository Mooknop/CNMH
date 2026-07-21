import React from 'react';
import { useFoeKit } from '../../hooks/useFoeKit';
import { useActorFeed } from '../../hooks/useActorFeed';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { getCondition } from '../../data/pf2eConditions';
import { getActionGlyph } from '../../utils/actionGlyph';
import { PERSISTENT_KEY } from '../../utils/persistentDamage';
import { monogram } from '../encounter/commandsheet/Dossier';
import { RELAY, globalKey } from '../../sync/keys';
import './DockEnemyPane.css';

// GM Command Dock enemy pane (#1531 S2) — replaces the enemy-turn stub with
// everything Foundry knows about the acting enemy: identity + vitals + turn
// economy, unredacted defenses/IWR (this is a GM surface — reveal gating stays
// a player-facing concern), and the bridge-pushed offensive kit (strikes,
// spellcasting with live slot/use counts, abilities, skills) from
// cnmh_foekit_global. Read-only in this slice: the strike/cast rails (S3/S4)
// grow buttons on these rows.

const SAVE_LABEL = { fortitude: 'Fort', reflex: 'Ref', will: 'Will' };

const fmtMod = (v) => (v >= 0 ? `+${v}` : `${v}`);
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Action-cost glyph in the genuine PF2e font, falling back to the raw cost
// text for glyph-less costs ("1 minute" rituals).
const CostGlyph = ({ cost }) => {
  const glyph = getActionGlyph(cost);
  if (glyph) {
    return <span className="pf2e-action-glyph dock-enemy-glyph" aria-hidden="true">{glyph}</span>;
  }
  return cost ? <span className="dock-enemy-cost-text">{cost}</span> : null;
};

// Collapsible rules text — NPC ability/spell descriptions are long; the GM
// pops them open only when adjudicating.
const RulesText = ({ text }) =>
  text ? (
    <details className="dock-enemy-details">
      <summary>Details</summary>
      <p>{text}</p>
    </details>
  ) : null;

const StrikeRow = ({ strike }) => (
  <li className="dock-enemy-strike" data-testid="dock-enemy-strike">
    <div className="dock-enemy-row-head">
      <CostGlyph cost={1} />
      <span className="dock-enemy-row-name">{strike.label}</span>
      {strike.ranged && <span className="dock-enemy-tag">ranged</span>}
      <span className="dock-enemy-strike-maps">
        {(strike.variantLabels || []).join(' / ') || fmtMod(strike.attackModifier ?? 0)}
      </span>
    </div>
    <div className="dock-enemy-strike-damage">
      {(strike.damage || []).map((d, i) => (
        <span key={i} className="dock-enemy-chip dock-enemy-chip--damage">
          {d.formula} {d.type}
        </span>
      ))}
      {(strike.attackEffects || []).map((fx) => (
        <span key={fx} className="dock-enemy-chip">+ {fx}</span>
      ))}
    </div>
    {(strike.traits || []).length > 0 && (
      <div className="dock-enemy-traits">{strike.traits.join(' · ')}</div>
    )}
  </li>
);

// One spellcasting entry: header (name · tradition/type · DC/atk), then spells
// grouped by rank — cantrips first, ranks ascending — with slot state per rank
// and per-spell innate uses.
const SpellcastingBlock = ({ entry }) => {
  const spells = entry.spells || [];
  const cantrips = spells.filter((sp) => sp.isCantrip);
  const ranked = spells.filter((sp) => !sp.isCantrip);
  const ranks = [...new Set(ranked.map((sp) => sp.rank))].sort((a, b) => a - b);

  const groups = [
    ...(cantrips.length ? [{ key: 'cantrips', label: 'Cantrips', spells: cantrips, slot: null }] : []),
    ...ranks.map((rank) => ({
      key: `rank-${rank}`,
      label: `Rank ${rank}`,
      spells: ranked.filter((sp) => sp.rank === rank),
      slot: entry.slots?.[rank] || null,
    })),
  ];

  return (
    <div className="dock-enemy-spellentry" data-testid="dock-enemy-spellentry">
      <div className="dock-enemy-spellentry-head">
        <span className="dock-enemy-row-name">{entry.name}</span>
        <span className="dock-enemy-spellentry-meta">
          {[
            entry.tradition && capitalize(entry.tradition),
            entry.castingType && capitalize(entry.castingType),
            entry.dc != null && `DC ${entry.dc}`,
            entry.attack != null && `atk ${fmtMod(entry.attack)}`,
          ].filter(Boolean).join(' · ')}
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="dock-enemy-rank">
          <div className="dock-enemy-rank-head">
            <span>{g.label}</span>
            {g.slot && (
              <span className="dock-enemy-chip dock-enemy-chip--slots">
                {g.slot.value}/{g.slot.max} slots
              </span>
            )}
          </div>
          <ul className="dock-enemy-list">
            {g.spells.map((sp) => (
              <li key={sp.id || sp.name} className="dock-enemy-spell" data-testid="dock-enemy-spell">
                <div className="dock-enemy-row-head">
                  <CostGlyph cost={sp.cost} />
                  <span className="dock-enemy-row-name">{sp.name}</span>
                  {sp.uses && (
                    <span className="dock-enemy-chip dock-enemy-chip--slots">
                      {sp.uses.value}/{sp.uses.max}
                    </span>
                  )}
                  {sp.save?.statistic && (
                    <span className="dock-enemy-tag">
                      {sp.save.basic ? 'basic ' : ''}{capitalize(sp.save.statistic)}
                    </span>
                  )}
                </div>
                <RulesText text={sp.description} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

const AbilityRow = ({ ability }) => (
  <li className="dock-enemy-ability" data-testid="dock-enemy-ability">
    <div className="dock-enemy-row-head">
      <CostGlyph cost={ability.actionType === 'action' ? ability.actions : ability.actionType} />
      <span className="dock-enemy-row-name">{ability.name}</span>
      {ability.actionType === 'passive' && <span className="dock-enemy-tag">passive</span>}
      {ability.category && <span className="dock-enemy-tag">{ability.category}</span>}
    </div>
    {(ability.traits || []).length > 0 && (
      <div className="dock-enemy-traits">{ability.traits.join(' · ')}</div>
    )}
    <RulesText text={ability.description} />
  </li>
);

const DockEnemyPane = ({ entry }) => {
  const kit = useFoeKit(entry.entryId);
  const { actions, spent, reaction } = useActorFeed(entry.entryId);
  const { effectsFor } = useEnemyEffects();
  const { effects: effectCatalog } = useContent();
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});
  const [persistentMap] = useSyncedState(PERSISTENT_KEY, {});

  const { name, entryId, defenses, bestiary } = entry;
  const hp = bestiary?.hp || null;
  const traits = bestiary?.traits || [];
  const subLine = [
    ...traits.map(capitalize),
    bestiary?.level != null ? `Level ${bestiary.level}` : null,
  ].filter(Boolean).join(' · ');

  // Ailment chips — same sources as the player Dossier (enemyfx conditions,
  // persistent damage, flanked), but unredacted.
  const conditionChips = [
    ...(effectsFor(entryId).conditions || []).map((c) => {
      const cname = getCondition(c.id)?.name
        || (effectCatalog || []).find((e) => e.id === c.id)?.name
        || c.id;
      const base = c.value != null ? `${cname} ${c.value}` : cname;
      return {
        key: `${c.id}:${c.scopedTo || ''}`,
        label: c.scopedToName ? `${base} to ${c.scopedToName}` : base,
      };
    }),
    ...(persistentMap?.[entryId] || []).map((inst) => ({
      key: `persistent-${inst.id}`,
      label: `🩸 ${inst.dice} persistent ${inst.type || 'damage'}${inst.half ? ' (half)' : ''}`,
    })),
  ];
  const isFlanked = !!flankedMap?.[entryId];

  const statCells = [
    { key: 'ac', label: 'AC', value: defenses?.ac ?? null },
    { key: 'perception', label: 'Perc', value: bestiary?.perception != null ? fmtMod(bestiary.perception) : null },
    { key: 'speed', label: 'Speed', value: bestiary?.speed != null ? `${bestiary.speed} ft` : null },
    ...Object.keys(SAVE_LABEL).map((k) => ({
      key: k,
      label: SAVE_LABEL[k],
      value: defenses?.saves?.[k] != null ? fmtMod(defenses.saves[k]) : null,
    })),
  ];

  const iwrRows = [
    { key: 'weak', label: 'Weak', chips: (defenses?.weaknesses || []).map((w) => `${w.type} ${w.value}`), tone: 'verdant' },
    { key: 'resist', label: 'Resist', chips: (defenses?.resistances || []).map((r) => `${r.type} ${r.value}`), tone: null },
    { key: 'immune', label: 'Immune', chips: defenses?.immunities || [], tone: null },
  ].filter((r) => r.chips.length > 0);

  return (
    <section className="dock-enemy" aria-label={`Enemy turn: ${name}`} data-testid="dock-enemy-pane">
      <div className="gm-dock-acting">
        <span className="gm-dock-acting-kicker">Enemy turn</span>
        <span className="gm-dock-acting-name dock-enemy-name-accent">{name}</span>
      </div>

      <header className="dock-enemy-head">
        {bestiary?.img ? (
          <img className="dock-enemy-portrait" src={bestiary.img} alt="" />
        ) : (
          <span className="dock-enemy-portrait dock-enemy-portrait--mono" aria-hidden="true">
            {monogram(name)}
          </span>
        )}
        <div className="dock-enemy-id">
          <span className="dock-enemy-title">{name}</span>
          {subLine && <span className="dock-enemy-sub">{subLine}</span>}
          {(isFlanked || conditionChips.length > 0) && (
            <div className="dock-enemy-chips">
              {isFlanked && <span className="dock-enemy-chip dock-enemy-chip--peril">⚔ flanked</span>}
              {conditionChips.map((c) => (
                <span key={c.key} className="dock-enemy-chip dock-enemy-chip--peril">{c.label}</span>
              ))}
            </div>
          )}
        </div>
        <div className="dock-enemy-economy" aria-label={`${actions - spent} of ${actions} actions left`}>
          <span className="dock-enemy-pips" aria-hidden="true">
            {Array.from({ length: actions }, (_, i) => (
              <span
                key={i}
                className={`dock-enemy-pip${i < spent ? ' dock-enemy-pip--spent' : ''}`}
              />
            ))}
          </span>
          <span className={`dock-enemy-reaction${reaction ? '' : ' dock-enemy-reaction--spent'}`}>
            R
          </span>
        </div>
      </header>

      {hp && hp.current != null && (
        <div className="dock-enemy-hp" data-testid="dock-enemy-hp">
          <div className="dock-enemy-hp-row">
            <span className="dock-enemy-hp-label">Hit Points</span>
            <span className="dock-enemy-hp-value">
              {hp.current}
              {hp.max > 0 && <span className="dock-enemy-hp-max">/{hp.max}</span>}
            </span>
          </div>
          {hp.max > 0 && (
            <div className="dock-enemy-hp-bar" aria-hidden="true">
              <div
                className="dock-enemy-hp-fill"
                style={{ '--hp-pct': `${Math.max(0, Math.min(100, (hp.current / hp.max) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="dock-enemy-grid" data-testid="dock-enemy-defenses">
        {statCells.map((c) => (
          <div key={c.key} className="dock-enemy-cell">
            <span className="dock-enemy-cell-value">{c.value ?? '—'}</span>
            <span className="dock-enemy-cell-label">{c.label}</span>
          </div>
        ))}
      </div>

      {iwrRows.length > 0 && (
        <div className="dock-enemy-iwr">
          {iwrRows.map((r) => (
            <div key={r.key} className="dock-enemy-iwr-row" data-testid={`dock-enemy-${r.key}`}>
              <span className="dock-enemy-iwr-label">{r.label}</span>
              {r.chips.map((chip) => (
                <span
                  key={chip}
                  className={`dock-enemy-chip${r.tone ? ` dock-enemy-chip--${r.tone}` : ''}`}
                >
                  {chip}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {!kit && (
        <p className="dock-enemy-waiting" data-testid="dock-enemy-waiting">
          Strikes and spells arrive from Foundry when the bridge is connected
          (module protocol 5+).
        </p>
      )}

      {kit && kit.strikes?.length > 0 && (
        <div className="dock-enemy-section">
          <h3 className="dock-enemy-section-head">Strikes</h3>
          <ul className="dock-enemy-list">
            {kit.strikes.map((s) => <StrikeRow key={s.index} strike={s} />)}
          </ul>
        </div>
      )}

      {kit && kit.spellcasting?.length > 0 && (
        <div className="dock-enemy-section">
          <h3 className="dock-enemy-section-head">Spellcasting</h3>
          {kit.spellcasting.map((e) => <SpellcastingBlock key={e.id || e.name} entry={e} />)}
        </div>
      )}

      {kit && kit.abilities?.length > 0 && (
        <div className="dock-enemy-section">
          <h3 className="dock-enemy-section-head">Abilities</h3>
          <ul className="dock-enemy-list">
            {kit.abilities.map((a) => <AbilityRow key={a.id || a.name} ability={a} />)}
          </ul>
        </div>
      )}

      {kit && kit.skills?.length > 0 && (
        <div className="dock-enemy-section">
          <h3 className="dock-enemy-section-head">Skills</h3>
          <div className="dock-enemy-chips">
            {kit.skills.map((s) => (
              <span key={s.slug} className="dock-enemy-chip">
                {capitalize(s.slug)} {fmtMod(s.mod)}
              </span>
            ))}
          </div>
        </div>
      )}

      {bestiary?.description && (
        <div className="dock-enemy-section">
          <RulesText text={bestiary.description} />
        </div>
      )}
    </section>
  );
};

export default DockEnemyPane;
