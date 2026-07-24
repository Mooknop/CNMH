# Chaotic Neutral Milk Hotel (CNMH)

A real-time **Pathfinder 2e** companion app for a home game (5 players + 1 GM). What
started as a localStorage character sheet has grown into a three-tier system: a React
SPA, a Cloudflare Worker + Durable Objects backend, and a Foundry VTT bridge module
that keeps the app and the virtual tabletop in sync over the same WebSocket.

## Architecture

CNMH is three cooperating tiers:

### 1. React frontend (`src/`)

- **React 19** SPA built with `react-scripts` (Create React App).
- **React Router 7** — routes are declared in `src/App.js`; GM pages live under
  `src/pages/gm/`.
- **Real-time state** via `useSyncedState(key, initialValue)` — a drop-in `useState`
  replacement that syncs keys to the server over WebSocket and falls back to
  `localStorage` when offline.

Synced keys follow the format `cnmh_<type>_<id>`, where `type` is a single token with
no underscores and `id` is a character id or `global` (e.g. `cnmh_playmode_global`,
`cnmh_moveopts_<charId>`).

**Context providers** (`src/contexts/`, composed in `App.js`):

- `SessionContext` — WebSocket lifecycle, `getState`, `sendUpdate`, `sendMessage`
- `ContentContext` — campaign content from the `CampaignContent` DO; resolves raw
  characters + catalog refs into full objects
- `CharacterContext`, `TraitContext`, `GameDateContext`, `LoreContext`

**Custom hooks** (`src/hooks/`) carry most of the logic — `useSyncedState` (the sync
primitive), `usePlayMode` (exploration / downtime / encounter), `useTokenMovement`,
`useEncounter`, `useGmAuth`, plus combat and exploration helpers (`useTargeting`,
`useShield`, `useEffects`, `useExploitVulnerability`, `useRecallKnowledge`,
`useExplorationEffect`, and more).

### 2. Cloudflare Worker + Durable Objects (`worker/`)

- **`worker/index.js`** — request router: serves the SPA and routes `/session/*`,
  `/content/*`, `/gm/*`, and `/images/*`.
- **`CampaignSession` DO** — real-time state store and WebSocket fanout relay. Every
  client (app tabs and the Foundry bridge) connects here. Handles `UPDATE`,
  `GM_UPDATE`, and `GM_BATCH` messages.
- **`CampaignContent` DO** — persistent campaign content (quests, lore, items, spells,
  characters, effects, calendar, reputation, traits). Its GM API is gated by
  Cloudflare Access.
- **`worker/access.js`** — Cloudflare Access (Zero Trust) JWT verification for GM
  endpoints.

Deployed with `wrangler`; configuration lives in `wrangler.toml`.

### 3. Foundry VTT bridge (`foundry-bridge/`)

A Foundry v13 / PF2e v6.x module (plain ES modules, no build step) that joins the game
as a normal session peer — same WebSocket as the player devices, same `cnmh_*` keys.

Every Foundry / canvas / actor / combat / PF2e API call goes through a single seam,
**`pf2eAdapter.js`**, so feature modules never touch `canvas.*`, `game.*`, or
`CONFIG.PF2E.*` directly (v14 migration markers are already in place). Feature modules:
`bridge.js` (lifecycle), `encounter.js`, `characterSync.js`, `movement.js`,
`targeting.js`, `flanking.js`, `flankingPush.js`, `doors.js`, `effects.js`, `saves.js`.

The relay route is authenticated with a shared secret: the Worker holds it as the
`BRIDGE_SECRET` secret, each Foundry world as the module's **Relay secret**
setting. It is deliberately absent from this repo and from the release zip —
rotate the two together (see
[`foundry-bridge/README.md`](foundry-bridge/README.md#setup-the-relay-secret)).

The full app ↔ bridge relay key table is documented in
[`foundry-bridge/README.md`](foundry-bridge/README.md).

## Features

**Player-facing**

- Full PF2e character sheets — stats, skills, proficiencies, feats, actions, strikes,
  reactions, and spell repertoires
- Inventory and containers, hands / loadout tracking, and party wealth
- Spellcasting with a spell browser, filters, and cast-spell flow
- Party dashboard and party summary views
- Golarion calendar with moon phases, plus a campaign history timeline
- Campaign lore drawer with discovery tracking
- Reputation tracking with radar-chart visualization

**Encounter & combat (synced with Foundry)**

- Live encounter state (round / turn / phase), token movement, and reachable-square
  grids during exploration
- Targeting, flanking detection, shield handling, and save prompts driven from the
  tabletop
- Chained strikes and spells, ability usage, and a combat log panel

**GM tools** (`/gm`, Cloudflare Access–gated)

- Editors for quests, lore, characters, items, spells, effects, reputation, calendar,
  and theme
- Encounter control panel and save requests
- Image management for campaign assets

## Getting started

### Prerequisites

- Node.js 18+ and npm
- (For backend/bridge work) a Cloudflare account and `wrangler`

### Install & run the frontend

```bash
npm install
npm start        # dev server at http://localhost:3000
```

> The frontend talks to the deployed Worker for sync; for full local backend
> development run the Worker with `wrangler dev` (see `wrangler.toml`).

## Commands

```bash
npm start                    # Dev server (localhost:3000)
npm run lint                 # ESLint — zero-warnings policy (--max-warnings 0)
npm test                     # Jest watch mode (app only)
npm run test:ci              # Lint → test --watchAll=false --coverage (80% gate)
npm run test:bridge          # Bridge-only Jest (foundry-bridge/)
npm run test:e2e             # Playwright E2E against staging (serial)
npm run build                # Lint → build → test:ci (full quality gate)
```

Run a single app test file (CRA needs the pattern via env in CI mode):

```bash
CI=true react-scripts test --watchAll=false src/hooks/usePlayMode.test.js
```

Run a single bridge test file:

```bash
npm run test:bridge -- --testPathPattern=movement
```

## Quality gates

- **Lint is zero-warnings** — `npm run lint` must be clean before handoff.
- **Coverage** thresholds are ≥ 80% across branches, statements, functions, and lines.
- **E2E tests run serially** against a shared staging Worker + Durable Objects. Parallel
  runs burn Cloudflare DO read/write tokens quickly, so the PR trigger is disabled — run
  them via `workflow_dispatch` only. Config is in `playwright.config.ts`.

## Styling

Avoid inline `style={{}}`. Use CSS custom properties; design tokens live in
`src/pf2e-tokens.css`. For dynamic per-character accents, pass
`style={{ '--x-theme': color }}` on the container and reference `var(--x-theme)` in CSS.

## Project structure

```
src/
  components/   Reusable UI (actions, encounter, spells, character-sheet, gm, shared, …)
  pages/        Top-level pages; GM pages under pages/gm/
  contexts/     React context providers (Session, Content, Character, …)
  hooks/        Sync primitive and feature logic
worker/         Cloudflare Worker + Durable Objects (CampaignSession, CampaignContent)
foundry-bridge/ Foundry VTT module (pf2eAdapter seam + feature modules)
scripts/        Tooling (e.g. content snapshot)
```

See [`CLAUDE.md`](CLAUDE.md) for deeper architecture notes and conventions.
