import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CAMPAIGN_ID } from '../data/campaign';

// Real-time campaign session sync. One WebSocket per device, one Durable Object
// per campaign. The connection is same-origin (served by a Pages Function), so
// no env var / CORS is needed in production; VITE_WS_URL overrides for dev.
const RECONNECT_MS = 3000;

const NOOP_SESSION = {
  connected: false,
  getState: () => undefined,
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

  const sendUpdate = useCallback((characterId, stateType, value) => {
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
    <SessionContext.Provider value={{ connected, getState, sendUpdate, subscribe }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext) || NOOP_SESSION;

export { SessionContext };
