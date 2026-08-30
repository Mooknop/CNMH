import { describe, it, expect } from 'vitest';
import {
  transformResearchTopics,
  transformPage,
  mergeGmFields,
  flattenUuids,
  cleanHtml,
  extractChecks,
  extractIntroParagraphs,
  extractTraits,
  parseSplitHeading,
  detectCostNote,
  parseSourceChunk,
  parseTierChunk,
  extractReward,
  PAGE_MATCHERS,
} from './importResearchTopics.mjs';

// All markup below is SYNTHETIC — invented fantasy prose (a fictional
// "Gloomvault"/"Lorekeeper" plot) shaped like the premium-module markup the
// transform parses (verified by hand against the gitignored S0 dump), without
// reproducing any Paizo book content. This repo is public; never paste real
// dump text here.

describe('flattenUuids', () => {
  it('flattens a labeled ref and drops a label-less one', () => {
    expect(flattenUuids('ask @UUID[JournalEntry.x.JournalEntryPage.y]{Fennimore} or @UUID[Actor.z]')).toBe(
      'ask Fennimore or ',
    );
  });
});

describe('cleanHtml', () => {
  it('strips images, tags, and collapses whitespace', () => {
    const html = '<img src="https://example.test/x.webp" />  <p>Some   <em>prose</em>\n\ntext.</p>';
    expect(cleanHtml(html)).toBe('Some prose text.');
  });

  it('renders an inline @Check as readable "Skill DC N" text', () => {
    expect(cleanHtml('succeed at a @Check[arcana|dc:24] check')).toBe('succeed at a Arcana DC 24 check');
  });
});

describe('extractChecks', () => {
  it('extracts a single check with traits/name, keeping the skill slug verbatim', () => {
    expect(extractChecks('@Check[diplomacy|dc:15|traits:skill,secret,action:gather-information|name:Gather Information]')).toEqual([
      { skill: 'diplomacy', dc: 15 },
    ]);
  });

  it('extracts every check across comma- and semicolon-separated alternatives, including a no-traits form', () => {
    const html = '@Check[arcana|dc:17], @Check[occultism|dc:18|traits:concentrate|name:Study]; @Check[perception|dc:16]';
    expect(extractChecks(html)).toEqual([
      { skill: 'arcana', dc: 17 },
      { skill: 'occultism', dc: 18 },
      { skill: 'perception', dc: 16 },
    ]);
  });

  it('does not normalize distinct-but-similar skill slugs', () => {
    expect(extractChecks('@Check[academia-lore|dc:19] @Check[academic-lore|dc:20]')).toEqual([
      { skill: 'academia-lore', dc: 19 },
      { skill: 'academic-lore', dc: 20 },
    ]);
  });
});

describe('extractIntroParagraphs', () => {
  it('joins every <p> before the section, cleaned', () => {
    const html =
      '<img class="float-right" src="https://example.test/a.webp" />' +
      '<p>Adventurers whisper about the Gloomvault.</p>' +
      '<p>A second paragraph.</p>';
    expect(extractIntroParagraphs(html)).toBe('Adventurers whisper about the Gloomvault.\n\nA second paragraph.');
  });
});

describe('extractTraits', () => {
  it('reads a mixed-case traits list', () => {
    const html = '<ul class="traits"><li class="trait">unique</li><li class="trait">Arcane</li></ul>';
    expect(extractTraits(html)).toEqual(['unique', 'Arcane']);
  });

  it('returns an empty array when there is no traits list', () => {
    expect(extractTraits('<p>no traits here</p>')).toEqual([]);
  });
});

describe('parseSplitHeading', () => {
  it('reads the title and research level from a split heading', () => {
    expect(parseSplitHeading('<h2 class="split no-toc"><span>The Gloomvault</span><span>Research Topic 3</span></h2>')).toEqual({
      title: 'The Gloomvault',
      level: 3,
    });
  });

  it('throws when the heading is missing', () => {
    expect(() => parseSplitHeading('<p>no heading</p>')).toThrow(/split/);
  });

  it('throws when the level span cannot be parsed', () => {
    const html = '<h2 class="split no-toc"><span>Title</span><span>Not A Level</span></h2>';
    expect(() => parseSplitHeading(html)).toThrow(/research level/);
  });
});

describe('detectCostNote', () => {
  it('finds the sentence that mentions charging a coin fee', () => {
    const note =
      'The archivist is friendly and well-read. Unless the party earns his favor he will charge them 3 sp for his trouble. He otherwise means no harm.';
    expect(detectCostNote(note)).toBe('Unless the party earns his favor he will charge them 3 sp for his trouble.');
  });

  it('treats a whole punctuation-free note as one sentence', () => {
    expect(detectCostNote('he will charge them 3 sp for his trouble')).toBe('he will charge them 3 sp for his trouble');
  });

  it('returns null when nothing is charged', () => {
    expect(detectCostNote('Simple observation reveals little of note.')).toBeNull();
  });
});

describe('parseSourceChunk', () => {
  it('parses name, note, maxRp, and checks with no cost note', () => {
    const chunk =
      '<p><strong>Tavern Gossip</strong> Locals trade rumors about strange lights; <strong>Maximum RP</strong> 4</p>' +
      '<p><strong>Research Checks</strong> @Check[diplomacy|dc:15|traits:skill,secret,action:gather-information|name:Gather Information]</p>';
    expect(parseSourceChunk(chunk)).toEqual({
      name: 'Tavern Gossip',
      note: 'Locals trade rumors about strange lights',
      maxRp: 4,
      checks: [{ skill: 'diplomacy', dc: 15 }],
    });
  });

  it('sets costNote and flattens a @UUID ref inside the source prose', () => {
    const chunk =
      '<p><strong>Consulting the Archivist</strong> The archivist Fennimore will help, but unless the party earns his ' +
      '@UUID[JournalEntry.x.JournalEntryPage.y]{Favor}, every time they ask for aid he will charge them 3 sp for his ' +
      'trouble; <strong>Maximum RP</strong> 6</p>' +
      '<p><strong>Research Checks</strong> @Check[arcana|dc:17], @Check[occultism|dc:18|traits:concentrate|name:Study]; @Check[perception|dc:16]</p>';
    const source = parseSourceChunk(chunk);
    expect(source.name).toBe('Consulting the Archivist');
    expect(source.note).toContain('Favor');
    expect(source.note).not.toContain('@UUID');
    expect(source.costNote).toContain('charge them 3 sp');
    expect(source.maxRp).toBe(6);
    expect(source.checks).toEqual([
      { skill: 'arcana', dc: 17 },
      { skill: 'occultism', dc: 18 },
      { skill: 'perception', dc: 16 },
    ]);
  });

  it('throws a clear error when Maximum RP is missing', () => {
    const chunk =
      '<p><strong>Broken Source</strong> No RP total here.</p>' +
      '<p><strong>Research Checks</strong> @Check[arcana|dc:10]</p>';
    expect(() => parseSourceChunk(chunk)).toThrow(/Maximum RP/);
  });

  it('throws a clear error when there is no Research Checks paragraph', () => {
    const chunk = '<p><strong>Broken Source</strong> prose; <strong>Maximum RP</strong> 2</p>';
    expect(() => parseSourceChunk(chunk)).toThrow(/Research Checks/);
  });

  it('throws a clear error when the Research Checks paragraph has no @Check tokens', () => {
    const chunk =
      '<p><strong>Broken Source</strong> prose; <strong>Maximum RP</strong> 2</p>' +
      '<p><strong>Research Checks</strong> ask around town</p>';
    expect(() => parseSourceChunk(chunk)).toThrow(/no @Check tokens/);
  });
});

describe('parseTierChunk', () => {
  it('parses singular and plural tier headings, sorted ascending regardless of source order', () => {
    const chunk =
      '<p><strong>10 Research Points</strong> The deepest secret is revealed at last.</p>' +
      '<p><strong>1 Research Point</strong> A single rumor: the Gloomvault exists.</p>' +
      '<p><strong>6 Research Points</strong> A guardian is glimpsed: @UUID[Actor.g1]{Grimtooth}.</p>';
    const unlocks = parseTierChunk(chunk, 'unmapped-doc');
    expect(unlocks.map((u) => u.rp)).toEqual([1, 6, 10]);
    expect(unlocks[0].text).toBe('A single rumor: the Gloomvault exists.');
    expect(unlocks[1].text).toContain('Grimtooth');
    expect(unlocks.every((u) => u.loreId === undefined)).toBe(true);
  });

  it('wires loreId from the hardcoded map, keyed by doc id + rp', () => {
    const chunk =
      '<p><strong>1 Research Point</strong> A.</p>' +
      '<p><strong>6 Research Points</strong> B.</p>' +
      '<p><strong>10 Research Points</strong> C.</p>';
    const unlocks = parseTierChunk(chunk, 'the-pit-research');
    expect(unlocks).toEqual([
      { rp: 1, text: 'A.', loreId: 'the-pit' },
      { rp: 6, text: 'B.', loreId: 'arika-avertin' },
      { rp: 10, text: 'C.', loreId: 'whistlefangs' },
    ]);
  });
});

describe('extractReward', () => {
  it('extracts a Reward paragraph', () => {
    expect(extractReward('<p><strong>Reward:</strong> Grant 5 XP per tier reached.</p>')).toBe('Grant 5 XP per tier reached.');
  });

  it('does not match "Reward:" appearing mid-paragraph rather than at its start', () => {
    const html = '<p><strong>Trigger</strong> You mention a Reward: in passing but this is not the field.</p>';
    expect(extractReward(html)).toBeNull();
  });

  it('returns null when absent', () => {
    expect(extractReward('<p>Nothing here.</p>')).toBeNull();
  });
});

// --- full page transform ---------------------------------------------------

function pitPageHtml() {
  return (
    '<h2 class="no-toc">Researching the Pit</h2>' +
    '<img class="float-right" src="https://example.test/art.webp" alt="" />' +
    '<p>Adventurers whisper about the Gloomvault at the edge of town.</p>' +
    '<p>A second paragraph of scene-setting prose.</p>' +
    '<section class="action">' +
    '<h2 class="split no-toc"><span>The Gloomvault</span><span>Research Topic 3</span></h2>' +
    '<ul class="traits"><li class="trait">unique</li><li class="trait">Arcane</li></ul>' +
    '<p><strong>Tavern Gossip</strong> Locals trade rumors about strange lights; <strong>Maximum RP</strong> 4</p>' +
    '<p><strong>Research Checks</strong> @Check[diplomacy|dc:15|traits:skill,secret,action:gather-information|name:Gather Information]</p>' +
    '<hr />' +
    '<p><strong>Consulting the Archivist</strong> The archivist Fennimore will help, but unless the party earns his ' +
    '@UUID[JournalEntry.x.JournalEntryPage.y]{Favor}, every time they ask for aid he will charge them 3 sp for his ' +
    'trouble; <strong>Maximum RP</strong> 6</p>' +
    '<p><strong>Research Checks</strong> @Check[arcana|dc:17], @Check[occultism|dc:18|traits:concentrate|name:Study]; @Check[perception|dc:16]</p>' +
    '<hr />' +
    '<p><strong>10 Research Points</strong> The deepest secret of the Gloomvault is revealed at last.</p>' +
    '<p><strong>1 Research Point</strong> A single rumor: the Gloomvault exists.</p>' +
    '<p><strong>6 Research Points</strong> The Gloomvault has a guardian, whispered to be named @UUID[Actor.g1]{Grimtooth}.</p>' +
    '</section>' +
    '<p><strong>Reward:</strong> Grant the party 5 XP per tier reached.</p>'
  );
}

function hellstormPageHtml() {
  return (
    '<h2 class="no-toc">Hellstorm Focus</h2>' +
    '<p>A single sentence of scene setting.</p>' +
    '<section class="action">' +
    '<h2 class="split no-toc"><span>Focus Stone</span><span>Research Topic 5</span></h2>' +
    '<p><strong>Studying the Stone</strong> Simple observation reveals little; <strong>Maximum RP</strong> 5</p>' +
    '<p><strong>Research Checks</strong> @Check[arcana|dc:20|traits:concentrate,action:Research|name:Research]</p>' +
    '<hr />' +
    '<p><strong>3 Research Points</strong> The stone hums faintly when touched.</p>' +
    '<p><strong>5 Research Points</strong> Its true purpose remains unknown.</p>' +
    '</section>'
  );
}

function eighthPageHtml() {
  return (
    '<h1 class="no-toc">Researching the Eighth</h1>' +
    '<p>Whispers speak of a hidden lorekeeper.</p>' +
    '<section class="action">' +
    '<h2 class="split no-toc"><span>The Lorekeeper</span><span>Research Topic 6</span></h2>' +
    '<img class="float-right" src="https://example.test/lorekeeper.webp" alt="" />' +
    '<p><strong>Old Ledgers</strong> Dusty ledgers hint at the truth; <strong>Maximum RP</strong> 3</p>' +
    '<p><strong>Research Checks</strong> @Check[society|dc:22|traits:concentrate,action:Research|name:Research]</p>' +
    '<hr />' +
    '<p><strong>2 Research Points</strong> A name surfaces: @UUID[Actor.lk1]{the Lorekeeper}.</p>' +
    '<img class="float-right" src="https://example.test/mid.webp" alt="" />' +
    '<p><strong>4 Research Points</strong> Further study requires a @Check[arcana|dc:24] check to fully decipher the text.</p>' +
    '</section>' +
    '<section class="action">' +
    '<h2 class="no-toc">Lorekeeper’s Boon</h2>' +
    '<p><strong>Trigger</strong> You would mention a Reward: buried mid-sentence here, which must not leak into the topic doc.</p>' +
    '</section>'
  );
}

function buildDump({ omit } = {}) {
  const chapterPages = [
    { name: 'Researching the Pit', text: { content: pitPageHtml() } },
    { name: 'Hellstorm Focus', text: { content: hellstormPageHtml() } },
  ].filter((p) => p.name !== omit);
  const toolboxPages = [{ name: 'Researching the Eighth', text: { content: eighthPageHtml() } }].filter(
    (p) => p.name !== omit,
  );
  return {
    journals: [
      { name: 'Ch 2: Strange Times in Sandpoint', pages: chapterPages },
      { name: 'Adventure Toolbox', pages: toolboxPages },
    ].filter((j) => j.name !== omit),
  };
}

describe('transformResearchTopics', () => {
  const docs = transformResearchTopics(buildDump());

  it('extracts exactly the three matched pages, in PAGE_MATCHERS order', () => {
    expect(docs.map((d) => d.id)).toEqual(PAGE_MATCHERS.map((m) => m.id));
  });

  it('builds the-pit-research with title/level/traits, sources, tiers, and reward', () => {
    const pit = docs.find((d) => d.id === 'the-pit-research');
    expect(pit).toMatchObject({
      id: 'the-pit-research',
      title: 'The Gloomvault',
      level: 3,
      traits: ['unique', 'Arcane'],
      description: 'Adventurers whisper about the Gloomvault at the edge of town.\n\nA second paragraph of scene-setting prose.',
      reward: 'Grant the party 5 XP per tier reached.',
    });
    expect(pit.sources).toHaveLength(2);
    expect(pit.sources[0]).toEqual({
      name: 'Tavern Gossip',
      note: 'Locals trade rumors about strange lights',
      maxRp: 4,
      checks: [{ skill: 'diplomacy', dc: 15 }],
    });
    expect(pit.sources[1].costNote).toContain('charge them 3 sp');
    expect(pit.unlocks.map((u) => u.rp)).toEqual([1, 6, 10]);
    expect(pit.unlocks).toEqual([
      { rp: 1, text: 'A single rumor: the Gloomvault exists.', loreId: 'the-pit' },
      { rp: 6, text: 'The Gloomvault has a guardian, whispered to be named Grimtooth.', loreId: 'arika-avertin' },
      { rp: 10, text: 'The deepest secret of the Gloomvault is revealed at last.', loreId: 'whistlefangs' },
    ]);
  });

  it('builds hellstorm-focus-research with no traits list and no reward', () => {
    const hellstorm = docs.find((d) => d.id === 'hellstorm-focus-research');
    expect(hellstorm.traits).toEqual([]);
    expect(hellstorm.reward).toBeUndefined();
    expect(hellstorm.unlocks).toEqual([
      { rp: 3, text: 'The stone hums faintly when touched.', loreId: 'hellstorm-focus' },
      { rp: 5, text: 'Its true purpose remains unknown.' },
    ]);
  });

  it('builds the-eighth-runelord from a single source, ignoring the trailing second section', () => {
    const eighth = docs.find((d) => d.id === 'the-eighth-runelord');
    expect(eighth.title).toBe('The Lorekeeper');
    expect(eighth.level).toBe(6);
    expect(eighth.sources).toHaveLength(1);
    expect(eighth.reward).toBeUndefined(); // the buried "Reward:" is inside the second section, not a real Reward paragraph
    expect(eighth.unlocks).toEqual([
      { rp: 2, text: 'A name surfaces: the Lorekeeper.' },
      { rp: 4, text: 'Further study requires a Arcana DC 24 check to fully decipher the text.' },
    ]);
  });

  it('throws a clear error naming the doc id when a matched page is missing', () => {
    expect(() => transformResearchTopics(buildDump({ omit: 'Hellstorm Focus' }))).toThrow(/hellstorm-focus-research/);
  });

  it('throws a clear error when a matched journal is missing entirely', () => {
    expect(() => transformResearchTopics(buildDump({ omit: 'Adventure Toolbox' }))).toThrow(/the-eighth-runelord/);
  });
});

describe('transformPage', () => {
  it('throws when the page has no <section class="action">', () => {
    const dump = { journals: [{ name: 'J', pages: [{ name: 'P', text: { content: '<p>no section here</p>' } }] }] };
    expect(() => transformPage({ journal: 'J', page: 'P', id: 'x' }, dump)).toThrow(/section/);
  });

  it('throws when a source is missing an <hr /> separator entirely', () => {
    const html =
      '<section class="action">' +
      '<h2 class="split no-toc"><span>T</span><span>Research Topic 1</span></h2>' +
      '<p><strong>1 Research Point</strong> only a tier, no source.</p>' +
      '</section>';
    const dump = { journals: [{ name: 'J', pages: [{ name: 'P', text: { content: html } }] }] };
    expect(() => transformPage({ journal: 'J', page: 'P', id: 'x' }, dump)).toThrow(/<hr/);
  });
});

describe('mergeGmFields', () => {
  const fresh = [
    { id: 'x', title: 'Fresh Title', level: 3, traits: [], description: 'd', sources: [], unlocks: [] },
    { id: 'y', title: 'Fresh Y', level: 1, traits: [], description: '', sources: [], unlocks: [] },
  ];

  it('always refreshes authored fields from the transform, even when the live doc disagrees', () => {
    const merged = mergeGmFields(fresh, [{ id: 'x', title: 'Stale Title', level: 99 }]);
    expect(merged.find((d) => d.id === 'x').title).toBe('Fresh Title');
    expect(merged.find((d) => d.id === 'x').level).toBe(3);
  });

  it('carries forward any live-only field not part of the authored shape', () => {
    const merged = mergeGmFields(fresh, [{ id: 'x', progress: { partyRp: 4 }, gmNotes: 'remember this' }]);
    const x = merged.find((d) => d.id === 'x');
    expect(x.progress).toEqual({ partyRp: 4 });
    expect(x.gmNotes).toBe('remember this');
  });

  it('leaves docs with no existing match untouched', () => {
    const merged = mergeGmFields(fresh, [{ id: 'gone', gmNotes: 'stale' }]);
    expect(merged.find((d) => d.id === 'y')).toEqual(fresh[1]);
  });
});
