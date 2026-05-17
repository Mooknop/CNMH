import {
  slugify,
  withQuestId,
  normalizeQuests,
  withFactionId,
  normalizeFactions,
  withCalendarId,
  normalizeCalendar,
  withLoreId,
  normalizeLore,
  withTraitId,
  normalizeTraits,
  withCharacterId,
  normalizeCharacters,
  existingIdSet,
  defaultContent,
  buildSeedPayload,
} from './contentUtils';

describe('contentUtils', () => {
  describe('slugify', () => {
    it('kebab-cases and strips punctuation', () => {
      expect(slugify("Deliver Uncle Milton's Package")).toBe('deliver-uncle-miltons-package');
    });
    it('falls back to "untitled" for empty input', () => {
      expect(slugify('')).toBe('untitled');
      expect(slugify(null)).toBe('untitled');
      expect(slugify('   ***   ')).toBe('untitled');
    });
  });

  describe('existingIdSet', () => {
    it('builds a string Set of ids and tolerates non-arrays', () => {
      const s = existingIdSet([{ id: 'a' }, { id: 1 }]);
      expect(s.has('a')).toBe(true);
      expect(s.has('1')).toBe(true);
      expect(existingIdSet(null).size).toBe(0);
    });
  });

  describe('withQuestId', () => {
    it('derives an id from the title when missing and indexes notes', () => {
      const q = withQuestId({ title: 'Find the Orb', notes: [{ content: 'a' }, { content: 'b' }] });
      expect(q.id).toBe('find-the-orb');
      expect(q.notes).toEqual([
        { id: 'find-the-orb-note-0', content: 'a' },
        { id: 'find-the-orb-note-1', content: 'b' },
      ]);
    });
    it('preserves an existing id and suffixes by index for duplicates', () => {
      expect(withQuestId({ id: 'keep', title: 'X' }).id).toBe('keep');
      expect(withQuestId({ title: 'Dup' }, 2).id).toBe('dup-2');
    });
    it('tolerates a missing notes array', () => {
      expect(withQuestId({ title: 'No Notes' }).notes).toEqual([]);
    });
  });

  describe('normalizeQuests', () => {
    it('maps an array and tolerates non-arrays', () => {
      expect(normalizeQuests([{ title: 'A' }]).map((q) => q.id)).toEqual(['a']);
      expect(normalizeQuests(null)).toEqual([]);
    });
  });

  describe('withFactionId / normalizeFactions', () => {
    it('derives an id from the name and indexes ranks', () => {
      const f = withFactionId({
        name: 'The Bunyip Club',
        reputation: -4,
        ranks: [{ name: 'Liked', min: 5, max: 14, effect: '10% discount' }],
      });
      expect(f.id).toBe('the-bunyip-club');
      expect(f.ranks[0]).toEqual({
        id: 'the-bunyip-club-rank-0',
        name: 'Liked',
        min: 5,
        max: 14,
        effect: '10% discount',
      });
    });
    it('omits effect when absent and tolerates missing ranks / preserves id', () => {
      const f = withFactionId({ id: 'keep', name: 'X' });
      expect(f.id).toBe('keep');
      expect(f.ranks).toEqual([]);
      const r = withFactionId({ name: 'Y', ranks: [{ name: 'Z', min: 0, max: 1 }] }).ranks[0];
      expect(r.effect).toBeUndefined();
      expect(normalizeFactions(null)).toEqual([]);
    });
  });

  describe('withCalendarId / normalizeCalendar', () => {
    it('derives an id from title or name and preserves all other fields', () => {
      const fixed = withCalendarId({
        title: 'Xar-Azmak Defeated',
        date: { year: 4724, month: 8, day: 1 },
        type: 'campaign',
      });
      expect(fixed.id).toBe('xar-azmak-defeated');
      expect(fixed.date).toEqual({ year: 4724, month: 8, day: 1 });

      const named = withCalendarId({ name: 'Longnight', recurring: 'every new moon' });
      expect(named.id).toBe('longnight');
      expect(named.recurring).toBe('every new moon');
    });
    it('keeps an existing id and tolerates non-arrays', () => {
      expect(withCalendarId({ id: 'keep', title: 'X' }).id).toBe('keep');
      expect(normalizeCalendar(null)).toEqual([]);
    });
  });

  describe('withLoreId / normalizeLore', () => {
    it('keeps an existing id and preserves all fields', () => {
      const e = withLoreId({ id: 'sandpoint', title: 'Sandpoint', category: 'Location', tags: ['town'] });
      expect(e.id).toBe('sandpoint');
      expect(e.category).toBe('Location');
      expect(e.tags).toEqual(['town']);
    });
    it('derives an id from the title when missing and tolerates non-arrays', () => {
      expect(withLoreId({ title: 'The Lost Coast' }).id).toBe('the-lost-coast');
      expect(normalizeLore(null)).toEqual([]);
    });
  });

  describe('withTraitId / normalizeTraits', () => {
    it('slugs the trait name and preserves description', () => {
      const t = withTraitId({ name: 'Agile', description: 'Lower MAP.' });
      expect(t.id).toBe('agile');
      expect(t.description).toBe('Lower MAP.');
      expect(normalizeTraits(null)).toEqual([]);
    });
  });

  describe('withCharacterId / normalizeCharacters', () => {
    it('keeps an existing id and preserves the whole nested sheet', () => {
      const c = withCharacterId({
        id: 'Pellias',
        name: 'Pellias',
        abilities: { strength: 18 },
        spells: { focus: [] },
      });
      expect(c.id).toBe('Pellias');
      expect(c.abilities).toEqual({ strength: 18 });
      expect(c.spells).toEqual({ focus: [] });
    });
    it('derives an id from the name when missing and tolerates non-arrays', () => {
      expect(withCharacterId({ name: 'New Hero' }).id).toBe('new-hero');
      expect(normalizeCharacters(null)).toEqual([]);
    });
  });

  describe('defaultContent / buildSeedPayload', () => {
    const KEYS = ['quest', 'faction', 'calendar', 'lore', 'trait', 'character'];
    it('exposes every managed collection, all with ids', () => {
      const dc = defaultContent();
      for (const key of KEYS) {
        expect(dc[key].length).toBeGreaterThan(0);
        expect(dc[key].every((d) => typeof d.id === 'string' && d.id.length > 0)).toBe(true);
      }
    });
    it('wraps defaults with the force flag', () => {
      expect(buildSeedPayload().force).toBe(false);
      expect(buildSeedPayload(true).force).toBe(true);
      for (const key of KEYS) {
        expect(buildSeedPayload().collections[key].length).toBeGreaterThan(0);
      }
    });
  });
});
