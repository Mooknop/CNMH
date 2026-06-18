// Pure helpers for the off-turn reactor-presence sweep (#477). Kept side-effect
// free so the turn-change watcher (useReactorTurnClear) and its tests share the
// same algebra. A reactor entry is { pcId, label, status } (see useReactors).

// A turn is identified by round:index — the same token the effect-expiry watcher
// uses. Reactions are declared against the acting combatant, so a new token means
// any still-declared reaction is stale.
export const turnToken = (encounter) =>
  `${encounter?.round ?? 0}:${encounter?.currentTurnIndex ?? 0}`;

// Whether the turn-change sweep should fire. Skips the initial observation
// (prevToken === null), the no-change case, non-GM clients (single writer so the
// log line isn't duplicated per device), and an already-empty reactor list.
export const shouldClearReactors = ({ prevToken, nextToken, isGm, reactorCount }) =>
  prevToken !== null && prevToken !== nextToken && !!isGm && (reactorCount ?? 0) > 0;

// The log line appended when stale reactions are retired on turn change.
export const reactorClearLog = (reactors) => {
  const names = (reactors || []).map((r) => r?.label).filter(Boolean);
  if (names.length === 0) return 'Unresolved reaction cleared';
  return `Unresolved reaction${names.length > 1 ? 's' : ''} cleared: ${names.join(', ')}`;
};
