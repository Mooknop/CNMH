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

export const buildReactionPrompt = ({ eventId, label, note, round, reqId } = {}) => ({
  reqId: reqId || `react-${Date.now()}-${++_reqCounter}`,
  eventId,
  label,
  ...(note ? { note } : {}),
  round,
  ttlSec: REACT_PROMPT_TTL_SEC,
  ts: Date.now(),
});
