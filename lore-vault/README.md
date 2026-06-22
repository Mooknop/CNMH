# Lore vault

This folder is the **source of truth for lore content** in CNMH. It is a plain
[Obsidian](https://obsidian.md) vault committed to the repo: one markdown file
per lore entry, edited in Obsidian (or any text editor), committed as a
content-only change, and synced to the live `CampaignContent` Durable Object.

Part of epic [#285](https://github.com/Mooknop/CNMH/issues/285). The format and
one-time export landed in #286; the push-to-DO sync (#287) makes this vault the
**write path**: edit → commit → `npm run lore:push` → the live app updates
instantly (see [Publishing edits](#publishing-edits-vault--do)).

## File layout

```
lore-vault/
  <Category>/
    <Title>.md
```

- **Folder = category** (`Location`, `NPC`, `Religion`, `History`, …).
- **Filename = the entry title**, with the characters `\ / : * ? " < > |`
  replaced by spaces (illegal in filenames). When that rewrite changes the
  title, the file keeps the canonical title in a `title:` frontmatter field.

## File format

```markdown
---
id: sandpoint                 # REQUIRED — the stable slug id; never change it
title: Sandpoint              # only present when the filename had to be sanitized
summary: One-line teaser shown in discovery panels and search.
image: img_sandpoint.jpg      # optional — id in the GM image catalog
imagePosition:                # optional
  x: 50
  y: 50
dateArStart: 4707             # History entries only (Absalom Reckoning year)
dateArEnd: 4708               # optional
parent: "[[Sandpoint]]"       # optional — the containing entry (see Hierarchy)
related:
  - "[[Abadar]]"
  - "[[The Late Unpleasantness]]"
---
Body is the entry content, as real markdown. Inline [[wikilinks]] are also
collected as relations alongside the `related:` list.
```

### What's intentionally **not** here

`visibility`, `tags`, and `createdAt` are **DO-managed** and never live in the
vault:

- **`visibility`** (reveal state) stays app-managed — the GM flips reveals live
  at the table from the app. The sync preserves the live value and never writes
  it (see #285 decision 4).
- **`tags` / `createdAt`** are preserved from the live doc on push. (`tags` was
  already dropped by the old in-app editor on every save, so nothing is lost.)

## Linking

Use Obsidian wikilinks: `[[Title]]` or `[[Title|display text]]`. The link target
is the part before the `|` and must match another entry's title. Both inline
body links and the `related:` frontmatter list feed the app's
Connections / Referenced By panels and Obsidian's own graph + backlinks.

Dead links (a wikilink or related id with no matching entry) are dropped by the
export and **fail the push** (a wikilink that resolves to no vault file is a hard
error). The old DO data had a number of dangling pointers; the export prints them
when it runs.

## Hierarchy (containment)

`parent` is an **optional single wikilink** naming the entry that contains this
one — e.g. a Sandpoint site points at `[[Sandpoint]]`, and `Sandpoint` itself
points at `[[Varisia]]`. It's a generic field (any category may use it), though
today only Locations do.

- It's a **directed, single-parent** edge, so arbitrary depth works
  (Region → City → Site) without any tier configuration.
- The app derives the rest: an entry shows an **ancestor breadcrumb** and a
  **"Contains"** list of its direct children. These render in their own sections,
  separate from generic Connections — so don't also list a parent/child in
  `related:` (it would be redundant; the app de-duplicates it anyway).
- The push **fails** on a `parent` that resolves to no vault file, a self-parent,
  or a containment cycle.

## Publishing edits (vault → DO)

`npm run lore:push` parses the vault, validates it, diffs against the live DO, and
PUT/DELETEs only the entries that changed. Per-entity writes broadcast to
connected clients, so a tab at the table updates **without a reload** — no deploy,
no force-reseed.

```bash
npm run lore:push -- --dry-run        # report what would change; writes nothing
npm run lore:push                     # push creates + updates
npm run lore:push -- --allow-delete   # also DELETE entries removed from the vault
# against another deployment:
node scripts/pushLoreVault.js https://cnmh-staging.example.workers.dev --dry-run
```

- **Validation** (aborts before any write): duplicate/missing `id`, missing
  title/category, broken wikilinks, and bad `parent` edges (dead/self/cyclic).
  `History` entries with no `dateArStart` warn (they render as "Unknown Date")
  but don't block.
- **`related[]`** is compiled from the `related:` frontmatter **and** inline
  `[[wikilinks]]` in the body, resolved title→id (case-insensitive).
- **Deletions are opt-in.** Without `--allow-delete`, entries present live but
  missing from the vault are listed and skipped.
- **Reveal state is never touched.** `visibility` is read from the live doc and
  preserved on every PUT; new entries default to `gm`.

> The first push after the #286 export also cleans up the live DO's residual dead
> `related` pointers (the export already dropped them from the vault), so it
> reports a few updates. After that, `--dry-run` reports zero changes.

### One-time auth setup (CF Access service token)

Reads (`/api/content`) are public; writes hit the Access-gated GM API and need a
Cloudflare Access **service token**:

1. In **Cloudflare Zero Trust → Access → Service Auth**, create a service token.
   Note the Client ID and Client Secret.
2. Add that service token to the Access application policy that protects
   `/api/gm/*` (an *Include → Service Token* rule). `worker/access.js` already
   accepts service-token JWTs.
3. Export the credentials before pushing (the same secrets the E2E runner uses):

   ```bash
   export CF_ACCESS_CLIENT_ID=<client-id>
   export CF_ACCESS_CLIENT_SECRET=<client-secret>
   ```

   `--dry-run` needs no token.

## Regenerating the vault from the live DO

The vault was bootstrapped from production with:

```bash
npm run lore:export            # fetches https://cnmh.mooknop.workers.dev/api/content
# or against another deployment:
node scripts/exportLoreVault.js https://cnmh-staging.example.workers.dev
```

`/api/content` is public (no auth). The export:

- aborts if the `lore` collection is missing/empty (won't wipe the vault on a
  bad fetch),
- writes one file per entry with deterministic ordering (idempotent — a clean
  re-run produces no git diff),
- rebuilds the category folders from scratch so renamed/removed entries don't
  leave stragglers.

The shared parse/serialize contract lives in
[`scripts/lib/loreVault.js`](../scripts/lib/loreVault.js) so the export and the
future push script read and write exactly the same format.

> ⚠️ Re-running the export **overwrites local edits** with whatever is live in
> the DO. The vault is now the write path: edit here, then `npm run lore:push` —
> don't re-export over unpushed changes.
