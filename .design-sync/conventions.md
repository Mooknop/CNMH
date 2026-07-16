# CNMH — build conventions

This is the shared-primitives layer of a **dark-only** Pathfinder 2e campaign app. There is no light theme: put every screen on `var(--shell-bg)` with `color: var(--shell-text-primary)` and `font-family: var(--font-ui)` (the shipped `styles.css` already styles `body` this way — don't fight it with light backgrounds).

## Setup / wrapping
Most components work bare. Two need context providers (both are exports of this library):
- `TraitTag` throws outside `<TraitProvider>` — it opens the trait-info modal on click.
- `HistoryTimeline` throws outside `<LoreProvider>`.

Wrap once near the root: `<TraitProvider><LoreProvider>…app…</LoreProvider></TraitProvider>`.

## Styling idiom: CSS custom properties (no utility classes)
Style your own layout glue with inline styles or small CSS referencing the tokens defined in `tokens/pf2e-tokens.css`. The core vocabulary:

- **Surfaces**: `--shell-bg` (page), `--shell-surface` (nav/chrome), `--shell-surface-raised`, `--surface-card` (card body), `--surface-inset` / `--surface-inset-hover` (sub-boxes, stat blocks)
- **Text**: `--shell-text-primary` / `--shell-text-secondary` / `--shell-text-tertiary`
- **Borders**: `--shell-border`, `--shell-border-strong`
- **Accents**: `--theme-accent` (ember — primary/HP/active), `--theme-gold` (legendary/treasure), `--theme-arcane` (spells/magic), `--theme-verdant` (healing/positive), `--theme-peril` (danger/dying); light-on-dark text variants `--ember-light`, `--gold-light`, `--arcane-light`, `--verdant-light`
- **Type**: `--font-ui` (DM Sans — UI default), `--font-display` (Cinzel — headers/titles), `--font-body` (Crimson Pro — prose), `--font-action` (the PF2e action-glyph font; use the `ActionSymbol` component instead of the raw font)
- **Rhythm**: `--space-1` … `--space-12`; `--radius-xs` … `--radius-xl`, `--radius-full`

One class vocabulary worth knowing: `TraitTag` tints via `className` — elemental/school tints (`magical`, `fire`, `cold`, `electricity`, `sonic`, `poison`, `disease`) and rarity tints (`uncommon`, `rare`, `unique`).

## Component notes
- `ActionSymbol cost={1|2|3|'reaction'|'free'}` renders the genuine PF2e action glyphs; unknown costs fall back to text. Use it for every action cost — never type ◆ characters.
- `ActionRow` needs at least `name`; `glyph` is a string (`actionFont` switches it to the action font).
- `Modal` is a portal with a fixed backdrop; give it realistic titled content. `CollapsibleCard` takes `header`, optional `headerRight`, `initialExpanded`, `themeColor`.
- `RankRing` / `ProficiencyPips` visualize proficiency ranks 0–4 (untrained→legendary).

## Where the truth lives
Read `tokens/pf2e-tokens.css` before inventing a color or size — every hue, ramp, and alias is defined and commented there. `tokens/fx.css` holds the animation/juice classes. Per-component API contracts are each `components/general/<Name>/<Name>.d.ts`, usage in the sibling `.prompt.md`.

## Idiomatic snippet
```jsx
<div style={{ background: 'var(--shell-bg)', color: 'var(--shell-text-primary)', fontFamily: 'var(--font-ui)', padding: 'var(--space-4)' }}>
  <CollapsibleCard header={<strong>Attacks</strong>} initialExpanded>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0' }}>
      <span>Flaming Longsword +1 <ActionSymbol cost={1} /></span>
      <span style={{ color: 'var(--shell-text-secondary)' }}>+11 · 1d8+4 S, 1d6 fire</span>
    </div>
    <div>
      <TraitTag trait="magical" className="magical" /> <TraitTag trait="fire" className="fire" />
    </div>
  </CollapsibleCard>
</div>
```
