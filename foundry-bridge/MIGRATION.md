# Foundry version migration checklist (v13 → v14 and beyond)

The bridge funnels **every** Foundry / canvas / actor / combat / PF2e API call
through [`pf2eAdapter.js`](./pf2eAdapter.js). Feature modules (`encounter.js`,
`characterSync.js`, `movement.js`) hold only logic and never touch a Foundry
global directly. That seam is what makes a version bump tractable: when an API or
data path moves, **only the adapter changes.**

## Target confirmed (2026-08-10)

- **Foundry v14 Stable 7 = build 14.365** (released 2026-07-15). Server-side:
  requires **Node 24**, a **clean install** (no in-place upgrade from v13), and
  world migration is **one-way** — a world opened in v14 can never be reopened
  in v13. Back up the full user-data directory (worlds + modules + per-world
  settings, which include `bridgeSecret`) before first boot.
- **PF2e system**: v14 support began at **8.1.2 (v14-only)**; current 8.3/8.4
  releases are verified against 14.365. The intel below was gathered against
  8.2.0 — re-verify the PF2e-side reads against the 8.4.x actually installed.
- **External modules**: Dice So Nice and Sequencer both ship v14-compatible
  releases; JB2A is consumed only as opaque database keys (content, not API).
  Update all three alongside core. First boot: disable everything except PF2e,
  then re-enable one module at a time.

## Known v14 hotspots

- **Token movement API — switch point implemented (#1574).** The adapter's
  `moveToken()` branches on `game.release.generation`: v13 keeps the
  `token.document.update({x,y})` write byte-identical; generation ≥ 14 uses the
  dedicated pipeline (`TokenDocument#move`) followed by `resolveMovedPosition()`
  — a document poll that handles the two field-verified pipeline gotchas
  (`move()` can resolve before the collection updates, and may legally stop a
  move SHORT of the request). `handleMoveConfirm` already consumes the reported
  landing, so a stopped-short move keeps app grid and canvas in agreement.
  Remaining v14 work: the in-world smoke pass, plus verifying that `move()`'s
  options bag still forwards `BRIDGE_SOURCE_FLAG` into the update context the
  hook listeners see.
  **Multi-waypoint path rail (#1736 S1)** rides the same switch point:
  `planTokenPath` (`Token#findMovementPath` → `Token#constrainMovementPath`),
  `measureTokenPathCost` (`TokenDocument#measureMovementPath` — the ONLY
  terrain-aware measurement; `canvas.grid.measurePath` is pure geometry and
  cannot see v14's Region difficult terrain), and `moveTokenPath`
  (`TokenDocument#move` over the whole waypoint array). Each method is
  capability-detected on top of the generation gate and degrades to the
  stepper's own primitives, so a renamed surface costs path fidelity, not the
  movement rail. Smoke pass additions: plan a full-speed stride from the app,
  confirm it, and verify the token walks the whole route with the reported
  cost — including one route across difficult terrain and one clipped at a wall.
  **Movement hooks — names VERIFIED against the 14.365 API docs (#1736 S3).**
  Earlier planning notes named `planToken` / `preMoveToken`; only the first is
  the right hook. The v14 movement-pipeline hooks are:
  - `planToken(document)` — "fires when the current movement of a Token
    document is planned". Takes **no path argument**: the plan hangs off
    `document.movement` (a `TokenMovementData`).
  - `moveToken(document, movement, operation, user)` — "fires for every Token
    document that was moved after conclusion of an update workflow […]
    activates on all connected clients". Fires while the animation is still
    running, so it reads as *movement started*, not a post-mortem.
  - `preMoveToken(document, movement, operation)` — real, cancellable
    (`return false` rejects the move), but **only executes on the client
    initiating the update request**. That makes it useless for observing other
    clients' movement; `pathPreview.js` deliberately does not register it.
  Payload shape: `movement.origin` / `.destination` are `TokenPosition`s and
  `movement.passed` / `.pending` are `TokenMovementSectionData` whose
  `waypoints` are `TokenMeasuredMovementWaypoint`s — whose `x`/`y` are the
  **top-left pixel** of the token, the same space `token.x/y`, `gridToPixels`
  and `pixelsToGrid` use, so no centre offset is involved. All of this is read
  in one place, `readTokenMovement()` in the adapter, and returns null (→ no
  preview, no crash) if a future build moves the fields.
  Still open from #1736 S3: whether `move()`'s options bag forwards
  `BRIDGE_SOURCE_FLAG` into the hook contexts. `readMovementSource()` checks
  BOTH the hook's `operation` argument and `movement.updateOptions` so either
  routing works; if neither carries it on the live build, app-driven moves will
  simply report `source: 'foundry'` — cosmetic, not a failure.
  Smoke pass additions: with the app open, drag-plan a foe in Foundry and
  confirm a `cnmh_pathpreview_global` write arrives with `phase: 'plan'`
  (throttled, not one per frame) followed by `phase: 'move'` on release; move a
  token from the app and confirm the same key arrives with `source: 'app'`.
  (The app-side consumer that draws the ghost is a later slice — verify the
  relay writes, not a visual.)
- **Namespaced core classes — dice half resolved (#1574).** `rollFormula` reads
  `foundry.dice.Roll` when present (the only exposure once v14 retires the
  deprecated global) with the bare global as the v13 fallback.
  `ChatMessage.getSpeaker` still reads the global — re-verify on v14 (likely
  `foundry.documents`).
- **Active Effects V2 schema** — expiry handling and the effect schema changed.
  The bridge does not yet read/write Active Effects (effects are app-side), but
  any future effect mirror lands behind the adapter.
- **PF2e system reads** are version-gated independently of core Foundry: `getHp`,
  `getHeroPoints`, `getFocusPool`, `getSpeed`, `getConditions`. A PF2e major bump
  can move these even when core Foundry is unchanged.
- **Measured Templates are REMOVED in v14** — the first core Document type ever
  deleted, absorbed into Scene Regions (`RegionDocument`,
  `canvas.regions.placeRegion`). `createMeasuredTemplate()` in the adapter
  (the `templateplace` spell-area rail consumed by `snapshots.js`) creates via
  `scene.createEmbeddedDocuments('MeasuredTemplate', …)` and its "schema stable
  v11→v14" comment is **wrong**. On v14 the create fails and area outlines
  silently stop drawing. Needs a `generation >= 14` branch that creates a
  circle-shaped Region instead (and the cleanup rail must delete whichever
  document type was created).
- **Bare globals with no v14 fallback yet** (audited 2026-08-10; fix by
  mirroring the `rollFormula` pattern — namespace first, bare global fallback):
  - `fromUuid(ref)` in `applyEffectByUuid` — no namespace fallback, not
    previously tracked here. If v14 retires the global, effect application
    silently returns null.
  - `ChatMessage.getSpeaker` — the known-open half of the dice work (likely
    `foundry.documents.ChatMessage`).
  - `CONFIG.Canvas.polygonBackends.move.testCollision(...)` — the only fully
    unguarded deep chain in the adapter; movement probing AND minion placement
    throw (not degrade) if the path moves.
  - `canvas.grid.measurePath(...)` — non-optional-chained; every move
    measurement flows through it.

### Confirmed v14-era intel (2026-07, from reviewing a module targeting Foundry v14.363 + PF2e 8.2.0)

- Land speed moved to `system.movement.speeds` — **already handled**: `getSpeed`
  prefers the new path with the `attributes.speed` fallback.
- Spell damage is an entries **map** (`Object.entries(spell.system.damage)`)
  whose values carry `kinds` arrays (damage vs healing) — re-verify `foekit`'s
  spell reads against the v14-era PF2e release.
- Save defenses read from `system.defense.save.statistic` on spells.
- The PF2e-family strike surface (`variants[]` MAP ladder, `damage`/`critical`)
  and `SpellcastingEntry#cast(spell, { rank })` are unchanged in the v14-era
  system — our #1531 native-execution reads should survive.
- The "spell damage is an entries map" note above targets a read the adapter
  **does not have** — `getSpellcastingEntries` never reads `system.damage`, and
  `getStrikes` reads the *item* shape (`system.damageRolls`). Nothing to
  re-verify unless a spell-damage read is added later.

## Phase 0 — pre-flight hardening (ship BEFORE the server upgrade)

All of these are capability-detected, so they are safe to release while the
server is still on v13 — the module then survives upgrade day without a
same-day emergency release:

1. `createMeasuredTemplate`: add the `generation >= 14` Region branch (see
   hotspot above). Return shape stays `{ templateId }`-compatible so the
   `templatedone` relay contract is untouched.
2. Namespace fallbacks for `fromUuid` and `ChatMessage.getSpeaker` (mirror the
   `foundry.dice.Roll` pattern).
3. Optional-chain the `polygonBackends.move.testCollision` and
   `canvas.grid.measurePath` chains so a moved path degrades instead of throws.
4. `module.json`: add a `relationships` block declaring the optional Sequencer /
   Dice So Nice integrations (Foundry's UI can then warn about incompatible
   pairings); leave `compatibility` at 13/13 — the verified bump is step 6
   below, gated on fixtures + smoke.

## Upgrade-day server runbook (manual, GM-side)

1. Back up the full Foundry user-data directory (worlds, modules, settings —
   the per-world `bridgeSecret` lives there). This backup is the ONLY rollback.
2. Install Node 24 (if node-hosted), uninstall v13, clean-install v14.365.
3. Update the PF2e system to latest 8.4.x and update Dice So Nice, Sequencer,
   and the JB2A pack(s) before opening the world.
4. First boot with only PF2e enabled; let the one-way world migration run;
   re-enable modules one at a time, bridge last.
5. Keep the v13 backup until the smoke pass (step 5 below) is clean.

## Checklist

1. **Re-export fixtures** from a live world running the target version into
   `__fixtures__/v14/` (`actor-pc.json`, `combat.json`, `token.json`). See
   [`__fixtures__/README.md`](./__fixtures__/README.md) for the console commands.
2. **Run the contract suite:** `npm run test:bridge`. It runs every assertion in
   `pf2eAdapter.test.js` against both `v13/` and `v14/` fixtures. A failure names
   the exact adapter function whose path moved.
3. **Fix failures in `pf2eAdapter.js` only.** Prefer capability detection (does
   the method/path exist?) over hard version checks. For behavior changes (not
   just shape) — the movement API is the likely case — read
   `game.release.generation` once and branch at the single adapter switch point.
   Document each branch with the v14 API doc link
   (https://foundryvtt.com/api/v14).
4. **Re-verify the movement and Active Effect paths specifically** — the known
   hotspots above.
5. **In-Foundry smoke pass (manual, not CI).** In a real v14 world: connect to
   the relay, raise a shield, advance a turn, request reachable squares, take a
   hit + Shield Block, roll a save prompt. v14-specific additions: move a token
   from the app (the `TokenDocument#move` pipeline — verify `BRIDGE_SOURCE_FLAG`
   reaches the hook listeners' update context), place a spell-area outline from
   the app (`templateplace` → Region branch) and clean it up, roll from the
   dice tower with a DSN appearance override, capture a map snapshot (PIXI v8
   render path), and fire one Sequencer/JB2A animation. (Evaluate the community
   **Quench** module for in-world automation — confirm its v14 support first.)
6. **Bump `module.json`** `compatibility.verified` to `"14"` **only after** the
   contract suite passes against the v14 fixtures **and** the smoke pass is clean.
7. Delete `__fixtures__/v14/PLACEHOLDER.md` once real v14 fixtures are committed.
