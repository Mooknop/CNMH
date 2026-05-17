import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CAMPAIGN_ID } from '../data/campaign';
import { loreEntries as defaultLore, reputation as defaultReputation } from '../data';
import { normalizeQuests, defaultContent } from '../utils/contentUtils';

// Campaign content layer. Loads the authoritative snapshot from the
// CampaignContent Durable Object (GET /api/content), subscribes to live GM
// edits over /content-sync, and falls back to the JSON bundled with the build
// when the server is unreachable or a collection has not been seeded yet — so
// the app never breaks offline or on first run.
//
// Slice 1 wires quests through the store; reputation/lore are bundled
// passthroughs here so later slices flip them over without touching consumers.

const RECONNECT_MS = 3000;

const ContentContext = createContext(null);

const resolveWsUrl = () => {
  if (process.env.REACT_APP_WS_URL) {
    return `${process.env.REACT_APP_WS_URL}/content-sync/${CAMPAIGN_ID}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/content-sync/${CAMPAIGN_ID}`;
};

const FALLBACK = defaultContent();

export const ContentProvider = ({ children }) => {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const unmounted = useRef(false);
  const [serverContent, setServerContent] = useState(null); // null until first load
  const [loading, setLoading] = useState(true);

  const applyFull = useCallback((payload) => {
    if (payload && typeof payload === 'object') setServerContent(payload);
  }, []);

  const applyUpsert = useCallback((collection, id, data) => {
    setServerContent((prev) => {
      const base = prev || {};
      const list = Array.isArray(base[collection]) ? base[collection] : [];
      const next = list.filter((d) => String(d.id) !== String(id));
      next.push(data);
      return { ...base, [collection]: next };
    });
  }, []);

  const applyDelete = useCallback((collection, id) => {
    setServerContent((prev) => {
      if (!prev || !Array.isArray(prev[collection])) return prev;
      return {
        ...prev,
        [collection]: prev[collection].filter((d) => String(d.id) !== String(id)),
      };
    });
  }, []);

  // Initial snapshot.
  useEffect(() => {
    let cancelled = false;
    if (typeof fetch !== 'function') {
      setLoading(false);
      return undefined;
    }
    fetch('/api/content')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => {
        if (!cancelled) applyFull(body.payload);
      })
      .catch(() => {
        /* stay on bundled fallback */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFull]);

  // Live edits.
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

      socket.onclose = () => {
        if (unmounted.current) return;
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
        if (msg.type === 'FULL_CONTENT') applyFull(msg.payload);
        else if (msg.type === 'CONTENT_UPDATE') applyUpsert(msg.collection, msg.id, msg.data);
        else if (msg.type === 'CONTENT_DELETE') applyDelete(msg.collection, msg.id);
      };
    };

    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      try { ws.current?.close(); } catch { /* noop */ }
    };
  }, [applyFull, applyUpsert, applyDelete]);

  const serverQuests = serverContent && Array.isArray(serverContent.quest)
    ? serverContent.quest
    : [];
  const hasServerQuests = serverQuests.length > 0;

  const value = {
    loading,
    source: hasServerQuests ? 'server' : 'fallback',
    quests: hasServerQuests ? normalizeQuests(serverQuests) : FALLBACK.quest,
    // Bundled passthroughs until their own slices move them into the store.
    reputation: defaultReputation,
    loreEntries: defaultLore,
  };

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
};

const NOOP_CONTENT = {
  loading: false,
  source: 'fallback',
  quests: FALLBACK.quest,
  reputation: defaultReputation,
  loreEntries: defaultLore,
};

export const useContent = () => useContext(ContentContext) || NOOP_CONTENT;

export { ContentContext };
