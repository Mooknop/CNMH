import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CAMPAIGN_ID } from '../data/campaign';

// Real-time campaign session sync. One WebSocket per device, one Durable Object
// per campaign. The connection is same-origin (served by a Pages Function), so
// no env var / CORS is needed in production; VITE_WS_URL overrides for dev.
const RECONNECT_MS = 3000;

// Inventory *organization* writes that stay interactive in the offline sandbox
// (#554). Moving items, setting hands, and attuning don't consume anything, so a
// player can manage their loadout while the live game isn't running. Resource
// burns (consumed, itemeffects, focus, gold, …) stay frozen so nothing gets used
// up. Keyed by the `cnmh_<type>_<id>` type segment.
const SANDBOX_WRITABLE_TYPES = new Set(['loadout', 'invested']);

// Whether a synced write may proceed while the live game is offline (DO up,
// Foundry down). Two always-live categories survive the sandbox freeze:
//   • Campaign-level (`_global`) state is GM-authored world setup — shops, play
//     mode, clock, exploration toggles — not player resource consumption. GM
//     edits must stay on regardless of mode, so the GM can prep while Foundry's
//     down. (characterId is the literal "global" for these keys.)
//   • Inventory organization (loadout / invested), which a player may always
//     manage (#554).
// Everything else — per-character resource burns — stays frozen.
export const isSandboxWritable = (stateType, characterId) =>
  characterId === 'global' || SANDBOX_WRITABLE_TYPES.has(stateType);

const NOOP_SESSION = {
  connected: false,
  foundryConnected: false,
  getState: () => undefined,
  getAllState: () => undefined,
  sendUpdate: () => {},
  subscribe: () => () => {},
};

const SessionContext = createContext(null);

const resolveWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return `${import.meta.env.VITE_WS_URL}/session/${CAMPAIGN_ID}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/session/${CAMPAIGN_ID}`;
};

export const SessionProvider = ({ children }) => {
  const ws = useRef(null);
  const serverState = useRef({});
  const subscribers = useRef({});
  const reconnectTimer = useRef(null);
  const unmounted = useRef(false);
  const [connected, setConnected] = useState(false);
  // Whether the Foundry bridge is present on the relay. Driven by PRESENCE
  // messages from the DO; unknown (false) until the first signal, and reset
  // whenever this client's link to the DO drops.
  const [foundryConnected, setFoundryConnected] = useState(false);

  // Offline sandbox (#553): the DO is up but Foundry isn't, so campaign-state
  // writes must be inert. Mirror the derived flag into a ref the stable
  // sendUpdate callback can read without churning its identity.
  const sandboxRef = useRef(false);
  sandboxRef.current = connected && !foundryConnected;

  const notify = (characterId, stateType, value) => {
    subscribers.current[characterId]?.[stateType]?.forEach((cb) => cb(value));
  };

  useEffect(() => {
    unmounted.current = false;

    const connect = () => {
      let socket;
      try {
        socket = new WebSocket(resolveWsUrl());
      } catch {
        reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
        return;
      }
      ws.current = socket;

      socket.onopen = () => {
        if (!unmounted.current) setConnected(true);
      };

      socket.onclose = () => {
        if (unmounted.current) return;
        setConnected(false);
        // Lost the DO link — we can no longer trust the last presence signal.
        setFoundryConnected(false);
        reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
      };

      socket.onerror = () => {
        try { socket.close(); } catch { /* already closing */ }
      };

      socket.onmessage = (evt) => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }

        if (msg.type === 'FULL_STATE' && msg.payload) {
          serverState.current = msg.payload;
          for (const [characterId, types] of Object.entries(msg.payload)) {
            for (const [stateType, value] of Object.entries(types)) {
              notify(characterId, stateType, value);
            }
          }
          return;
        }

        if (msg.type === 'UPDATE') {
          const { characterId, key, value } = msg;
          if (!serverState.current[characterId]) serverState.current[characterId] = {};
          serverState.current[characterId][key] = value;
          notify(characterId, key, value);
          return;
        }

        if (msg.type === 'PRESENCE') {
          setFoundryConnected(!!msg.foundry);
        }
      };
    };

    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try { ws.current?.close(); } catch { /* noop */ }
    };
  }, []);

  const getState = useCallback((characterId, stateType) => {
    return serverState.current[characterId]?.[stateType];
  }, []);

  // Whole per-character live-state map ({ [stateType]: value }) — the primitive
  // the GM state inspector needs to enumerate every key, including ones no hook
  // declares. Returns the live ref object; callers that retain it should copy.
  const getAllState = useCallback((characterId) => {
    return serverState.current[characterId];
  }, []);

  const sendUpdate = useCallback((characterId, stateType, value) => {
    // Offline sandbox: freeze campaign-state mutations (synced via useSyncedState
    // or written directly by consumables/healing) so nothing gets used up while
    // the game isn't running — except always-live writes (GM-authored `_global`
    // state and inventory organization), see isSandboxWritable. Suppress before
    // touching the cache, the socket, or local subscribers.
    if (sandboxRef.current && !isSandboxWritable(stateType, characterId)) return;
    if (!serverState.current[characterId]) serverState.current[characterId] = {};
    serverState.current[characterId][stateType] = value;
    const socket = ws.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'UPDATE', characterId, key: stateType, value }));
    }
    // Also notify *local* subscribers: the server broadcast excludes the
    // sender, so without this every other useSyncedState consumer of this key
    // on this same client (e.g. useCharacter's effective tree + the Bulk bar
    // while HandsPanel writes) would never see the change until a reload.
    notify(characterId, stateType, value);
  }, []);

  const subscribe = useCallback((characterId, stateType, callback) => {
    if (!subscribers.current[characterId]) subscribers.current[characterId] = {};
    if (!subscribers.current[characterId][stateType]) {
      subscribers.current[characterId][stateType] = new Set();
    }
    subscribers.current[characterId][stateType].add(callback);
    return () => {
      subscribers.current[characterId]?.[stateType]?.delete(callback);
    };
  }, []);

  return (
    <SessionContext.Provider value={{ connected, foundryConnected, getState, getAllState, sendUpdate, subscribe }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext) || NOOP_SESSION;

export { SessionContext };
