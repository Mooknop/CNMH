import React, { useEffect, useState } from 'react';
import { useFoeKit } from '../../hooks/useFoeKit';
import { useFoeStrike } from '../../hooks/useFoeStrike';
import { useFoeCast } from '../../hooks/useFoeCast';
import { useActorFeed } from '../../hooks/useActorFeed';
import { useEncounter } from '../../hooks/useEncounter';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import PF2E_CONDITIONS, { getCondition } from '../../data/pf2eConditions';
import { getActionGlyph } from '../../utils/actionGlyph';
import { PERSISTENT_KEY } from '../../utils/persistentDamage';
import { STRIKE_DEGREE_LABEL } from '../../utils/strikeRelay';
import { DAMAGE_TYPES } from '../../utils/damage';
import { buildDamageApply } from '../../utils/damageRelay';
import { SAVEDONE_KEY, buildSaveRoll } from '../../utils/saveRelay';
import { computeSaveDegree } from '../../utils/saveDegree';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import { monogram } from '../encounter/commandsheet/Dossier';
import PersistentChip from '../encounter/PersistentChip';
import { RELAY, globalKey } from '../../sync/keys';
import './DockEnemyPane.css';

// GM Command Dock enemy pane (#1531 S2/S3) — replaces the enemy-turn stub with
// everything Foundry knows about the acting enemy: identity + vitals + turn
// economy, unredacted defenses/IWR (this is a GM surface — reveal gating stays
// a player-facing concern), and the bridge-pushed offensive kit (strikes,
// spellcasting with live slot/use counts, abilities, skills) from
// cnmh_foekit_global.
//
// S3: strike rows grow roll buttons when the strike rail is live (Foundry
// connected, protocol 6+) — each MAP step, Damage, and Crit execute NATIVELY
// through PF2e's strike pipeline (chat card + Dice So Nice on the table view);
// an optional PC target chip pre-sets the Foundry target so the card carries
// the native degree. The ack feeds a read-out line only — resolution stays in
// Foundry.
//
// S4: spell rows grow Cast buttons (protocol 7+) — SpellcastingEntryPF2e#cast
// posts the card and consumes the REAL slot/innate use in Foundry; the foekit
// re-push refreshes the remaining-count badges, and rows with nothing left to
// spend disable themselves.

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

// `live` (strike rail available) swaps the MAP read-out for roll buttons and
// adds Damage/Crit beside the formulas; read-only otherwise (S2 shape).
const StrikeRow = ({ strike, live, striking, onAttack, onDamage }) => (
  <li className="dock-enemy-strike" data-testid="dock-enemy-strike">
    <div className="dock-enemy-row-head">
      <CostGlyph cost={1} />
      <span className="dock-enemy-row-name">{strike.label}</span>
      {strike.ranged && <span className="dock-enemy-tag">ranged</span>}
      {live ? (
        <span className="dock-enemy-btns">
          {(strike.variantLabels || []).map((label, v) => (
            <button
              key={v}
              type="button"
              className="dock-enemy-btn"
              disabled={striking}
              onClick={() => onAttack(strike, v)}
              aria-label={`Strike: ${strike.label} at ${label}`}
            >
              {label}
            </button>
          ))}
        </span>
      ) : (
        <span className="dock-enemy-strike-maps">
          {(strike.variantLabels || []).join(' / ') || fmtMod(strike.attackModifier ?? 0)}
        </span>
      )}
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
      {live && (
        <span className="dock-enemy-btns">
          <button
            type="button"
            className="dock-enemy-btn"
            disabled={striking}
            onClick={() => onDamage(strike, 'roll')}
            aria-label={`Damage: ${strike.label}`}
          >
            Damage
          </button>
          <button
            type="button"
            className="dock-enemy-btn"
            disabled={striking}
            onClick={() => onDamage(strike, 'critical')}
            aria-label={`Critical damage: ${strike.label}`}
          >
            Crit
          </button>
        </span>
      )}
    </div>
    {(strike.traits || []).length > 0 && (
      <div className="dock-enemy-traits">{strike.traits.join(' · ')}</div>
    )}
  </li>
);

const SAVE_STATS = ['fortitude', 'reflex', 'will'];

// GM vitals controls (#1537 S4): ad-hoc damage/heal via the dmgapply rail
// (typed damage → PF2e nets IWR; heal = negative untyped) and an ad-hoc save
// roll via the saveroll rail against a GM-typed DC. Rails need live Foundry;
// the whole block hides otherwise.
const GmVitalsControls = ({ entryId, name }) => {
  const { sendUpdate } = useSession();
  const [saveAck] = useSyncedState(SAVEDONE_KEY, null);
  const [amount, setAmount] = useState('');
  const [dmgType, setDmgType] = useState('');
  const [saveStat, setSaveStat] = useState('fortitude');
  const [saveDc, setSaveDc] = useState('');
  const [pending, setPending] = useState(null); // { id, stat, dc }
  const [saveResult, setSaveResult] = useState(null);

  useEffect(() => {
    if (!pending || saveAck?.id !== pending.id) return;
    const r = (saveAck.results || []).find((x) => x.entryId === entryId);
    setSaveResult(r
      ? {
          stat: pending.stat,
          dc: pending.dc,
          total: r.total,
          degree: computeSaveDegree({ d20: r.d20, total: r.total, dc: pending.dc }),
        }
      : { failed: true, stat: pending.stat });
    setPending(null);
  }, [saveAck, pending, entryId]);

  const fireDamage = (heal) => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;
    sendUpdate('global', RELAY.DMGAPPLY, buildDamageApply({
      hits: [{
        entryId,
        name,
        amount: heal ? -amt : amt,
        type: heal ? '' : dmgType,
      }],
      sourceName: heal ? 'GM healing (dock)' : 'GM damage (dock)',
    }));
    setAmount('');
  };

  const fireSave = () => {
    const dc = parseInt(saveDc, 10);
    if (!dc || pending) return;
    const req = buildSaveRoll({
      id: `docksave-${Date.now()}`,
      save: saveStat,
      dc,
      targets: [{ entryId, name }],
    });
    setSaveResult(null);
    setPending({ id: req.id, stat: saveStat, dc });
    sendUpdate('global', RELAY.SAVEROLL, req);
  };

  return (
    <div className="dock-enemy-gmctl" data-testid="dock-enemy-gmctl">
      <div className="dock-enemy-gmctl-row">
        <input
          type="number"
          min="1"
          aria-label="Quick damage amount"
          placeholder="Amt"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          aria-label="Quick damage type"
          value={dmgType}
          onChange={(e) => setDmgType(e.target.value)}
        >
          <option value="">untyped</option>
          {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" className="dock-enemy-btn" disabled={!amount} onClick={() => fireDamage(false)}>
          Damage
        </button>
        <button type="button" className="dock-enemy-btn" disabled={!amount} onClick={() => fireDamage(true)}>
          Heal
        </button>
      </div>
      <div className="dock-enemy-gmctl-row">
        <select
          aria-label="Foe save"
          value={saveStat}
          onChange={(e) => setSaveStat(e.target.value)}
        >
          {SAVE_STATS.map((s) => <option key={s} value={s}>{SAVE_LABEL[s]}</option>)}
        </select>
        <input
          type="number"
          min="1"
          aria-label="Foe save DC"
          placeholder="DC"
          value={saveDc}
          onChange={(e) => setSaveDc(e.target.value)}
        />
        <button
          type="button"
          className="dock-enemy-btn"
          disabled={!saveDc || !!pending}
          onClick={fireSave}
        >
          Roll save
        </button>
      </div>
      {saveResult && (
        <p className="dock-enemy-result" data-testid="dock-enemy-save-result" role="status">
          {saveResult.failed ? (
            <><b>{SAVE_LABEL[saveResult.stat]} save</b> — no answer; roll it in Foundry.</>
          ) : (
            <>
              <b>{SAVE_LABEL[saveResult.stat]} save</b> — {saveResult.total} vs DC {saveResult.dc}
              {' · '}{DEGREE_LABELS[saveResult.degree]}
            </>
          )}
        </p>
      )}
    </div>
  );
};

// GM condition editor (#1537 S3): apply any catalog condition (with a value
// when the condition is valued) onto the acting foe's app-side enemyfx record.
const ConditionEditor = ({ onApply }) => {
  const [condId, setCondId] = useState('');
  const [value, setValue] = useState(1);
  const selected = getCondition(condId);
  const apply = () => {
    if (!condId) return;
    onApply(condId, selected?.valued ? value : null);
    setCondId('');
    setValue(1);
  };
  return (
    <div className="dock-enemy-cond-editor">
      <select
        aria-label="Add condition"
        value={condId}
        onChange={(e) => setCondId(e.target.value)}
      >
        <option value="">Add condition…</option>
        {PF2E_CONDITIONS.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {selected?.valued && (
        <input
          type="number"
          aria-label="Condition value"
          min="1"
          max={selected.maxValue || 4}
          value={value}
          onChange={(e) => setValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
        />
      )}
      <button type="button" className="dock-enemy-btn" disabled={!condId} onClick={apply}>
        Apply
      </button>
    </div>
  );
};

// A spell with nothing left to spend: its own innate uses at 0, or (for a
// non-cantrip) the rank's slots at 0. Cantrips never spend.
const spellSpent = (group, spell) =>
  (spell.uses ? spell.uses.value <= 0 : false)
  || (!spell.isCantrip && group.slot ? group.slot.value <= 0 : false);

// One spellcasting entry: header (name · tradition/type · DC/atk), then spells
// grouped by rank — cantrips first, ranks ascending — with slot state per rank
// and per-spell innate uses. `live` (cast rail available) grows Cast buttons.
const SpellcastingBlock = ({ entry, live, casting, onCast }) => {
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
                  {live && (
                    <span className="dock-enemy-btns">
                      <button
                        type="button"
                        className="dock-enemy-btn"
                        disabled={casting || spellSpent(g, sp)}
                        onClick={() => onCast(entry, sp)}
                        aria-label={`Cast: ${sp.name}`}
                      >
                        Cast
                      </button>
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

// tone='ally' (#1537 S6): a FRIENDLY no-charId combatant. Same pane, ally
// styling, "Ally turn" kicker, and NO PC target chips — an ally strikes the
// GM's Foundry-targeted enemy, never a default-offered party member.
const DockEnemyPane = ({ entry, tone = 'foe' }) => {
  const ally = tone === 'ally';
  const kit = useFoeKit(entry.entryId);
  const { strike: sendStrike, striking, available: strikeRailLive } = useFoeStrike();
  const { cast: sendCast, casting, available: castRailLive } = useFoeCast();
  const { encounter } = useEncounter();
  const { actions, spent, reaction } = useActorFeed(entry.entryId);
  const { effectsFor, applyCondition, removeCondition } = useEnemyEffects();
  const { foundryConnected } = useSession();
  const { effects: effectCatalog } = useContent();
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});
  const [persistentMap] = useSyncedState(PERSISTENT_KEY, {});
  // Strike-rail viewport state: the optional target override and the last
  // ack read-out. Local — per-GM-client, like the dock pin.
  const [targetEntryId, setTargetEntryId] = useState(null);
  const [lastStrike, setLastStrike] = useState(null);
  const [lastCast, setLastCast] = useState(null);

  const { name, entryId, defenses, bestiary } = entry;
  const hp = bestiary?.hp || null;
  const traits = bestiary?.traits || [];
  const subLine = [
    ...traits.map(capitalize),
    bestiary?.level != null ? `Level ${bestiary.level}` : null,
  ].filter(Boolean).join(' · ');

  // Ailment chips (#1537 S3): the foe's REAL Foundry conditions off the kit
  // (truth — GM edits those in Foundry), then the app-applied enemyfx ones
  // (player actions + this pane's editor; removable), then persistent damage.
  const foundryConditionChips = (kit?.conditions || []).map((c) => {
    const meta = getCondition(c.slug);
    const showValue = meta?.valued && c.value != null;
    return {
      key: `foundry-${c.slug}`,
      label: `${meta?.name || c.slug}${showValue ? ` ${c.value}` : ''}`,
    };
  });
  const appConditionChips = (effectsFor(entryId).conditions || []).map((c) => {
    const cname = getCondition(c.id)?.name
      || (effectCatalog || []).find((e) => e.id === c.id)?.name
      || c.id;
    const base = c.value != null ? `${cname} ${c.value}` : cname;
    return {
      key: `${c.id}:${c.scopedTo || ''}`,
      label: c.scopedToName ? `${base} to ${c.scopedToName}` : base,
      id: c.id,
      scopedTo: c.scopedTo || null,
    };
  });
  const hasPersistent = (persistentMap?.[entryId] || []).length > 0;
  const hasChips =
    foundryConditionChips.length > 0 || appConditionChips.length > 0 || hasPersistent;
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

  // PC combatants offered as the strike target override.
  const pcTargets = (encounter?.order || []).filter((e) => e.kind === 'pc');

  const fireStrike = async (strikeDef, { variant = 0, damage = null } = {}) => {
    const label = damage
      ? `${strikeDef.label} — ${damage === 'critical' ? 'critical damage' : 'damage'}`
      : `${strikeDef.label} ${strikeDef.variantLabels?.[variant] ?? ''}`.trim();
    const ack = await sendStrike({
      entryId,
      actionIndex: strikeDef.index,
      variant,
      damage,
      targets: targetEntryId ? [targetEntryId] : null,
    });
    setLastStrike(ack
      ? { label, ok: true, total: ack.total, degree: ack.degree, mode: ack.mode }
      : { label, ok: false });
  };

  const fireCast = async (spellEntry, sp) => {
    const ack = await sendCast({
      entryId,
      entryItemId: spellEntry.id,
      spellId: sp.id,
      rank: sp.rank ?? null,
    });
    setLastCast(ack
      ? { label: ack.name || sp.name, rank: ack.rank ?? null, ok: true }
      : { label: sp.name, ok: false });
  };

  const iwrRows = [
    { key: 'weak', label: 'Weak', chips: (defenses?.weaknesses || []).map((w) => `${w.type} ${w.value}`), tone: 'verdant' },
    { key: 'resist', label: 'Resist', chips: (defenses?.resistances || []).map((r) => `${r.type} ${r.value}`), tone: null },
    { key: 'immune', label: 'Immune', chips: defenses?.immunities || [], tone: null },
  ].filter((r) => r.chips.length > 0);

  return (
    <section
      className={`dock-enemy${ally ? ' dock-enemy--ally' : ''}`}
      aria-label={`${ally ? 'Ally' : 'Enemy'} turn: ${name}`}
      data-testid="dock-enemy-pane"
    >
      <div className="gm-dock-acting">
        <span className="gm-dock-acting-kicker">{ally ? 'Ally turn' : 'Enemy turn'}</span>
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
          {(isFlanked || hasChips) && (
            <div className="dock-enemy-chips">
              {isFlanked && <span className="dock-enemy-chip dock-enemy-chip--peril">⚔ flanked</span>}
              {foundryConditionChips.map((c) => (
                <span key={c.key} className="dock-enemy-chip dock-enemy-chip--foundry">{c.label}</span>
              ))}
              {appConditionChips.map((c) => (
                <span key={c.key} className="dock-enemy-chip dock-enemy-chip--peril">
                  {c.label}
                  <button
                    type="button"
                    className="dock-enemy-chip-x"
                    aria-label={`Remove ${c.label}`}
                    onClick={() => removeCondition(entryId, { id: c.id, scopedTo: c.scopedTo })}
                  >
                    ×
                  </button>
                </span>
              ))}
              {/* #1537 S4: the real clear popover (flat check / healed), not a
                  read-only chip — PersistentChip self-hides when untracked. */}
              <PersistentChip entry={entry} />
            </div>
          )}
          <ConditionEditor
            onApply={(id, value) =>
              applyCondition(entryId, { id, value, source: 'GM (dock)' })
            }
          />
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

      {foundryConnected && <GmVitalsControls entryId={entryId} name={name} />}

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
          {!ally && strikeRailLive && pcTargets.length > 0 && (
            <div className="dock-enemy-targets" role="group" aria-label="Strike target">
              <span className="dock-enemy-targets-label">Target</span>
              <button
                type="button"
                className={`dock-enemy-target${targetEntryId ? '' : ' dock-enemy-target--active'}`}
                aria-pressed={!targetEntryId}
                onClick={() => setTargetEntryId(null)}
                title="Leave whatever is targeted in Foundry alone"
              >
                Foundry&apos;s
              </button>
              {pcTargets.map((t) => (
                <button
                  key={t.entryId}
                  type="button"
                  className={`dock-enemy-target${targetEntryId === t.entryId ? ' dock-enemy-target--active' : ''}`}
                  aria-pressed={targetEntryId === t.entryId}
                  onClick={() =>
                    setTargetEntryId((cur) => (cur === t.entryId ? null : t.entryId))
                  }
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {lastStrike && (
            <p className="dock-enemy-result" data-testid="dock-enemy-result" role="status">
              {lastStrike.ok ? (
                <>
                  <b>{lastStrike.label}</b> — {lastStrike.total}
                  {lastStrike.degree != null
                    && ` · ${STRIKE_DEGREE_LABEL[lastStrike.degree] ?? ''}`}
                </>
              ) : (
                <><b>{lastStrike.label}</b> — no answer; check Foundry chat.</>
              )}
            </p>
          )}
          <ul className="dock-enemy-list">
            {kit.strikes.map((s) => (
              <StrikeRow
                key={s.index}
                strike={s}
                live={strikeRailLive}
                striking={striking}
                onAttack={(strikeDef, v) => fireStrike(strikeDef, { variant: v })}
                onDamage={(strikeDef, mode) => fireStrike(strikeDef, { damage: mode })}
              />
            ))}
          </ul>
        </div>
      )}

      {kit && kit.spellcasting?.length > 0 && (
        <div className="dock-enemy-section">
          <h3 className="dock-enemy-section-head">Spellcasting</h3>
          {lastCast && (
            <p className="dock-enemy-result" data-testid="dock-enemy-cast-result" role="status">
              {lastCast.ok ? (
                <>
                  <b>Cast: {lastCast.label}</b>
                  {lastCast.rank != null && ` — rank ${lastCast.rank}`}
                </>
              ) : (
                <><b>{lastCast.label}</b> — no answer; cast it from the Foundry sheet.</>
              )}
            </p>
          )}
          {kit.spellcasting.map((e) => (
            <SpellcastingBlock
              key={e.id || e.name}
              entry={e}
              live={castRailLive}
              casting={casting}
              onCast={fireCast}
            />
          ))}
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
