// Pure utilities for effect auto-expiry in the encounter system.
//
// duration.until values:
//   'caster-turn-end'   expires at the end of the caster's current turn
//   'caster-turn-start' expires at the start of the caster's next turn
//   'target-turn-end'   expires at the end of the target's current turn
//   'target-turn-start' expires at the start of the target's next turn
//   'round-end'         expires at the end of the current round
//   'rounds'            expires N rounds from now at the caster's turn-end
//   'manual'            never auto-expires (default for manually-applied effects)
//
// expireAt shape:
//   { round: number, entryId?: string, boundary: 'turn-start'|'turn-end'|'round-end' }

/**
 * Compute which turn/round boundaries are crossed when advancing
 * from the current encounter state to (nextTurnIdx, nextRound).
 */
export function boundariesCrossedBy(encounter, nextTurnIdx, nextRound) {
  const order = encounter.order || [];
  const curIdx = encounter.currentTurnIndex ?? 0;
  const curRound = encounter.round ?? 1;
  const curEntry = order[curIdx];
  const nextEntry = order[nextTurnIdx];
  const boundaries = [];

  // Outgoing entry's turn-end
  if (curEntry) {
    boundaries.push({ round: curRound, entryId: curEntry.entryId, boundary: 'turn-end' });
  }

  // If round wrapped, add round-end for the outgoing round
  if (nextRound !== curRound) {
    boundaries.push({ round: curRound, boundary: 'round-end' });
  }

  // Incoming entry's turn-start
  if (nextEntry) {
    boundaries.push({ round: nextRound, entryId: nextEntry.entryId, boundary: 'turn-start' });
  }

  return boundaries;
}

/**
 * Resolve when a spell/effect duration expires, anchored to the current encounter state.
 *
 * @param {object} duration        - { until, rounds? }
 * @param {object} encounter       - current encounter state (round, currentTurnIndex, order)
 * @param {string} casterEntryId   - entryId of the character casting the spell
 * @param {string} [targetEntryId] - entryId of the target (for target-relative durations)
 * @returns {object|null} expireAt object, or null for manual/unknown
 */
export function resolveExpireAt(duration, encounter, casterEntryId, targetEntryId) {
  if (!duration || duration.until === 'manual' || !duration.until) return null;

  const round = encounter.round ?? 1;

  switch (duration.until) {
    case 'caster-turn-end':
      return { round, entryId: casterEntryId, boundary: 'turn-end' };

    case 'caster-turn-start':
      // Expires at the START of the caster's NEXT turn (round + 1 if caster is first,
      // or same round if caster hasn't gone yet — for simplicity, always next occurrence)
      return { round: round + 1, entryId: casterEntryId, boundary: 'turn-start' };

    case 'target-turn-end':
      return { round, entryId: targetEntryId || casterEntryId, boundary: 'turn-end' };

    case 'target-turn-start':
      return { round: round + 1, entryId: targetEntryId || casterEntryId, boundary: 'turn-start' };

    case 'round-end':
      return { round, boundary: 'round-end' };

    case 'rounds': {
      const n = Number(duration.rounds) || 1;
      // N rounds from now, at the caster's turn-end (PF2e convention)
      return { round: round + n, entryId: casterEntryId, boundary: 'turn-end' };
    }

    default:
      return null;
  }
}

/**
 * Returns true if the effect's expireAt has been crossed by the given boundary list.
 *
 * @param {object|null} expireAt   - the resolved expiry descriptor on the active effect
 * @param {Array}       boundaries - from boundariesCrossedBy()
 */
export function isExpired(expireAt, boundaries) {
  if (!expireAt) return false;

  for (const b of boundaries) {
    if (b.boundary !== expireAt.boundary) continue;

    if (expireAt.boundary === 'round-end') {
      if (b.round >= expireAt.round) return true;
    } else {
      // 'turn-start' or 'turn-end'
      if (b.entryId !== expireAt.entryId) continue;
      if (b.round >= expireAt.round) return true;
    }
  }
  return false;
}

/**
 * Human-readable label for an expireAt object, used in EffectsPanel.
 */
export function expiryLabel(expireAt) {
  if (!expireAt) return null;
  if (expireAt.boundary === 'round-end') return `Round ${expireAt.round} end`;
  const b = expireAt.boundary === 'turn-end' ? 'turn-end' : 'turn-start';
  return `R${expireAt.round} ${b}`;
}
