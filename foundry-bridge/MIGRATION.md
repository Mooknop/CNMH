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
  As of #1744 WS-1 there are TWO keys: `cnmh_pathpreview_global` (filtered to
  visible friendly movers) and `cnmh_pathpreviewgm_global` (unfiltered). The
  smoke pass gains one assertion: drag a **hidden** or hostile token and confirm
  the write lands on `pathpreviewgm` and **not** on `pathpreview`. Cells are now
  converted against `getTokenScene(document)`'s grid — `TokenDocument#parent` is
  the embedding Scene in v14
  (https://foundryvtt.com/api/v14/classes/foundry.documents.TokenDocument.html);
  if a build stops exposing it the adapter falls back to `canvas.scene`, i.e.
  today's single-scene-correct answer. Verify by moving a token on a scene the
  GM is NOT viewing and checking the emitted `sceneId`.
- **Mover-centered world-rect capture (#1744 WS-2)** — `captureSceneSnapshot({
  worldRect })` renders an arbitrary world rect instead of the GM's screen view
  by retargeting `canvas.stage` (`pivot` → 0,0; `scale` → k; `position` →
  `-x1·k, -y1·k`) for exactly one synchronous render to an offscreen
  RenderTexture, restoring all three in a `finally`. The PIXI surfaces involved
  are the **v14 hotspots** to re-verify:
  - `Container#position` / `#scale` / `#pivot` are `ObservablePoint`s in PIXI v7
    and v8 alike; the adapter uses `set()` with a plain-property fallback.
  - `renderer.render({ container, target })` (v8) vs
    `renderer.render(stage, { renderTexture })` (v7) — both call shapes are
    attempted, in that order.
  - `renderer.extract.canvas(texture)` (v8) vs `renderer.plugins.extract` (v7).
  If none of that is available the world-rect path returns **null** (→
  `snapdone ok:false`) rather than falling back to the raw view — a GM-view
  image under a matrix claiming to be the mover's neighbourhood would send taps
  to the wrong squares.
  Smoke-pass items, none of which unit tests can prove without a live canvas:
  (1) the GM's own view shows **no flicker** during a capture; (2) the returned
  image really is the mover's neighbourhood, not the GM's viewport;
  (3) hidden tokens are absent from it; (4) tapping the mover's own square in
  the app resolves to the cell it is standing on; (5) one broadcast `snapdone`
  with `trigger: 'movedone'` arrives per completed move, and only one.
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
  document type was created). **[resolved #1732 for circles; extended #1735 S2
  to cone/line.]** v14's Region shape registry
  (`foundry.data.BaseShapeData.TYPES` — `circle`, `cone`, `ellipse`,
  `emanation`, `grid`, `line`, `polygon`, `rectangle`, `ring`, `token`) is what
  the adapter capability-probes before drawing a directional shape; the shapes
  written are `{ type:'cone', x, y, radius, angle, rotation }` and
  `{ type:'line', x, y, length, width, rotation }`, all lengths in canvas
  PIXELS. **`rotation` is Foundry's screen-space convention: 0 = EAST,
  increasing clockwise** (the convention `MeasuredTemplate#direction` used
  before v14), while the wire carries COMPASS degrees (0 = north, clockwise) —
  `compassToRegionRotation()` is the single translation point, and the live
  canvas is the only thing that can prove its handedness (smoke item below).
  The `curvature` field a cone accepts is deliberately left unset, so the
  build's own default cone rendering applies.
- **Token-attached emanation Regions are v14-GREENFIELD, not a migration**
  (#1733, `createTokenAuraRegion` / `deleteRegion` / `findBridgeAuraRegions` /
  `getRegionTokens` in the adapter, driven by `auras.js`). 14.353 added
  `RegionDocument.createTokenEmanation(token, range, regionData, options)` plus
  `RegionDocument#attachedToken`, so a Region can follow — and rotate with — the
  creature it belongs to; v13 has no equivalent and the whole rail no-ops there.
  Two things about it diverge from the template rail above and are easy to get
  wrong: **`range` is in GRID UNITS (feet), not pixels** — core authors the
  shape, we only name the distance — and **region events never reach `Hooks`**.
  `CONST.REGION_EVENTS.TOKEN_ENTER` / `TOKEN_EXIT` are delivered to
  `RegionBehaviorType#_handleRegionEvent` on behavior documents embedded in the
  Region and nowhere else (the 14.365 hook registry has no region hook at all),
  so membership is recomputed off the token lifecycle hooks and read from
  `RegionDocument#tokens`. See the aura block in the smoke pass below — the mock
  world can prove the code, only a canvas can prove those two facts.
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
   the app (`templateplace` → Region branch) and clean it up, **place a CONE
   from the app at a known facing and confirm the wedge on canvas points that
   way** (#1735 S2 — cast NE and the wedge must open toward the top-right, not
   the bottom-right; repeat for one cardinal, e.g. N, plus a line, whose length
   must run along the facing and whose width must read as 5 ft unless the spell
   says otherwise. The compass→`rotation` translation and its handedness are
   unit-pinned but only a canvas proves them; if they are mirrored or 90° off,
   the entire fix is the offset in `compassToRegionRotation`), roll from the
   dice tower with a DSN appearance override, capture a map snapshot (PIXI v8
   render path) AND a mover-centered one (the stage-retarget path — watch for
   flicker), and fire one Sequencer/JB2A animation. (Evaluate the community
   **Quench** module for in-world automation — confirm its v14 support first.)

   **Aura emanations (#1733) — four canvas facts the mock world cannot prove.**
   The whole rail is v14-only (`RegionDocument.createTokenEmanation`, 14.353)
   and every one of these is a live-canvas question:

   a. **The API exists and accepts our arguments.** Console-check
      `typeof foundry.documents.RegionDocument.createTokenEmanation` in the real
      world. The signature the adapter is written against is
      `(token, range, regionData, options)` with `regionData` an
      `Omit<RegionData, 'elevation' | 'shapes'>`. If the world rejects the
      `flags`/`visibility` keys, or wants the token as a placeable rather than a
      TokenDocument, the fix is entirely inside `createTokenAuraRegion`.
   b. **`range` is FEET, not pixels.** The docs call it "the emanation range in
      grid units", so this is the ONE Region write in the bridge that does not
      convert with `feet / grid.distance * grid.size`. Activate a 15 ft aura and
      count squares: three out on a 5 ft grid. A ring that draws a barely-visible
      dot means `range` wanted pixels after all — the fix is one `toPixels()`
      call in `createTokenAuraRegion`.
   c. **The ring follows its token, and enter/exit actually reaches the app.**
      Activate an aura, then walk the *owner* around (the ring must travel with
      it) and walk a *second* token in and out of it. Each crossing must produce
      one `cnmh_auramembers_<charId>` within a round-trip. **This is the highest
      risk item in the rail**: v14 core routes `CONST.REGION_EVENTS.TOKEN_ENTER`
      / `TOKEN_EXIT` only to `RegionBehaviorType` instances — there is no core
      hook for them (verified against the 14.365 hook registry) — so
      `auras.js` recomputes membership off `updateToken`/`createToken`/
      `deleteToken` and reads `RegionDocument#tokens` for the answer. If
      membership never changes on canvas, `RegionDocument#tokens` is not being
      kept current for attached emanations, and the fallback in
      `geometricMembers` should become the primary path. Check the GM console
      for `region.tokens` right after a token walks in.
   d. **The connect-time orphan sweep.** Activate an aura, then reload Foundry
      (F5). On reconnect the scene must end up with exactly ONE ring for that
      character — the sweep deletes every `flags['cnmh-bridge'].auraCharId`
      Region first, then FULL_STATE's replay re-creates the active ones. Two
      rings means the flag is not surviving the document write; zero means the
      replay is not seeing the persisted `auraset`. Also confirm a GM's own
      hand-drawn Region is untouched by the sweep.
6. **Bump `module.json`** `compatibility.verified` to `"14"` **only after** the
   contract suite passes against the v14 fixtures **and** the smoke pass is clean.
7. Delete `__fixtures__/v14/PLACEHOLDER.md` once real v14 fixtures are committed.
