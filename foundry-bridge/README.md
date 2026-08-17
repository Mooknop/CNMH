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
| `pathPreview.js` | Hooks the v14 movement pipeline (`planToken` / `moveToken`) to push route ghosts for moves the app didn't initiate (#1736 S3). |
| `auras.js` | Turns `auraset` into a token-attached v14 emanation Region that follows the creature, and pushes `auramembers` when who is standing inside it changes (#1733). v14-only. |
| `pf2eAdapter.js` | **The seam.** Every Foundry / canvas / actor / combat / PF2e API call. |
| `utils.js` | Echo-loop guard flags, condition-slug map, log ids. |
| `config.js` | Per-campaign config (worker URL, actor/token maps). **Public — no secrets.** |
| `secret.js` | Reads the relay secret from the per-world module setting. |

## Setup: the relay secret

The Worker gates `/bridge/:campaignId` and `/api/bridge/image` on a shared
secret (`BRIDGE_SECRET`, set with `wrangler secret put BRIDGE_SECRET`). The
bridge side of it is a **per-world Foundry setting**, not a repo constant:

> Configure Settings → Module Settings → CNMH Bridge → **Relay secret**

Paste the current value there once per world; the bridge connects as soon as you
save. Until it is set, the bridge logs an error, notifies the GM, and retries
every 15s without opening a socket — it never sends an unauthenticated request.

The value must never land in `config.js` or any other tracked file: this repo is
public and the release zip ships every file in this directory verbatim. Rotating
the secret means updating the Worker (`wrangler secret put BRIDGE_SECRET`) and
each world's setting together — the relay 403s any bridge holding the old value.

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
| `bridgehello` | bridge → app | `global` | `{ protocol, module, ts }` — protocol handshake (#1310), pushed on every connect. `protocol` = `PROTOCOL_VERSION` from `syncKeys.js` (bump on ANY relay payload change); `module` = installed module version. The app warns the table (`SyncStatus` "Bridge outdated") when a connected bridge's protocol predates its minimum — or when no hello arrives at all |
| `roster` | bridge → app | `global` | `[{ actorId, name, speed }]` — PC actor roster, pushed on connect and actor create/delete so the app can resolve charId → token before any combat |
| `rosterreq` | app → bridge | `global` | _(no payload)_ — request a fresh `roster` push (reconnect) |
| `actormap` | app → bridge | `global` | `{ [foundryActorId]: charId }` |
| `encounter` | bridge → app | `global` | `{ active, phase, round, currentTurnIndex, order[], log[], foundryCombatId }` — each order entry carries `disposition` (#1537 S6): the combatant token's CONST.TOKEN_DISPOSITIONS value (FRIENDLY 1 / NEUTRAL 0 / HOSTILE -1 / SECRET -2, null without a token), so the dock renders a friendly no-charId combatant as an ally pane instead of an enemy one. Protocol ≥ 17 (#1749 OQ-5) adds `hidden` (boolean): the combatant token's `TokenDocument#hidden`, the GM's eye toggle, `false` for a token-less combatant. **The order still carries every combatant, hidden included** — GM surfaces are built from it and need the complete picture — so the flag is what player-facing surfaces filter on; the bridge does not decide the audience |
| `turncmd` | app → bridge | `global` | `{ action: 'next-turn' }` |
| `initcommit` | app → bridge | `global` | `{ rolls: [{ entryId, initiative, statistic? }], rollNpcs }` — batch-write PC initiatives (`setMultipleInitiatives`), roll NPCs, then `startCombat` (idempotent; no-op once started) |
| `initroll` | app → bridge | charId | `{ d20, mod, total, skill, ts }` — a player's setup-phase initiative roll; survives `encounter` overwrites. The bridge tallies these against the PC combatant set and auto-runs `initcommit` once every expected PC has rolled |
| `actorfeed` | bridge → app | `global` | `{ entryId, actions, spent, reaction, feed:[{ n, cost?, label, detail?, result?, tone?, type, attackRange?, targetActorId?, damageTotal?, damageInstances?, ts, state }] }` — the active combatant's chat-derived action feed + per-turn economy; clears and re-keys on every turn change (#472b). `damage-roll` entries carry `damageTotal` + `damageInstances:[{ amount, type }]` off the PF2e `DamageRoll` (#1355) so the app's taken-damage juice can type an hp drop; `ts` bounds that correlation |
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
| `movereq` | app → bridge | charId | `{ moveType, ts }` — the `<id>` segment (all six movement channels) is a PC charId, a minion `<ownerCharId>-<role>` id (#362), or — protocol ≥ 10 — a combat entryId for foe movement from the GM dock (#1572); the bridge resolves in that order |
| `moveopts` | bridge → app | charId | `{ origin, reachable[], blocked[], gridSize, speed, originOccupied, reqTs }` — `reachable[]` entries `{ col, row, feet, terrain, passThrough? }`; `blocked[]` entries `{ col, row, kind: 'wall'\|'ally'\|'enemy' }`; `speed` = actor land Speed in feet (action accounting); `originOccupied` = token currently shares its cell with an ally, so the move may not END here |
| `moveplan` | app → bridge | charId | `{ waypoints, moveType, ts }` — protocol ≥ 14 (#1736): plan a full-speed route. `waypoints` = the tapped destination cells `[{ col, row }, …]` in order, EXCLUDING the origin (one entry for the common open-room tap; more to chain around a corner). Read-only — nothing moves until a `moveconfirm` carries the plan |
| `moveplanned` | bridge → app | charId | `{ path, costFeet, clipped, reqTs }` — the route core would ACTUALLY walk: `path` = `[{ col, row, x, y }, …]` excluding the origin and ending at the real landing cell (`x`,`y` = the cell's top-left pixels, as `moveopts`/`movedone` use); `costFeet` = terrain-aware total in feet snapped to 5 (v14 `TokenDocument#measureMovementPath`, so Region difficult terrain counts); `clipped` = a wall/constraint stopped the route short of the last requested waypoint, so the app offers an intermediate waypoint tap; `reqTs` echoes the plan's `ts` |
| `moveconfirm` | app → bridge | charId | `{ destination, moveType, actionCost, ts, waypoints? }` — `waypoints` (optional, protocol ≥ 14) is the planned `moveplanned.path` cells verbatim `[{ col, row }, …]`: present → execute the whole multi-waypoint route as one `TokenDocument#move`; absent → the legacy single-`destination` 5-ft stepper move, unchanged. The bridge re-plans/constrains at confirm time, so a stale plan degrades to an honest stop-short rather than an error |
| `movedone` | bridge → app | charId | `{ newPosition, feetMoved, reqTs, nextOpts }` — identical shape for both confirm flows. `feetMoved` is the measured cost of the path ACTUALLY traveled and `newPosition` the real landing (a v14 move may legally stop short — the app refunds the over-charged actions). `nextOpts` is the `moveopts` payload for the landing cell (same shape), piggybacked so a chained step skips a `movereq`→`moveopts` round-trip (#451); consumed by `useTokenMovement` |
| `doorreq` | app → bridge | charId | `{ ts }` — request doors near the PC token |
| `dooropts` | bridge → app | charId | `{ doors: [{ wallId, state, x, y }], reqTs }` — doors within ~1.5 grid squares; secret doors only when already open |
| `doorinteract` | app → bridge | charId | `{ wallId, op: 'open'\|'close', ts }` — locked doors (ds 2) are ignored |
| `exploremove` | both | `global` | `boolean` — exploration-movement toggle. App-owned (`usePlayMode`); the bridge force-writes `false` when any door opens (auto-off) |
| `shieldraise` | app (↔ Foundry mirror TBD) | charId | `{ raised, uid, ts }` — Raise a Shield state |
| `action` | app → bridge | charId | `{ kind:'strike'\|'spell'\|'save-effect', sourceUid, targets:[entryId], ts }` — sets Foundry's user target set; bridge annotates each target with `offGuard:true` if attacker is a flanker. **Protocol ≥ 17 (#1749 OQ-3): the canvas write is gated to the ACTIVE combatant.** `setUserTargets` writes `game.user` — the GM client's single target set — so an ungated write lets two deliberating players overwrite each other's aim on the one shared canvas. The bridge therefore writes Foundry's targets only when the `<charId>` segment resolves to the combatant whose turn it is (resolved through the same id spaces as every movement key: PC charId, minion `<ownerCharId>-<role>`, combat entryId for a GM-dock-driven foe). Writes from anyone else resolve and annotate exactly as before but never touch the canvas — they are the app-local preview path. The bridge also **clears the target set on every turn change** (protocol ≤ 16 never cleared: a stale aim persisted on the GM canvas until someone else wrote). Genuinely per-player target sets would need a Foundry user account per player — out of scope, epic #1749 |
| `applyeffect` | app → bridge | charId | `{ ref, op:'apply', targets:[entryId], source, ts }` — bridge clones the compendium effect item onto each target actor (apply-only; removal is Foundry's own concern) |
| `dmgapply` | app → bridge | `global` | `{ id, sourceName, hits:[{ entryId, name, amount, type, instances? }], ts }` — apply the app damage step's RAW typed totals to combatant actors via PF2e `applyDamage` (a typed `DamageRoll`, so Foundry nets the target's IWR itself; enemy targets only) (#1016). A hit with `instances:[{ amount, type }]` (#1019 — mixed-type damage, e.g. a flaming rune's fire beside the base piercing) is applied as ONE multi-instance `DamageRoll` (`'13[piercing],4[fire]'`) so IWR nets per instance within a single application |
| `dmgdone` | bridge → app | `global` | `{ id, sourceName, applied:[{ entryId, name, amount, type, instances? }], failed:[{ entryId, name }], ts }` — ack for `dmgapply` (`id` echoes); the GM client mirrors it into the encounter log |
| `saveroll` | app → bridge | `global` | `{ id, save, dc, targets:[{ entryId, name }], ts }` — roll each target combatant's saving throw (`fortitude`\|`reflex`\|`will`) natively via PF2e `Statistic#roll` (#1275); `id` is the originating save request's id. Live modifiers apply; the roll lands in Foundry chat as a GM roll |
| `savedone` | bridge → app | `global` | `{ id, results:[{ entryId, name, d20, total }], failed:[{ entryId, name }], ts }` — ack for `saveroll` (`id` echoes). Degrees are recomputed app-side (`computeSaveDegree`); `failed` targets fall back to the GM's manual d20 entry |
| `rollreq` | app → bridge | `global` | `{ id, charId, formula, flavor, ts }` — dice-tower rail (#1490): roll a raw dice formula in Foundry chat (plain core `Roll`, NOT a PF2e statistic — the app owns all modifiers/DCs/degrees). `charId` resolves through the actor map for chat-speaker attribution only; `flavor` is the app-composed chat label. Live-only: never replayed from FULL_STATE |
| `rolldone` | bridge → app | `global` | `{ id, charId, ok, total, faces:[[sides, face], …], ts }` — ack for `rollreq` (`id` echoes). One `[sides, face]` pair per kept die (the app pulls the raw d20 from here for nat-20/nat-1). `ok:false` (bad formula / roll failure) tells the requester to fall back to manual entry immediately |
| `strikereq` | app → bridge | `global` | `{ id, entryId, actionIndex, variant, damage?, targets?, ts }` — native NPC strike execution from the GM Command Dock enemy pane (#1531 S3). `entryId` = the acting enemy combatant, `actionIndex` = the strike's index in the foe kit, `variant` = the MAP step (0\|1\|2), `damage` = `'roll'`\|`'critical'` for the damage buttons (omitted → attack roll). `targets` (optional app entryIds) pre-set the GM client's Foundry target set first so the chat card carries the target and PF2e computes the degree natively; absent/empty leaves the GM's targets alone. Live-only: never replayed from FULL_STATE |
| `strikedone` | bridge → app | `global` | `{ id, ok, mode, total, faces:[[sides, face], …], degree, ts }` — ack for `strikereq` (`id` echoes). `mode` = `'attack'`\|`'roll'`\|`'critical'`; `degree` = PF2e degreeOfSuccess (0-3) when a target made a DC resolvable, else null. `ok:false` = roll it in Foundry chat instead — resolution is native, so nothing app-side depends on the ack beyond the pane's result read-out |
| `castreq` | app → bridge | `global` | `{ id, entryId, entryItemId, spellId, rank, ts }` — native NPC spellcasting from the GM Command Dock enemy pane (#1531 S4). `entryId` = the acting enemy combatant, `entryItemId` = the spellcasting entry in the foe kit, `spellId` = the spell to cast, `rank` heightens when present. The bridge invokes `SpellcastingEntryPF2e#cast` — chat card + REAL slot/innate-use consumption in Foundry (v1 decision: Foundry owns NPC resources); the foekit re-push off the resulting item update refreshes the pane's remaining counts. Live-only: never replayed from FULL_STATE |
| `castdone` | bridge → app | `global` | `{ id, ok, name?, rank?, ts }` — ack for `castreq` (`id` echoes). `ok:false` = cast it from the Foundry sheet instead; the ack only feeds the pane's read-out line |
| `snapreq` | app → bridge | `global` | `{ id, ts, moverId?, radiusFeet? }` — request a scene snapshot (#1573 B1: Ping the Map / template placement). Without `moverId` this captures the GM client's current canvas view, unchanged. With `moverId` (protocol ≥ 16, #1744 WS-2) it captures the WORLD RECT centred on that mover instead — `radiusFeet` in every direction, clamped to the canvas bounds, defaulting to **1.5× the mover's Speed** — so a player's destination is in frame regardless of where the GM is looking. `moverId` resolves through the same id spaces as every movement key (PC charId, minion `<ownerCharId>-<role>`, combat entryId); one that doesn't resolve falls back to the GM view rather than nacking. Live-only: never replayed from FULL_STATE |
| `snapdone` | bridge → app | `global` | `{ id, ok, url?, capture?, worldRect?, gridSize?, moverId, trigger, ts }` — ack for `snapreq` (`id` echoes). `url` = stable app-relative `/api/images/…` (the bestiary-token R2 pipeline, catalog folder `Scene Snapshots`; captures are never content-referenced, so the orphan sweep is their GC). `capture` = the world→capture-space affine matrix `{ a, b, c, d, tx, ty, screenW, screenH, sceneId }` — the app inverts it to map a normalized tap back to world coordinates; `worldRect` = `{ x1, y1, x2, y2 }` the rect the image covers, in world coords (matrix-less fallback); `gridSize` = px per square. **Those three describe the captured rect whatever produced it** — a mover-centered capture reports its own rect with the same semantics, so `worldPointFromTap` / `cellFromWorldPoint` invert it unchanged. `moverId` = the mover a mover-centered capture is framed on, `null` for a GM-view capture; `trigger` = `'request'` (answering a `snapreq`) or `'movedone'` (protocol ≥ 16 — the ONE broadcast capture the bridge pushes unprompted after every completed move, so N viewing clients cost one capture instead of N; correlate by `id` as always, a broadcast never matches a pending request). GM-only layers (notes, drawings, HUD, rulers) and hidden tiles/tokens are excluded from the image; measured templates stay visible. `ok:false` = no snapshot available — fall back now |
| `pingpoint` | app → bridge | `global` | `{ id, x, y, sceneId, name?, ts }` — ping a WORLD point on the GM canvas (#1573 B2: tap-to-ping from a snapshot). The app inverts the `snapdone` capture matrix locally, so the coordinates arrive already resolved; Foundry's own `Canvas#ping` broadcasts the pulse to every client. Scene-guarded — a snapshot of scene A never pings scene B if the GM navigated away. Fire-and-forget: no ack channel, silent no-op when the ping can't be placed |
| `templateplace` | app → bridge | `global` | `{ id, shape, feet, x, y, sceneId, name?, ts, direction?, width? }` — draw the outline of a placed spell area (#1573 B4). WORLD coordinates (the app resolved them); the bridge also pings `x`/`y`. Scene-guarded. `shape` is radial (`burst`/`emanation` → a circle, every generation, `x`/`y` = the CENTRE) or — protocol ≥ 18 (#1735 S2) — directional (`cone`/`line`), where `x`/`y` is the shape's **ORIGIN** (app-derived from the caster's own space, never a centre) and two fields join it: **`direction`** = the facing in **COMPASS degrees — 0 = north, increasing clockwise, multiples of 45** (the app's 8-point rosette; the bridge owns translating it to Foundry's Region `rotation`, which measures from EAST — a fixed −90° offset) and **`width`** = a line's width in feet, **line only**, default 5 (a cone must not send it). Directional shapes are **v14-only**: they exist as Region `cone`/`line` shapes and have no MeasuredTemplate equivalent worth faking, so a v13 world, a build whose Region shape registry lacks the type, or a missing/non-numeric `direction` all nack rather than draw. The Region drawn is **presentational** — occupancy stays app-side in `spellArea.js` over the quantized template cells, and a Foundry cone is a 90° wedge where the PF2e template is a cell staircase (near-exact on the cardinals, approximate on the diagonals) |
| `templatedone` | bridge → app | `global` | `{ id, ok, templateId?, ts }` — ack for `templateplace` (`id` echoes), **unchanged by #1735 S2**. `templateId` is the created document's id — a Region on v14, a MeasuredTemplate on v13 — echoed so a later cleanup rail can remove it; `ok:false` = no outline was drawn (wrong scene, unsupported shape for this Foundry generation, a directional shape with no facing, or the create failed) and the app says so in the log, falling back to the ping |
| `auraset` | app → bridge | charId | `{ active, feet, label?, color?, ts }` — protocol ≥ 19 (#1733 S1): activate/deactivate a persistent aura emanation on the character's token. Sent by every `useAura` writer ALONGSIDE the app-only `cnmh_aura_<charId>` key, which stays authoritative for impulse gating — a v13 world or a disconnected bridge changes nothing app-side. `feet` = the aura's authored radius (from `areaShape { shape:'emanation', feet }` on the activating ability; an aura with no authored size is never sent — no fallback radius, per the #1733 ruling). Since #1733 S3 the app resolves the radius from SEVERAL possible sources (`src/utils/auraSources.js`): a champion's aura and a kineticist's aura, both switched by the app-only key, and effect-driven auras such as Courageous Anthem, which exist only while the CASTER carries the spell's effect. Exactly one is mirrored — one Region per charId is a contract limit — and a class aura outranks an effect aura; `label`/`color` are optional presentation for the ring. On `active:true` the bridge resolves the token (same id spaces as every movement key: PC charId, minion `<ownerCharId>-<role>`, combat entryId) and creates a token-attached emanation Region (`visibility: ALWAYS`) that moves with the token; `active:false` (or the token's deletion) deletes it. **v14-only**: v13 or a build without the token-emanation capability no-ops — the rail is fire-and-forget with no ack channel (the ring is presentational; `auramembers` is the read-back). Persisted — replayed from FULL_STATE on connect so a bridge restart re-creates active rings; the connect-time orphan sweep deletes bridge-created aura Regions whose `auraset` is absent or inactive |
| `auramembers` | bridge → app | charId | `{ inside: [{ entryId?, tokenId, name, disposition, hidden }], ts }` — protocol ≥ 19 (#1733 S2): who is currently inside the character's aura Region, pushed on the region's `TOKEN_ENTER` / `TOKEN_EXIT` behavior events, on aura creation (initial membership), and as an empty `inside: []` on teardown. The aura's own token is excluded (the app knows the caster stands in their own aura). `entryId` = the token's combatant id when it is in the current combat, absent for a non-combatant token (same optionality rule as `pathpreview.id`); `disposition` = CONST.TOKEN_DISPOSITIONS (FRIENDLY 1 / NEUTRAL 0 / HOSTILE -1 / SECRET -2); `hidden` = `TokenDocument#hidden`. **Hidden entries are still SENT** — GM surfaces need the complete picture — so the flag is what player-facing surfaces filter on, exactly the `positions` / `encounter.hidden` convention (#1749 OQ-5). Bridge-owned snapshot: recomputed and re-pushed on connect for every active aura |
| `dicesets` | app → bridge | `global` | `{ [charId]: appearance, enemy: appearance }` — Dice So Nice dice sets from the GM's Theme page (#1490 S7). `appearance` = DSN's `{ colorset?, foreground, background, outline, edge, texture?, material, font?, system? }`. The bridge stamps it in DSN's `diceSoNiceRollStart` hook (speaker actor → actorMap → charId; unmapped actors get the `enemy` set), styling delegated rolls, native enemy saves, NPC initiative, and GM manual rolls alike. Persisted config — replayed from FULL_STATE on connect |
| `foekit` | bridge → app | `global` | `{ entryId, foundryActorId, kit, ts }` — the ACTIVE enemy combatant's full offensive kit for the GM Command Dock enemy pane (#1531). `kit` = `{ strikes:[{ index, slug, label, attackModifier, variantLabels, traits, ranged, damage:[{ formula, type }], attackEffects }], spellcasting:[{ id, name, tradition, castingType, dc, attack, slots:{ [rank]: { value, max, prepared? } }, spells:[{ id, name, rank, isCantrip, cost, uses?, save?, traits, description }] }], abilities:[{ id, name, actionType, actions, category, traits, description }], skills:[{ slug, mod }], conditions:[{ slug, value }] }`, extracted from the live actor instance (elite/weak accurate). `conditions` are the foe's REAL Foundry condition items (#1537 S3) — the dock renders them as truth chips beside the app-applied `enemyfx` ones, and the item-hook re-push keeps them fresh. Pushed on enemy turn start and re-pushed on the foe's own actor/embedded-item updates (slot consumption stays live); PC turns / combat end push a cleared `{ entryId: null, kit: null }`. Persisted so a mid-turn dock refresh recovers; also pushed on socket open |
| `flanked` | bridge → app | `global` | `{ [enemyEntryId]: { byCharIds:[charId,...] } }` — pushed on token-move and turn-advance |
| `adjacency` | bridge → app | `global` | `{ [entryId]: [adjacentEntryId, …] }` — combatant adjacency map, pushed on token-move / turn-advance / combat start; the app (`useAdjacency`) gates reach-limited actions on it (#430) |
| `positions` | bridge → app | `global` | `{ gridSize, positions: { [entryId]: { col, row, width, height, hidden } } }` — each combatant's current grid cell; pushed on token-move and combat lifecycle, empty when no combat. App measures attacker→target distance for ranged range increments (#527). `col`/`row` are the token's **top-left** cell (`token.x/y` rounded to the grid — note `movereq`'s tap resolution *floors*, so the two disagree for an off-grid token). Protocol ≥ 17 (#1749 OQ-1 / #1751 OQ-1) adds `width`/`height`: the token's footprint in grid squares, integers ≥ 1 — so a 2×2 ogre is a square to hit-test and an emanation can originate from the caster's real space rather than one corner of it. Protocol ≥ 17 (#1749 OQ-5) also adds `hidden` (boolean, `TokenDocument#hidden`). The entry is still SENT for a hidden combatant — this channel is the complete combat picture, and GM surfaces consume it whole — but `captureSceneSnapshot` deliberately omits hidden tokens from the image, so **any player-facing marker drawn over a snapshot must drop `hidden` entries** or it draws an X over an invisible creature |
| `positionsreq` | app → bridge | `global` | _(no payload)_ — request a fresh `positions` push (reconnect / resolver open) |
| `pathpreview` | bridge → app | `global` | `{ tokenId, id, name, disposition, sceneId, origin, path, phase, source, ts }` — protocol ≥ 16 (#1736 S3, filtered in #1744 WS-1): the route a token is taking, for moves the app did NOT initiate (a GM drag-planning in Foundry, a natively driven enemy turn, another player's stride). **PUBLIC channel — filtered**: only movers that are NOT hidden (`document.hidden` falsy) AND friendly (`disposition > 0`) are written here. Hostile, neutral, `SECRET (-2)` and every hidden token are dropped entirely (protocol 15 emitted all of them: a GM dragging a hidden ambusher broadcast its route to every player device, mid-deliberation). `origin` = `{ col, row }` the movement starts from; `path` = `[{ col, row }, …]` from the origin EXCLUSIVE to the destination INCLUSIVE; `sceneId` = the TOKEN's own scene (the move hooks fire world-wide — cells are converted against **that** scene's grid, not the active canvas's); `name` + `disposition` label a ghost the encounter order can't name; `phase` = `'plan'` (a movement is being planned/previewed — throttled to one emission per token per ~150ms with a trailing edge, so the final path of a drag always lands) or `'move'` (a movement started executing — never throttled); `source` = `'app'` when the bridge itself initiated the move (`BRIDGE_SOURCE_FLAG`) or `'foundry'` otherwise — bridge-initiated moves are NOT suppressed, the rest of the table wants to watch them. `id` = the app-side mover id when one exists (PC charId, minion `<ownerCharId>-<role>`, or combat entryId — the reverse of the `movereq` id resolution) and `null` for a token the app has no mover for; `tokenId` always identifies the Foundry token. Emitted from the v14 `planToken` / `moveToken` hooks; a build without them simply never pushes |
| `pathpreviewgm` | bridge → app | `global` | Identical payload to `pathpreview`, **unfiltered** — every mover, hidden and hostile included (protocol ≥ 16, #1744 WS-1). The relay has no per-key ACL, so player devices still *receive* this key; the app render-gates it to GM surfaces. That is the accepted trade-off for a home table — wire-level audience separation in the session DO is out of scope (epic #1744, OQ-2 ruling). Consume `pathpreview` on player surfaces and `pathpreviewgm` on the GM dock; never both on the same surface, or a filtered ghost draws twice |
| `fxplay` | app → bridge | `global` | `{ id, shape, file, source, targets:[entryId \| { x, y }], opts?, ts }` — resolved canvas-animation recipe (#1415, epic #1414). The app-side animation catalog (content) picks `shape` + `file` (a Sequencer database key); the bridge interprets the shape: `melee` = swing on each target rotated along the attack line, `projectile` = stretch source → target, `burst` = radial effect centered on each target (source-free — `source` may be null; save-spell recipes ride the save request and fire GM-side). Point targets are in the contract for later AoE templates. Fire-and-forget juice — silent no-op on unknown shape / unresolved tokens, warn-once when the Sequencer module is absent; needs Sequencer + an asset pack (e.g. JB2A free) in the world |

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
- **Inbound relay contract tests** (`relayContractInbound.test.js`, #1749 S1
  follow-up) — the app→bridge mirror of the rail above, for the direction the
  outbound rail never covered. `relayContract.test.js` only ever recorded what
  the bridge SENT; every inbound channel (`movereq`, `snapreq`, `action`, …)
  was driven with plain inline arguments and had no fixture at all, so an
  app-side payload rename never tripped a named bridge test.

  **Direction**: fixtures live in `__fixtures__/relay/inbound/<channel>.json`,
  separate from the bridge→app fixtures one level up. **There is no RECORD
  mode** — unlike an emission, there is nothing bridge-side to capture an app
  payload FROM. Every inbound fixture is **hand-authored from the real app
  producer's emitted shape**: read the hook that calls `sendUpdate` for that
  channel (e.g. `useActionTargetSync`, `useTokenMovement.planMove`,
  `useMoverMapSurface`/`useSceneSnapshot`), copy its exact field set, and use
  realistic values — never invent fields from the README table alone, and
  never generate one from a schema.

  Each fixture is driven from **both** sides against the SAME file:
  - `relayContractInbound.test.js` drives the real handler with the fixture
    against the mocked world and asserts the bridge **accepts** it — no
    throw, and the handler's real observable effect fires (e.g. `handleAction`
    with the active combatant's fixture calls `setUserTargets`).
  - `src/test/relayInboundContract.test.jsx` drives the real producer hook
    and shape-compares ITS emission against the same fixture, via the
    identical `__fixtures__/relay/shape.js` `diffShapes` the outbound rail
    uses.

  A field rename on either side now fails a named test on both. Re-author the
  fixture by hand (not `RELAY_FIXTURES=record` — that flag only applies to
  the outbound rail) whenever the producer's shape intentionally changes, and
  fix whichever side's test goes red first.

  **Coverage**: `action`, `moveplan`, `snapreq` — the three newest inbound
  contracts as of #1749 S1 — plus `templateplace` (#1735 S2, hand-authored as a
  CONE: the directional payload is the newest half of that contract, and the
  fixture pins that a cone carries `direction` but **no** `width`) and
  `auraset` (#1733 S1, hand-authored as an ACTIVATION: `active:true` with an
  explicitly authored `feet`, plus the optional `label`/`color`, so the fixture
  pins that a radius is part of the payload rather than something the bridge may
  default). Only the
  bridge half of `templateplace` runs today: the app producer still refuses to
  send a cone, so `src/test/relayInboundContract.test.jsx` picks this fixture
  up when #1735 S3 wires the rosette into `useTemplatePlacementSection`.
  `auraset` is in the same state for the same reason — `useAura` does not write
  the bridge key yet, so the app half joins when #1733's app slice lands. The epic's own grep of `origin/main` found `action`
  was the only documented relay channel with no recorded emission at all;
  `moveplan`/`snapreq`'s mover-centered form are equally recent (#1736,
  #1744). **Not yet covered** (a follow-up, not swept here): `movereq`,
  `moveconfirm`, `doorreq`, `doorinteract`, `rosterreq`, `actormap`, `turncmd`,
  `initcommit`, `initroll`, `exploremove`, `shieldraise`, `applyeffect`,
  `dmgapply`, `saveroll`, `rollreq`, `strikereq`, `castreq`, `pingpoint`,
  `dicesets`, `positionsreq`, `minionactorsreq`,
  `summonpoolreq`, `spawnminion`.
