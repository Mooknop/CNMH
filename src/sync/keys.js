// App-side entry point for the shared sync-key registry (#1307). The
// definition lives in foundry-bridge/syncKeys.js because it must ship inside
// the Foundry module (which has no build step); app code imports from here so
// the cross-package path exists in exactly one place. App-only key types (the
// non-relay cnmh_* channels) join this module in the follow-up migration.
export { GLOBAL_ID, RELAY, syncKey, globalKey } from '../../foundry-bridge/syncKeys.js';
