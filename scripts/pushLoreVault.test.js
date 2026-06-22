import { describe, it, expect } from 'vitest';
import {
  compileVault,
  validateVault,
  canonicalizeDoc,
  mergeDoc,
  diffDocs,
} from './pushLoreVault.js';

// Build a raw vault file record the way readVaultFiles() would.
function file(category, filenameTitle, frontmatter, body = '') {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((x) => `  - "${x}"`).join('\n')}`;
      return `${k}: ${v}`;
    })
    .join('\n');
  return { category, filenameTitle, markdown: `---\n${fm}\n---\n\n${body}\n` };
}

describe('compileVault', () => {
  it('unions frontmatter and inline-body wikilinks, resolved to ids', () => {
    const files = [
      file('Location', 'Sandpoint', { id: 'sandpoint' }, 'Home of [[Abadar]] worship.'),
      file('Religion', 'Abadar', { id: 'abadar', related: ['Sandpoint'] }),
    ];
    const { docs } = compileVault(files);
    const sandpoint = docs.find((d) => d.id === 'sandpoint');
    const abadar = docs.find((d) => d.id === 'abadar');
    expect(sandpoint.related).toEqual(['abadar']); // from inline body link
    expect(abadar.related).toEqual(['sandpoint']); // from frontmatter
  });

  it('resolves links case-insensitively and honors [[Title|alias]]', () => {
    const files = [
      file('Religion', 'Abadar', { id: 'abadar' }),
      file('Location', 'Sandpoint', { id: 'sandpoint' }, 'Worship of [[abadar|the banker god]].'),
    ];
    const { docs } = compileVault(files);
    expect(docs.find((d) => d.id === 'sandpoint').related).toEqual(['abadar']);
  });

  it('de-duplicates a relation appearing in both frontmatter and body', () => {
    const files = [
      file('Religion', 'Abadar', { id: 'abadar' }),
      file('Location', 'Sandpoint', { id: 'sandpoint', related: ['Abadar'] }, 'See [[Abadar]].'),
    ];
    const { docs } = compileVault(files);
    expect(docs.find((d) => d.id === 'sandpoint').related).toEqual(['abadar']);
  });

  it('reports links that resolve to no vault file', () => {
    const files = [file('Location', 'Sandpoint', { id: 'sandpoint', related: ['Nowhere'] })];
    const { unresolved } = compileVault(files);
    expect(unresolved).toEqual([{ id: 'sandpoint', link: 'Nowhere' }]);
  });

  it('resolves a single parent wikilink to an id', () => {
    const files = [
      file('Location', 'Sandpoint', { id: 'sandpoint' }),
      file('Location', 'Cathedral', { id: 'cathedral', parent: '"[[Sandpoint]]"' }),
    ];
    const { docs } = compileVault(files);
    expect(docs.find((d) => d.id === 'cathedral').parent).toBe('sandpoint');
  });

  it('reports a parent that resolves to no vault file', () => {
    const files = [file('Location', 'Cathedral', { id: 'cathedral', parent: '"[[Nowhere]]"' })];
    const { unresolved } = compileVault(files);
    expect(unresolved).toEqual([{ id: 'cathedral', link: 'Nowhere' }]);
  });
});

describe('validateVault', () => {
  it('passes a clean vault with no errors', () => {
    const { docs, unresolved } = compileVault([
      file('Location', 'Sandpoint', { id: 'sandpoint' }),
    ]);
    expect(validateVault(docs, unresolved).errors).toEqual([]);
  });

  it('flags duplicate ids', () => {
    const { docs } = compileVault([
      file('Location', 'A', { id: 'dup' }),
      file('NPC', 'B', { id: 'dup' }),
    ]);
    const { errors } = validateVault(docs, []);
    expect(errors.some((e) => /Duplicate id "dup"/.test(e))).toBe(true);
  });

  it('flags a missing id', () => {
    const { docs } = compileVault([file('Location', 'NoId', { summary: 'x' })]);
    const { errors } = validateVault(docs, []);
    expect(errors.some((e) => /Missing id/.test(e))).toBe(true);
  });

  it('flags a missing title', () => {
    // No filename title and no frontmatter title -> blank title.
    const { docs } = compileVault([file('Location', '', { id: 'x' })]);
    const { errors } = validateVault(docs, []);
    expect(errors.some((e) => /Missing title/.test(e))).toBe(true);
  });

  it('flags a missing category', () => {
    const docs = [{ id: 'x', title: 'X', category: '', related: [] }];
    const { errors } = validateVault(docs, []);
    expect(errors.some((e) => /Missing category/.test(e))).toBe(true);
  });

  it('flags a self-parent', () => {
    const docs = [{ id: 'x', title: 'X', category: 'Location', related: [], parent: 'x' }];
    const { errors } = validateVault(docs, []);
    expect(errors.some((e) => /Self-parent/.test(e))).toBe(true);
  });

  it('flags a parent cycle', () => {
    const docs = [
      { id: 'a', title: 'A', category: 'Location', related: [], parent: 'b' },
      { id: 'b', title: 'B', category: 'Location', related: [], parent: 'a' },
    ];
    const { errors } = validateVault(docs, []);
    expect(errors.some((e) => /cycle/i.test(e))).toBe(true);
  });

  it('accepts a valid multi-level hierarchy', () => {
    const docs = [
      { id: 'varisia', title: 'Varisia', category: 'Location', related: [] },
      { id: 'sandpoint', title: 'Sandpoint', category: 'Location', related: [], parent: 'varisia' },
      { id: 'cathedral', title: 'Cathedral', category: 'Location', related: [], parent: 'sandpoint' },
    ];
    expect(validateVault(docs, []).errors).toEqual([]);
  });

  it('turns unresolved links into errors', () => {
    const { docs, unresolved } = compileVault([
      file('Location', 'Sandpoint', { id: 'sandpoint', related: ['Nowhere'] }),
    ]);
    const { errors } = validateVault(docs, unresolved);
    expect(errors.some((e) => /Broken link.*Nowhere/.test(e))).toBe(true);
  });

  it('warns (does not error) on a History entry without dateArStart', () => {
    const { docs } = compileVault([file('History', 'Some Event', { id: 'evt' })]);
    const { errors, warnings } = validateVault(docs, []);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => /dateArStart/.test(w))).toBe(true);
  });
});

describe('canonicalizeDoc', () => {
  it('drops empty-string, empty-array, and nullish optional fields', () => {
    const out = canonicalizeDoc({
      id: 'x',
      title: 'X',
      summary: '',
      content: '',
      related: [],
      image: null,
      visibility: 'gm',
    });
    expect(out).toEqual({ id: 'x', title: 'X', visibility: 'gm' });
  });

  it('produces order-stable JSON regardless of input key order', () => {
    const a = canonicalizeDoc({ b: 2, a: 1, c: { y: 1, x: 2 } });
    const b = canonicalizeDoc({ c: { x: 2, y: 1 }, a: 1, b: 2 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('preserves array order (related is not sorted)', () => {
    expect(canonicalizeDoc({ related: ['b', 'a', 'c'] }).related).toEqual(['b', 'a', 'c']);
  });
});

describe('mergeDoc', () => {
  it('preserves DO-managed fields (visibility, tags, createdAt) from the live doc', () => {
    const authored = { id: 'x', title: 'X', category: 'NPC', content: 'new body', related: [] };
    const live = {
      id: 'x',
      title: 'old',
      content: 'old body',
      visibility: 'revealed',
      tags: ['npc'],
      createdAt: '2025-01-01',
    };
    const merged = mergeDoc(authored, live);
    expect(merged.visibility).toBe('revealed');
    expect(merged.tags).toEqual(['npc']);
    expect(merged.createdAt).toBe('2025-01-01');
    expect(merged.content).toBe('new body'); // authored wins for authored fields
  });

  it('defaults new docs to visibility gm and never invents reveal', () => {
    expect(mergeDoc({ id: 'x', title: 'X' }, null).visibility).toBe('gm');
  });

  it('drops an authored field that the vault no longer sets', () => {
    const authored = { id: 'x', title: 'X', category: 'NPC' }; // image removed
    const live = { id: 'x', title: 'X', category: 'NPC', image: 'old.jpg', visibility: 'gm' };
    expect(mergeDoc(authored, live).image).toBeUndefined();
  });
});

describe('diffDocs', () => {
  const live = [
    { id: 'a', title: 'A', category: 'NPC', content: 'body', visibility: 'revealed', related: [] },
    { id: 'gone', title: 'Gone', category: 'NPC', visibility: 'gm', related: [] },
  ];

  it('buckets create / update / unchanged / delete', () => {
    const vault = [
      { id: 'a', title: 'A', category: 'NPC', content: 'EDITED', related: [] }, // update
      { id: 'b', title: 'B', category: 'NPC', content: 'new', related: [] }, // create
    ];
    const { creates, updates, unchanged, deletes } = diffDocs(vault, live);
    expect(creates.map((c) => c.id)).toEqual(['b']);
    expect(updates.map((u) => u.id)).toEqual(['a']);
    expect(unchanged).toEqual([]);
    expect(deletes.map((d) => d.id)).toEqual(['gone']);
  });

  it('skips a doc whose authored fields are unchanged (visibility difference ignored)', () => {
    // Identical authored content; live carries reveal state the vault never sets.
    const vault = [{ id: 'a', title: 'A', category: 'NPC', content: 'body', related: [] }];
    const { updates, unchanged } = diffDocs(vault, live);
    expect(updates).toEqual([]);
    expect(unchanged.map((u) => u.id)).toEqual(['a']);
  });

  it('new docs are pushed with visibility gm', () => {
    const vault = [{ id: 'b', title: 'B', category: 'NPC', content: 'new', related: [] }];
    const { creates } = diffDocs(vault, live);
    expect(creates[0].doc.visibility).toBe('gm');
  });
});
