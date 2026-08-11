# Bridge fixtures

Captured Foundry/PF2e document JSON used by the **adapter contract tests**
(`pf2eAdapter.test.js`). Each version directory holds the document shapes the
adapter reads from a live world running that Foundry generation:

- `v13/` — Foundry **v13** + PF2e **v6.x**.
- `v14/` — Foundry **14.365** + PF2e **8.4.0** (exported from the live world
  2026-08-10, then curated — see below).

## Curation convention

Fixtures carry each version's **shape** with **canonical values**: the raw
export is trimmed to the documents/fields the adapter reads, and the values
the contract tests assert (hp 32/48/5, hero points 2, focus 1/2, speed 30,
frightened 2 + off-guard, combat round 2 turn 1, token at 500,300) are
grafted in so the same assertions run against every version. Synthetic ids
(`tok-pellias`, `cbt-goblin`) are part of that contract. Fields that only
exist in *prepared* (runtime-derived) data but that the adapter reads off
live documents — PC `hp.max`, `dying/wounded/doomed`, `movement.speeds` —
are curated in deliberately; the raw v14 export stores none of them. The
v14 files keep the new structural fields the export surfaced
(`system.value.isValued` on conditions, combatant `type`/`system`/`groups`,
token `_movementHistory`/`_regions`/`depth`/`level`/`shape`) so a future
shape drift diffs loudly.

## What these are

These are stored close to Foundry's serialized form: `system.*` paths verbatim
plus an `items[]` array. The contract suite reads them through the
`hydrateActorFixture` / `hydrateCombatFixture` helpers in `test/foundryMock.js`,
which reconstruct the handful of **derived** accessors the adapter touches
(`itemTypes.condition`, `condition.slug`, `combat.combatant`). Everything the
adapter reads off `system.*` stays raw — so if a future version moves `hp` or
`heroPoints` to a new path, the re-exported fixture won't have it there and the
contract test fails loudly. That failure is the early-warning tripwire.

## Regenerating from a live world

In a Foundry world running the target version, from the console (F12):

```js
// Actor (pick a PC with HP, hero points, focus, and a couple of conditions):
copy(JSON.stringify(game.actors.getName('Pellias').toObject(), null, 2));

// Combat (have an encounter running with a PC and an NPC):
copy(JSON.stringify(game.combat.toObject(), null, 2));

// A placed token:
copy(JSON.stringify(canvas.tokens.controlled[0].document.toObject(), null, 2));
```

Paste into the matching file under the version directory. Then run
`npm run test:bridge` and fix any contract-test failure **in `pf2eAdapter.js`
alone** — feature modules should not need to change. See
`foundry-bridge/MIGRATION.md` for the full upgrade checklist.
