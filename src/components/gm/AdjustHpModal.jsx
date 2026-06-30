import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useResolvedEffects } from '../../hooks/useResolvedEffects';
import { useMinions } from '../../hooks/useMinions';
import { useSummons } from '../../hooks/useSummons';
import { useEncounter } from '../../hooks/useEncounter';
import { minionRoster } from '../../utils/minionUtils';
import { DAMAGE_TYPES } from '../../utils/damage';
import { clearsOnDamageType, resistanceFor, weaknessFor } from '../../utils/EffectUtils';
import PF2E_EFFECTS from '../../data/pf2eEffects';
import './AdjustHpModal.css';

const EMPTY_HP = { current: 0, max: 0, temp: 0, dying: 0, wounded: 0, doomed: 0 };

// A PC selects by its plain id (stable contract for existing callers/e2e); allied
// minions and GM summons (#261) are prefixed so the kinds never collide:
//   <charId>                 → the PC's own cnmh_hp_<charId>
//   minion:<ownerId>:<role>  → an entry in the owner's cnmh_minions_<ownerId>
//   summon:<entryId>         → a summon in cnmh_summons_global
const parseSelection = (value) => {
  if (!value) return null;
  if (value.startsWith('minion:')) {
    const [, ownerId, role] = value.split(':');
    return { kind: 'minion', ownerId, role };
  }
  if (value.startsWith('summon:')) {
    return { kind: 'summon', entryId: value.slice('summon:'.length) };
  }
  return { kind: 'char', id: value };
};

const AdjustHpModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { appendLog } = useEncounter();
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('heal');
  const [damageType, setDamageType] = useState('');

  const sel = parseSelection(selectedId);

  // Both sources are subscribed unconditionally (hooks can't be conditional);
  // only the one matching the current selection is read/written.
  const charId = sel?.kind === 'char' ? sel.id : 'none';
  const [charHp, setCharHp] = useSyncedState(
    `cnmh_hp_${charId}`,
    () => ({ ...EMPTY_HP }),
  );
  const [charEffects, setCharEffects] = useSyncedState(`cnmh_effects_${charId}`, () => []);
  // Full resistance picture for the selected PC: app + Foundry effects + worn
  // gear (#922 S2). charEffects above is still the app-owned store the #275
  // clear writes to; resolvedEffects/resolvedCatalog drive the resistance read
  // so worn items (Energy Robe, …) mitigate incoming damage too.
  const selectedChar = sel?.kind === 'char' ? (characters || []).find((c) => c.id === charId) : null;
  const selectedCharData = useCharacter(selectedChar);
  const { effects: resolvedEffects, catalog: resolvedCatalog } =
    useResolvedEffects(charId, selectedCharData?.inventory);
  const minionOwner = sel?.kind === 'minion' ? sel.ownerId : 'none';
  const { getHp, damage, heal } = useMinions(minionOwner);
  const { summons, getHp: getSummonHp, setHp: setSummonHp } = useSummons();

  // The authored max HP for the selected minion (from owner character data).
  const minionMax = useMemo(() => {
    if (sel?.kind !== 'minion') return 0;
    const owner = (characters || []).find((c) => c.id === sel.ownerId);
    const entry = minionRoster(owner).find((r) => r.role === sel.role);
    return entry?.maxHp ?? 0;
  }, [sel, characters]);

  const hp =
    sel?.kind === 'minion' ? getHp(sel.role, minionMax)
    : sel?.kind === 'summon' ? { ...getSummonHp(sel.entryId), temp: 0 }
    : charHp;

  // Preview of the weakness/resistance that will modify the entered typed damage
  // (#900/#918), surfaced beside the damage-type picker. PCs only — minions/
  // summons carry no effects here.
  const preview = useMemo(
    () => (sel?.kind === 'char' && mode === 'damage' && damageType
      ? {
          weakness: weaknessFor(resolvedEffects, damageType, resolvedCatalog),
          resistance: resistanceFor(resolvedEffects, damageType, resolvedCatalog),
        }
      : { weakness: 0, resistance: 0 }),
    [sel?.kind, mode, damageType, resolvedEffects, resolvedCatalog],
  );

  const handleApply = () => {
    const n = parseInt(amount, 10);
    if (!sel || !n || n < 1 || !hp) return;

    if (sel.kind === 'minion') {
      if (mode === 'heal') heal(sel.role, n, minionMax);
      else damage(sel.role, n, minionMax);
    } else if (sel.kind === 'summon') {
      const next = mode === 'heal'
        ? { current: Math.min(hp.max, hp.current + n), max: hp.max }
        : { current: Math.max(0, hp.current - n), max: hp.max };
      setSummonHp(sel.entryId, next);
    } else {
      // Typed weakness/resistance on incoming damage (#900/#918). Reads the
      // resolved set (app + Foundry + worn gear). Per PF2e, weakness ADDS first
      // and resistance REDUCES after, on the running total; floors at 0. Neither
      // stacks (highest matching applies). Applied before temp HP absorbs it.
      const weak =
        mode === 'damage' && damageType
          ? weaknessFor(resolvedEffects, damageType, resolvedCatalog)
          : 0;
      const resisted =
        mode === 'damage' && damageType
          ? resistanceFor(resolvedEffects, damageType, resolvedCatalog)
          : 0;
      const incoming = Math.max(0, n + weak - resisted);

      let newHp;
      if (mode === 'heal') {
        newHp = { ...hp, current: Math.min(hp.max, hp.current + n) };
      } else {
        const tempAbsorb = Math.min(hp.temp || 0, incoming);
        const remainder = incoming - tempAbsorb;
        newHp = {
          ...hp,
          temp: (hp.temp || 0) - tempAbsorb,
          current: Math.max(0, hp.current - remainder),
        };
      }
      setCharHp(newHp);

      if (weak > 0 || resisted > 0) {
        const charName = (characters || []).find((c) => c.id === sel.id)?.name || 'Character';
        const parts = [];
        if (weak > 0) parts.push(`weakness ${weak}`);
        if (resisted > 0) parts.push(`resistance ${resisted}`);
        appendLog({
          type: 'action',
          charId: sel.id,
          text: `${charName}: ${damageType} damage ${n} → ${incoming} (${parts.join(', ')})`,
        });
      }

      // Typed damage clears effects that end on it — e.g. eld-charged on
      // electricity (#275). Applies even when temp HP absorbs the hit (taking
      // the damage is what counts).
      if (mode === 'damage' && damageType) {
        const cur = charEffects || [];
        const cleared = cur.filter((e) => clearsOnDamageType(e, damageType));
        if (cleared.length) {
          setCharEffects(cur.filter((e) => !clearsOnDamageType(e, damageType)));
          const charName = (characters || []).find((c) => c.id === sel.id)?.name || 'Character';
          const names = cleared
            .map((e) => PF2E_EFFECTS.find((d) => d.id === e.effectId)?.name || e.effectId)
            .join(', ');
          appendLog({
            type: 'action',
            charId: sel.id,
            text: `${charName} took ${damageType} damage — ${names} cleared`,
          });
        }
      }
    }
    setAmount('');
  };

  const handleClose = () => {
    setAmount('');
    setDamageType('');
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleApply();
  };

  const canApply = !!selectedId && !!amount && parseInt(amount, 10) >= 1;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Adjust HP" maxWidth="400px">
      <div className="adj-hp-body">
        <div className="adj-hp-char-row">
          <label htmlFor="adj-hp-char">Character</label>
          <select
            id="adj-hp-char"
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setAmount(''); }}
            aria-label="select character"
          >
            <option value="">— pick a character —</option>
            {(characters || []).map((c) => {
              const minions = minionRoster(c);
              return (
                <React.Fragment key={c.id}>
                  <option value={c.id}>{c.name}</option>
                  {minions.map((m) => (
                    <option key={m.role} value={`minion:${c.id}:${m.role}`}>
                      {c.name} — {m.name}
                    </option>
                  ))}
                </React.Fragment>
              );
            })}
            {summons.map((s) => (
              <option key={s.entryId} value={`summon:${s.entryId}`}>
                Summon — {s.name}
              </option>
            ))}
          </select>
        </div>

        {sel && (
          <>
            <div className="adj-hp-status" aria-label="current hp">
              <span className="adj-hp-current">{hp?.current ?? 0}</span>
              <span className="adj-hp-sep">/</span>
              <span className="adj-hp-max">{hp?.max ?? 0}</span>
              {(hp?.temp ?? 0) > 0 && (
                <span className="adj-hp-temp">+{hp.temp} temp</span>
              )}
            </div>

            <div className="adj-hp-mode" role="group" aria-label="damage or heal">
              <button
                type="button"
                className={`adj-hp-mode-btn${mode === 'damage' ? ' is-active' : ''}`}
                data-mode="damage"
                onClick={() => setMode('damage')}
                aria-pressed={mode === 'damage'}
              >
                Damage
              </button>
              <button
                type="button"
                className={`adj-hp-mode-btn${mode === 'heal' ? ' is-active' : ''}`}
                data-mode="heal"
                onClick={() => { setMode('heal'); setDamageType(''); }}
                aria-pressed={mode === 'heal'}
              >
                Heal
              </button>
            </div>

            {mode === 'damage' && (
              <div className="adj-hp-dtype-row">
                <label htmlFor="adj-hp-dtype">Damage type</label>
                <select
                  id="adj-hp-dtype"
                  value={damageType}
                  onChange={(e) => setDamageType(e.target.value)}
                  aria-label="damage type"
                >
                  <option value="">— untyped —</option>
                  {DAMAGE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {(preview.weakness > 0 || preview.resistance > 0) && (
                  <span className="adj-hp-resist-note" aria-label="damage modifier preview">
                    {[
                      preview.weakness > 0 ? `weakness ${preview.weakness}` : null,
                      preview.resistance > 0 ? `resistance ${preview.resistance}` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            )}

            <div className="adj-hp-entry">
              <input
                type="number"
                min="1"
                className="adj-hp-input"
                placeholder="Amount"
                aria-label="hp amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                className={`btn-primary adj-hp-apply${mode === 'damage' ? ' adj-hp-apply--damage' : ''}`}
                onClick={handleApply}
                disabled={!canApply}
                aria-label={`Apply ${mode}`}
              >
                Apply
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default AdjustHpModal;
