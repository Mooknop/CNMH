# Lore vault

This folder is the **source of truth for lore content** in CNMH. It is a plain
[Obsidian](https://obsidian.md) vault committed to the repo: one markdown file
per lore entry, edited in Obsidian (or any text editor), committed as a
content-only change, and synced to the live `CampaignContent` Durable Object.

Part of epic [#285](https://github.com/Mooknop/CNMH/issues/285). This slice
(#286) sets up the format and the one-time export. The push-to-DO sync is a
follow-up slice (#287); until then, edits here are committed but not yet
auto-published.

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
export and will be flagged by the sync script. The old DO data had a number of
these dangling pointers; the export prints them when it runs.

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
> the DO. Once the push sync (#287) lands, the vault is the write path: edit
> here, then push — don't re-export over unpushed changes.
