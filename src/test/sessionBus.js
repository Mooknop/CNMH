// In-memory session bus (#1311) — a real-semantics stand-in for the
// SessionProvider's WebSocket value. It implements the exact context surface
// (getState / getAllState / sendUpdate / subscribe + presence flags) against a
// plain object, including the offline-sandbox write freeze, so the REAL
// useSyncedState (and every hook built on it) runs unmodified in tests.
//
// Test-only extras:
//   bus.push(charId, type, value) — simulate a remote UPDATE arriving from
//     another peer (applies + notifies subscribers, not recorded as sent).
//   bus.sent — [{ characterId, stateType, value, options }] log of every
//     sendUpdate the code under test issued.
//
// Presence flags are fixed at creation; render a fresh bus (rerender with a
// new wrapper) to change them mid-test.
import { isSandboxWritable } from '../contexts/SessionContext';

export function makeSessionBus({
  state = {},
  connected = true,
  foundryConnected = true,
  pendingWrites = 0,
} = {}) {
  // Deep-ish copy so a shared fixture object can't leak writes across tests.
  const serverState = JSON.parse(JSON.stringify(state));
  const subscribers = {};
  const sent = [];
  const sandbox = connected && !foundryConnected;

  const notify = (characterId, stateType, value) => {
    subscribers[characterId]?.[stateType]?.forEach((cb) => cb(value));
  };

  const apply = (characterId, stateType, value) => {
    if (!serverState[characterId]) serverState[characterId] = {};
    serverState[characterId][stateType] = value;
    notify(characterId, stateType, value);
  };

  return {
    connected,
    foundryConnected,
    pendingWrites,
    getState: (characterId, stateType) => serverState[characterId]?.[stateType],
    getAllState: (characterId) => serverState[characterId],
    sendUpdate: (characterId, stateType, value, options) => {
      // Mirror SessionProvider's sandbox freeze so tests exercise it for real.
      if (sandbox && !options?.force && !isSandboxWritable(stateType, characterId)) return;
      sent.push({ characterId, stateType, value, options });
      apply(characterId, stateType, value);
    },
    subscribe: (characterId, stateType, callback) => {
      if (!subscribers[characterId]) subscribers[characterId] = {};
      if (!subscribers[characterId][stateType]) subscribers[characterId][stateType] = new Set();
      subscribers[characterId][stateType].add(callback);
      return () => subscribers[characterId]?.[stateType]?.delete(callback);
    },
    push: apply,
    sent,
  };
}
