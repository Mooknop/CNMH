import { describe, it, expect } from 'vitest';
import {
  parseCheck,
  extractChecks,
  renderChecksInline,
  cleanHtml,
  stripInlineRolls,
  flattenUuids,
  parseHeading,
  extractReadAloud,
  extractLabeledParagraph,
  extractCreatures,
  extractHazards,
  buildHazardIndex,
  transformDump,
  mergeGmFields,
  isChapterJournal,
  classifyLootItem,
  coinValueGp,
  extractTreasureCache,
} from './importAdventureRooms.mjs';

// Build a loot-actor as the export macro dumps it (embedded items).
function lootActor(id, name, items) {
  return { _id: id, name, type: 'loot', items };
}
function embItem(type, name, { slug, gp, sp, cp, pp, qty = 1 } = {}) {
  const value = {};
  if (gp) value.gp = gp;
  if (sp) value.sp = sp;
  if (cp) value.cp = cp;
  if (pp) value.pp = pp;
  return { type, name, system: { slug, quantity: qty, price: { value } } };
}

// All text below is synthetic — it mirrors the premium-module markup shapes
// (verified in the S0 dump) without reproducing any Paizo book content, so the
// parser can be pinned without committing the adventure text (public repo).
const MODULE = 'test-module';

function page(name, sort, content, flags) {
  return { name, sort, text: { content }, flags: flags ? { [MODULE]: flags } : {} };
}

function hazard(id, name, stealthValue, level = 5, complex = false) {
  return {
    _id: id,
    name,
    type: 'hazard',
    system: { attributes: { stealth: { value: stealthValue } }, details: { level: { value: level }, isComplex: complex } },
  };
}

describe('parseCheck', () => {
  it('parses a skill check with traits, action, and name', () => {
    const c = parseCheck('@Check[athletics|dc:19|traits:attack,skill,action:force-open|name:Force Open]');
    expect(c).toMatchObject({ statistic: 'athletics', dc: 19, secret: false, action: 'force-open', label: 'Force Open' });
    expect(c.traits).toEqual(['attack', 'skill']); // action:… lifted out of the trait list
  });

  it('flags the secret trait', () => {
    expect(parseCheck('@Check[religion|dc:19|traits:secret,skill,action:recall-knowledge|name:Recall Knowledge]').secret).toBe(true);
  });

  it('derives a label for a basic save with no name', () => {
    const c = parseCheck('@Check[fortitude|dc:22|basic:true]');
    expect(c).toMatchObject({ statistic: 'fortitude', dc: 22, basic: true, label: 'Fortitude (basic) save' });
  });

  it('derives a label for a flat check', () => {
    expect(parseCheck('@Check[flat|dc:20]').label).toBe('Flat check');
  });
});

describe('inline enricher cleanup', () => {
  it('flattens @UUID links to their labels and drops label-less refs', () => {
    expect(flattenUuids('go to @UUID[JournalEntry.x.JournalEntryPage.y]{A4} now @UUID[Actor.z]')).toBe('go to A4 now ');
  });

  it('flattens typed and untyped inline rolls', () => {
    expect(stripInlineRolls('deals [[/r 2d6[bludgeoning]]] and [[/r 1d20+5]] more')).toBe('deals 2d6 bludgeoning and 1d20+5 more');
  });

  it('renders @Check inline as a readable DC label', () => {
    expect(renderChecksInline('a @Check[athletics|dc:19|traits:skill,action:force-open|name:Force Open] check')).toBe(
      'a <strong>DC 19 Athletics (Force Open)</strong> check',
    );
  });

  it('cleanHtml strips images and unwraps link spans', () => {
    const html = '<img src="https://forge/x.webp" /><span class="link">@UUID[Actor.z]{Glorkus}</span> waits';
    expect(cleanHtml(html)).toBe('Glorkus waits');
  });
});

describe('parseHeading', () => {
  it('reads a split heading with an encounter budget', () => {
    expect(parseHeading('<h2 class="split no-toc"><span>A3. Shrine to Kabriri</span><span>Trivial 4</span></h2>')).toEqual({
      code: 'A3',
      name: 'Shrine to Kabriri',
      encounterLabel: 'Trivial 4',
    });
  });

  it('reads a plain heading with no budget', () => {
    expect(parseHeading('<h2 class="no-toc">A1. Entrance</h2>')).toEqual({ code: 'A1', name: 'Entrance', encounterLabel: null });
  });
});

describe('extractReadAloud', () => {
  it('collects both <p> and <div> read-aloud boxes', () => {
    const html = '<p class="read-aloud">First box.</p><p>normal</p><div class="read-aloud">Second box.</div>';
    expect(extractReadAloud(html)).toBe('First box.\n\nSecond box.');
  });
});

describe('extractLabeledParagraph', () => {
  it('pulls a Treasure paragraph and flattens its refs and breaks', () => {
    const html = '<p><strong>Treasure:</strong> @UUID[Actor.q]{Rubble}<br />a <em>shark tooth charm</em>.</p>';
    expect(extractLabeledParagraph(html, 'Treasure')).toBe('Rubble a <em>shark tooth charm</em>.');
  });
});

describe('creature vs hazard classification', () => {
  const hazardIndex = buildHazardIndex({ hazards: [hazard('haz1', 'Fires of Abraxas', 8)] });

  it('takes creatures from encounter headers, excluding hazards and body props', () => {
    const html =
      '<section class="encounter"><div class="header"><span class="link">@UUID[Actor.mob1]{Glorkus}</span></div></section>' +
      '<section class="encounter"><div class="header"><span class="link">@UUID[Actor.haz1]{Fires of Abraxas}</span></div></section>' +
      '<p>a prop @UUID[Actor.prop9]{Wrapped Bundle} sits here</p>';
    expect(extractCreatures(html, hazardIndex)).toEqual(['Glorkus']); // not the hazard, not the prop
  });

  it('enriches every referenced hazard by id, deduped', () => {
    const html = '<span class="link">@UUID[Actor.haz1]{Fires of Abraxas}</span> … @UUID[Actor.haz1] again';
    expect(extractHazards(html, hazardIndex)).toEqual([{ name: 'Fires of Abraxas', level: 5, stealthDc: 8, complex: false }]);
  });
});

describe('coinValueGp', () => {
  it('converts all denominations to gp', () => {
    expect(coinValueGp({ gp: 5 })).toBe(5);
    expect(coinValueGp({ sp: 10 })).toBe(1);
    expect(coinValueGp({ cp: 100 })).toBe(1);
    expect(coinValueGp({ pp: 1 })).toBe(10);
    expect(coinValueGp(undefined)).toBe(0);
  });
});

describe('classifyLootItem', () => {
  it('folds coins into gold by denomination × quantity', () => {
    expect(classifyLootItem(embItem('treasure', 'Gold Pieces', { gp: 1, qty: 120 }))).toEqual({ kind: 'coin', gp: 120 });
    expect(classifyLootItem(embItem('treasure', 'Silver Pieces', { sp: 1, qty: 50 }))).toEqual({ kind: 'coin', gp: 5 });
  });

  it('treats non-coin treasure as a valuable with a per-unit gp value', () => {
    // "Crystal Game Pieces" ends in Pieces but is NOT coins — must be a valuable.
    expect(classifyLootItem(embItem('treasure', 'Crystal Game Pieces', { gp: 35 }))).toEqual({
      kind: 'valuable',
      entry: { name: 'Crystal Game Pieces', qty: 1, value: 35 },
    });
  });

  it('emits a ref = slug for a real item', () => {
    expect(classifyLootItem(embItem('weapon', 'Longspear', { slug: 'longspear', sp: 5, qty: 2 }))).toEqual({
      kind: 'item',
      entry: { ref: 'longspear', name: 'Longspear', qty: 2 },
    });
  });

  it('treats a slug-less item as a story item', () => {
    expect(classifyLootItem(embItem('equipment', 'Iron Key to B5', {}))).toEqual({
      kind: 'story',
      entry: { name: 'Iron Key to B5', qty: 1 },
    });
  });

  // A scroll/wand dump item as the macro emits it: the generic rank slug plus
  // the real spell embedded in system.spell (#1093 code PR 2).
  function spellItem(type, name, slug, spellSlug, spellLevel, heightenedLevel) {
    return {
      type,
      name,
      system: {
        slug,
        quantity: 1,
        price: { value: {} },
        spell: { system: { slug: spellSlug, level: { value: spellLevel }, location: { heightenedLevel } } },
      },
    };
  }

  it('rewrites a generic scroll slug to a spell-specific ref (no suffix at base rank)', () => {
    // Every rank-3 scroll shares `scroll-of-3rd-rank-spell`, so the ref must
    // come from the embedded spell to keep Heal and Mind Reading distinct.
    expect(
      classifyLootItem(spellItem('consumable', 'Scroll of Mind Reading (Rank 3)', 'scroll-of-3rd-rank-spell', 'mind-reading', 3, 3)),
    ).toEqual({ kind: 'item', entry: { ref: 'scroll-of-mind-reading', name: 'Scroll of Mind Reading (Rank 3)', qty: 1 } });
  });

  it('adds a rank suffix only when the scroll is heightened above the spell base rank', () => {
    // Heal is a rank-1 spell in a rank-3 scroll → scroll-of-heal-3.
    expect(
      classifyLootItem(spellItem('consumable', 'Scroll of Heal (Rank 3)', 'scroll-of-3rd-rank-spell', 'heal', 1, 3)),
    ).toEqual({ kind: 'item', entry: { ref: 'scroll-of-heal-3', name: 'Scroll of Heal (Rank 3)', qty: 1 } });
  });

  it('rewrites a generic wand slug to a spell-specific ref, preserving a name override', () => {
    // Hezrou Crystal is mechanically a wand of Stinking Cloud (rank 3).
    expect(
      classifyLootItem(spellItem('consumable', 'Hezrou Crystal', 'magic-wand-3rd-rank-spell', 'stinking-cloud', 3, 3)),
    ).toEqual({ kind: 'item', entry: { ref: 'wand-of-stinking-cloud', name: 'Hezrou Crystal', qty: 1 } });
  });

  it('splits a slug shared across variants by item name', () => {
    expect(classifyLootItem(embItem('consumable', 'Fire Elemental Gem', { slug: 'elemental-gem', gp: 200 }))).toEqual({
      kind: 'item',
      entry: { ref: 'elemental-gem-fire', name: 'Fire Elemental Gem', qty: 1 },
    });
    expect(classifyLootItem(embItem('equipment', 'Charm of Acid Resistance (Greater)', { slug: 'charm-of-resistance-greater' }))).toEqual({
      kind: 'item',
      entry: { ref: 'charm-of-acid-resistance-greater', name: 'Charm of Acid Resistance (Greater)', qty: 1 },
    });
  });

  it('collapses a per-variant slug onto the base doc + a variant label', () => {
    expect(classifyLootItem(embItem('consumable', 'Antiplague (Moderate)', { slug: 'antiplague-moderate', gp: 35 }))).toEqual({
      kind: 'item',
      entry: { ref: 'antiplague', name: 'Antiplague (Moderate)', qty: 1, variant: 'Moderate' },
    });
  });

  it('resolves a consolidated-doc alias', () => {
    expect(classifyLootItem(embItem('backpack', 'Spacious Pouch (Type I)', { slug: 'spacious-pouch-type-i', gp: 75 }))).toEqual({
      kind: 'item',
      entry: { ref: 'spacious-pouch', name: 'Spacious Pouch (Type I)', qty: 1 },
    });
  });

  it('reclassifies the ghost-stone prose slug as a story entry', () => {
    expect(classifyLootItem(embItem('equipment', 'Ghost Stone', { slug: 'ghost-stone' }))).toEqual({
      kind: 'story',
      entry: { name: 'Ghost Stone', qty: 1 },
    });
  });
});

describe('extractTreasureCache', () => {
  const lootIndex = {
    chest: lootActor('chest', 'Chest', [
      embItem('treasure', 'Gold Pieces', { gp: 1, qty: 30 }),
      embItem('consumable', 'Acid Flask', { slug: 'acid-flask', gp: 3, qty: 2 }),
      embItem('treasure', 'Garnet', { gp: 20, qty: 1 }),
    ]),
    urn: lootActor('urn', 'Urn', [
      embItem('treasure', 'Silver Pieces', { sp: 1, qty: 100 }), // 10 gp
      embItem('equipment', 'Old Deed', {}), // story
    ]),
  };

  it('merges every referenced loot actor: coins → gold, items by kind', () => {
    const html = '<p><strong>Treasure:</strong> @UUID[Actor.chest]{Chest} and @UUID[Actor.urn]{Urn}</p>';
    const cache = extractTreasureCache(html, lootIndex);
    expect(cache.gold).toBe(40); // 30 + 10
    expect(cache.items).toEqual([
      { ref: 'acid-flask', name: 'Acid Flask', qty: 2 },
      { name: 'Garnet', qty: 1, value: 20 },
      { name: 'Old Deed', qty: 1 },
    ]);
  });

  it('returns an empty cache when the paragraph has no loot-actor ref', () => {
    expect(extractTreasureCache('<p><strong>Treasure:</strong> just prose.</p>', lootIndex)).toEqual({ gold: 0, items: [] });
  });
});

describe('mergeGmFields', () => {
  const fresh = [
    { id: 'a1', name: 'Entrance', notes: '', treasureCache: { gold: 5, items: [] } },
    { id: 'a2', name: 'Hall', notes: '', treasureCache: { gold: 0, items: [] } },
  ];

  it('carries over an existing non-empty note by id', () => {
    const merged = mergeGmFields(fresh, [{ id: 'a1', notes: 'Ambush here!' }]);
    expect(merged.find((d) => d.id === 'a1').notes).toBe('Ambush here!');
    expect(merged.find((d) => d.id === 'a2').notes).toBe(''); // untouched
  });

  it('preserves a GM-curated treasureCache and distributedAt over the fresh transform', () => {
    const existing = [{ id: 'a1', treasureCache: { gold: 999, items: [{ ref: 'rope', name: 'Rope', qty: 1 }] }, distributedAt: 1720000000000 }];
    const merged = mergeGmFields(fresh, existing);
    const a1 = merged.find((d) => d.id === 'a1');
    expect(a1.treasureCache.gold).toBe(999); // GM's copy wins, not the fresh 5
    expect(a1.distributedAt).toBe(1720000000000);
  });

  it('preserves the claimed accumulator over the fresh transform (#1281 WB2)', () => {
    const existing = [{ id: 'a1', claimed: { gold: 25, itemsValue: 10 } }];
    const merged = mergeGmFields(fresh, existing);
    expect(merged.find((d) => d.id === 'a1').claimed).toEqual({ gold: 25, itemsValue: 10 });
    expect(merged.find((d) => d.id === 'a2').claimed).toBeUndefined();
  });

  it('leaves fresh values for ids with no existing doc', () => {
    const merged = mergeGmFields(fresh, [{ id: 'gone', notes: 'stale' }]);
    expect(merged.find((d) => d.id === 'a1').treasureCache.gold).toBe(5);
    expect(merged.every((d) => d.notes === '')).toBe(true);
  });

  it('preserves every event-tracking field over the fresh transform (#1112)', () => {
    // A re-import re-stamps fresh tracking defaults; the GM's live progress
    // must win — including deliberately falsy values (tracked:false, an empty
    // steps the GM cleared) that a truthiness check would drop.
    const freshEvents = [
      { id: 'e1', name: 'Rumors', tracked: true, status: 'upcoming', steps: [], scheduledFor: '', outcome: '', notes: '' },
    ];
    const existing = [
      {
        id: 'e1',
        tracked: false, // GM hid this connective page
        status: 'resolved',
        steps: [{ label: 'Find the witness', done: true }],
        scheduledFor: 'Rova 12',
        outcome: 'The PCs uncovered the copycat.',
        notes: 'Ties back to Ch 1.',
      },
    ];
    const merged = mergeGmFields(freshEvents, existing);
    expect(merged[0]).toMatchObject({
      tracked: false,
      status: 'resolved',
      steps: [{ label: 'Find the witness', done: true }],
      scheduledFor: 'Rova 12',
      outcome: 'The PCs uncovered the copycat.',
      notes: 'Ties back to Ch 1.',
    });
  });
});

describe('isChapterJournal', () => {
  it('matches "Ch N:" chapter journals only', () => {
    expect(isChapterJournal('Ch 2: Strange Times in Sandpoint')).toBe(true);
    expect(isChapterJournal('Ch 9: The Red Bishop’s Gift')).toBe(true);
    expect(isChapterJournal('Sandpoint Gazetteer A Doomed Town')).toBe(false);
    expect(isChapterJournal('Frontmatter')).toBe(false);
    expect(isChapterJournal('Art Gallery')).toBe(false);
    expect(isChapterJournal('')).toBe(false);
  });
});

describe('transformDump', () => {
  const dump = {
    module: MODULE,
    hazards: [hazard('haz1', 'Web Deadfall', 13, 3)],
    lootActors: [
      lootActor('chestA3', 'Reliquary', [
        embItem('treasure', 'Gold Pieces', { gp: 1, qty: 25 }),
        embItem('consumable', 'Acid Flask', { slug: 'acid-flask', gp: 3, qty: 2 }),
      ]),
    ],
    journals: [
      {
        name: 'Ch 1: Test',
        pages: [
          page('Warren Features', 1500, '<h2 class="no-toc">Warren Features</h2><p>Tunnels are cramped. A [[/r 2d6[bludgeoning]]] fall.</p>'),
          page(
            'Shrine',
            1800,
            '<h2 class="split no-toc"><span>A3. Shrine</span><span>Trivial 4</span></h2>' +
              '<p class="read-aloud">A grim altar.</p>' +
              '<p>Force it with a @Check[athletics|dc:19|traits:skill,action:force-open|name:Force Open] check.</p>' +
              '<section class="encounter"><div class="header"><span class="link">@UUID[Actor.mob1]{Glorkus}</span></div></section>' +
              '<p><strong>Treasure:</strong> @UUID[Actor.chestA3]{Reliquary} holds a charm.</p><p><strong>Reward:</strong> 80 XP.</p>',
            { pageNumber: 'A3', pageNumberClass: 'location' },
          ),
          page('Getting Started', 900, '<p>Some narrative that is not a room.</p>'),
          // A non-room, non-Features page in a chapter journal → an event.
          page(
            'Town Rumors',
            2000,
            '<h2 class="no-toc">Town Rumors</h2>' +
              '<p>Ask around with a @Check[diplomacy|dc:15|traits:secret,action:gather-information|name:Gather Information] check.</p>',
          ),
        ],
      },
      {
        // Ch 9-style: rooms carry no location flag; the code is a name prefix
        // and there is no "Features" page, so site falls back to the chapter.
        name: 'Ch 9: Finale',
        pages: [
          page('K. Abandoned Village', 5000, '<h2 class="no-toc">K. Abandoned Village</h2><p>A ruin with a @UUID[Actor.haz1]{Web Deadfall}.</p>'),
        ],
      },
      {
        // A non-chapter journal: its narrative pages must NOT become events.
        name: 'Sandpoint Gazetteer A Doomed Town',
        pages: [page('The Rusty Dragon', 7000, '<h2 class="no-toc">The Rusty Dragon</h2><p>A famous inn.</p>')],
      },
    ],
  };

  const { rooms, features, events, stats } = transformDump(dump);

  it('emits a features doc per site and skips non-room narrative pages', () => {
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ id: 'sd4s-features-warren', site: 'Warren', isFeatures: true });
    expect(stats.rooms).toBe(2); // A3 + K, not "Getting Started"
  });

  it('builds a flagged room with all fields resolved', () => {
    const a3 = rooms.find((r) => r.code === 'A3');
    expect(a3).toMatchObject({
      id: 'sd4s-a3',
      name: 'Shrine',
      site: 'Warren',
      chapter: 'Ch 1: Test',
      encounterLabel: 'Trivial 4',
      readAloud: 'A grim altar.',
      creatures: ['Glorkus'],
      treasure: 'Reliquary holds a charm.',
      reward: '80 XP.',
    });
    expect(a3.checks).toHaveLength(1);
    expect(a3.checks[0]).toMatchObject({ statistic: 'athletics', dc: 19, label: 'Force Open' });
    expect(a3.notes).toBe('');
  });

  it('builds a structured treasure cache from the referenced loot actor', () => {
    const a3 = rooms.find((r) => r.code === 'A3');
    expect(a3.treasureCache).toEqual({ gold: 25, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 2 }] });
    // A room with no loot ref (Ch 9 K) still gets an empty cache, not undefined.
    expect(rooms.find((r) => r.code === 'K').treasureCache).toEqual({ gold: 0, items: [] });
    expect(stats.treasureCaches).toBe(1); // only A3 has loot
  });

  it('applies the Ch 9 name-prefix + chapter-site fallback and links the hazard', () => {
    const k = rooms.find((r) => r.code === 'K');
    expect(k).toMatchObject({ id: 'sd4s-k', name: 'Abandoned Village', site: 'Ch 9: Finale' });
    expect(k.hazards).toEqual([{ name: 'Web Deadfall', level: 3, stealthDc: 13, complex: false }]);
  });

  it('emits chapter-journal events (not rooms/features) with fresh tracking defaults', () => {
    // "Getting Started" (narrative) and "Town Rumors" — both non-room,
    // non-Features pages in a chapter journal. The Gazetteer inn is excluded.
    expect(stats.events).toBe(2);
    expect(events.map((e) => e.name).sort()).toEqual(['Getting Started', 'Town Rumors']);
    expect(events.some((e) => e.name === 'The Rusty Dragon')).toBe(false); // non-chapter journal

    const rumors = events.find((e) => e.name === 'Town Rumors');
    expect(rumors).toMatchObject({
      id: 'sd4s-event-town-rumors',
      chapter: 'Ch 1: Test',
      sort: 2000,
      tracked: true,
      status: 'upcoming',
      steps: [],
      scheduledFor: '',
      outcome: '',
      notes: '',
    });
    // The shared extractors run on event bodies too — the secret check parses.
    expect(rumors.checks).toHaveLength(1);
    expect(rumors.checks[0]).toMatchObject({ statistic: 'diplomacy', dc: 15, secret: true, label: 'Gather Information' });
  });

  it('does not classify a room or a Features page as an event', () => {
    expect(events.some((e) => e.name === 'Shrine')).toBe(false); // it's a room
    expect(events.some((e) => /Features/.test(e.name))).toBe(false);
  });
});
