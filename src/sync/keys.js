// App-side entry point for the shared sync-key registry (#1307). The relay
// vocabulary lives in foundry-bridge/syncKeys.js (it must ship inside the
// Foundry module, which has no build step); app code imports from here so the
// cross-package path exists in exactly one place.
//
// Adding a channel? Bridge-relayed types go in foundry-bridge/syncKeys.js
// (RELAY) + the README table; app-only types go in APP below. An ESLint rule
// bans hand-written `cnmh_` literals in src/ (tests excepted), so every key
// must come from this module.
// PARTY_MAP_PROTOCOL (#1807) is a bridge-owned FEATURE FLOOR rather than a key,
// but it lives in the same dependency-free bridge module for the same reason
// the key builders do — so it re-exports through here too, keeping the
// cross-package path in exactly one place. utils/snapshotRelay.js re-exports it
// alongside the snapshot rail's other floors, which is where consumers read it.
export { GLOBAL_ID, syncKey, globalKey, PARTY_MAP_PROTOCOL } from '../../foundry-bridge/syncKeys.js';
import { RELAY as BRIDGE_RELAY } from '../../foundry-bridge/syncKeys.js';

// #1736 S2 (app-only slice): the plan/confirm movement rail's relay pair.
// The paired bridge PR (#1736 S1) adds the same two entries to
// foundry-bridge/syncKeys.js RELAY — that's the eventual single source of
// truth. Declaring them here too lets the app-only slice ship independently
// without touching foundry-bridge/ (a sibling agent owns that PR); once both
// merge this becomes a harmless duplicate and can fold back into a plain
// re-export.
export const RELAY = Object.freeze({
  ...BRIDGE_RELAY,
  MOVEPLAN: 'moveplan',
  MOVEPLANNED: 'moveplanned',
});

// App-only channels — synced between app clients (and persisted by the
// CampaignSession DO) but never consumed by the Foundry bridge. Same
// cnmh_<type>_<id> namespace as RELAY, so tokens must stay unique across both.
export const APP = Object.freeze({
  ABSORBED: 'absorbed',
  ACQUIRED: 'acquired',
  AFFIXED: 'affixed',
  ATTACHED: 'attached',
  AURA: 'aura',
  BLADE: 'blade',
  BYSTANDER: 'bystander',
  CAMPAIGN: 'campaign',
  CHAMBERS: 'chambers',
  CLOCK: 'clock',
  COMBATSECS: 'combatsecs',
  CONSUMED: 'consumed',
  CRAFTPROJECTS: 'craftprojects',
  DOWNTIME: 'downtime',
  DOWNTIMEBENCH: 'downtimebench',
  DOWNTIMEBLOCK: 'downtimeblock',
  DOWNTIMERESULTS: 'downtimeresults',
  DOWNTIMESUMMARY: 'downtimesummary',
  EARNINCOMETASK: 'earnincometask',
  EFFECTS: 'effects',
  ELDATTUNE: 'eldattune',
  ENCAUTO: 'encauto',
  ENEMYFX: 'enemyfx',
  EXPLOIT: 'exploit',
  EXPLORATION: 'exploration',
  EXPLOREDIST: 'exploredist',
  EXPLOREOVERRIDE: 'exploreoverride',
  FIELDNOTES: 'fieldnotes',
  FOCUS: 'focus',
  FOCUSTARGET: 'focustarget',
  FOLLOWEXPERT: 'followexpert',
  FREQ: 'freq',
  FX: 'fx',
  GOLD: 'gold',
  GRANTEDACTIONS: 'grantedactions',
  HUNTPREY: 'huntprey',
  INVESTED: 'invested',
  ITEMBROKEN: 'itembroken',
  ITEMEFFECTS: 'itemeffects',
  ITEMHP: 'itemhp',
  ITEMMODE: 'itemmode',
  KNOWLEDGE: 'knowledge',
  LINGERING: 'lingering',
  LOADOUT: 'loadout',
  LOOTAREAS: 'lootareas',
  LOOTDROP: 'lootdrop',
  OMEN: 'omen',
  PERSISTENT: 'persistent',
  PINNEDROOM: 'pinnedroom',
  PLAYING: 'playing',
  REACTORS: 'reactors',
  REACTPROMPT: 'reactprompt',
  READIED: 'readied',
  REMOVED: 'removed',
  RUNECONFIG: 'runeconfig',
  RUNEWORK: 'runework',
  SAVEPROMPT: 'saveprompt',
  SCOUTBONUS: 'scoutbonus',
  SESSIONLOG: 'sessionlog',
  SHIELDSTATE: 'shieldstate',
  SHOPS: 'shops',
  SKILLPROMPT: 'skillprompt',
  SLOTS: 'slots',
  SPELLCOUNTERS: 'spellcounters',
  SPELLGUNATK: 'spellgunatk',
  STAFF: 'staff',
  STAFFPREP: 'staffprep',
  STANCE: 'stance',
  SUMMONS: 'summons',
  SUPPORT: 'support',
  SUSTAINS: 'sustains',
  TAKE10: 'take10',
  TAKE10ALLOC: 'take10alloc',
  TELLFORTUNE: 'tellfortune',
  TRAINING: 'training',
  TURNSTATE: 'turnstate',
  VERACIOUS: 'veracious',
  VPCHALLENGE: 'vpchallenge',
  VPRESULT: 'vpresult',
  WANDS: 'wands',
  WAYFINDER: 'wayfinder',
});
