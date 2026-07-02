// Vocoder of Invisibility (#935): while the wielder is playing (a Composition
// cantrip sustained — see utils/playing.js), the device's sonic veil makes them
// Concealed. Pure helpers for the grant/removal; the watcher lives in
// useVocoderConcealSweep.
//
// The condition is written into cnmh_conditions_<charId> as the real
// `concealed` entry, tagged `source: 'vocoder'` so removal never touches a
// manually toggled Concealed. Hydration ignores the extra field (display comes
// from the canonical defs), and the raw synced array preserves it.

import { flattenInventory } from './InventoryUtils';

export const VOCODER_ID = 'vocoder-of-invisibility';
const CONCEAL_SOURCE = 'vocoder';

export const hasVocoder = (inventory) =>
  flattenInventory(inventory).some((it) => it?.id === VOCODER_ID);

/**
 * Next conditions array with the vocoder-granted Concealed added, or null when
 * no write is needed — already concealed by any source (a manual toggle wins;
 * we never stack a second entry under the same id).
 */
export const withVocoderConcealed = (conditions) => {
  const list = Array.isArray(conditions) ? conditions : [];
  if (list.some((c) => c?.id === 'concealed')) return null;
  return [...list, { id: 'concealed', value: null, source: CONCEAL_SOURCE }];
};

/**
 * Next conditions array with only the vocoder-granted entry removed, or null
 * when none exists. A manually toggled Concealed (no source tag) is left alone.
 */
export const withoutVocoderConcealed = (conditions) => {
  const list = Array.isArray(conditions) ? conditions : [];
  const kept = list.filter((c) => !(c?.id === 'concealed' && c?.source === CONCEAL_SOURCE));
  return kept.length === list.length ? null : kept;
};
