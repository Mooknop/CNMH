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

// App↔bridge wire protocol version (#1310). The bridge announces it on
// cnmh_bridgehello_global every time it connects; the app warns the GM when a
// connected bridge's protocol predates the app's minimum (or when no hello
// arrives at all — a pre-handshake module).
//
// BUMP POLICY: any change to a relay payload shape bumps this — new fields
// included (an old bridge silently not sending a field the app now expects is
// exactly the degradation this exists to surface). Bump it in the same PR as
// the payload change; the app-side minimum (src/hooks/useBridgeStatus.js)
// decides when old protocols stop being acceptable.
export const PROTOCOL_VERSION = 5;

// App ↔ bridge relay channels. Values are the bare <type> tokens carried as
// the `key` field on the wire and used as the middle segment of storage keys.
export const RELAY = Object.freeze({
  ACTION: 'action',
  ACTORFEED: 'actorfeed',
  ACTORMAP: 'actormap',
  ADJACENCY: 'adjacency',
  APPLYEFFECT: 'applyeffect',
  BRIDGEHELLO: 'bridgehello',
  CONDITIONS: 'conditions',
  DICESETS: 'dicesets',
  DMGAPPLY: 'dmgapply',
  DMGDONE: 'dmgdone',
  DOORINTERACT: 'doorinteract',
  DOOROPTS: 'dooropts',
  DOORREQ: 'doorreq',
  ENCOUNTER: 'encounter',
  EXPLOREMOVE: 'exploremove',
  FLANKED: 'flanked',
  FOEKIT: 'foekit',
  FOUNDRYEFFECTS: 'foundryeffects',
  FXPLAY: 'fxplay',
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
  ROLLDONE: 'rolldone',
  ROLLREQ: 'rollreq',
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
