import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  parseWikilink,
  extractBodyWikilinks,
  serializeDoc,
  splitFrontmatter,
  parseFile,
} from './loreVault.js';

// Re-parse a serialized doc the way the export writes it to disk: category from
// the folder, filenameTitle from the filename (minus `.md`).
function roundTrip(doc, idToTitle = new Map()) {
  const { category, filename, markdown } = serializeDoc(doc, idToTitle);
  return parseFile(markdown, { category, filenameTitle: filename.replace(/\.md$/, '') });
}

describe('sanitizeFilename', () => {
  it('passes clean titles through unchanged', () => {
    expect(sanitizeFilename('Sandpoint')).toBe('Sandpoint');
    expect(sanitizeFilename("Father Zantus' Chapel")).toBe("Father Zantus' Chapel");
  });

  it('replaces illegal filename characters with spaces', () => {
    expect(sanitizeFilename('Who/What: Why?')).toBe('Who What Why');
  });

  it('falls back to "untitled" when nothing survives', () => {
    expect(sanitizeFilename('')).toBe('untitled');
    expect(sanitizeFilename('???')).toBe('untitled');
  });
});

describe('parseWikilink', () => {
  it('extracts the link target', () => {
    expect(parseWikilink('[[Sandpoint]]')).toBe('Sandpoint');
  });

  it('uses the target, not the alias, for piped links', () => {
    expect(parseWikilink('[[Sandpoint|the town]]')).toBe('Sandpoint');
  });

  it('tolerates surrounding whitespace and bare text', () => {
    expect(parseWikilink('  [[Abadar]]  ')).toBe('Abadar');
    expect(parseWikilink('Abadar')).toBe('Abadar');
  });
});

describe('extractBodyWikilinks', () => {
  it('pulls inline links and resolves their targets, not aliases', () => {
    const body = 'See [[Sandpoint]] and [[Abadar|the god]] for details.';
    expect(extractBodyWikilinks(body)).toEqual(['Sandpoint', 'Abadar']);
  });

  it('de-duplicates repeated mentions, keeping first-seen order', () => {
    const body = '[[Sandpoint]] then [[Abadar]] then [[Sandpoint]] again.';
    expect(extractBodyWikilinks(body)).toEqual(['Sandpoint', 'Abadar']);
  });

  it('returns an empty array when there are no links', () => {
    expect(extractBodyWikilinks('plain prose')).toEqual([]);
    expect(extractBodyWikilinks('')).toEqual([]);
    expect(extractBodyWikilinks(null)).toEqual([]);
  });
});

describe('serializeDoc', () => {
  it('omits DO-managed fields (visibility/tags/createdAt)', () => {
    const { markdown } = serializeDoc({
      id: 'abadar',
      title: 'Abadar',
      category: 'Religion',
      summary: 'God of cities.',
      content: 'Body.',
      visibility: 'revealed',
      tags: ['deity'],
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    expect(markdown).not.toMatch(/visibility/);
    expect(markdown).not.toMatch(/tags/);
    expect(markdown).not.toMatch(/createdAt/);
  });

  it('maps related ids to title wikilinks and drops dead pointers', () => {
    const idToTitle = new Map([
      ['abadar', 'Abadar'],
      ['sandpoint', 'Sandpoint'],
    ]);
    const { markdown } = serializeDoc(
      { id: 'x', title: 'X', category: 'Lore', content: '', related: ['abadar', 'ghost-id', 'sandpoint'] },
      idToTitle
    );
    expect(markdown).toMatch(/- "\[\[Abadar\]\]"/);
    expect(markdown).toMatch(/- "\[\[Sandpoint\]\]"/);
    expect(markdown).not.toMatch(/ghost-id/);
  });

  it('maps the parent id to a single title wikilink and drops a dead parent', () => {
    const idToTitle = new Map([['sandpoint', 'Sandpoint']]);
    const withParent = serializeDoc(
      { id: 'cathedral', title: 'Cathedral', category: 'Location', content: '', parent: 'sandpoint' },
      idToTitle
    );
    expect(withParent.markdown).toMatch(/^parent: "\[\[Sandpoint\]\]"$/m);

    const deadParent = serializeDoc(
      { id: 'cathedral', title: 'Cathedral', category: 'Location', content: '', parent: 'ghost-id' },
      idToTitle
    );
    expect(deadParent.markdown).not.toMatch(/parent/);
  });

  it('places the entry in a folder named for its category', () => {
    const { category, filename } = serializeDoc({ id: 'sandpoint', title: 'Sandpoint', category: 'Location', content: '' });
    expect(category).toBe('Location');
    expect(filename).toBe('Sandpoint.md');
  });
});

describe('splitFrontmatter', () => {
  it('returns the body verbatim when there is no frontmatter', () => {
    expect(splitFrontmatter('just a body').body).toBe('just a body');
  });

  it('parses CRLF files (Obsidian/Windows checkouts) and normalizes body to LF', () => {
    const crlf = '---\r\nid: sandpoint\r\n---\r\n\r\nFirst.\r\n\r\nSecond.\r\n';
    const { data, body } = splitFrontmatter(crlf);
    expect(data.id).toBe('sandpoint');
    expect(body).not.toMatch(/\r/);
    expect(body).toContain('First.\n\nSecond.');
  });
});

describe('parseFile (CRLF)', () => {
  it('reads id/title/related from a CRLF file', () => {
    const crlf = ['---', 'id: sandpoint', 'related:', '  - "[[Abadar]]"', '---', '', 'Body text.', ''].join('\r\n');
    const doc = parseFile(crlf, { category: 'Location', filenameTitle: 'Sandpoint' });
    expect(doc.id).toBe('sandpoint');
    expect(doc.title).toBe('Sandpoint');
    expect(doc.related).toEqual(['Abadar']);
    expect(doc.content).toBe('Body text.');
  });
});

describe('round-trip (authored fields)', () => {
  const idToTitle = new Map([
    ['abadar', 'Abadar'],
    ['sandpoint', 'Sandpoint'],
  ]);

  it('reproduces a typical entry', () => {
    const doc = {
      id: 'sandpoint-cathedral',
      title: 'Sandpoint Cathedral',
      category: 'Location',
      summary: 'The great church at the heart of town.',
      content: 'First paragraph.\n\nSecond paragraph mentioning Abadar.',
      related: ['abadar', 'sandpoint'],
    };
    const out = roundTrip(doc, idToTitle);
    expect(out.id).toBe(doc.id);
    expect(out.title).toBe(doc.title);
    expect(out.category).toBe(doc.category);
    expect(out.summary).toBe(doc.summary);
    expect(out.content).toBe(doc.content);
    // related is stored as title wikilinks; it comes back as resolution targets.
    expect(out.related).toEqual(['Abadar', 'Sandpoint']);
  });

  it('round-trips a parent edge as a resolution-target title', () => {
    const doc = {
      id: 'sandpoint-cathedral',
      title: 'Sandpoint Cathedral',
      category: 'Location',
      summary: 's',
      content: 'c',
      parent: 'sandpoint',
    };
    const out = roundTrip(doc, idToTitle);
    expect(out.parent).toBe('Sandpoint');
  });

  it('reproduces History dateAr fields', () => {
    const doc = {
      id: 'the-late-unpleasantness',
      title: 'The Late Unpleasantness',
      category: 'History',
      summary: 'A dark chapter.',
      content: 'It happened.',
      dateArStart: 4702,
      dateArEnd: 4703,
      related: [],
    };
    const out = roundTrip(doc);
    expect(out.dateArStart).toBe(4702);
    expect(out.dateArEnd).toBe(4703);
    expect(out.related).toEqual([]);
  });

  it('reproduces image and imagePosition', () => {
    const doc = {
      id: 'img-doc',
      title: 'Img Doc',
      category: 'Location',
      summary: 's',
      content: 'c',
      image: 'img_sandpoint.jpg',
      imagePosition: { x: 25, y: 75 },
    };
    const out = roundTrip(doc);
    expect(out.image).toBe('img_sandpoint.jpg');
    expect(out.imagePosition).toEqual({ x: 25, y: 75 });
  });

  it('recovers the canonical title from frontmatter when the filename was sanitized', () => {
    const doc = {
      id: 'who-what',
      title: 'Who/What: Why?',
      category: 'Lore',
      summary: 's',
      content: 'c',
    };
    const { filename, markdown } = serializeDoc(doc);
    expect(filename).toBe('Who What Why.md');
    expect(markdown).toMatch(/^title:/m);
    const out = roundTrip(doc);
    expect(out.title).toBe('Who/What: Why?');
  });

  it('trims stray trailing whitespace in content', () => {
    const doc = { id: 'iron', title: 'Iron', category: 'Location', summary: 's', content: 'Iron Harbor is a town. ' };
    expect(roundTrip(doc).content).toBe('Iron Harbor is a town.');
  });
});
