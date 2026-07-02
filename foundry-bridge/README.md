# CNMH Foundry Bridge (`cnmh-bridge`)

A Foundry VTT module that connects a world to the CNMH app over the Cloudflare
session relay. The bridge is a normal session peer: it sends and receives
`{ type:'UPDATE', characterId, key, value }` messages alongside the player
devices.

## Layout

| File | Role |
| --- | --- |
| `bridge.js` | Entry point. WebSocket lifecycle + incoming-message dispatch. |
| `encounter.js` | Combat hooks ↔ app encounter/turn tracker. |
| `characterSync.js` | HP / conditions / hero points sync (both directions). |
| `movement.js` | Token movement: reachable-square picker + move write-back. |
| `targeting.js` | Combat-action targeting: resolve entry ids → set Foundry user targets; off-guard annotation for flanking melee strikes. |
| `flanking.js` | Pure geometry — `computeFlanking` (no Foundry globals). |
| `flankingPush.js` | Hooks into token-move / turn-advance to push flanked state to the app. |
| `positions.js` | Hooks into token-move / combat lifecycle to push each combatant's grid cell to the app (range-increment measurement). |
| `pf2eAdapter.js` | **The seam.** Every Foundry / canvas / actor / combat / PF2e API call. |
| `utils.js` | Echo-loop guard flags, condition-slug map, log ids. |
| `config.js` | Per-campaign config (worker URL, secret, actor/token maps). |

Feature modules hold logic and never touch a Foundry global directly — all of
that goes through `pf2eAdapter.js`. See [`MIGRATION.md`](./MIGRATION.md) for why
and how that protects version upgrades.

## Relay keys (single source of truth)

Keys are `cnmh_<key>_<charId>`; encounter-wide data uses `characterId: 'global'`.
Request/response pairs correlate via an echoed `ts` / `reqTs` (or `reqId`).
**Keep this table in sync when adding a channel** — the app and bridge both read
from it.

| Key | Direction | charId | Payload |
| --- | --- | --- | --- |
| `actormap` | app → bridge | `global` | `{ [foundryActorId]: charId }` |
| `encounter` | bridge → app | `global` | `{ active, phase, round, currentTurnIndex, order[], log[], foundryCombatId }` |
| `turncmd` | app → bridge | `global` | `{ action: 'next-turn' }` |
| `initcommit` | app → bridge | `global` | `{ rolls: [{ entryId, initiative, statistic? }], rollNpcs }` — batch-write PC initiatives (`setMultipleInitiatives`), roll NPCs, then `startCombat` (idempotent; no-op once started) |
| `initroll` | app → bridge | charId | `{ d20, mod, total, skill, ts }` — a player's setup-phase initiative roll; survives `encounter` overwrites. The bridge tallies these against the PC combatant set and auto-runs `initcommit` once every expected PC has rolled |
| `hp` | both | charId | `{ current, max, temp, dying, wounded, doomed }` |
| `conditions` | bridge → app | charId | `[{ id, value }]` |
| `heropoints` | both | charId | `number` |
| `movereq` | app → bridge | charId | `{ moveType, ts }` |
| `moveopts` | bridge → app | charId | `{ origin, reachable[], blocked[], gridSize, maxFeet, reqTs }` |
| `moveconfirm` | app → bridge | charId | `{ destination, moveType, actionCost, ts }` |
| `movedone` | bridge → app | charId | `{ newPosition, feetMoved, reqTs }` |
| `shieldraise` | app (↔ Foundry mirror TBD) | charId | `{ raised, uid, ts }` — Raise a Shield state |
| `action` | app → bridge | charId | `{ kind:'strike'\|'spell'\|'save-effect', sourceUid, targets:[entryId], ts }` — sets Foundry's user target set; bridge annotates each target with `offGuard:true` if attacker is a flanker |
| `applyeffect` | app → bridge | charId | `{ ref, op:'apply', targets:[entryId], source, ts }` — bridge clones the compendium effect item onto each target actor (apply-only; removal is Foundry's own concern) |
| `dmgapply` | app → bridge | `global` | `{ id, sourceName, hits:[{ entryId, name, amount, type, instances? }], ts }` — apply the app damage step's RAW typed totals to combatant actors via PF2e `applyDamage` (a typed `DamageRoll`, so Foundry nets the target's IWR itself; enemy targets only) (#1016). A hit with `instances:[{ amount, type }]` (#1019 — mixed-type damage, e.g. a flaming rune's fire beside the base piercing) is applied as ONE multi-instance `DamageRoll` (`'13[piercing],4[fire]'`) so IWR nets per instance within a single application |
| `dmgdone` | bridge → app | `global` | `{ id, sourceName, applied:[{ entryId, name, amount, type, instances? }], failed:[{ entryId, name }], ts }` — ack for `dmgapply` (`id` echoes); the GM client mirrors it into the encounter log |
| `flanked` | bridge → app | `global` | `{ [enemyEntryId]: { byCharIds:[charId,...] } }` — pushed on token-move and turn-advance |
| `positions` | bridge → app | `global` | `{ gridSize, positions: { [entryId]: { col, row } } }` — each combatant's current grid cell; pushed on token-move and combat lifecycle, empty when no combat. App measures attacker→target distance for ranged range increments (#527) |
| `positionsreq` | app → bridge | `global` | _(no payload)_ — request a fresh `positions` push (reconnect / resolver open) |

## Tests

The bridge has its own jest project (it lives outside `src/`, so it does not run
under the CRA `react-scripts test`):

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
