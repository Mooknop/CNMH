import React, { useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSustains } from '../../hooks/useSustains';
import { useSummons } from '../../hooks/useSummons';
import { heightenedEntriesFor } from '../../utils/spellHeighten';
import './AddSummonModal.css';
import { RELAY, globalKey } from '../../sync/keys';

// Parse the creature-level cap a summon spell's heightening grants at a cast
// rank, e.g. "The creature can be up to Level 5." → 5. Returns null if the
// spell/rank can't be resolved (older sustains without castRank).
const heighteningLevelCap = (spell, castRank) => {
  if (!spell || typeof castRank !== 'number') return null;
  let cap = null;
  for (const e of heightenedEntriesFor(spell, castRank)) {
    const m = /Level\s+(-?\d+)/i.exec(e.text || '');
    if (m) { const n = Number(m[1]); if (cap === null || n > cap) cap = n; }
  }
  return cap;
};

/**
 * GM adds a summon (#261): pick a creature from the bridge-synced Foundry
 * "Summons" folder, tie it to one of a caster's active sustains, and drop it
 * into the encounter (cnmh_summons_global). Its level is guided by the spell's
 * heightening table; it's removed when the sustain ends or via Dismiss.
 */
const AddSummonModal = ({ isOpen, onClose }) => {
  const { characters, spells } = useContent();
  const { sendUpdate } = useSession();
  const { addSummon } = useSummons();
  const [pool] = useSyncedState(globalKey(RELAY.SUMMONPOOL), []);

  const [casterId, setCasterId] = useState('');
  const [sustainId, setSustainId] = useState('');
  const [creatureKey, setCreatureKey] = useState('');

  const { sustains } = useSustains(casterId || 'none');
  const caster = (characters || []).find((c) => c.id === casterId) || null;
  const sustain = sustains.find((s) => s.id === sustainId) || null;
  const creature = (pool || []).find((p) => p.key === creatureKey) || null;

  const linkedSpell = useMemo(
    () => (sustain?.spellId ? (spells || []).find((sp) => sp.id === sustain.spellId) : null),
    [sustain, spells]
  );
  const levelCap = useMemo(
    () => heighteningLevelCap(linkedSpell, sustain?.castRank),
    [linkedSpell, sustain]
  );
  const overCap = creature?.level != null && levelCap != null && creature.level > levelCap;

  const reset = () => { setCasterId(''); setSustainId(''); setCreatureKey(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleAdd = () => {
    if (!caster || !sustain || !creature) return;
    addSummon({
      name: creature.name,
      level: creature.level,
      casterId: caster.id,
      casterName: caster.name,
      sustainId: sustain.id,
      spellName: sustain.spellName,
      defenses: creature.defenses,
      maxHp: creature.hp?.max ?? 0,
      traits: creature.traits,
      img: creature.img,
    });
    handleClose();
  };

  const refreshPool = () => sendUpdate('global', RELAY.SUMMONPOOLREQ, Date.now());

  const canAdd = !!caster && !!sustain && !!creature;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add summon" maxWidth="440px">
      <div className="asm-body">
        <div className="asm-field">
          <label htmlFor="asm-caster">Caster</label>
          <select
            id="asm-caster"
            aria-label="summon caster"
            value={casterId}
            onChange={(e) => { setCasterId(e.target.value); setSustainId(''); }}
          >
            <option value="">— pick a caster —</option>
            {(characters || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {casterId && (
          <div className="asm-field">
            <label htmlFor="asm-sustain">Sustained spell</label>
            {sustains.length === 0 ? (
              <span className="asm-empty">{caster?.name} has no active sustained spells.</span>
            ) : (
              <select
                id="asm-sustain"
                aria-label="linked sustain"
                value={sustainId}
                onChange={(e) => setSustainId(e.target.value)}
              >
                <option value="">— pick a sustain —</option>
                {sustains.map((s) => (
                  <option key={s.id} value={s.id}>{s.spellName}</option>
                ))}
              </select>
            )}
            {sustain && levelCap != null && (
              <span className="asm-hint">Heightening allows a creature up to Level {levelCap}.</span>
            )}
          </div>
        )}

        <div className="asm-field">
          <label htmlFor="asm-creature">Creature</label>
          {(pool || []).length === 0 ? (
            <div className="asm-pool-empty">
              <span className="asm-empty">
                No creatures in the Foundry "Summons" folder.
              </span>
              <button type="button" className="btn-secondary asm-refresh" onClick={refreshPool}>
                Refresh
              </button>
            </div>
          ) : (
            <select
              id="asm-creature"
              aria-label="summon creature"
              value={creatureKey}
              onChange={(e) => setCreatureKey(e.target.value)}
            >
              <option value="">— pick a creature —</option>
              {(pool || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}{p.level != null ? ` (Lvl ${p.level})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {creature && (
          <div className="asm-summary" aria-label="summon summary">
            <strong>{creature.name}</strong>
            <span>
              HP {creature.hp?.max ?? 0}
              {creature.defenses?.ac != null ? ` · AC ${creature.defenses.ac}` : ''}
              {creature.level != null ? ` · Level ${creature.level}` : ''}
            </span>
            {overCap && (
              <span className="asm-warn" role="status">
                Level {creature.level} exceeds the heightening cap (Level {levelCap}).
              </span>
            )}
          </div>
        )}

        <div className="asm-actions">
          <button
            type="button"
            className="btn-primary asm-add"
            onClick={handleAdd}
            disabled={!canAdd}
            aria-label="Add summon to encounter"
          >
            Add to encounter
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AddSummonModal;
