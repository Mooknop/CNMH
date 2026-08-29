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
export const PROTOCOL_VERSION = 23;

// Feature protocol floors — the version at which a specific rail became
// available, so an app feature can gate on the capability it needs rather than
// on head. Scene-scoped door feed (#1805): `cnmh_doorreq_global` →
// `cnmh_dooropts_global` (all doors on the rendered scene, secret doors
// included), `cnmh_doorinteract_global`, and the `updateWall` re-push.
export const SCENE_DOORS_PROTOCOL = 20;

// Party-framed snapshot capture + token positions (#1807, epic #1804 S3):
// `snapreq { party: true }` and the `tokens[]` field on `snapdone`. Named
// separately from PROTOCOL_VERSION so a future reader can find which bump
// this feature landed on; the app gates the party map on `protocol >=` this
// constant.
export const PARTY_MAP_PROTOCOL = 21;

// Exploration GROUP move (#1823, epic #1822): `cnmh_groupmovereq_global` →
// `cnmh_groupmovedone_global` — one request moves N selected PCs to spread
// destinations ringing a tapped cell. Named separately from PROTOCOL_VERSION
// for the same reason PARTY_MAP_PROTOCOL is: the app gates multi-select on
// `protocol >=` this constant and caps the selection at 1 below it (today's
// single-move flow IS the degradation).
export const GROUP_MOVE_PROTOCOL = 22;

// Movement PATHFINDING (#1832, epic #1831): every planned route now goes AROUND
// walls (an 8-way A* over grid cells) instead of being clipped straight at the
// first one, and the group-move ring picks connectivity-valid destinations.
//
// NOTE — this bump is a SEMANTICS change, not a shape change: no relay payload
// gained, lost or retyped a field. `moveplanned.clipped` used to mean "a wall is
// in the way, tap again past it" and now means "unreachable even routing around,
// within budget" (the partial route still rides along). The app gates its
// routing-aware hint copy on `protocol >=` this constant and keeps the old
// "tap again" wording below it, which is exactly why the floor is named
// separately from PROTOCOL_VERSION.
export const PATHFIND_PROTOCOL = 23;

// App ↔ bridge relay channels. Values are the bare <type> tokens carried as
// the `key` field on the wire and used as the middle segment of storage keys.
export const RELAY = Object.freeze({
  ACTION: 'action',
  ACTORFEED: 'actorfeed',
  ACTORMAP: 'actormap',
  ADJACENCY: 'adjacency',
  APPLYEFFECT: 'applyeffect',
  AURAMEMBERS: 'auramembers',
  AURASET: 'auraset',
  BRIDGEHELLO: 'bridgehello',
  CASTDONE: 'castdone',
  CASTREQ: 'castreq',
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
  GROUPMOVEDONE: 'groupmovedone',
  GROUPMOVEREQ: 'groupmovereq',
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
  MOVEPLAN: 'moveplan',
  MOVEPLANNED: 'moveplanned',
  MOVEREQ: 'movereq',
  PATHPREVIEW: 'pathpreview',
  PATHPREVIEWGM: 'pathpreviewgm',
  PINGPOINT: 'pingpoint',
  PLAYMODE: 'playmode',
  POSITIONS: 'positions',
  POSITIONSREQ: 'positionsreq',
  ROLLDONE: 'rolldone',
  ROLLREQ: 'rollreq',
  ROSTER: 'roster',
  ROSTERREQ: 'rosterreq',
  SAVEDONE: 'savedone',
  SAVEROLL: 'saveroll',
  SHIELDRAISE: 'shieldraise',
  SNAPDONE: 'snapdone',
  SNAPREQ: 'snapreq',
  SPAWNMINION: 'spawnminion',
  STRIKEDONE: 'strikedone',
  STRIKEREQ: 'strikereq',
  SUMMONPOOL: 'summonpool',
  SUMMONPOOLREQ: 'summonpoolreq',
  TEMPLATEDONE: 'templatedone',
  TEMPLATEPLACE: 'templateplace',
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
