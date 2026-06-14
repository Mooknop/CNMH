/*
 * Shared parse/serialize contract for the lore Obsidian vault (epic #285).
 *
 * One markdown file per lore entry: `lore-vault/<Category>/<Title>.md`.
 *   - folder       = category
 *   - filename     = sanitized title
 *   - frontmatter  = authored fields only (id, summary, image, imagePosition,
 *                    dateArStart/End, related as wikilinks); `title:` is added
 *                    only when sanitization changed the filename.
 *   - body         = the entry content (markdown)
 *
 * Deliberately ABSENT: visibility / tags / createdAt. Those are DO-managed —
 * the slice-2 push reads them from the live doc and preserves them (see #285
 * decision 4). The vault never carries reveal state.
 *
 * The export script (slice 1) and the push script (slice 2) both go through
 * this module so they agree byte-for-byte on the format.
 */

const YAML = require('yaml');

// Characters illegal in Windows/macOS filenames. Replaced with a space and
// collapsed so a title like `Who/What` becomes `Who What`.
const ILLEGAL_FILENAME = /[\\/:*?"<>|]/g;

function sanitizeFilename(title) {
  const cleaned = String(title || '')
    .replace(ILLEGAL_FILENAME, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}

// `[[Target]]` / `[[Target|alias]]` -> resolution target ("Target"). The link
// target is the part before the pipe; the alias is display-only.
function parseWikilink(link) {
  const m = String(link || '').match(/^\s*\[\[([^\]]+)\]\]\s*$/);
  const inner = m ? m[1] : String(link || '');
  const target = inner.split('|')[0];
  return target.trim();
}

// Pull every inline `[[Target]]` / `[[Target|alias]]` out of a markdown body and
// return the resolution targets (titles). The slice-2 push unions these with the
// `related:` frontmatter list (epic #285: "frontmatter ∪ inline body"), so an
// entry that merely *mentions* another in prose still forms a relation. Order is
// first-seen; duplicates are removed.
function extractBodyWikilinks(body) {
  const seen = new Set();
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    const target = m[1].split('|')[0].trim();
    if (target && !seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}

// Build the markdown file for one lore doc. `idToTitle` maps related ids to
// titles; related ids with no known title (dead pointers the app already
// ignores via `.filter(Boolean)`) are dropped — they can't be valid wikilinks.
function serializeDoc(doc, idToTitle = new Map()) {
  const title = String(doc.title || '');
  const filenameBase = sanitizeFilename(title);

  const fm = { id: doc.id };
  // Preserve the canonical title only when the filename can't carry it.
  if (filenameBase !== title) fm.title = title;
  if (doc.summary) fm.summary = String(doc.summary);
  if (doc.image) fm.image = doc.image;
  if (doc.imagePosition) fm.imagePosition = doc.imagePosition;
  if (doc.dateArStart != null) fm.dateArStart = doc.dateArStart;
  if (doc.dateArEnd != null) fm.dateArEnd = doc.dateArEnd;

  const related = (Array.isArray(doc.related) ? doc.related : [])
    .map((id) => idToTitle.get(id))
    .filter(Boolean)
    .map((t) => `[[${t}]]`);
  if (related.length) fm.related = related;

  const frontmatter = YAML.stringify(fm, { lineWidth: 0 });
  const body = String(doc.content || '').trim();
  const markdown = `---\n${frontmatter}---\n\n${body}\n`;

  return { category: doc.category, filename: `${filenameBase}.md`, markdown };
}

// Split `---\nYAML\n---\nbody` into its frontmatter object and raw body.
// Line endings are normalized to LF first: Obsidian/Windows checkouts (and
// `core.autocrlf=true`) produce CRLF, which would otherwise defeat the `---\n`
// frontmatter match (every id reads as missing) and leave stray `\r` in body
// content (spurious diffs against the LF-stored DO docs).
function splitFrontmatter(markdown) {
  const text = String(markdown || '').replace(/\r\n?/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  return { data: YAML.parse(match[1]) || {}, body: match[2] };
}

// Parse a vault file back into an authored-fields doc. `category` comes from the
// folder and `filenameTitle` from the filename (sans extension). `related` is
// returned as resolution-target strings (titles) — slice 2 maps them to ids.
function parseFile(markdown, { category, filenameTitle } = {}) {
  const { data, body } = splitFrontmatter(markdown);

  const doc = {
    id: data.id,
    title: data.title || filenameTitle || '',
    category,
    summary: data.summary || '',
    content: String(body || '').trim(),
    related: (Array.isArray(data.related) ? data.related : []).map(parseWikilink),
  };
  if (data.image) doc.image = data.image;
  if (data.imagePosition) doc.imagePosition = data.imagePosition;
  if (data.dateArStart != null) doc.dateArStart = data.dateArStart;
  if (data.dateArEnd != null) doc.dateArEnd = data.dateArEnd;

  return doc;
}

module.exports = {
  sanitizeFilename,
  parseWikilink,
  extractBodyWikilinks,
  serializeDoc,
  splitFrontmatter,
  parseFile,
};
