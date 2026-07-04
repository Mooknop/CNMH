import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  normalizeSpells,
  normalizeEffects,
  normalizeRunes,
  mergeArmorRunes,
  mergeFundamentalRunes,
  normalizeImages,
  normalizeTheme,
  resolveCharacterItems,
  defaultContent,
} from '../utils/contentUtils';
import { paletteToVars } from '../utils/themeVars';

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
  if (import.meta.env.VITE_WS_URL) {
    return `${import.meta.env.VITE_WS_URL}/content-sync/${CAMPAIGN_ID}`;
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
  const serverSpells = serverList('spell');
  const serverEffects = serverList('effect');
  const serverRunes = serverList('rune');
  const serverImages = serverList('image');
  const serverTheme = serverList('theme');
  const serverMonsters = serverList('monster');
  const serverRooms = serverList('room');
  const serverEvents = serverList('event');

  // The shared item catalog, then resolve every character's inventory refs
  // against it (legacy inline items pass through unchanged). Resolving here —
  // upstream of useCharacter — means InventoryUtils/SpellUtils/ContainerItem
  // consume fully-shaped items and need no changes.
  const items = serverItems.length ? normalizeItems(serverItems) : FALLBACK.item;
  // Shared spell catalog — wand/scroll/staff blocks reference it by id; it is
  // inlined during inventory resolution below (bundled-only for now, so this
  // is the fallback path until a GM Spell collection lands).
  const spells = serverSpells.length ? normalizeSpells(serverSpells) : FALLBACK.spell;
  const effects = serverEffects.length ? normalizeEffects(serverEffects) : FALLBACK.effect;
  // Armor runes (#727) always merge in from the code seed (FALLBACK already
  // carries them), so etched armor resolves whether or not the DO was reseeded.
  const runes = mergeFundamentalRunes(mergeArmorRunes(serverRunes.length ? normalizeRunes(serverRunes) : FALLBACK.rune));
  const images = serverImages.length ? normalizeImages(serverImages) : FALLBACK.image;
  // `rawCharacters` keeps inventory as authored (catalog refs intact) — the GM
  // editor must edit/save THAT, not the resolved view, or saving would inline
  // every item back and defeat the catalog. `characters` is the resolved view
  // every player-facing consumer uses.
  const rawCharacters = serverCharacters.length
    ? normalizeCharacters(serverCharacters)
    : FALLBACK.character;
  const characters = rawCharacters.map((c) =>
    resolveCharacterItems(c, items, spells, runes)
  );

  // Lore is split into two views: `allLoreEntries` (GM editors, the location
  // picker) and `loreEntries` (every player-facing surface), which only holds
  // entries the GM has revealed. Filtering here means no player consumer needs
  // to know the flag exists.
  const allLoreEntries = serverLore.length ? normalizeLore(serverLore) : FALLBACK.lore;
  const visibleLoreEntries = allLoreEntries.filter((e) => e.visibility === 'revealed');

  const theme = useMemo(
    () => normalizeTheme(serverTheme.length ? serverTheme : FALLBACK.theme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(serverTheme)]
  );

  // Inject the themeable CSS vars onto :root whenever the theme changes.
  useEffect(() => {
    const root = document.documentElement;
    const vars = paletteToVars(theme.palette);
    Object.entries(vars).forEach(([k, v]) => {
      if (v != null) root.style.setProperty(k, v);
    });
  }, [theme]);

  const value = {
    loading,
    source:
      serverQuests.length ||
      serverFactions.length ||
      serverCalendar.length ||
      serverLore.length ||
      serverTraits.length ||
      serverCharacters.length ||
      serverItems.length ||
      serverSpells.length ||
      serverImages.length
        ? 'server'
        : 'fallback',
    quests: serverQuests.length ? normalizeQuests(serverQuests) : FALLBACK.quest,
    reputation: serverFactions.length
      ? { Factions: normalizeFactions(serverFactions) }
      : defaultReputation,
    calendarEvents: serverCalendar.length
      ? normalizeCalendar(serverCalendar)
      : FALLBACK.calendar,
    loreEntries: visibleLoreEntries,
    allLoreEntries,
    traits: serverTraits.length ? normalizeTraits(serverTraits) : FALLBACK.trait,
    characters,
    rawCharacters,
    items,
    spells,
    effects,
    runes,
    images,
    theme,
    monsters: serverMonsters,
    // Adventure-room guide (#1074). Capture-only + live-DO-only (Paizo text,
    // public repo), so there's no bundled fallback — an empty array until the
    // GM imports rooms via scripts/importAdventureRooms.js.
    rooms: serverRooms,
    // Chapter-event tracker (#1112). Same capture-only, live-DO-only shape as
    // rooms — imported from the same Foundry journal dump, empty until then.
    events: serverEvents,
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
  loreEntries: FALLBACK.lore.filter((e) => e.visibility === 'revealed'),
  allLoreEntries: FALLBACK.lore,
  traits: FALLBACK.trait,
  characters: FALLBACK.character.map((c) =>
    resolveCharacterItems(c, FALLBACK.item, FALLBACK.spell, FALLBACK.rune)
  ),
  rawCharacters: FALLBACK.character,
  items: FALLBACK.item,
  spells: FALLBACK.spell,
  effects: FALLBACK.effect,
  runes: FALLBACK.rune,
  images: FALLBACK.image,
  theme: FALLBACK.theme ? FALLBACK.theme[0] : undefined,
  monsters: [],
  rooms: [],
  events: [],
  refresh: () => Promise.resolve(),
};

export const useContent = () => useContext(ContentContext) || NOOP_CONTENT;

export { ContentContext };
