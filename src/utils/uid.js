// Stable per-inventory-entry id. Every authored inventory entry (top-level and
// nested container contents) carries a `uid` so the durable live-loadout layer
// (cnmh_loadout_<characterId>) can target one specific entry and duplicates are
// independently trackable. Bundled sheets are stamped once by
// scripts/buildEntryUids.js (deterministic <charId>-<n>); the GM editor mints a
// fresh one here for entries added at runtime. uid is inert metadata until the
// live layer (later slices) reads it — absent ⇒ effective == authored.
export const newEntryUid = () =>
  `e-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
