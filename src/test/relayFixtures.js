// App-side loader for the bridge relay-payload fixtures (#1308).
//
// These JSON files are RECORDED from real bridge emissions by
// foundry-bridge/relayContract.test.js (RELAY_FIXTURES=record). The bridge
// suite shape-checks its live emissions against them; app tests consume the
// same files — so a payload field rename fails a named test on both sides.
// Never hand-edit a fixture: re-record instead.
import { RELAY } from '../sync/keys';
import actorfeed from '../../foundry-bridge/__fixtures__/relay/actorfeed.json';
import adjacency from '../../foundry-bridge/__fixtures__/relay/adjacency.json';
import auramembers from '../../foundry-bridge/__fixtures__/relay/auramembers.json';
import castdone from '../../foundry-bridge/__fixtures__/relay/castdone.json';
import conditions from '../../foundry-bridge/__fixtures__/relay/conditions.json';
import dmgdone from '../../foundry-bridge/__fixtures__/relay/dmgdone.json';
import dooropts from '../../foundry-bridge/__fixtures__/relay/dooropts.json';
import dooroptsGlobal from '../../foundry-bridge/__fixtures__/relay/dooropts_global.json';
import encounter from '../../foundry-bridge/__fixtures__/relay/encounter.json';
import exploremove from '../../foundry-bridge/__fixtures__/relay/exploremove.json';
import flanked from '../../foundry-bridge/__fixtures__/relay/flanked.json';
import foekit from '../../foundry-bridge/__fixtures__/relay/foekit.json';
import foundryeffects from '../../foundry-bridge/__fixtures__/relay/foundryeffects.json';
import groupmovedone from '../../foundry-bridge/__fixtures__/relay/groupmovedone.json';
import heropoints from '../../foundry-bridge/__fixtures__/relay/heropoints.json';
import hp from '../../foundry-bridge/__fixtures__/relay/hp.json';
import minionactors from '../../foundry-bridge/__fixtures__/relay/minionactors.json';
import minions from '../../foundry-bridge/__fixtures__/relay/minions.json';
import movedone from '../../foundry-bridge/__fixtures__/relay/movedone.json';
import moveopts from '../../foundry-bridge/__fixtures__/relay/moveopts.json';
import moveplanned from '../../foundry-bridge/__fixtures__/relay/moveplanned.json';
import pathpreview from '../../foundry-bridge/__fixtures__/relay/pathpreview.json';
import pathpreviewgm from '../../foundry-bridge/__fixtures__/relay/pathpreviewgm.json';
import positions from '../../foundry-bridge/__fixtures__/relay/positions.json';
import rolldone from '../../foundry-bridge/__fixtures__/relay/rolldone.json';
import roster from '../../foundry-bridge/__fixtures__/relay/roster.json';
import savedone from '../../foundry-bridge/__fixtures__/relay/savedone.json';
import snapdoneParty from '../../foundry-bridge/__fixtures__/relay/snapdone-party.json';
import strikedone from '../../foundry-bridge/__fixtures__/relay/strikedone.json';
import summonpool from '../../foundry-bridge/__fixtures__/relay/summonpool.json';

// Keyed by the RELAY channel token; each entry is { characterId, value } as
// captured on the wire.
//
// SYNTHETIC KEYS: a channel whose payload has two genuinely different shapes
// gets one fixture per shape, which means the key can no longer BE the channel
// token (they'd clobber each other). `snapdoneParty` is the party-framed
// `snapdone` ack (#1807 — `tokens[]` present, `moverId: null`), distinct from
// the legacy GM-view `snapdone.json`; `dooroptsGlobal` is the GLOBAL-id shape
// of `dooropts` (#1805/#1809 — EVERY door on the scene, `secret?` present),
// distinct from the per-character proximity-filtered `dooropts.json`.
// SYNTHETIC_CHANNELS below maps each back to the channel it actually rides on
// so `pushRelayFixture` still lands it on the right key.
export const relayFixtures = {
  actorfeed, adjacency, auramembers, castdone, conditions, dmgdone, dooropts, dooroptsGlobal, encounter,
  exploremove, flanked, foekit, foundryeffects, groupmovedone, heropoints, hp, minionactors, minions,
  movedone, moveopts, moveplanned, pathpreview, pathpreviewgm, positions, rolldone, roster,
  savedone, snapdoneParty, strikedone, summonpool,
};

const SYNTHETIC_CHANNELS = {
  snapdoneParty: RELAY.SNAPDONE,
  dooroptsGlobal: RELAY.DOOROPTS,
};

// Push a fixture into a test session bus as if the bridge sent it.
// `charId` overrides the recorded characterId (per-character channels);
// remaining overrides shallow-merge into an object payload (e.g. to correlate
// a reqTs with the ts the hook actually sent). `channel` is normally the RELAY
// token itself; a synthetic key (see SYNTHETIC_CHANNELS) resolves to the token
// its shape rides on.
export function pushRelayFixture(bus, channel, { charId, ...overrides } = {}) {
  const fx = relayFixtures[channel];
  if (!fx) throw new Error(`no relay fixture for channel '${channel}'`);
  const wireChannel = SYNTHETIC_CHANNELS[channel] || channel;
  const isPlainObject = fx.value !== null && typeof fx.value === 'object' && !Array.isArray(fx.value);
  const value = isPlainObject ? { ...fx.value, ...overrides } : fx.value;
  bus.push(charId ?? fx.characterId, wireChannel, value);
  return value;
}
