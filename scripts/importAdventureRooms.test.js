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
} from './importAdventureRooms.js';

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

describe('transformDump', () => {
  const dump = {
    module: MODULE,
    hazards: [hazard('haz1', 'Web Deadfall', 13, 3)],
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
              '<p><strong>Treasure:</strong> a charm.</p><p><strong>Reward:</strong> 80 XP.</p>',
            { pageNumber: 'A3', pageNumberClass: 'location' },
          ),
          page('Getting Started', 900, '<p>Some narrative that is not a room.</p>'),
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
    ],
  };

  const { rooms, features, stats } = transformDump(dump);

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
      treasure: 'a charm.',
      reward: '80 XP.',
    });
    expect(a3.checks).toHaveLength(1);
    expect(a3.checks[0]).toMatchObject({ statistic: 'athletics', dc: 19, label: 'Force Open' });
    expect(a3.notes).toBe('');
  });

  it('applies the Ch 9 name-prefix + chapter-site fallback and links the hazard', () => {
    const k = rooms.find((r) => r.code === 'K');
    expect(k).toMatchObject({ id: 'sd4s-k', name: 'Abandoned Village', site: 'Ch 9: Finale' });
    expect(k.hazards).toEqual([{ name: 'Web Deadfall', level: 3, stealthDc: 13, complex: false }]);
  });
});
