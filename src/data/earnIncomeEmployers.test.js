import factions from './snapshot/faction.json';
import {
  EARN_INCOME_EMPLOYERS,
  FREELANCE,
  FREELANCE_ID,
  FACTIONS,
  employersByFaction,
  employerById,
  employerSkillSummary,
} from './earnIncomeEmployers';

// The 16 core PF2e skills — employer.skills entries must be one of these.
const CORE_SKILLS = new Set([
  'acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy',
  'intimidation', 'medicine', 'nature', 'occultism', 'performance', 'religion',
  'society', 'stealth', 'survival', 'thievery',
]);

const factionNames = new Set(factions.map((f) => f.name));

describe('earnIncomeEmployers data', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(EARN_INCOME_EMPLOYERS)).toBe(true);
    expect(EARN_INCOME_EMPLOYERS.length).toBeGreaterThan(0);
  });

  it('every employer id is unique', () => {
    const ids = EARN_INCOME_EMPLOYERS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no employer collides with the freelance sentinel id', () => {
    expect(EARN_INCOME_EMPLOYERS.some((e) => e.id === FREELANCE_ID)).toBe(false);
  });

  it('every FACTIONS value is a real faction from faction.json', () => {
    Object.values(FACTIONS).forEach((name) => {
      expect(factionNames.has(name)).toBe(true);
    });
  });

  it('every employer has the required fields with valid shapes', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      expect(typeof e.id).toBe('string');
      expect(e.id.length).toBeGreaterThan(0);
      expect(typeof e.name).toBe('string');
      expect(e.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(e.level)).toBe(true);
      expect(e.level).toBeGreaterThanOrEqual(1);
      expect(e.level).toBeLessThanOrEqual(20);
      expect(Array.isArray(e.skills)).toBe(true);
      expect(Array.isArray(e.lores)).toBe(true);
      expect(typeof e.anyLore).toBe('boolean');
    });
  });

  it('every employer faction is a real faction from faction.json', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      expect(factionNames.has(e.faction)).toBe(true);
    });
  });

  it('skill ids are lowercase core skills', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      e.skills.forEach((s) => {
        expect(s).toBe(s.toLowerCase());
        expect(CORE_SKILLS.has(s)).toBe(true);
      });
    });
  });

  it('lore names are non-empty and carry no " Lore" suffix', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      e.lores.forEach((l) => {
        expect(typeof l).toBe('string');
        expect(l.length).toBeGreaterThan(0);
        expect(/\blore$/i.test(l)).toBe(false);
      });
    });
  });

  it('every employer unlocks at least one skill, lore, or anyLore', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      expect(e.skills.length + e.lores.length > 0 || e.anyLore).toBe(true);
    });
  });

  it('a bonus, when present, is well-formed and targets core skills', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      if (!e.bonus) return;
      expect(typeof e.bonus.value).toBe('number');
      expect(['circumstance', 'item']).toContain(e.bonus.type);
      expect(Array.isArray(e.bonus.skills)).toBe(true);
      expect(e.bonus.skills.length).toBeGreaterThan(0);
      e.bonus.skills.forEach((s) => expect(CORE_SKILLS.has(s)).toBe(true));
      expect(typeof e.bonus.note).toBe('string');
    });
  });

  it('note and risk are strings when present', () => {
    EARN_INCOME_EMPLOYERS.forEach((e) => {
      if (e.note != null) expect(typeof e.note).toBe('string');
      if (e.risk != null) expect(typeof e.risk).toBe('string');
    });
  });
});

describe('FREELANCE', () => {
  it('is the town-level, faction-less, always-available option', () => {
    expect(FREELANCE.id).toBe(FREELANCE_ID);
    expect(FREELANCE.faction).toBeNull();
    expect(FREELANCE.level).toBe(4);
    expect(FREELANCE.anyLore).toBe(true);
    expect(FREELANCE.skills).toContain('crafting');
    expect(FREELANCE.skills).toContain('performance');
  });

  it('flags the Thievery risk', () => {
    expect(FREELANCE.skills).toContain('thievery');
    expect(typeof FREELANCE.risk).toBe('string');
    expect(FREELANCE.risk.length).toBeGreaterThan(0);
  });
});

describe('employersByFaction', () => {
  it('groups every employer exactly once, in FACTIONS order', () => {
    const groups = employersByFaction();
    const flat = groups.flatMap((g) => g.employers);
    expect(flat.length).toBe(EARN_INCOME_EMPLOYERS.length);
    expect(new Set(flat.map((e) => e.id)).size).toBe(EARN_INCOME_EMPLOYERS.length);

    const order = Object.values(FACTIONS);
    const groupOrder = groups.map((g) => g.faction);
    // group order is a subsequence of the FACTIONS declaration order
    let last = -1;
    groupOrder.forEach((f) => {
      const idx = order.indexOf(f);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    });
  });

  it('omits factions with no employers', () => {
    employersByFaction().forEach((g) => {
      expect(g.employers.length).toBeGreaterThan(0);
    });
  });
});

describe('employerSkillSummary', () => {
  it('joins core skills and named Lores', () => {
    expect(employerSkillSummary(employerById('sandpoint-shipyard')))
      .toBe('Engineering Lore, Labor Lore, Sailing Lore');
  });

  it('renders anyLore as "most Lore skills" when no named Lores', () => {
    expect(employerSkillSummary(employerById('turandarok-academy')))
      .toBe('most Lore skills');
  });

  it('summarizes a core-skill employer', () => {
    expect(employerSkillSummary(employerById('red-dog-smithy'))).toBe('Athletics');
  });
});

describe('employerById', () => {
  it('returns the freelance option for the sentinel id', () => {
    expect(employerById(FREELANCE_ID)).toBe(FREELANCE);
  });

  it('finds an employer by id', () => {
    expect(employerById('the-rusty-dragon').name).toBe('The Rusty Dragon');
  });

  it('returns null for an unknown id', () => {
    expect(employerById('nope')).toBeNull();
  });
});
