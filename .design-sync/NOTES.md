# design-sync notes — chaotic-neutral-milk-hotel

- This repo is an APP, not a packaged design system. Scope (user decision 2026-07-16): the shared primitives layer only — `src/components/shared/` (26 components), synced to Claude Design project `edef4c63-6f04-40fd-ad04-406ddbc5fbc0` ("Chaotic Neutral Milk Hotel").
- No library build exists. The bundle entry is the hand-maintained barrel `.design-sync/entry.jsx` (all shared components are `export default`, so the converter's synthesized `export * from` entry would export nothing — keep the barrel in sync when shared components are added/removed, and mirror any change in `componentSrcMap`).
- `VpResultsCollector` (renders null — sync plumbing) and `hpFxSymbols` (helper module) are deliberately NOT synced.
- Tokens are repo files, not a package: `css.mjs` is forked (`.design-sync/overrides/css.mjs`) so `tokensGlob` accepts workspace-relative stylesheet paths (`src/pf2e-tokens.css`, `src/fx.css`). The fork also copies `@font-face` binaries into `fonts/` and repoints urls (`../fonts/…` from `tokens/`), which is how `pathfinder-2e-actions.woff2` ships.
- `cssEntry` is `.design-sync/ds-global.css` — the body/base rules from `src/index.css` minus its `@import`s and minus the `code { source-code-pro }` fallback (killed a `[FONT_MISSING]`; the app never ships that font). The Tabler icons webfont import was dropped too: no shared component uses `ti-*` classes.
- Provider chain for previews AND for the design agent: `TraitProvider` > `LoreProvider` (via `extraEntries` `./src/contexts/TraitContext.jsx` + `./src/contexts/LoreContext.jsx`). `useTrait()` and `useLore()` THROW outside their providers; `useSession()`/`useContent()` fall back to NOOPs and are safe unwrapped.
- Preview cards have a white body (emit.mjs contract) but the app is dark — every authored preview wraps stories in a dark Shell div (`background: var(--shell-bg); color: var(--shell-text-primary); font-family: var(--font-ui)`). Keep doing this for new previews.
- Modal is an overlay: `cfg.overrides.Modal = {cardMode: "single", viewport: "800x600"}`.

## Preview-authoring recipes (from the 2026-07 waves)
- ActionRow: needs a `name` (and ideally `glyph`) or it renders blank. `glyph` is a plain string; add `actionFont` for genuine PF2e font chars (`'1'|'2'|'3'|'R'|'F'` per `src/utils/actionGlyph.js`); exploration rows use literal `glyph="→"` without `actionFont`. It's a `width:100%` button — constrain (~420px) in previews.
- UseActionChip: variant auto-resolves from `cost` (`1|2|3|'reaction'|'free'`), plus `inactive` and `variableRange={{min,max}}` — covers the whole `use-chip--*` CSS vocabulary.
- GameGlyph registry keys: attachment, spellSlot, focusBard, focusSorcerer, focusMonk, focusChampion, profOffense, profDefense, augmentation, profArmor. 1em square, `fill: currentColor` — size/tint via a wrapping span.
- RankRing: wrap cells in `<div className="snode-wrap">` (grid lives on the wrapper class). Legendary pips fill `i < rank` (4 gold + 1 empty) — correct per source, don't "fix" it.
- HistoryTimeline renders ALL SIX Golarion age periods (~4000px) vs a 900x700 non-fullPage capture — previews scope to one period via `.timeline-period:not(:nth-of-type(N)) { display:none }` + zoom. Honest long-term preview shape; a viewport override alone can't fit six periods.
- PenaltyDisplay tooltip is hover-only — forced visible via scoped `.pd-force-tooltip .pd-tooltip { display:block }` + top padding. Reusable pattern for hover-tooltip components.
- TraitsField in the harness resolves a REAL trait catalog via `useContent()` (defined traits render neutral; only unknown names get the gold ⚠ orphan styling).
- Adding a `cfg.overrides.<Name>` entry AFTER a full build stamp blocks `preview-rebuild` for that component with `[CONFIG_STALE]` — re-run `package-build.mjs` first.
- Raw per-story shots: `ds-bundle/_screenshots/review/raw/…` — check bottom-edge clipping at full res.

## Known render warns
- `[FONT_REMOTE]` Cinzel / DM Sans / Crimson Pro / Special Elite (--font-type) / Caveat (--font-hand) — pf2e-tokens.css carries a remote font-host `@import`; families load at runtime. Expected, do not chase.
- `[TOKENS_MISSING]`-adjacent: "2 missing, below threshold" on validate — runtime-set vars, non-blocking.

## Re-sync risks
- The barrel `.design-sync/entry.jsx` and `componentSrcMap` are parallel hand-maintained lists; a new shared component must be added to BOTH or it silently doesn't ship.
- `.design-sync/overrides/css.mjs` is a fork — on re-sync, diff against the staged `lib/css.mjs` and merge upstream changes (the fork's only delta is the repo-local `tokensGlob` branch at the top of `copyTokens` and the repointed `common.mjs` import).
- `ds-global.css` duplicates ~15 lines of `src/index.css` body rules; if the app's base body styling changes, refresh it by hand.
- Trait tint / rarity class vocabulary in previews (fire, cold, magical, uncommon…) comes from `TraitTag.css` — if those classes are renamed the previews and conventions header go stale.
