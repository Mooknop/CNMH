// Hunt Prey designation (#223). Ashka marks one creature as her prey; the
// designation is keyed by the creature's stable rkKey (creatureKey when the
// bridge supplies one, else the per-combatant entryId), so same-type enemies
// all match — mirroring Exploit Vulnerability's targeting. React-free helpers.
import { rkKeyFor } from './recallKnowledge';

// The stable key to designate a given enemy order entry as prey.
export const preyKeyFor = (enemy) => rkKeyFor(enemy);

// Build the synced prey entry stored at cnmh_huntprey_<charId>.
export const makePreyEntry = ({ targetKey, targetName }) => ({
  targetKey,
  targetName: targetName || '',
  ts: Date.now(),
});

// True when an encounter order entry is the hunter's current prey. Matches by
// rkKey so all same-creatureKey enemies are flagged; a manual enemy (no
// creatureKey) matches only its own entry.
export const preyMatches = (prey, enemyEntry) =>
  !!prey?.targetKey && !!enemyEntry && rkKeyFor(enemyEntry) === prey.targetKey;
