import React, { useMemo, useState } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useMoveRune } from '../../hooks/useMoveRune';
import { computeSaveDegree } from '../../utils/saveDegree';
import { flattenInventory } from '../../utils/InventoryUtils';
import { moveRuneDc, moveRuneCost, weaponMovableRunes, MOVE_RUNE_HOURS } from '../../utils/moveRune';
import {
  propertySlotCapacity, freePropertySlots, usedPropertySlots, weaponPropertyRunes,
} from '../../utils/weaponRunes';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import './MoveRunePanel.css';

// Move a rune (#803) — a 1-hour Crafting activity that relocates a property rune
// between a weapon and a runestone. Pick what to move (a rune on a weapon, or a
// filled runestone), choose a target weapon when applying a runestone, enter the
// Crafting check, and resolve it by degree of success. Requires trained
// Crafting; renders nothing when the player has no movable runes.
const MoveRunePanel = ({ character }) => {
  const charData = useCharacter(character);
  const craftRank = charData?.skillProficiencies?.crafting || 0;
  const { move } = useMoveRune(character?.id);

  const [selectedKey, setSelectedKey] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [replaceRuneId, setReplaceRuneId] = useState('');
  const [d20, setD20] = useState('');
  const [total, setTotal] = useState('');
  const [result, setResult] = useState(null);

  const flat = useMemo(() => flattenInventory(charData?.inventory), [charData?.inventory]);

  // Movable sources: each property rune on a weapon (→ runestone), and each
  // filled runestone (→ weapon).
  const options = useMemo(() => {
    const fromWeapons = flat
      .filter((it) => it && it.strikes && it.uid != null)
      .flatMap((it) =>
        weaponMovableRunes(it).map((r) => ({
          key: `w:${it.uid}:${r.id}`,
          kind: 'fromWeapon',
          weapon: it,
          rune: r,
          label: `${r.name} — remove from ${it.name}`,
        })),
      );
    const fromRunestones = flat
      .filter((it) => it && it.runestone && it.runestone.runeRef && it.uid != null)
      .map((it) => {
        const r = it.runestone.rune || { id: it.runestone.runeRef, name: it.runestone.runeRef };
        return {
          key: `r:${it.uid}`,
          kind: 'fromRunestone',
          runestone: it,
          rune: r,
          label: `${r.name} — apply to a weapon`,
        };
      });
    return [...fromWeapons, ...fromRunestones];
  }, [flat]);

  // Target weapons for applying a runestone: a weapon can hold property runes
  // only up to its potency (#607), so a potency-0 weapon is never a target. A
  // full weapon stays selectable — applying then displaces one of its runes.
  const targets = useMemo(
    () => flat.filter((it) => it && it.strikes && it.uid != null && propertySlotCapacity(it.runes) >= 1),
    [flat],
  );

  if (!options.length) return null;

  const selected = options.find((o) => o.key === selectedKey) || null;
  const rune = selected?.rune || null;
  const dc = rune ? moveRuneDc(rune.level) : null;
  const upkeep = rune ? moveRuneCost(rune.price) : 0;

  const d20Num = parseInt(d20, 10);
  const totalNum = parseInt(total, 10);
  const rollValid = d20Num >= 1 && d20Num <= 20 && Number.isFinite(totalNum);
  const needsTarget = selected?.kind === 'fromRunestone';
  const target = needsTarget ? targets.find((t) => t.uid === targetUid) : null;
  // A full target (no free slot) must displace one of its property runes.
  const needsReplace = !!target && freePropertySlots(target) === 0;
  const replaceableRunes = target ? weaponPropertyRunes(target) : [];
  const replaceChosen = !needsReplace || !!replaceRuneId;
  const canMove =
    craftRank >= 1 && !!selected && rollValid &&
    (!needsTarget || (!!target && replaceChosen));

  const resolve = () => {
    if (!canMove) return;
    let res;
    if (selected.kind === 'fromWeapon') {
      res = move({ direction: 'toRunestone', weapon: selected.weapon, rune, d20: d20Num, total: totalNum });
    } else {
      res = move({
        direction: 'toWeapon', weapon: target, runestone: selected.runestone, rune,
        replaceRuneId: needsReplace ? replaceRuneId : undefined,
        d20: d20Num, total: totalNum,
      });
    }
    if (!res) {
      // Rejected (e.g. can't fund the success upkeep). Show the would-be degree.
      const degree = computeSaveDegree({ d20: d20Num, total: totalNum, dc });
      setResult({ degree, rejected: true });
    } else {
      setResult(res);
    }
    setReplaceRuneId('');
    setD20('');
    setTotal('');
  };

  const resultNote = (r) => {
    if (r.rejected) return 'Not enough gold for the move’s upkeep.';
    if (r.outcome.destroyed) return 'The rune was destroyed.';
    if (r.outcome.moved) return r.outcome.costGp ? `Moved — expended ${r.outcome.costGp} gp.` : 'Moved for free.';
    return 'No effect — the rune stays put.';
  };

  return (
    <div className="mr-wrap" data-testid="move-rune-panel">
      <div className="mr-header">
        <span className="mr-title">Move a Rune</span>
        <span className="mr-cost">{MOVE_RUNE_HOURS} hour · Crafting</span>
      </div>

      {craftRank < 1 ? (
        <p className="mr-hint">Moving a rune requires trained Crafting.</p>
      ) : (
        <>
          <label className="mr-field mr-field--block">
            What to move
            <select
              className="mr-select"
              value={selectedKey}
              onChange={(e) => { setSelectedKey(e.target.value); setTargetUid(''); setReplaceRuneId(''); setResult(null); }}
              aria-label="Rune to move"
            >
              <option value="">Select a rune…</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          {needsTarget && (
            <label className="mr-field mr-field--block">
              Apply to
              <select
                className="mr-select"
                value={targetUid}
                onChange={(e) => { setTargetUid(e.target.value); setReplaceRuneId(''); }}
                aria-label="Target weapon"
              >
                <option value="">Select a weapon…</option>
                {targets.map((t) => {
                  const free = freePropertySlots(t);
                  const cap = propertySlotCapacity(t.runes);
                  return (
                    <option key={t.uid} value={t.uid}>
                      {t.name} ({usedPropertySlots(t)}/{cap} slots{free ? '' : ' — full'})
                    </option>
                  );
                })}
              </select>
            </label>
          )}

          {needsTarget && targets.length === 0 && (
            <p className="mr-hint">No weapon with a potency rune to hold a property rune.</p>
          )}

          {needsReplace && (
            <label className="mr-field mr-field--block">
              Replace which rune?
              <select
                className="mr-select"
                value={replaceRuneId}
                onChange={(e) => setReplaceRuneId(e.target.value)}
                aria-label="Rune to replace"
              >
                <option value="">Select a rune to displace…</option>
                {replaceableRunes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
          )}

          {selected && (
            <p className="mr-dc">
              Crafting vs <strong>DC {dc}</strong>. On a success you expend{' '}
              <strong>{upkeep} gp</strong>; on a critical failure the rune is destroyed.
              {needsReplace && ' The displaced rune is moved to a new runestone.'}
            </p>
          )}

          <div className="mr-roll-row">
            <label className="mr-field">
              d20
              <input
                type="number" className="mr-input" min={1} max={20}
                value={d20} onChange={(e) => setD20(e.target.value)}
                placeholder="—" aria-label="Raw d20 die"
              />
            </label>
            <label className="mr-field">
              Total
              <input
                type="number" className="mr-input"
                value={total} onChange={(e) => setTotal(e.target.value)}
                placeholder="—" aria-label="Check total"
              />
            </label>
          </div>

          <button className="mr-move-btn" onClick={resolve} disabled={!canMove}>
            Move rune
          </button>
        </>
      )}

      {result && (
        <div className={`mr-result mr-result--${result.degree}`} role="status">
          <span className="mr-result-degree">{DEGREE_LABELS[result.degree]}</span>
          <span className="mr-result-note">{resultNote(result)}</span>
        </div>
      )}
    </div>
  );
};

export default MoveRunePanel;
