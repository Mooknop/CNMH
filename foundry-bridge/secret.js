// The relay secret — deliberately NOT in the repo.
//
// The Worker gates /bridge/:campaignId (and /api/bridge/image) on a shared
// secret. It used to live as a plaintext constant in config.js, which meant it
// shipped inside every public release zip and sat in the public repo's history:
// anyone who read either could connect as the bridge and write session state.
//
// It now lives in a per-world Foundry module setting ("Relay secret", registered
// in bridge.js), read here through the pf2eAdapter settings seam. The GM pastes
// it once per world; nothing in git or the zip ever carries it.
//
// A blank secret means "not configured" — callers must refuse to talk to the
// Worker rather than hammer it with requests that can only 403.

import { getModuleSetting } from './pf2eAdapter.js';

export const MODULE_ID = 'cnmh-bridge';
export const SECRET_SETTING = 'bridgeSecret';

// The configured relay secret, or '' when unset. Trimmed — a paste that picks up
// surrounding whitespace would otherwise fail auth with no visible cause.
export function getBridgeSecret() {
  const value = getModuleSetting(MODULE_ID, SECRET_SETTING);
  return typeof value === 'string' ? value.trim() : '';
}
