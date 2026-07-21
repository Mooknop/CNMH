// App-side loader for the bridge relay-payload fixtures (#1308).
//
// These JSON files are RECORDED from real bridge emissions by
// foundry-bridge/relayContract.test.js (RELAY_FIXTURES=record). The bridge
// suite shape-checks its live emissions against them; app tests consume the
// same files — so a payload field rename fails a named test on both sides.
// Never hand-edit a fixture: re-record instead.
import actorfeed from '../../foundry-bridge/__fixtures__/relay/actorfeed.json';
import adjacency from '../../foundry-bridge/__fixtures__/relay/adjacency.json';
import conditions from '../../foundry-bridge/__fixtures__/relay/conditions.json';
import dmgdone from '../../foundry-bridge/__fixtures__/relay/dmgdone.json';
import dooropts from '../../foundry-bridge/__fixtures__/relay/dooropts.json';
import encounter from '../../foundry-bridge/__fixtures__/relay/encounter.json';
import exploremove from '../../foundry-bridge/__fixtures__/relay/exploremove.json';
import flanked from '../../foundry-bridge/__fixtures__/relay/flanked.json';
import foekit from '../../foundry-bridge/__fixtures__/relay/foekit.json';
import foundryeffects from '../../foundry-bridge/__fixtures__/relay/foundryeffects.json';
import heropoints from '../../foundry-bridge/__fixtures__/relay/heropoints.json';
import hp from '../../foundry-bridge/__fixtures__/relay/hp.json';
import minionactors from '../../foundry-bridge/__fixtures__/relay/minionactors.json';
import minions from '../../foundry-bridge/__fixtures__/relay/minions.json';
import movedone from '../../foundry-bridge/__fixtures__/relay/movedone.json';
import moveopts from '../../foundry-bridge/__fixtures__/relay/moveopts.json';
import positions from '../../foundry-bridge/__fixtures__/relay/positions.json';
import rolldone from '../../foundry-bridge/__fixtures__/relay/rolldone.json';
import roster from '../../foundry-bridge/__fixtures__/relay/roster.json';
import savedone from '../../foundry-bridge/__fixtures__/relay/savedone.json';
import summonpool from '../../foundry-bridge/__fixtures__/relay/summonpool.json';

// Keyed by the RELAY channel token; each entry is { characterId, value } as
// captured on the wire.
export const relayFixtures = {
  actorfeed, adjacency, conditions, dmgdone, dooropts, encounter, exploremove,
  flanked, foekit, foundryeffects, heropoints, hp, minionactors, minions,
  movedone, moveopts, positions, rolldone, roster, savedone, summonpool,
};

// Push a fixture into a test session bus as if the bridge sent it.
// `charId` overrides the recorded characterId (per-character channels);
// remaining overrides shallow-merge into an object payload (e.g. to correlate
// a reqTs with the ts the hook actually sent).
export function pushRelayFixture(bus, channel, { charId, ...overrides } = {}) {
  const fx = relayFixtures[channel];
  if (!fx) throw new Error(`no relay fixture for channel '${channel}'`);
  const isPlainObject = fx.value !== null && typeof fx.value === 'object' && !Array.isArray(fx.value);
  const value = isPlainObject ? { ...fx.value, ...overrides } : fx.value;
  bus.push(charId ?? fx.characterId, channel, value);
  return value;
}
