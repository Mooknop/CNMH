// src/utils/shieldRuneStrike.js
// Strike-side shield property-rune wiring (#1246 — Class C self-side runes).
//
// Two rune families ride a shield's OWN Strikes (the derived Shield Bash /
// Shield Throw, shieldStrikes.js, and a bound attachment's Strike,
// shieldAttach.js):
//
//   Thirsting (2/5/10): "When you hit a creature that has blood or a similar
//   life essence with this shield or any attachment or adjustment on this
//   shield and deal damage, the shield regains N Hit Points." Wired as a
//   confirm-time applier (applyThirstingOnHit) that writes the shared item-HP
//   overlay (cnmh_itemhp_, #541) — the same live HP useShield/useItemHp read.
//
//   Reverberating (×1/×2/×3 weapon dice + 2d4/4d4/6d4 persistent on crit):
//   the shockwave of a Shield Block (or a raised-shield-caused miss) is stored
//   for 1 round and released on the next hit with the shield. The charge
//   itself has no engine (nothing observes enemy misses), so the release is an
//   OPT-IN pair of damage riders on the shield's strikes — off by default, the
//   player ticks them when a charge is stored (ShieldBlockBar logs a reminder
//   on every block with this rune). The flat sonic add uses the existing
//   perWeaponDie rider bonus; the crit rider carries the persistent sonic dice
//   and the deafened note, gated to criticalSuccess.
//
// Pure/React-free; the applier receives its rails (getState/sendUpdate/log)
// in the arg bag, like strikeOnCrit.js.

import { itemUidOf } from './affix';
import { flattenInventory } from './InventoryUtils';
import { entryHpStatus, restoreItemHp } from './itemDurability';
import { APP, syncKey } from '../sync/keys';

// Local-persistence mirror of the sendUpdate write (the consumables/hymnHealing
// pattern): sendUpdate echoes to mounted local subscribers, but localStorage is
// what a reload re-hydrates from before the socket answers.
const writeLocal = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable — the synced write still lands */ }
};

// Thirsting grade → shield HP regained per damaging hit. Code-owned, like
// shieldRuneEffects' ENERGY_RESISTANT_AMOUNT.
export const THIRSTING_REGAIN = {
  thirsting: 2,
  'greater-thirsting': 5,
  'major-thirsting': 10,
};

// Reverberating grade → sonic damage per weapon damage die on release, and the
// crit-only persistent sonic dice ("2d4 persistent sonic, and deafening the
// target for 1 minute" — 4d4/6d4 at greater/major).
export const REVERBERATING = {
  reverberating: { perDie: 1, critPersistent: '2d4' },
  'greater-reverberating': { perDie: 2, critPersistent: '4d4' },
  'major-reverberating': { perDie: 3, critPersistent: '6d4' },
};

// Resolved property-rune docs on an item's runes block (objects only — bare
// string refs carry no name and are skipped, matching heldShieldRuneEffects).
const propertyRunesOf = (item) =>
  (item?.runes && Array.isArray(item.runes.property) ? item.runes.property : [])
    .filter((p) => p && typeof p === 'object');

/**
 * Damage riders a shield's property runes contribute to Strikes made WITH the
 * shield (bash / throw / bound attachment). Currently: the Reverberating
 * release pair. Both riders are defaultOn:false — the player opts in on the
 * strike where the stored charge is spent.
 *
 * @param {Object|null} shieldItem - the host shield inventory entry
 * @returns {Array} damage-step riders (damage.js shape)
 */
export const shieldRuneStrikeRiders = (shieldItem) => {
  const riders = [];
  for (const rune of propertyRunesOf(shieldItem)) {
    const rev = REVERBERATING[rune.id];
    if (rev) {
      riders.push({
        id: 'reverberating-charge',
        label: `${rune.name} (sonic)`,
        bonus: { perWeaponDie: rev.perDie },
        defaultOn: false,
        note: 'needs the stored charge: a Shield Block or shield-caused miss within the last round',
      });
      riders.push({
        id: 'reverberating-crit',
        label: `${rune.name} — charged crit`,
        persistent: { dice: rev.critPersistent, type: 'sonic' },
        condition: 'deafened 1 minute',
        on: ['criticalSuccess'],
        defaultOn: false,
      });
    }
  }
  return riders;
};

/**
 * The thirsting regain a shield's runes grant, or null.
 * @returns {{ amount: number, name: string }|null}
 */
export const thirstingRegainFor = (shieldItem) => {
  for (const rune of propertyRunesOf(shieldItem)) {
    const amount = THIRSTING_REGAIN[rune.id];
    if (amount) return { amount, name: rune.name };
  }
  return null;
};

// Flat result list across single-roll / multi-ray / chained strikes — the same
// normalization strikeOnCrit.js uses.
const strikeResults = (rayGroups, chainResults) => [
  ...(rayGroups || []).flatMap((g) => g?.results || []),
  ...((chainResults?.rolls || []).flat()),
];

/**
 * Thirsting (#1246): after a Strike made with a thirsting-runed shield
 * confirms, regain shield HP per damaging hit — capped at the shield's max
 * (reinforcing-rune folded, entryHpStatus). Writes the shared cnmh_itemhp_
 * overlay so useShield / useItemHp / the durability chips all see it.
 *
 * A "damaging hit" is a success/criticalSuccess result whose entered damage
 * netted above 0 (a fully-resisted hit dealt nothing; a hit whose damage step
 * was skipped recorded no damage and doesn't regain). The "blood or a similar
 * life essence" requirement can't be proven app-side, so the log line carries
 * the reminder and the GM keeps the call.
 *
 * @param {Object} bag - { ability, character, rayGroups, chainResults,
 *   getState, sendUpdate, appendLog }
 */
export const applyThirstingOnHit = ({
  ability,
  character,
  rayGroups,
  chainResults,
  getState,
  sendUpdate,
  appendLog,
}) => {
  const hostUid = ability?.hostUid;
  if (!hostUid || !(ability.shieldBash || ability.shieldAttachment)) return;
  const flat = flattenInventory(character?.inventory || []);
  const shieldEntry = flat.find((e) => e && e.shield && itemUidOf(e) === hostUid);
  const thirsting = thirstingRegainFor(shieldEntry);
  if (!thirsting) return;

  const damagingHits = strikeResults(rayGroups, chainResults).filter(
    (r) => (r?.degree === 'success' || r?.degree === 'criticalSuccess')
      && (r.damage?.final ?? 0) > 0
  );
  if (!damagingHits.length) return;

  const overlay = getState(character.id, APP.ITEMHP) || {};
  const status = entryHpStatus(shieldEntry, overlay[hostUid]);
  if (!status || status.destroyed) return; // a destroyed shield is beyond thirst
  const next = restoreItemHp({
    hp: status.hp,
    maxHp: status.maxHp,
    amount: thirsting.amount * damagingHits.length,
  });
  if (next === status.hp) return; // already at max — nothing to log
  const nextOverlay = { ...overlay, [hostUid]: { hp: next } };
  writeLocal(syncKey(APP.ITEMHP, character.id), nextOverlay);
  sendUpdate(character.id, APP.ITEMHP, nextOverlay);
  appendLog({
    type: 'system',
    text: `${thirsting.name}: ${character.name}'s shield drinks deep — regains `
      + `${next - status.hp} HP (${next}/${status.maxHp}). `
      + 'Target must have blood or a similar life essence (GM call).',
  });
};

export default applyThirstingOnHit;
