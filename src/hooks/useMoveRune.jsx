import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useSessionLog } from './useSessionLog';
import { docGold } from '../utils/gold';
import { computeSaveDegree } from '../utils/saveDegree';
import { foldRuneIntoWeapon } from '../utils/runeWorkOrder';
import { moveRuneDc, moveRuneOutcome, removeRuneFromWeapon, runestoneEntryFor } from '../utils/moveRune';
import { APP, syncKey } from '../sync/keys';

// Move a rune (#803). A 1-hour Crafting check relocates a property rune between
// a weapon and a runestone: Standard DC vs the rune's level-based DC, resolved
// by degree of success (crit = free, success = −10% value, failure = no-op,
// crit-fail = rune destroyed). The weapon is always swapped for a fresh copy
// (the rune added or removed); a runestone that gives up its rune cracks and is
// consumed, and a weapon that gives up its rune mints a new filled runestone.
//
// Overlay edits mirror useRuneWork: an entry the player bought lives in
// `cnmh_acquired_`, so it is spliced; an authored entry is masked via
// `cnmh_removed_`. New entries are credited to the acquired overlay. All
// acquired changes go through a single setAcquired call so two pulls/credits in
// one move can't clobber each other.
export const useMoveRune = (charId) => {
  const { connected, foundryConnected } = useSession();
  const { characters } = useContent();
  const { appendEvent } = useSessionLog();

  const byId = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c])),
    [characters],
  );

  const [gold, setGold] = useSyncedState(syncKey(APP.GOLD, charId || 'none'), docGold(byId[charId]));
  const [acquired, setAcquired] = useSyncedState(syncKey(APP.ACQUIRED, charId || 'none'), []);
  const [, setRemoved] = useSyncedState(syncKey(APP.REMOVED, charId || 'none'), []);

  const offline = connected && !foundryConnected;
  const who = byId[charId]?.name || 'Someone';

  // Resolve and apply a move. `direction` is 'toWeapon' (runestone→weapon) or
  // 'toRunestone' (weapon→runestone). `replaceRuneId` (toWeapon only) names a
  // property rune already on the weapon to displace when no slot is free — the
  // displaced rune is minted as a fresh runestone (#804). Returns { degree,
  // outcome } on a resolved roll (even a no-op failure), or null when the move is
  // rejected outright (offline, bad input, or not enough gold for the upkeep).
  const move = useCallback(
    ({ direction, weapon, runestone, rune, replaceRuneId, d20, total }) => {
      if (offline || !charId) return null;
      if (!weapon || weapon.uid == null || !rune || rune.id == null) return null;
      if (direction === 'toWeapon' && (!runestone || runestone.uid == null)) return null;

      const runeRef = rune.id;
      const dc = moveRuneDc(rune.level);
      const degree = computeSaveDegree({ d20, total, dc });
      const outcome = moveRuneOutcome(degree, rune.price);
      if (outcome.moved && outcome.costGp > gold) return null; // can't fund the upkeep

      // Accumulate overlay edits, then commit once.
      const mine = Array.isArray(acquired) ? acquired : [];
      const isAcq = (uid) => mine.some((e) => e && e.uid === uid);
      const splice = new Set();
      const mask = [];
      const credit = [];
      const pull = (uid) => { if (isAcq(uid)) splice.add(uid); else mask.push(uid); };

      if (direction === 'toWeapon') {
        if (outcome.moved) {
          pull(weapon.uid);
          // Displace an existing rune first when replacing (no free slot); the
          // displaced rune is re-housed in a fresh runestone.
          const base = replaceRuneId ? removeRuneFromWeapon(weapon, replaceRuneId) : weapon;
          credit.push(foldRuneIntoWeapon(base, runeRef));
          if (replaceRuneId) credit.push(runestoneEntryFor(replaceRuneId));
          pull(runestone.uid); // the stone cracks on transfer
        } else if (outcome.destroyed) {
          pull(runestone.uid); // consumed; the rune is lost with it
        }
      } else { // toRunestone
        if (outcome.moved) {
          pull(weapon.uid);
          credit.push(removeRuneFromWeapon(weapon, runeRef));
          credit.push(runestoneEntryFor(runeRef));
        } else if (outcome.destroyed) {
          pull(weapon.uid);
          credit.push(removeRuneFromWeapon(weapon, runeRef)); // rune gone, no stone minted
        }
      }

      // Commit overlays only when something actually changed (failure is inert).
      if (splice.size || credit.length) {
        setAcquired([...mine.filter((e) => !(e && splice.has(e.uid))), ...credit]);
      }
      if (mask.length) {
        setRemoved((cur) => {
          const set = Array.isArray(cur) ? cur : [];
          const add = mask.filter((uid) => !set.includes(uid));
          return add.length ? [...set, ...add] : set;
        });
      }
      if (outcome.costGp > 0) setGold(gold - outcome.costGp);

      const dest = direction === 'toWeapon' ? weapon.name || 'a weapon' : 'a runestone';
      const text = outcome.destroyed
        ? `${who}'s ${rune.name} rune was destroyed in a failed transfer`
        : outcome.moved
          ? `${who} moved the ${rune.name} rune to ${dest}${outcome.costGp ? ` (expended ${outcome.costGp} gp)` : ' (no cost)'}`
          : `${who} failed to move the ${rune.name} rune — no effect`;
      appendEvent({ type: 'action', text });

      return { degree, outcome };
    },
    [offline, charId, gold, acquired, setAcquired, setRemoved, setGold, appendEvent, who],
  );

  return { move };
};

export default useMoveRune;
