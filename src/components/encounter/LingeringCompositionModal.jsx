import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useCastingResources } from '../../hooks/useCastingResources';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { computeSaveDegree } from '../../utils/saveDegree';
import { recallKnowledgeDC } from '../../utils/recallKnowledge';
import { lingeringResult } from '../../utils/lingering';
import { markPlayingOnCast } from '../../utils/playing';
import './LingeringCompositionModal.css';

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

/**
 * Lingering Composition (#226-B) — the bard free-action spellshape. Rolls a
 * Performance check vs a GM-entered DC (hinted from the caster's level) and,
 * on a success/crit, sets a pending extension on the caster that the next
 * composition cast consumes (`cnmh_lingering_<id> = { rounds, ts }`): success →
 * 3 rounds, crit → 4. The focus point is spent only on a success/crit — a
 * failure leaves the composition at 1 round and refunds the attempt.
 *
 * Routed here from CastSpellModal in place of the generic UseAbilityModal.
 */
const LingeringCompositionModal = ({ isOpen, onClose, spell, character, themeColor }) => {
  const characterModel = useCharacter(character);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || 'none'}`, []);
  const { appendLog, encounter } = useEncounter();
  const { sendUpdate } = useSession();
  const casterEntryId = (encounter?.order || [])
    .find((e) => e.kind === 'pc' && e.charId === character?.id)?.entryId;
  const resources = useCastingResources(character);

  const [d20, setD20] = useState('');
  const [dcInput, setDcInput] = useState('');
  const [resolved, setResolved] = useState(null);

  // Performance modifier via the shared resolver (nets conditions + effects).
  const rollProfile = useMemo(() => {
    if (!character || !characterModel) return null;
    const synthetic = { traits: spell?.traits, roll: { type: 'skill', skill: 'performance' } };
    return resolveActionRoll(synthetic, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
      mapStep: 0,
    });
  }, [character, characterModel, spell, activeConditions, effects, effectCatalog]);

  const mod = rollProfile?.bonus ?? null;

  // "Standard-difficulty of the highest-level target" — GM-entered, hinted from
  // the caster's level (the party's level is a fair stand-in for a self/ally buff).
  const dcHint = recallKnowledgeDC(character?.level ?? 0);
  const dcVal = dcInput !== '' ? parseInt(dcInput, 10) : dcHint;

  const d20Val = parseInt(d20, 10);
  const total = !isNaN(d20Val) && mod != null ? d20Val + mod : null;
  const degree = total != null && dcVal != null && !isNaN(dcVal)
    ? computeSaveDegree({ d20: d20Val, total, dc: dcVal })
    : null;

  const canConfirm = !resolved && degree != null && resources.focus.remaining > 0;

  const handleD20 = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setD20(v);
  };
  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDcInput(v);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const { rounds, spendFocus } = lingeringResult(degree);

    // Pending extension consumed by the next composition cast (null on failure
    // so a stale prior attempt never lingers).
    const id = character?.id;
    const next = rounds ? { rounds, ts: Date.now() } : null;
    writeLocal(`cnmh_lingering_${id}`, next);
    sendUpdate(id, 'lingering', next);

    if (spendFocus) resources.focus.spend();

    const resultStr = rounds
      ? `next composition lasts ${rounds} rounds`
      : 'composition lasts 1 round — focus point not spent';
    appendLog({
      type: 'action',
      charId: id,
      text: `${character?.name} used Lingering Composition (Performance ${total} vs DC ${dcVal}) → ${DEGREE_LABELS[degree]} — ${resultStr}`,
    });

    // 'While playing' (#935) — Lingering Composition is itself a Composition
    // cast, so even a failed check keeps the performance going.
    markPlayingOnCast({ ability: spell, caster: character, casterEntryId, encounter, sendUpdate, appendLog });

    setResolved({ degree, resultStr });
  };

  const handleClose = () => {
    setD20('');
    setDcInput('');
    setResolved(null);
    onClose();
  };

  if (!isOpen || !spell) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Lingering Composition"
      themeColor={themeColor}
      maxWidth="400px"
      placement="bottom"
    >
      <div className="lcm-body">
        <p className="lcm-blurb">
          Extend your next 1-round composition. Roll Performance vs the DC: success → 3 rounds,
          critical → 4. On a failure the composition lasts 1 round and you keep the focus point.
        </p>

        <div className="lcm-mod-row" aria-label="performance modifier">
          <span className="lcm-mod-label">Performance</span>
          <span className="lcm-mod-value">{mod != null ? fmtMod(mod) : '—'}</span>
        </div>

        <div className="lcm-inputs">
          <div className="lcm-field">
            <label className="lcm-label" htmlFor="lcm-d20">d20 roll</label>
            <input
              id="lcm-d20"
              className="lcm-input"
              type="number"
              min="1"
              max="20"
              placeholder="1–20"
              value={d20}
              onChange={handleD20}
              disabled={!!resolved}
            />
          </div>
          <div className="lcm-field">
            <label className="lcm-label" htmlFor="lcm-dc">DC</label>
            <input
              id="lcm-dc"
              className="lcm-input"
              type="number"
              min="1"
              placeholder={String(dcHint)}
              value={dcInput}
              onChange={handleDc}
              disabled={!!resolved}
            />
          </div>
        </div>

        {total != null && (
          <div className="lcm-total-row">
            <span className="lcm-total-label">Total</span>
            <span className="lcm-total-value">{total}</span>
          </div>
        )}
        {degree && !resolved && (
          <div className={`lcm-degree lcm-degree--${degree}`}>
            {DEGREE_LABELS[degree]} — {lingeringResult(degree).rounds
              ? `${lingeringResult(degree).rounds} rounds`
              : '1 round, focus kept'}
          </div>
        )}

        {resolved ? (
          <div className="lcm-result">✓ {DEGREE_LABELS[resolved.degree]} — {resolved.resultStr}</div>
        ) : (
          <button className="lcm-confirm-btn" onClick={handleConfirm} disabled={!canConfirm}>
            {resources.focus.remaining > 0 ? 'Cast Lingering Composition' : 'No focus points'}
          </button>
        )}

        <div className="lcm-footer">
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default LingeringCompositionModal;
