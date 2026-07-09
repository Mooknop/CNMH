# CNMH Foundry Bridge (`cnmh-bridge`)

A Foundry VTT module that connects a world to the CNMH app over the Cloudflare
session relay. The bridge is a normal session peer: it sends and receives
`{ type:'UPDATE', characterId, key, value }` messages alongside the player
devices.

## Layout

| File | Role |
| --- | --- |
| `bridge.js` | Entry point. WebSocket lifecycle + incoming-message dispatch + roster push. |
| `encounter.js` | Combat hooks ↔ app encounter/turn tracker. |
| `actorFeed.js` | Active-combatant chat-message feed + per-turn action economy (#472b). |
| `characterSync.js` | HP / conditions / hero points sync (both directions) + Foundry effect items → app. |
| `minionSync.js` | Companion/familiar HP + conditions ↔ linked Foundry actors (#362). |
| `minionActors.js` | Ownership-derived minion→PC links + spawn-token handler (#362). |
| `summonPool.js` | Summons-folder actor snapshot for the GM's Add-summon modal (#261). |
| `movement.js` | Token movement: 8-direction step probe + move write-back. |
| `doors.js` | Door detection near the PC token + open/close interaction. |
| `targeting.js` | Combat-action targeting: resolve entry ids → set Foundry user targets; off-guard annotation for flanking melee strikes. |
| `effects.js` | Apply compendium effect items to target actors on app request. |
| `damageApply.js` | Apply the app damage step's typed totals via PF2e `applyDamage` (#1016). |
| `saves.js` | Roll enemy saving throws natively for the app's save-request rail (#1275). |
| `flanking.js` | Pure geometry — `computeFlanking` (no Foundry globals). |
| `flankingPush.js` | Hooks into token-move / turn-advance to push flanked state to the app. |
| `adjacency.js` | Pure geometry — `computeAdjacency` (no Foundry globals). |
| `adjacencyPush.js` | Hooks into token-move / combat lifecycle to push combatant adjacency (#430). |
| `positions.js` | Hooks into token-move / combat lifecycle to push each combatant's grid cell to the app (range-increment measurement). |
| `pf2eAdapter.js` | **The seam.** Every Foundry / canvas / actor / combat / PF2e API call. |
| `utils.js` | Echo-loop guard flags, condition-slug map, log ids. |
| `config.js` | Per-campaign config (worker URL, secret, actor/token maps). |

Feature modules hold logic and never touch a Foundry global directly — all of
that goes through `pf2eAdapter.js`, including hook registration (`onHook`) and
module-settings reads (`getModuleSetting`). See [`MIGRATION.md`](./MIGRATION.md)
for why and how that protects version upgrades. Since #1313 this is **enforced
by ESLint** (`npm run lint` covers `foundry-bridge/`): a bare `game`/`canvas`/
`CONFIG`/`ui`/`Hooks`/… reference in a feature module fails the build; only
`pf2eAdapter.js` and `bridge.js` (the Foundry entry point) may use them.

## Relay keys (single source of truth)

Keys are `cnmh_<key>_<charId>`; encounter-wide data uses `characterId: 'global'`.
Request/response pairs correlate via an echoed `ts` / `reqTs` (or `reqId`).
**Keep this table in sync when adding a channel** — the app and bridge both read
from it.

The channel tokens are defined in code in [`syncKeys.js`](./syncKeys.js)
(`RELAY.*`), which the app consumes via `src/sync/keys.js` — when adding a
channel, add its token there too so neither side hand-writes the string.

| Key | Direction | charId | Payload |
| --- | --- | --- | --- |
| `roster` | bridge → app | `global` | `[{ actorId, name, speed }]` — PC actor roster, pushed on connect and actor create/delete so the app can resolve charId → token before any combat |
| `rosterreq` | app → bridge | `global` | _(no payload)_ — request a fresh `roster` push (reconnect) |
| `actormap` | app → bridge | `global` | `{ [foundryActorId]: charId }` |
| `encounter` | bridge → app | `global` | `{ active, phase, round, currentTurnIndex, order[], log[], foundryCombatId }` |
| `turncmd` | app → bridge | `global` | `{ action: 'next-turn' }` |
| `initcommit` | app → bridge | `global` | `{ rolls: [{ entryId, initiative, statistic? }], rollNpcs }` — batch-write PC initiatives (`setMultipleInitiatives`), roll NPCs, then `startCombat` (idempotent; no-op once started) |
| `initroll` | app → bridge | charId | `{ d20, mod, total, skill, ts }` — a player's setup-phase initiative roll; survives `encounter` overwrites. The bridge tallies these against the PC combatant set and auto-runs `initcommit` once every expected PC has rolled |
| `actorfeed` | bridge → app | `global` | `{ entryId, actions, spent, reaction, feed:[{ n, cost?, label, detail?, result?, tone?, type, attackRange?, targetActorId?, state }] }` — the active combatant's chat-derived action feed + per-turn economy; clears and re-keys on every turn change (#472b) |
| `hp` | both | charId | `{ current, max, temp, dying, wounded, doomed }` |
| `conditions` | bridge → app | charId | `[{ id, value }]` |
| `heropoints` | both | charId | `number` |
| `foundryeffects` | bridge → app | charId | `[{ id, effectId, source, fromFoundry: true }]` — the PC's app-modelled Foundry effect items. Full-list replace; bridge-owned, so it never clobbers the app's own `effects` key |
| `minions` | both | ownerCharId | `{ [role]: { hp: { current, max, temp }, conditions: [{ id, value }], … } }` — combined companion+familiar object per owner. Bridge → app pushes MERGE one role into the cached object (never replace); app → bridge writes each role's HP to its linked Foundry actor (#362) |
| `minionactors` | bridge → app | `global` | `{ ["<ownerCharId>-<role>"]: { foundryActorId, ownerCharId, role, name, onScene } }` — ownership-derived minion links; bridge-owned snapshot, re-pushed on actor/token changes |
| `minionactorsreq` | app → bridge | `global` | _(no payload)_ — request a fresh `minionactors` push (reconnect / manual refresh) |
| `spawnminion` | app → bridge | `global` | `{ ownerCharId, role }` — create the linked minion's token in an open cell adjacent to its owner's token |
| `summonpool` | bridge → app | `global` | `[{ key, name, level, hp: { max }, defenses, traits, img }]` — actors in the designated Summons folder, re-pushed on any actor/folder change (#261) |
| `summonpoolreq` | app → bridge | `global` | _(no payload)_ — request a fresh `summonpool` push (Add-summon modal refresh / reconnect) |
| `movereq` | app → bridge | charId | `{ moveType, ts }` |
| `moveopts` | bridge → app | charId | `{ origin, reachable[], blocked[], gridSize, speed, originOccupied, reqTs }` — `reachable[]` entries `{ col, row, feet, terrain, passThrough? }`; `blocked[]` entries `{ col, row, kind: 'wall'\|'ally'\|'enemy' }`; `speed` = actor land Speed in feet (action accounting); `originOccupied` = token currently shares its cell with an ally, so the move may not END here |
| `moveconfirm` | app → bridge | charId | `{ destination, moveType, actionCost, ts }` |
| `movedone` | bridge → app | charId | `{ newPosition, feetMoved, reqTs, nextOpts }` — `nextOpts` is the `moveopts` payload for the destination cell (same shape), piggybacked so a chained step skips a `movereq`→`moveopts` round-trip (#451); consumed by `useTokenMovement` |
| `doorreq` | app → bridge | charId | `{ ts }` — request doors near the PC token |
| `dooropts` | bridge → app | charId | `{ doors: [{ wallId, state, x, y }], reqTs }` — doors within ~1.5 grid squares; secret doors only when already open |
| `doorinteract` | app → bridge | charId | `{ wallId, op: 'open'\|'close', ts }` — locked doors (ds 2) are ignored |
| `exploremove` | both | `global` | `boolean` — exploration-movement toggle. App-owned (`usePlayMode`); the bridge force-writes `false` when any door opens (auto-off) |
| `shieldraise` | app (↔ Foundry mirror TBD) | charId | `{ raised, uid, ts }` — Raise a Shield state |
| `action` | app → bridge | charId | `{ kind:'strike'\|'spell'\|'save-effect', sourceUid, targets:[entryId], ts }` — sets Foundry's user target set; bridge annotates each target with `offGuard:true` if attacker is a flanker |
| `applyeffect` | app → bridge | charId | `{ ref, op:'apply', targets:[entryId], source, ts }` — bridge clones the compendium effect item onto each target actor (apply-only; removal is Foundry's own concern) |
| `dmgapply` | app → bridge | `global` | `{ id, sourceName, hits:[{ entryId, name, amount, type, instances? }], ts }` — apply the app damage step's RAW typed totals to combatant actors via PF2e `applyDamage` (a typed `DamageRoll`, so Foundry nets the target's IWR itself; enemy targets only) (#1016). A hit with `instances:[{ amount, type }]` (#1019 — mixed-type damage, e.g. a flaming rune's fire beside the base piercing) is applied as ONE multi-instance `DamageRoll` (`'13[piercing],4[fire]'`) so IWR nets per instance within a single application |
| `dmgdone` | bridge → app | `global` | `{ id, sourceName, applied:[{ entryId, name, amount, type, instances? }], failed:[{ entryId, name }], ts }` — ack for `dmgapply` (`id` echoes); the GM client mirrors it into the encounter log |
| `saveroll` | app → bridge | `global` | `{ id, save, dc, targets:[{ entryId, name }], ts }` — roll each target combatant's saving throw (`fortitude`\|`reflex`\|`will`) natively via PF2e `Statistic#roll` (#1275); `id` is the originating save request's id. Live modifiers apply; the roll lands in Foundry chat as a GM roll |
| `savedone` | bridge → app | `global` | `{ id, results:[{ entryId, name, d20, total }], failed:[{ entryId, name }], ts }` — ack for `saveroll` (`id` echoes). Degrees are recomputed app-side (`computeSaveDegree`); `failed` targets fall back to the GM's manual d20 entry |
| `flanked` | bridge → app | `global` | `{ [enemyEntryId]: { byCharIds:[charId,...] } }` — pushed on token-move and turn-advance |
| `adjacency` | bridge → app | `global` | `{ [entryId]: [adjacentEntryId, …] }` — combatant adjacency map, pushed on token-move / turn-advance / combat start; the app (`useAdjacency`) gates reach-limited actions on it (#430) |
| `positions` | bridge → app | `global` | `{ gridSize, positions: { [entryId]: { col, row } } }` — each combatant's current grid cell; pushed on token-move and combat lifecycle, empty when no combat. App measures attacker→target distance for ranged range increments (#527) |
| `positionsreq` | app → bridge | `global` | _(no payload)_ — request a fresh `positions` push (reconnect / resolver open) |

## Tests

The bridge has its own jest project (it lives outside `src/`, so it does not run
under the app's Vitest suite):

```sh
npm run test:bridge            # one-shot
npm run test:bridge -- --watch
```

It runs with **no real Foundry present** — `test/setup.js` installs mocked
Foundry globals (`game`, `canvas`, `Hooks`, `CONFIG`, `WebSocket`) via the
factories in `test/foundryMock.js`. Two layers:

- **Feature-module unit tests** (`encounter.test.js`, `characterSync.test.js`,
  `movement.test.js`) — exercise the logic against the mocked adapter. These are
  version-independent.
- **Adapter contract tests** (`pf2eAdapter.test.js`) — pin the exact Foundry/PF2e
  data shapes, driven by captured fixtures in `__fixtures__/<version>/`. These
  are the early-warning tripwire for a version bump. See
  [`__fixtures__/README.md`](./__fixtures__/README.md).
- **Relay contract tests** (`relayContract.test.js`, #1308) — the same tripwire
  idea for the bridge→app seam. Every emitted channel is driven against the
  mock world and shape-checked (field names + types) against the recorded
  payload in `__fixtures__/relay/<channel>.json`; the app's vitest suite
  consumes the SAME files (`src/test/relayFixtures.js`), so a payload rename
  fails a named test on both sides. After an intentional payload change,
  re-record with `RELAY_FIXTURES=record npm run test:bridge -- --testPathPattern=relayContract`
  and fix the failing app consumers.
