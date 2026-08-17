// Reaction-prompt payload builder (#221; ttl countdown #1575 D4) — shared by
// the dock reaction rail and the GM trigger console so the payload (and its
// countdown contract) can't drift between fire sites.
//
// ttlSec: the player's ReactionPrompt shows a countdown ring and auto-passes
// when it expires — anchored on prompt ARRIVAL on the player device, so the
// two clocks never need to agree; the dock's waiting chip counts down from
// `ts` on the GM's own clock. Pre-D4 player clients simply ignore the field —
// the round stamp remains the hard backstop either way.

let _reqCounter = 0;

export const REACT_PROMPT_TTL_SEC = 30;

// allyEntryId (#1733 S3): the combatant id of the ally the event happened TO,
// when the GM named one. Additive and optional — a prompt without it behaves
// exactly as every prompt did before, which is what keeps aura gating from ever
// suppressing a reaction on a guess (see `filterAllyAuraReactions`).
export const buildReactionPrompt = ({ eventId, label, note, round, reqId, allyEntryId } = {}) => ({
  reqId: reqId || `react-${Date.now()}-${++_reqCounter}`,
  eventId,
  label,
  ...(note ? { note } : {}),
  ...(allyEntryId ? { allyEntryId } : {}),
  round,
  ttlSec: REACT_PROMPT_TTL_SEC,
  ts: Date.now(),
});
