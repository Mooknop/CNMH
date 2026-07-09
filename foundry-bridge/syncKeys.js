// Shared sync-key registry (#1307) — the single code-level definition of the
// cnmh_<type>_<id> vocabulary relayed between the app and the Foundry bridge.
//
// This file is dependency-free ESM on purpose: it ships inside the Foundry
// module (which has no build step) AND is imported by the app through
// src/sync/keys.js. Payload shapes for every channel: foundry-bridge/README.md
// ("Relay keys" table).
//
// Key format: `cnmh_<type>_<id>` — <type> must not contain underscores (the
// app parses keys with /^cnmh_([^_]+)_(.+)$/ in useSyncedState); <id> is a
// character id or GLOBAL_ID.

export const GLOBAL_ID = 'global';

// App ↔ bridge relay channels. Values are the bare <type> tokens carried as
// the `key` field on the wire and used as the middle segment of storage keys.
export const RELAY = Object.freeze({
  ACTION: 'action',
  ACTORFEED: 'actorfeed',
  ACTORMAP: 'actormap',
  ADJACENCY: 'adjacency',
  APPLYEFFECT: 'applyeffect',
  CONDITIONS: 'conditions',
  DMGAPPLY: 'dmgapply',
  DMGDONE: 'dmgdone',
  DOORINTERACT: 'doorinteract',
  DOOROPTS: 'dooropts',
  DOORREQ: 'doorreq',
  ENCOUNTER: 'encounter',
  EXPLOREMOVE: 'exploremove',
  FLANKED: 'flanked',
  FOUNDRYEFFECTS: 'foundryeffects',
  HEROPOINTS: 'heropoints',
  HP: 'hp',
  INITCOMMIT: 'initcommit',
  INITROLL: 'initroll',
  MINIONACTORS: 'minionactors',
  MINIONACTORSREQ: 'minionactorsreq',
  MINIONS: 'minions',
  MOVECONFIRM: 'moveconfirm',
  MOVEDONE: 'movedone',
  MOVEOPTS: 'moveopts',
  MOVEREQ: 'movereq',
  POSITIONS: 'positions',
  POSITIONSREQ: 'positionsreq',
  ROSTER: 'roster',
  ROSTERREQ: 'rosterreq',
  SAVEDONE: 'savedone',
  SAVEROLL: 'saveroll',
  SHIELDRAISE: 'shieldraise',
  SPAWNMINION: 'spawnminion',
  SUMMONPOOL: 'summonpool',
  SUMMONPOOLREQ: 'summonpoolreq',
  TURNCMD: 'turncmd',
});

// Compose a full storage/subscription key: syncKey(RELAY.HP, charId).
export function syncKey(type, id) {
  return `cnmh_${type}_${id}`;
}

// Encounter-wide channels use the shared 'global' id.
export function globalKey(type) {
  return syncKey(type, GLOBAL_ID);
}
