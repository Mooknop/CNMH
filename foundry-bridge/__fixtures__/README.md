# Bridge fixtures

Captured Foundry/PF2e document JSON used by the **adapter contract tests**
(`pf2eAdapter.test.js`). Each version directory holds the document shapes the
adapter reads from a live world running that Foundry generation:

- `v13/` — Foundry **v13** + PF2e **v6.x** (current `compatibility.verified`).
- `v14/` — Foundry **v14** target. Placeholder until re-exported (see below).

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
