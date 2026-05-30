# Foundry version migration checklist (v13 → v14 and beyond)

The bridge funnels **every** Foundry / canvas / actor / combat / PF2e API call
through [`pf2eAdapter.js`](./pf2eAdapter.js). Feature modules (`encounter.js`,
`characterSync.js`, `movement.js`) hold only logic and never touch a Foundry
global directly. That seam is what makes a version bump tractable: when an API or
data path moves, **only the adapter changes.**

## Known v14 hotspots

- **Token movement API** — v14 added a planned-movement pipeline
  (`TokenDocument.move`, the `moveToken` hook, movement-constraint options) and
  new origin accessors. The bridge writes moves via `moveToken()` in the adapter
  (currently `token.document.update({x,y})`, which still works on v14). This is
  the single switch point if you migrate to the new pipeline. Marked
  `[v14-MIGRATION]` in the adapter.
- **Active Effects V2 schema** — expiry handling and the effect schema changed.
  The bridge does not yet read/write Active Effects (effects are app-side), but
  any future effect mirror lands behind the adapter.
- **PF2e system reads** are version-gated independently of core Foundry: `getHp`,
  `getHeroPoints`, `getFocusPool`, `getSpeed`, `getConditions`. A PF2e major bump
  can move these even when core Foundry is unchanged.

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
   hit + Shield Block, roll a save prompt. (Evaluate the community **Quench**
   module for in-world automation — confirm its v14 support first.)
6. **Bump `module.json`** `compatibility.verified` to `"14"` **only after** the
   contract suite passes against the v14 fixtures **and** the smoke pass is clean.
7. Delete `__fixtures__/v14/PLACEHOLDER.md` once real v14 fixtures are committed.
