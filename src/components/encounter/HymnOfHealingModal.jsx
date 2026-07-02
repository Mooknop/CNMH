import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useEncounter } from '../../hooks/useEncounter';
import { useSession } from '../../contexts/SessionContext';
import { useTurnState } from '../../hooks/useTurnState';
import { useCastingResources } from '../../hooks/useCastingResources';
import { useContent } from '../../contexts/ContentContext';
import { registerSustain } from '../../utils/sustain';
import { markPlayingOnCast } from '../../utils/playing';
import { hymnRank, hymnAmounts, applyHymnTempHp } from '../../utils/hymnHealing';
import './HymnOfHealingModal.css';

/**
 * Hymn of Healing (#226, Slice A) — Izzy's sustained composition. Pick a willing
 * target: they gain fast healing (auto-applied at the start of their turn by the
 * encounter's turn-start tick) and temporary Hit Points now (and again the first
 * time each round the spell is Sustained). Both scale +2 per rank; the spell
 * auto-heightens to half the caster's level. The target + amounts ride on the
 * sustain entry so the tick and the Sustain prompt resolve healing off the
 * ledger. Routed here from CastSpellModal in place of the generic UseAbilityModal.
 */
const HymnOfHealingModal = ({ isOpen, onClose, spell, character, themeColor }) => {
  const { appendLog, encounter } = useEncounter();
  const { getState, sendUpdate } = useSession();
  const { spendActions } = useTurnState(character?.id);
  const resources = useCastingResources(character);
  const { characters } = useContent();

  const [targetId, setTargetId] = useState(character?.id || '');
  const [resolved, setResolved] = useState(null);

  const party = useMemo(() => characters || [], [characters]);
  const rank = hymnRank(character?.level);
  const amounts = hymnAmounts(rank);

  const inProgress = encounter?.phase === 'in-progress';
  const casterEntryId = (encounter?.order || [])
    .find((e) => e.kind === 'pc' && e.charId === character?.id)?.entryId;

  const target = party.find((c) => c.id === targetId) || null;
  const canConfirm = !resolved && !!target && resources.focus.remaining > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;

    const heal = {
      targetId:     target.id,
      targetName:   target.name,
      targetMaxHp:  target.maxHp,
      fastHealing:  amounts.fastHealing,
      tempHp:       amounts.tempHp,
    };

    // Grant the on-cast temporary HP (take-higher; PF2e temp HP don't stack).
    applyHymnTempHp({ getState, sendUpdate, target, amount: amounts.tempHp });

    // Focus spell — auto-spend a point (parity with Lingering Composition).
    resources.focus.spend();

    // Two Actions, only while in an encounter.
    if (inProgress) spendActions(2, 'Cast Hymn of Healing');

    // Register the sustain (carries the heal payload). Sustains only prompt in
    // combat, so out of combat we skip registration and just leave the buff.
    if (inProgress && casterEntryId) {
      registerSustain({
        ability: spell,
        caster: character,
        round: encounter?.round,
        castRank: rank,
        heal,
        getState,
        sendUpdate,
        appendLog,
      });
    }

    appendLog({
      type: 'action',
      charId: character?.id,
      text: `${character?.name} cast Hymn of Healing on ${target.name} — fast healing ${amounts.fastHealing}, +${amounts.tempHp} temp HP`,
    });

    // 'While playing' (#935) — Hymn is a Composition cast (no-op out of combat).
    markPlayingOnCast({ ability: spell, caster: character, casterEntryId, encounter, sendUpdate, appendLog });

    setResolved({ targetName: target.name });
  };

  const handleClose = () => {
    setTargetId(character?.id || '');
    setResolved(null);
    onClose();
  };

  if (!isOpen || !spell) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Hymn of Healing"
      themeColor={themeColor}
      maxWidth="400px"
      placement="bottom"
    >
      <div className="hoh-body">
        <p className="hoh-blurb">
          The target gains <strong>fast healing {amounts.fastHealing}</strong> (applied at the start of
          their turn) and <strong>{amounts.tempHp} temporary HP</strong> now and the first time each round
          you Sustain. Sustained up to 4 rounds.
        </p>

        <div className="hoh-field" role="group" aria-label="Select target">
          <span className="hoh-label">Willing target</span>
          <div className="hoh-targets">
            {party.map((c) => (
              <button
                key={c.id}
                className={`hoh-target-chip ${c.id === targetId ? 'is-selected' : ''}`}
                onClick={() => setTargetId(c.id)}
                disabled={!!resolved}
                aria-label={`Target ${c.name}`}
                aria-pressed={c.id === targetId}
              >
                {c.name}{c.id === character?.id ? ' (self)' : ''}
              </button>
            ))}
          </div>
        </div>

        {resolved ? (
          <div className="hoh-result">
            ✓ Hymn of Healing on {resolved.targetName} — fast healing {amounts.fastHealing}, +{amounts.tempHp} temp HP
          </div>
        ) : (
          <button className="hoh-confirm-btn" onClick={handleConfirm} disabled={!canConfirm}>
            {resources.focus.remaining > 0 ? 'Cast Hymn of Healing' : 'No focus points'}
          </button>
        )}

        <div className="hoh-footer">
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default HymnOfHealingModal;
