import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { CAMPAIGN_ID } from '../data/campaign';
import { reputation as defaultReputation } from '../data';
import {
  normalizeQuests,
  normalizeFactions,
  normalizeCalendar,
  normalizeLore,
  normalizeTraits,
  normalizeCharacters,
  normalizeItems,
  resolveCharacterItems,
  defaultContent,
} from '../utils/contentUtils';

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

  // Pull the authoritative snapshot. Exposed as `refresh` so the GM area can
  // re-sync immediately after seeding without waiting on the live socket.
  const loadSnapshot = useCallback(() => {
    if (typeof fetch !== 'function') {
      setLoading(false);
      return Promise.resolve();
    }
    return fetch('/api/content')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => applyFull(body.payload))
      .catch(() => {
        /* stay on bundled fallback */
      })
      .finally(() => setLoading(false));
  }, [applyFull]);

  // Initial snapshot.
  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

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

  // Per-collection: use the store when it holds rows, else the bundled
  // default. `source` is 'server' if ANY managed collection is populated —
  // the GM area still seeds every empty collection on entry, so a partially
  // populated store can never hide a collection's other entries.
  const serverList = (key) =>
    serverContent && Array.isArray(serverContent[key]) ? serverContent[key] : [];
  const serverQuests = serverList('quest');
  const serverFactions = serverList('faction');
  const serverCalendar = serverList('calendar');
  const serverLore = serverList('lore');
  const serverTraits = serverList('trait');
  const serverCharacters = serverList('character');
  const serverItems = serverList('item');

  // The shared item catalog, then resolve every character's inventory refs
  // against it (legacy inline items pass through unchanged). Resolving here —
  // upstream of useCharacter — means InventoryUtils/SpellUtils/ContainerItem
  // consume fully-shaped items and need no changes.
  const items = serverItems.length ? normalizeItems(serverItems) : FALLBACK.item;
  // `rawCharacters` keeps inventory as authored (catalog refs intact) — the GM
  // editor must edit/save THAT, not the resolved view, or saving would inline
  // every item back and defeat the catalog. `characters` is the resolved view
  // every player-facing consumer uses.
  const rawCharacters = serverCharacters.length
    ? normalizeCharacters(serverCharacters)
    : FALLBACK.character;
  const characters = rawCharacters.map((c) => resolveCharacterItems(c, items));

  const value = {
    loading,
    source:
      serverQuests.length ||
      serverFactions.length ||
      serverCalendar.length ||
      serverLore.length ||
      serverTraits.length ||
      serverCharacters.length ||
      serverItems.length
        ? 'server'
        : 'fallback',
    quests: serverQuests.length ? normalizeQuests(serverQuests) : FALLBACK.quest,
    reputation: serverFactions.length
      ? { Factions: normalizeFactions(serverFactions) }
      : defaultReputation,
    calendarEvents: serverCalendar.length
      ? normalizeCalendar(serverCalendar)
      : FALLBACK.calendar,
    loreEntries: serverLore.length ? normalizeLore(serverLore) : FALLBACK.lore,
    traits: serverTraits.length ? normalizeTraits(serverTraits) : FALLBACK.trait,
    characters,
    rawCharacters,
    items,
    refresh: loadSnapshot,
  };

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
};

const NOOP_CONTENT = {
  loading: false,
  source: 'fallback',
  quests: FALLBACK.quest,
  reputation: defaultReputation,
  calendarEvents: FALLBACK.calendar,
  loreEntries: FALLBACK.lore,
  traits: FALLBACK.trait,
  characters: FALLBACK.character.map((c) => resolveCharacterItems(c, FALLBACK.item)),
  rawCharacters: FALLBACK.character,
  items: FALLBACK.item,
  refresh: () => Promise.resolve(),
};

export const useContent = () => useContext(ContentContext) || NOOP_CONTENT;

export { ContentContext };
